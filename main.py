"""ASTRA mission control: hardware ingestion, persistent log, commands, and simulator."""
from __future__ import annotations
import asyncio
import csv
import io
import json
import math
import os
import random
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from anomaly import BaselineAnomalyDetector

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
MODE = os.getenv("ASTRA_MODE", "hardware").lower()
if MODE not in {"hardware", "simulation"}:
    raise RuntimeError("ASTRA_MODE must be hardware or simulation")
API_KEY = os.getenv("ASTRA_API_KEY", "")
DB_PATH = Path(os.getenv("ASTRA_DB", str(ROOT / "data" / "astra.sqlite3")))
STALE_SECONDS = 6.0
ROLES = {"main", "supervisor"}
ACTIONS = {
    "main": {"freeze", "test_thermal"},
    "supervisor": {"payload_on", "payload_off", "reset_main", "rearm", "test_current", "test_voltage"},
}
THRESHOLDS = {"temperature_c": 45, "current_ma": 30, "voltage_v": 2.7, "heartbeat_timeout_ms": 2000}
devices: dict[str, dict] = {}
received: dict[str, float] = {}
last_saved: dict[str, float] = {}
clients: set[WebSocket] = set()
command_lock = asyncio.Lock()
sim = {"freeze_at": None, "reset_at": None, "fault": None, "payload_off": False,
       "locked": False, "resets": 0, "edges": 0, "boot": 1}
ml_detector = BaselineAnomalyDetector()
last_ml_observation = 0.0


def utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with database() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS samples (
          id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, device TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT, device TEXT NOT NULL, action TEXT NOT NULL,
          created REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
        CREATE INDEX IF NOT EXISTS samples_device ON samples(device,id);
        """)
        db.execute("UPDATE commands SET status='expired' WHERE status='pending'")


def event(message: str, kind="info"):
    with database() as db:
        db.execute("INSERT INTO events(timestamp,kind,message) VALUES(?,?,?)", (utc(), kind, message))


def recent_events(limit=60):
    with database() as db:
        return [dict(row) for row in db.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))]


def online(role):
    return role in received and time.monotonic() - received[role] < STALE_SECONDS


def snapshot():
    main = devices.get("main", {}) if online("main") else {}
    supervisor = devices.get("supervisor", {}) if online("supervisor") else {}
    fault = main.get("fault") if online("main") else None
    if fault == "none": fault = None
    if online("supervisor") and supervisor.get("fault") not in {None, "none"}:
        fault = supervisor["fault"] if not fault else fault
    status = "waiting"
    if devices:
        if not online("supervisor"): status = "offline"
        elif supervisor.get("status") == "locked_out": status = "locked_out"
        elif supervisor.get("status") in {"starting", "recovering"}: status = supervisor["status"]
        elif not online("main"): status = "warning"
        elif fault: status = "fault"
        else: status = "healthy"
    view = {}
    for role in sorted(ROLES):
        value = dict(devices.get(role, {}))
        value["online"] = online(role)
        value["age_s"] = round(time.monotonic() - received[role], 1) if role in received else None
        view[role] = value
    ml_values = {"temperature_c": main.get("temperature_c"),
                 "voltage_v": supervisor.get("voltage_v"),
                 "current_ma": supervisor.get("current_ma")}
    ml_status = ml_detector.status(ml_values)
    recommendations = advice(fault, status)
    if ml_status["ready"] and ml_status["anomaly"]:
        recommendations.append("ML advisory: the sensor pattern differs from the learned healthy baseline. Inspect readings; ESP32 safety rules remain authoritative.")
    return {
        "project": "ASTRA", "mode": MODE, "timestamp": utc(), "status": status, "fault": fault,
        "temperature_c": main.get("temperature_c"), "voltage_v": supervisor.get("voltage_v"),
        "current_ma": supervisor.get("current_ma"), "heartbeat_count": supervisor.get("heartbeat_count", 0),
        "heartbeat_ok": online("supervisor") and supervisor.get("heartbeat_ok", False),
        "payload_enabled": supervisor.get("payload_enabled"), "reset_count": supervisor.get("reset_count", 0),
        "devices": view, "events": recent_events(30), "thresholds": THRESHOLDS,
        "recommendations": recommendations, "ml": ml_status,
    }


def advice(fault, status):
    if status == "offline": return ["Supervisor telemetry is stale. Check USB power and Wi-Fi. Local protection may still be operating."]
    if status == "waiting": return ["Flash both boards and enter the same network and API key. Waiting for the first device reports."]
    if fault == "probe_missing": return ["Check the probe data wire on main GPIO4 and the 4.7 kΩ pull-up to main 3V3."]
    if (fault and "thermal" in fault) or fault == "overtemperature": return ["Allow the probe to cool below 40 °C. The main stops heartbeat at 45 °C.", "Re-arm only after the cause is resolved."]
    if fault == "current_sensor_missing": return ["Check INA226 VCC, common GND, SDA21 and SCL22. Default address is 0x40."]
    if fault and "current" in fault: return ["Payload is isolated. Inspect the LED branch, resistor and current reading before re-arming."]
    if fault and "voltage" in fault: return ["Check the 3.3 V payload supply and INA226 VIN path before re-arming."]
    if status == "locked_out": return ["Automatic retries are exhausted. Resolve the fault, then use Re-arm supervisor."]
    if status == "recovering": return ["Supervisor has isolated the payload and is checking heartbeat after the reset."]
    return ["Monitoring heartbeat, temperature, payload voltage and current."]


class DeviceReport(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    boot_id: str = Field(min_length=1, max_length=32)
    seq: int = Field(ge=1, le=4294967295)
    uptime_ms: int = Field(ge=0, le=4294967295)
    command_ack: int = Field(default=0, ge=0)
    status: Literal["healthy", "fault", "starting", "recovering", "locked_out"]
    fault: str = Field(default="none", max_length=48)
    temperature_c: float | None = Field(default=None, ge=-55, le=125)
    probe_ok: bool | None = None
    voltage_v: float | None = Field(default=None, ge=-1, le=32)
    current_ma: float | None = Field(default=None, ge=-3200, le=3200)
    heartbeat_count: int = Field(default=0, ge=0)
    heartbeat_ok: bool | None = None
    payload_enabled: bool | None = None
    reset_count: int | None = Field(default=None, ge=0)
    reset_attempts: int | None = Field(default=None, ge=0)
    ina219_ok: bool | None = None  # legacy reports
    ina226_ok: bool | None = None
    oled_ok: bool | None = None
    manual_off: bool | None = None


class CommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device: Literal["main", "supervisor"]
    action: str = Field(max_length=32)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


async def authorize(x_astra_key: str = Header(default="")):
    if not API_KEY:
        raise HTTPException(503, "Run configure.py first to create the device API key.")
    if not secrets.compare_digest(x_astra_key, API_KEY):
        raise HTTPException(401, "Incorrect API key")


def accept_report(role, data):
    previous = devices.get(role)
    if previous and previous["boot_id"] == data["boot_id"] and data["seq"] <= previous["seq"]:
        return False
    now = time.monotonic()
    was_online = online(role)
    if not previous or previous["boot_id"] != data["boot_id"]:
        event(f"{role.title()} controller booted ({data['boot_id']}).")
    elif previous.get("fault") != data.get("fault") or previous.get("status") != data.get("status"):
        event(f"{role.title()}: {data['status']} / {data.get('fault', 'none')}.", "warning" if data.get("fault") not in {None, "none"} else "success")
    elif not was_online:
        event(f"{role.title()} connection restored.", "success")
    devices[role] = data
    received[role] = now
    if now - last_saved.get(role, -100) >= 1.0:
        with database() as db:
            db.execute("INSERT INTO samples(timestamp,device,data) VALUES(?,?,?)", (utc(), role, json.dumps(data, allow_nan=False)))
        last_saved[role] = now
    return True


def command_for(role, acknowledged):
    with database() as db:
        # Acknowledgements only apply to commands for this physical role.
        db.execute("UPDATE commands SET status='acknowledged' WHERE id=? AND device=? AND status='pending'", (acknowledged, role))
        db.execute("UPDATE commands SET status='expired' WHERE status='pending' AND created<?", (time.time()-20,))
        row = db.execute("SELECT id,action FROM commands WHERE device=? AND status='pending' ORDER BY id LIMIT 1", (role,)).fetchone()
        return dict(row) if row else None


async def simulate_command(role, action):
    if action in {"freeze", "test_thermal"}:
        sim["freeze_at"] = time.monotonic()
        sim["fault"] = "injected_freeze" if action == "freeze" else "injected_thermal"
    elif action in {"test_current", "test_voltage"}:
        sim["locked"] = True
        sim["fault"] = "injected_overcurrent" if action == "test_current" else "injected_undervoltage"
    elif action == "reset_main":
        sim["reset_at"] = time.monotonic(); sim["resets"] += 1
    elif action == "rearm":
        sim.update(locked=False, fault=None, freeze_at=None, reset_at=None, payload_off=False)
    else: sim["payload_off"] = action == "payload_off"


async def background():
    previous_online = {}
    next_prune = 0.0
    rng = random.Random(42)
    while True:
        now = time.monotonic()
        if MODE == "simulation":
            if sim["freeze_at"] is not None and now-sim["freeze_at"] >= 2 and sim["reset_at"] is None:
                sim["reset_at"] = now; sim["resets"] += 1
            if sim["reset_at"] is not None and now-sim["reset_at"] > 1.5:
                sim.update(reset_at=None, freeze_at=None, fault=None)
                sim["boot"] += 1
            recovering = sim["reset_at"] is not None
            frozen = sim["freeze_at"] is not None
            if not frozen and not recovering: sim["edges"] += 2
            is_healthy = not sim["locked"] and not recovering and not frozen
            main_fault = sim["fault"] if frozen else "none"
            main = {"boot_id": f"sim-main-{sim['boot']}", "seq": int(now*1000), "uptime_ms": int(now*1000)%4294967295,
                    "status": "fault" if frozen else "healthy", "fault": main_fault,
                    "temperature_c": 46.0 if main_fault == "injected_thermal" else round(28+rng.uniform(-.2,.2), 2), "probe_ok": True}
            supervisor = {"boot_id": "sim-supervisor", "seq": int(now*1000), "uptime_ms": int(now*1000)%4294967295,
                          "status": "locked_out" if sim["locked"] else "recovering" if recovering else "healthy",
                          "fault": sim["fault"] if sim["locked"] else "heartbeat_timeout" if recovering else "none",
                          "voltage_v": round(3.3+rng.uniform(-.02,.02), 3), "current_ma": round(5+rng.uniform(-.2,.2), 2) if is_healthy and not sim["payload_off"] else 0,
                          "heartbeat_count": sim["edges"], "heartbeat_ok": not frozen and not recovering,
                          "payload_enabled": is_healthy and not sim["payload_off"], "reset_count": sim["resets"],
                          "ina219_ok": True, "oled_ok": True, "manual_off": sim["payload_off"]}
            accept_report("main", main); accept_report("supervisor", supervisor)
        global last_ml_observation
        main = devices.get("main", {})
        supervisor = devices.get("supervisor", {})
        healthy_pair = (
            online("main") and online("supervisor")
            and main.get("status") == "healthy" and main.get("fault") in {None, "none"}
            and main.get("probe_ok") is True
            and supervisor.get("status") == "healthy" and supervisor.get("fault") in {None, "none"}
            and supervisor.get("ina226_ok", supervisor.get("ina219_ok")) is True
            and supervisor.get("heartbeat_ok") is True
            and supervisor.get("payload_enabled") is True
        )
        if healthy_pair and now - last_ml_observation >= 1.0:
            ml_detector.observe_healthy({
                "temperature_c": main.get("temperature_c"),
                "voltage_v": supervisor.get("voltage_v"),
                "current_ma": supervisor.get("current_ma"),
            })
            last_ml_observation = now
        for role in ROLES:
            current = online(role)
            if previous_online.get(role) is True and not current:
                event(f"{role.title()} telemetry is stale; check device connection.", "warning")
            previous_online[role] = current
        if now >= next_prune:
            with database() as db:
                db.execute("DELETE FROM samples WHERE id<(SELECT MAX(id)-100000 FROM samples)")
                db.execute("DELETE FROM events WHERE id<(SELECT MAX(id)-5000 FROM events)")
                db.execute("DELETE FROM commands WHERE id<(SELECT MAX(id)-5000 FROM commands)")
            next_prune = now + 600
        if clients:
            await asyncio.gather(*(send_snapshot(ws) for ws in list(clients)), return_exceptions=True)
        await asyncio.sleep(.5)


async def send_snapshot(ws):
    try: await asyncio.wait_for(ws.send_json(snapshot()), timeout=1)
    except (Exception, asyncio.TimeoutError): clients.discard(ws)


@asynccontextmanager
async def lifespan(app):
    init_db(); event(f"Mission control started in {MODE} mode.")
    task = asyncio.create_task(background())
    try: yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError): await task


app = FastAPI(title="ASTRA Mission Control", version="2.0.0", lifespan=lifespan,
              description="Two-controller tabletop fault detection, isolation and recovery demonstrator.")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
async def index(): return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/health")
async def health(): return {"ok": True, "mode": MODE, "configured": bool(API_KEY), "version": "2.0.0"}


@app.get("/telemetry")
@app.get("/api/telemetry")
async def telemetry(): return snapshot()


@app.post("/api/devices/{device}/telemetry", dependencies=[Depends(authorize)])
async def ingest(device: str, report: DeviceReport):
    if MODE != "hardware": raise HTTPException(409, "Restart server in hardware mode to accept real readings")
    if device not in ROLES: raise HTTPException(404, "Unknown device")
    data = report.model_dump(exclude_none=True)
    accepted = accept_report(device, data)
    return {"ok": True, "accepted": accepted, "command": command_for(device, report.command_ack)}


@app.get("/api/events")
async def events(): return recent_events()


@app.get("/api/ml/status")
async def ml_status(): return snapshot()["ml"]


@app.get("/api/history")
async def history(limit: int = Query(240, ge=1, le=2000)):
    with database() as db:
        rows = db.execute("SELECT timestamp,device,data FROM samples ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{"timestamp": row["timestamp"], "device": row["device"], **json.loads(row["data"])} for row in reversed(rows)]


@app.get("/api/export.csv")
async def export_csv():
    output = io.StringIO(); writer = csv.writer(output)
    fields = ["timestamp", "device", "boot_id", "seq", "status", "fault", "temperature_c", "voltage_v", "current_ma", "heartbeat_count", "payload_enabled", "reset_count"]
    writer.writerow(fields)
    with database() as db:
        rows = db.execute("SELECT timestamp,device,data FROM samples ORDER BY id DESC LIMIT 10000").fetchall()
    for row in reversed(rows):
        data = {"timestamp": row["timestamp"], "device": row["device"], **json.loads(row["data"])}
        writer.writerow([data.get(f, "") for f in fields])
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=astra-telemetry.csv"})


@app.post("/api/commands", dependencies=[Depends(authorize)])
async def command(body: CommandRequest):
    if body.action not in ACTIONS[body.device]: raise HTTPException(422, "Action not supported by this device")
    if MODE == "simulation":
        await simulate_command(body.device, body.action)
        event(f"Simulation command: {body.device} / {body.action}.", "warning")
        return {"status": "applied_in_simulation"}
    if not online(body.device): raise HTTPException(409, "Device is offline; no command was queued")
    async with command_lock:
        command_for(body.device, 0)
        with database() as db:
            pending = db.execute("SELECT id FROM commands WHERE device=? AND status='pending'", (body.device,)).fetchone()
            if pending: raise HTTPException(409, "This device already has a pending command; wait a moment")
            cursor = db.execute("INSERT INTO commands(device,action,created) VALUES(?,?,?)", (body.device, body.action, time.time()))
            command_id = cursor.lastrowid
        event(f"Queued {body.action} for {body.device} (command {command_id}).", "warning")
    return {"id": command_id, "status": "pending"}


@app.get("/api/commands")
async def commands():
    command_for("main", 0); command_for("supervisor", 0)
    with database() as db:
        return [dict(row) for row in db.execute("SELECT id,device,action,status FROM commands ORDER BY id DESC LIMIT 15")]


@app.post("/api/chat")
async def chat(body: ChatRequest):
    data = snapshot()
    answer = f"ASTRA is {data['status']} in {MODE} mode. "
    if "event" in body.message.lower() or "history" in body.message.lower():
        answer += " ".join(row["message"] for row in data["events"][:4])
    else:
        answer += f"Temperature: {data['temperature_c']} °C. Payload voltage: {data['voltage_v']} V. Current: {data['current_ma']} mA. "
        answer += " ".join(data["recommendations"])
    return {"answer": answer, "source": "local telemetry and event log; deterministic assistant"}


@app.websocket("/ws/telemetry")
async def websocket(ws: WebSocket):
    await ws.accept(); clients.add(ws)
    try:
        await ws.send_json(snapshot())
        while True: await ws.receive_text()
    except WebSocketDisconnect: pass
    finally: clients.discard(ws)

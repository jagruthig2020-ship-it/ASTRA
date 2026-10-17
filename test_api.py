import asyncio
import time
import pytest
from fastapi.testclient import TestClient
import main

KEY = {"X-ASTRA-Key": "test-key"}


def report(role="main", seq=1, **values):
    data = {"boot_id": "test-boot", "seq": seq, "uptime_ms": seq * 1000,
            "status": "healthy", "fault": "none", "command_ack": 0}
    if role == "main": data.update(temperature_c=28, probe_ok=True)
    else: data.update(voltage_v=3.3, current_ma=5, heartbeat_count=10, heartbeat_ok=True,
                      payload_enabled=True, reset_count=0, ina219_ok=True)
    return {**data, **values}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "MODE", "hardware")
    monkeypatch.setattr(main, "API_KEY", "test-key")
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.sqlite3")
    main.devices.clear(); main.received.clear(); main.last_saved.clear()
    with TestClient(main.app) as test_client: yield test_client


def send(client, role="main", **values):
    return client.post(f"/api/devices/{role}/telemetry", headers=KEY, json=report(role, **values))


def test_initial_hardware_has_no_fake_readings(client):
    data = client.get("/api/telemetry").json()
    assert data["status"] == "waiting" and data["mode"] == "hardware"
    assert data["temperature_c"] is None and not data["devices"]["main"]["online"]


def test_dashboard_and_assets(client):
    for path in ["/", "/static/app.js", "/static/style.css", "/docs", "/api/health"]:
        assert client.get(path).status_code == 200


def test_device_authentication(client):
    assert client.post("/api/devices/main/telemetry", json=report()).status_code == 401
    assert send(client).status_code == 200


def test_live_aggregation_and_history(client):
    send(client); send(client, "supervisor")
    data = client.get("/telemetry").json()
    assert data["status"] == "healthy" and data["temperature_c"] == 28
    assert data["payload_enabled"] and data["voltage_v"] == 3.3
    assert len(client.get("/api/history").json()) == 2
    csv = client.get("/api/export.csv")
    assert csv.status_code == 200 and "temperature_c" in csv.text


def test_old_sequence_is_rejected_without_overwriting_sensor(client):
    send(client, seq=2, temperature_c=30)
    response = send(client, seq=1, temperature_c=100)
    assert not response.json()["accepted"]
    assert client.get("/telemetry").json()["temperature_c"] == 30


def test_reboot_resets_sequence(client):
    send(client, seq=50)
    assert send(client, seq=1, boot_id="new-boot").json()["accepted"]


def test_stale_device_does_not_show_live_health(client):
    send(client); send(client, "supervisor")
    main.received["supervisor"] -= 10
    data = client.get("/telemetry").json()
    assert data["status"] == "offline" and not data["heartbeat_ok"]


def test_missing_temperature_stays_unknown(client):
    send(client, temperature_c=None, probe_ok=False, status="fault", fault="probe_missing")
    assert client.get("/telemetry").json()["temperature_c"] is None


def test_invalid_report_cannot_poison_telemetry(client):
    assert send(client, temperature_c=500).status_code == 422
    assert send(client, unexpected=123).status_code == 422
    assert client.post("/api/devices/other/telemetry", headers=KEY, json=report()).status_code == 404


def test_command_requires_key_and_online_device(client):
    command = {"device": "main", "action": "freeze"}
    assert client.post("/api/commands", json=command).status_code == 401
    assert client.post("/api/commands", headers=KEY, json=command).status_code == 409


def test_commands_retry_until_ack_and_only_one_is_pending(client):
    send(client)
    body = {"device": "main", "action": "freeze"}
    response = client.post("/api/commands", headers=KEY, json=body)
    assert response.status_code == 200
    command_id = response.json()["id"]
    assert client.post("/api/commands", headers=KEY, json=body).status_code == 409
    assert send(client, seq=2).json()["command"]["id"] == command_id
    assert send(client, seq=3).json()["command"]["id"] == command_id
    assert send(client, seq=4, command_ack=command_id).json()["command"] is None
    assert client.get("/api/commands").json()[0]["status"] == "acknowledged"


def test_other_device_cannot_acknowledge_command(client):
    send(client); send(client, "supervisor")
    result = client.post("/api/commands", headers=KEY, json={"device": "main", "action": "freeze"}).json()
    send(client, "supervisor", seq=2, command_ack=result["id"])
    assert client.get("/api/commands").json()[0]["status"] == "pending"


def test_expired_command_is_not_sent(client):
    send(client)
    result = client.post("/api/commands", headers=KEY, json={"device": "main", "action": "freeze"}).json()
    with main.database() as db: db.execute("UPDATE commands SET created=? WHERE id=?", (time.time()-30, result["id"]))
    assert send(client, seq=2).json()["command"] is None
    assert client.get("/api/commands").json()[0]["status"] == "expired"


def test_wrong_role_action_rejected(client):
    assert client.post("/api/commands", headers=KEY, json={"device": "main", "action": "rearm"}).status_code == 422


def test_hardware_cannot_mix_with_simulation(client, monkeypatch):
    monkeypatch.setattr(main, "MODE", "simulation")
    assert send(client).status_code == 409


def test_websocket_initial_state(client):
    with client.websocket_connect("/ws/telemetry") as ws:
        assert ws.receive_json()["project"] == "ASTRA"


def test_lockout_and_real_fault_advice(client):
    send(client); send(client, "supervisor", status="locked_out", fault="overcurrent", payload_enabled=False)
    data = client.get("/telemetry").json()
    assert data["status"] == "locked_out" and data["fault"] == "overcurrent"
    assert "isolated" in data["recommendations"][0]


def test_ina226_report_and_stale_readings(client):
    send(client)
    response=send(client, 'supervisor', ina219_ok=None, ina226_ok=True)
    assert response.status_code==200
    assert client.get('/telemetry').json()['devices']['supervisor']['ina226_ok'] is True
    main.received['main']-=10
    main.received['supervisor']-=10
    data=client.get('/telemetry').json()
    assert data['temperature_c'] is None
    assert data['voltage_v'] is None and data['current_ma'] is None
    assert data['payload_enabled'] is None
    assert not data['ml']['ready']

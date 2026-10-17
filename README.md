> UPDATED: Start with **RUN-LIVE-FIRST.md** for INA226 + real USB telemetry.
> Older Wi-Fi setup notes below remain for that optional transport.

# ASTRA · Mission Control

**Two-ESP32 tabletop fault detection, isolation and recovery demonstrator.**

Start with **[START-HERE.md](START-HERE.md)**. It walks through Mac setup, network configuration, flashing both ESP32s and the first working demonstration.

## Included

- **Main ESP32 firmware:** DS18B20 asynchronous temperature reads, debounced fault button, heartbeat generation, thermal hysteresis and missing-probe detection.
- **Supervisor ESP32 firmware:** heartbeat interrupt capture, independent reset state machine, bounded reset retries, INA226 power monitoring, MOSFET payload control, SSD1306 OLED, status LEDs and an optional buzzer driver.
- **Network transport:** each board publishes its own telemetry; Wi-Fi/HTTP runs in a separate FreeRTOS task. No UART link between boards is needed.
- **FastAPI backend:** validated authenticated device reports, command queue with acknowledgement and expiry, SQLite event/history storage, WebSocket updates, CSV export and interactive API documentation.
- **Dashboard:** live metrics and trends, controller freshness, event timeline, advisory ML anomaly screen, deterministic telemetry-based answers, payload/recovery controls and labelled software fault tests.
- **Simulation mode:** a separate mode with synthetic readings and simulated recovery, useful before flashing hardware.
- **Tests:** backend integration tests and native C++ tests using the same recovery policy header as the supervisor firmware.

## Quick commands

Run inside the extracted project folder:

```bash
bash setup.command
source .venv/bin/activate
python -m platformio device list
python upload.py main --port /dev/cu.YOUR_MAIN_PORT
python upload.py supervisor --port /dev/cu.YOUR_SUPERVISOR_PORT
bash start.command
```

Open http://127.0.0.1:8000. The real device destination is your Mac's LAN IP, not `127.0.0.1`. `configure.py` sets that address in the firmware credentials.

To preview the complete app with synthetic data:

```bash
bash simulate.command
```

Only one server can use port 8000 at a time. Stop an existing server with Control+C before changing modes.

## Project layout

```text
ASTRA-complete/
  START-HERE.md
  README.md
  configure.py              shared local network/key configuration
  upload.py                 build and upload helper
  setup.command             Mac environment setup
  start.command             hardware dashboard server
  simulate.command          simulation dashboard server
  main.py                   FastAPI application
  requirements.txt          server dependencies
  requirements-dev.txt      test and firmware tooling
  firmware/
    platformio.ini          two explicit build environments
    include/config.h        pin map and fault limits
    include/secrets.example.h
    include/transport.h     independent network task
    include/supervisor_logic.h
    src/main_controller.cpp
    src/supervisor.cpp
  static/                   local HTML, CSS, JavaScript; no CDN required
  tests/                    API and actual recovery-policy tests
  docs/                     wiring, architecture, troubleshooting, verification
```

Local configuration creates `.env` and `firmware/include/secrets.h`. Runtime telemetry goes in `data/astra.sqlite3`. These files and build caches are excluded from the source download.

## Test and build

```bash
source .venv/bin/activate
python -m pytest -q
python upload.py both --build-only
```

If you have a native C++ compiler (macOS: Apple's Command Line Tools):

```bash
c++ -std=c++11 -Wall -Wextra -Werror -Ifirmware/include tests/recovery_test.cpp -o /tmp/astra-recovery-test
/tmp/astra-recovery-test
```

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what was actually verified while preparing this release and what remains to verify on your circuit.

## Scope

This is an engineering demonstration using a small 3.3 V LED payload. The hard fault responses use explicit thresholds and heartbeat timing. The dashboard combines deterministic rules with an advisory Isolation Forest model trained from healthy live readings. It is an engineering demo, not a validated spacecraft anomaly model or safety controller. A true processor hang is represented by stopping the heartbeat in the injected test. The INA226 branch measurement does not measure the ESP32's entire power consumption. An active buzzer is optional and disabled by default.

Use the hardware server on a trusted local network. Telemetry viewing is read-only and available to that LAN; device reports and hardware commands require the API key. HTTP is used for local development. Do not expose this server directly to the public internet.

Pin labels, component types, OLED dimensions and thresholds must match the actual hardware. Software tests cannot establish that a breadboard circuit is wired correctly.

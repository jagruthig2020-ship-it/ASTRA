# ASTRA: real USB telemetry

This revision fixes the uploaded INA219 firmware mismatch for INA226 and adds
serial_bridge.py. Keep this file open while running. The existing ATMOS design
is retained. This is a tabletop prototype; physical operation is not certified.

## Before flashing

Use both boards on the laptop with data-capable USB cables. Close Arduino Serial
Monitor and PlatformIO monitors before opening the bridge or uploading.
Identify each port by unplugging/reconnecting one board, not by guessing.

The code preserves these GPIO assignments. Confirm they match your circuit:

| Connection | GPIO |
|---|---|
| A DS18B20 data (4.7k pull-up to 3V3) | 4 |
| A fault button to GND | 25 |
| A heartbeat OUT → B heartbeat IN | 18 → 27 |
| B reset transistor control | 32 |
| B payload MOSFET gate | 26 |
| B SDA / SCL | 21 / 22 |
| B green / red LED | 19 / 23 |

Boards need common GND. Heartbeat is one-way A → B; USB carries each board's
telemetry independently. No new inter-board TX/RX wiring is required.

Check firmware/include/config.h: INA226_SHUNT_OHMS defaults to 0.1 for R100.
If your module says R010, change it to 0.01 before building. If unreadable, confirm
its specification; do not claim calibrated current or overcurrent protection.
INA226_ADDRESS defaults to 0x40. INA226 chip identity is checked, so another chip
at 0x40 is not silently treated as INA226. Current requires load current to pass
through the shunt between IN+ and IN-. Supplying VCC alone does not measure it.
The INA226 VBUS measurement input must also connect to the monitored supply;
check your breakout's labeling/schematic before changing wiring. Never infer a
breakout pin's purpose from the name VS alone.

## Install and configure (project folder)

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python configure.py --usb
python serial_bridge.py --list
```

Save the printed dashboard control key locally. USB setup disables Wi-Fi in the
new builds so commands have one transport. Do not run simulate.command for this
hardware demo. Wi-Fi is still available via configure.py without --usb.

## Flash each board (replace the two port placeholders)

```bash
python -m platformio run -d firmware -e main_controller -t upload --upload-port MAIN_PORT
python -m platformio run -d firmware -e supervisor -t upload --upload-port SUPERVISOR_PORT
```

macOS ports usually start /dev/cu.; Windows uses COM names. BOTH boards need
these updated builds for USB dashboard commands. If flashing fails, stop here
and read the upload error rather than assuming new firmware was installed.

## Terminal 1: backend

```bash
source .venv/bin/activate
ASTRA_MODE=hardware python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Terminal 2: USB bridge (same folder)

```bash
source .venv/bin/activate
python serial_bridge.py --main MAIN_PORT --supervisor SUPERVISOR_PORT
```

Open http://127.0.0.1:8000. Each bridge thread must print accepted=True with
increasing sequence numbers. HTTP 401 means key mismatch; HTTP 422 means report
schema mismatch; HTTP 409 means server is in simulation mode. A wrong-port
message means the roles are reversed. Permission/busy errors mean another app
owns the port, the cable disconnected, or the port name changed.

You can check A alone using --main MAIN_PORT. Temperature should still appear;
B remains offline. Supplying B from another laptop/power bank provides power but
does not send B's telemetry to this USB bridge.

## Verify using the physical circuit

1. Dashboard says HARDWARE and both boards ONLINE. Confirm readings agree with
   the bridge logs. Do not equate ONLINE with healthy: lockout is a real state.
2. Warm the temperature probe gently in your hand. The displayed temperature
   must follow it. A missing probe must display no number, never a fake value.
3. Confirm INA226 readings. Zero current can be legitimate with payload off;
   zero bus voltage can indicate an unconnected VBUS input. Fix the cause before
   Re-arm. Missing/current-invalid sensors keep the payload isolated.
4. Disconnect A USB: after about six seconds its temperature must become blank
   and A must show offline. Reconnect and restart bridge if the port changes.
5. Only after basic readings work, check heartbeat, payload switching and the
   reset circuit. Press the A fault button and observe actual payload isolation,
   reset, a new A boot ID, fresh heartbeat edges, and return to healthy. If reset
   fails, the bounded retry policy should lock out. Do not call it recovered
   based on the animation alone.
6. ML learns only from healthy reports from both boards with valid sensors,
   active heartbeat and payload ON. It requires 60 baseline observations (about
   one minute), then provides advisory Isolation Forest scores. It does not
   control reset or shutdown. No baseline is preloaded or simulated in hardware
   mode. Restarting the server clears the model.

The dashboard command acknowledgement means firmware received the command;
it does not prove the physical action succeeded. Inspect subsequent telemetry.

## Validation boundary

See PATCH-VALIDATION.md for automated checks run on this revision. USB devices,
actual wiring, sensor accuracy, and an ESP32 toolchain are not assumed available
in the editing environment. Verify physical behavior on your laptop.

INA226 conversion reference: https://www.ti.com/lit/ds/symlink/ina226.pdf

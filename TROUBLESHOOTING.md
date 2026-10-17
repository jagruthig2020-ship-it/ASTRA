# Troubleshooting

## `requirements.txt` not found

You are outside the extracted project folder. In Finder, open `ASTRA-complete` and confirm it contains `main.py`, `requirements.txt` and `firmware`. In Terminal type `cd `, drag that folder into Terminal, and press Return. Run `pwd` and `ls` to check the location. Do not run install commands from `~` or from the old folder containing only `main.py`.

## ZIP cannot be found

Download the attached ZIP first. Use Finder to extract the file actually downloaded; its name or location may differ from an earlier command. You do not need an `unzip ~/Downloads/...` command if you double-click it in Finder.

## Port 8000 / “Address already in use”

An older server is still running. Go to that Terminal window and press Control+C. Start this version again. To identify a listener without terminating unrelated processes:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

The firmware is configured to reach port 8000. If you deliberately change the server port, change `ASTRA_SERVER_URL` in the local firmware credentials and reflash both boards.

## Hardware page stays Waiting / Offline

1. Confirm you flashed A with the `main_controller` environment and B with `supervisor`.
2. Both boards must be powered by USB data/power cables.
3. The original ESP32 uses 2.4 GHz Wi-Fi. A 5 GHz-only network will not work.
4. Both devices must be able to reach the Mac's LAN IP; guest networks can isolate clients. The URL in `secrets.h` must not use localhost or 127.0.0.1.
5. Start the server with `bash start.command`, which binds to `0.0.0.0`, and allow incoming Python connections on macOS.
6. Check the Mac's current Wi-Fi IP (System Settings → Wi-Fi → Details → TCP/IP). DHCP can change it. Rerun `python configure.py`, rebuild and reflash both boards if it changes. A router DHCP reservation can keep it stable.
7. Confirm the API key matches `.env` and both firmware builds. In `/docs`, add the `x-astra-key` value for protected endpoints.
8. After using simulation, stop it and start the hardware server. Real reports are intentionally rejected in simulation mode.

View a board's serial output at 115200 baud:

```bash
python -m platformio device monitor --port /dev/cu.YOUR_BOARD_PORT --baud 115200
```

Close the monitor with Control+C before flashing. JSON reports still appear over USB even without Wi-Fi.

## Red LED / current_sensor_missing

Check B 3V3 → INA226 VCC, common GND, B GPIO21 → SDA and GPIO22 → SCL. The default address is 0x40. After correcting wiring with power off, use Re-arm supervisor or power-cycle B. The payload stays off while the current sensor is unavailable.

## Probe missing / temperature shows —

The code expects a DS18B20 on **A GPIO4**, with a **4.7 kΩ resistor between DATA and A 3V3**. The resistor is not in series with DATA. Verify the actual probe wire colours. Check solder joints and that breadboard holes belong to the intended connected row. A disconnected probe yields unknown temperature, not a guessed value. B may eventually enter recovery lockout; repair the probe, then re-arm.

## OLED blank but telemetry works

Check its printed GND/VCC/SCL/SDA labels; modules do not all have the same physical pin order. Default is SSD1306 I2C 128×64 address 0x3C. Change `OLED_ADDRESS` to 0x3D or `OLED_HEIGHT` to 32 if appropriate and reflash B. SH1106 or SPI displays need corresponding driver/code changes. A missing display does not disable the supervisor.

## INA226 shows near zero current

A small LED may draw only a few mA. Confirm current actually flows through VIN+ → sensor shunt → VIN− → LED resistor → LED → MOSFET drain → source → GND. INA226 VCC does not supply the payload through the measurement terminals by itself. Check LED polarity, the MOSFET G-D-S pinout and that GPIO26 controls its gate through the gate resistor. Do not leave the payload LED connected directly to a GPIO from an earlier test.

## Payload never turns on

The supervisor requires fresh heartbeat edges, a responding INA226 and adequate payload supply. Check **A GPIO18 → B GPIO27** and common GND. Check the reset NPN is off normally and not holding A EN low. The base must have a 10 kΩ pull-down, not a direct short to ground. Inspect dashboard fault text and the event log. Re-arm after correcting a persistent problem.

## Main repeatedly resets / recovery lockout

The fault is still active, or heartbeat/reset wiring is wrong. Release the button. Check temperature and the probe. Three attempts exhaust the retry budget; brief recovery does not clear it. Resolve the fault and re-arm. Reset Main cannot bypass a latched overcurrent/voltage/sensor fault.

## Flashing cannot connect

Select the right port; use a USB data cable; close serial monitors. Some boards need BOOT held until writing starts. On A, the supervisor's reset transistor may interrupt flashing: with power off, temporarily disconnect its collector-to-A-EN wire, flash A, then reconnect it with power off. If the USB device never appears, check which USB-UART chip is on the board before installing a manufacturer driver. Do not install random drivers based only on a similar-looking board.

## Control key accepted by page but commands rejected

Unlock controls saves the key for this browser tab. Server authentication happens when a command is sent. Use the key printed by `configure.py`; if you changed it, reflash both boards and restart the server. `401` means wrong key; `409` can mean the target is offline or already has a pending command. `acknowledged` means processed; check actual payload/status for the resulting state.

## Firmware build needs internet

The initial PlatformIO build downloads the pinned ESP32 platform, compiler/framework and Arduino libraries. Run it on your Mac with access to the official PlatformIO package registries. The ZIP includes source and configuration; it does not bundle downloaded toolchains or board-specific binary builds.

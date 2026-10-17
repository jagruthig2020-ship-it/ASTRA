> UPDATED: Start with **RUN-LIVE-FIRST.md** for INA226 + real USB telemetry.
> Older Wi-Fi setup notes below remain for that optional transport.

# Start here — ASTRA on your Mac M4

This download contains the complete local software project. Your Mac runs the dashboard; **ESP32 A** reads the temperature probe and sends a heartbeat; **ESP32 B** independently protects the payload and resets A when its heartbeat stops.

## 1. Extract this ZIP

Double-click the downloaded ZIP in Finder. You should see a folder named `ASTRA-complete` containing this file, `main.py`, `requirements.txt`, and `firmware`.

Open Terminal and type `cd ` (with a space), drag the extracted folder into Terminal, then press Return. This uses the actual download location and avoids the missing-ZIP problem from earlier.

**Do not merge it into your old ASTRA folder yet.** This version is complete on its own.

## 2. Set up software and Wi-Fi

In that Terminal window:

```bash
bash setup.command
```

Enter:

1. Your **2.4 GHz Wi-Fi** network name. Both ESP32s and your Mac must be on the same reachable network. A 2.4 GHz phone hotspot can work if it permits devices to reach one another.
2. Wi-Fi password (typing is hidden).
3. Your Mac's LAN IP address. Press Return to accept the suggestion if it is the correct Wi-Fi network address.

The script generates the matching firmware and backend credentials. **Copy the dashboard control key** it prints. These settings stay in your local `.env` and `firmware/include/secrets.h` files. Do not share those files.

## 3. Compare the pin map

Read [docs/WIRING.md](docs/WIRING.md). These software defaults must match your physical connections. Change any differences in `firmware/include/config.h` **before flashing**.

The reset transistor's base must connect to B GPIO32 **through 1 kΩ**, with **10 kΩ from base to GND**. Its base must not be shorted directly to GND. The emitter connects directly to common GND.

## 4. Identify the boards and serial ports

Label the boards **A = MAIN** and **B = SUPERVISOR**. Connect both with USB **data** cables.

```bash
source .venv/bin/activate
python -m platformio device list
```

Mac serial ports usually look like `/dev/cu.usbserial-...`, `/dev/cu.SLAB_USBtoUART`, or `/dev/cu.wchusbserial...`. To identify a board, unplug just its USB cable, list ports again, and see which port disappeared. Reconnect it.

The firmware targets the original ESP32 DevKit/WROOM boards shown in your photos. Select different PlatformIO boards only if your actual board is a different ESP32 variant.

## 5. Flash each board

Replace the example port with the actual port for that board:

```bash
python upload.py main --port /dev/cu.YOUR_MAIN_PORT
python upload.py supervisor --port /dev/cu.YOUR_SUPERVISOR_PORT
```

The first build downloads the ESP32 toolchain and sensor libraries; allow it to finish. To build without uploading:

```bash
python upload.py both --build-only
```

If an upload stays at “Connecting…”, hold that board's **BOOT** button, start the upload, and release BOOT when writing begins. If the supervisor repeatedly resets A during flashing, switch power off and temporarily disconnect only the transistor collector → A EN wire; reconnect it with power off after flashing. Close any serial monitor before uploading.

## 6. Start mission control

Stop any older Uvicorn server with **Control+C in its Terminal window**. Then:

```bash
bash start.command
```

Open **http://127.0.0.1:8000**. Leave the server Terminal window open. Allow incoming local network connections if macOS asks for Python network access.

Paste the control key into the dashboard and click **Unlock controls**. Both controller cards should become **ONLINE**. The ML anomaly screen needs about 60 seconds of continuous healthy readings before it reports that its advisory baseline is ready. It cannot shut down or re-arm the payload. If a key is incorrect, the server rejects commands; the page does not validate it just by saving it.

## 7. First hardware demonstration

1. Both USB power cables are connected; the shared GND is intact.
2. Within several seconds, B sees A's heartbeat. The **green status LED** and payload LED turn on. The OLED shows `healthy` and the measured voltage/current.
3. Press and release the button on **A GPIO25**. A deliberately stops heartbeat. After about **2 seconds**, B turns the payload off and briefly pulls A's EN pin low through the transistor.
4. A restarts, heartbeat returns, and B restores the payload after observing three fresh edges. The dashboard records A's new boot and B's reset count.
5. Try **Test overcurrent**. This is a software fault: B isolates the LED and latches protection without creating an actual current spike. Use **Re-arm supervisor** to resume after checking readings.
6. Unplug the Mac from Wi-Fi while leaving both ESP32s powered. Local protection still operates. The dashboard marks network readings stale when it reconnects and sees no recent reports.

For a persistent real temperature fault, the main stops heartbeat at **45 °C**, and thermal hysteresis clears at **40 °C**. After a reset, the initial probe reading must be at or below 40 °C before heartbeat starts. Persistent faults exhaust three reset attempts and leave the payload isolated. Use software thermal injection for the first demonstration; heating is unnecessary.

## Preview without hardware

Stop the hardware server first, then:

```bash
bash simulate.command
```

The page clearly says **SIMULATION** and uses synthetic values. This mode cannot accept device reports or control real boards. Stop it with Control+C and run `bash start.command` to return to hardware mode.

## Where to make changes later

| What | File |
|---|---|
| Pins, trip limits, OLED height, optional buzzer | `firmware/include/config.h` |
| Wi-Fi, Mac IP and key | Run `python configure.py`, then reflash both boards |
| Main ESP32 behavior | `firmware/src/main_controller.cpp` |
| Supervisor protection/recovery | `firmware/src/supervisor.cpp` |
| API and telemetry storage | `main.py` |
| Dashboard layout / style / behavior | `static/index.html`, `static/style.css`, `static/app.js` |
| Firmware upload helper | `upload.py` |

See [README.md](README.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

> Historical verification from the original package. For this revision see ../PATCH-VALIDATION.md. Physical hardware checks must be repeated.

# Verification record

## Checks completed for this download

- **19 backend and ML tests passed.** Includes Isolation Forest warm-up, real healthy baseline collection, advisory outlier flagging and invalid reading exclusion. The 17 API integration tests cover initial hardware waiting state with no simulated readings, static/dashboard routes, key enforcement, report validation, combined real telemetry, persistent history/export, duplicate sequence rejection, reboot sequence handling, stale-device detection, missing temperature, command role validation, offline command rejection, pending-command retry and acknowledgement, expiry, cross-device acknowledgement rejection, simulation/hardware separation, WebSocket initial state, and protection-fault advice.
- **Native C++ recovery-policy tests passed**, compiled with `-std=c++11 -Wall -Wextra -Werror`. They exercise the exact `supervisor_logic.h` header used by B: startup qualification, heartbeat timeout, 300 ms EN pulse, requirement for fresh post-reset edges, sustained-health retry-budget reset, three-attempt lockout, re-arm conditions, manual-off behavior, retaining the latched cause, sensor loss during reset and millisecond counter rollover.
- **Python syntax compilation passed** for the backend, configuration tool and uploader.
- **JavaScript syntax check passed** with Node.js.
- **Bash syntax checks passed** for the three Mac helper scripts.
- **Live HTTP/WebSocket smoke test passed** against a running Uvicorn server in simulation mode: dashboard serving, freeze → supervisor reset → healthy recovery, overcurrent lockout → explicit re-arm, telemetry answers, CSV download and a WebSocket snapshot. This check used real local HTTP connections, independently of the in-process integration tests.

Backend tests used Python 3.12 and the exact primary package versions in the requirements files. The code is written for Python 3.11 or later; your earlier Mac terminal showed Python 3.11.9. Python 3.11 execution on the Mac remains part of setup validation.

## Verification limits

- A full PlatformIO build was attempted. The ESP32 platform was downloaded, but the compiler toolchain download could not complete in this environment. **Neither complete ESP32 firmware build is claimed as compiled here.** Run `python upload.py both --build-only` on your Mac to complete that check before uploading.
- No physical boards were attached to this environment. Probe identity, wiring, current readings, display compatibility, reset pulses and USB power behavior require the first hardware test described in START-HERE.md.
- A headless browser check was attempted, but its browser download failed. **Rendered desktop/mobile layout and browser interaction have not been visually verified here.** The dashboard source is local, responsive CSS and native JavaScript; static routing and JavaScript syntax were verified.
- The fault test buttons inject logic faults. They do not validate the response time of a real short circuit or a flight system, and this LED demonstration is not an electronic fuse.

## Checks to complete on the assembled circuit

1. Compare `docs/WIRING.md` with physical connections and `firmware/include/config.h`.
2. Build and flash A and B. Check their JSON serial reports at 115200 baud.
3. Check that B sees at least three heartbeat edges, shows healthy supply and enables the LED payload.
4. Press/release the fault button and confirm payload isolation, a brief A reset, a changed main boot ID, recovered heartbeat and restored payload.
5. Run software current/voltage tests and confirm protection stays latched until an explicit valid re-arm.
6. Check stale-link behavior by stopping the server, then restart it. Local board protection should continue while the Mac is offline.

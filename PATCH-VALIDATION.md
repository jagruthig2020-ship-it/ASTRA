# Validation of this revision

- 21 Python tests passed: API ingestion/authentication, command lifecycle, stale-data handling, INA226 schema, ML behavior, and bridge HTTP payload/command forwarding.
- Native C++ recovery policy test passed: startup, timeout, reset pulse, fresh heartbeat edges, retry budget, lockout, re-arm, sensor loss and millis rollover.
- Python syntax checks and dashboard JavaScript syntax check passed.
- PlatformIO compilation was attempted but did not progress past downloading espressif32 6.9.0 in this environment. ESP32 compilation is NOT verified.
- No attached ESP32 or sensors were available. USB serial exchange, physical sensor readings, MOSFET switching and automatic reset remain unverified on hardware.
- The bridge test uses a mocked HTTP response, not connected boards. Existing API and ML tests use test data, never dashboard hardware-mode telemetry.

## Changes

INA226 identity-checked register driver replaces INA219. Current scaling uses the configured physical shunt resistance. Added two-port USB ingestion and serial command return, USB configuration mode, INA226 backend schema and ML eligibility. Stale top-level sensor values and ML inference become unavailable. Existing GPIOs and ATMOS visual design retained.

Start with RUN-LIVE-FIRST.md. Check shunt marking and GPIO wiring before flashing.

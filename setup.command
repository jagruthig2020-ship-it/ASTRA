#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python configure.py
printf '\nSetup complete. Read START-HERE.md to flash both ESP32s.\n'

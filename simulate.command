#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
if [ ! -f .env ]; then
  .venv/bin/python -c 'from pathlib import Path; import secrets; key=secrets.token_urlsafe(24); Path(".env").write_text("ASTRA_MODE=hardware\nASTRA_API_KEY="+key+"\n"); print("Dashboard control key:", key)'
else
  .venv/bin/python -c 'from dotenv import dotenv_values; print("Dashboard control key:",dotenv_values(".env").get("ASTRA_API_KEY","Run configure.py"))'
fi
printf '\nSIMULATION dashboard: http://127.0.0.1:8000\nNo commands will be sent to hardware in this mode.\n'
ASTRA_MODE=simulation exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000

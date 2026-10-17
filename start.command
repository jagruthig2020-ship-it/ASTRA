#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if [ ! -x .venv/bin/python ]; then
  printf 'Run bash setup.command first.\n'
  exit 1
fi
if [ ! -f .env ]; then
  .venv/bin/python configure.py
fi
printf '\nASTRA dashboard: http://127.0.0.1:8000\nKeep this window open. Press Control+C to stop.\n\n'
ASTRA_MODE=hardware exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000

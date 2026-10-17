#!/usr/bin/env python3
"""PlatformIO helper. Use the Python interpreter from the project virtual environment."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description="Build or flash the ASTRA ESP32 firmware")
parser.add_argument("board", choices=["main", "supervisor", "both"])
parser.add_argument("--port", help="Serial port, e.g. /dev/cu.usbserial-0001")
parser.add_argument("--build-only", action="store_true")
args = parser.parse_args()
if args.board == "both" and not args.build_only:
    parser.error("Flash one board at a time; use main or supervisor with --port.")
if not args.build_only and not (ROOT / "firmware/include/secrets.h").exists():
    parser.error("Run python configure.py first.")
command = [sys.executable, "-m", "platformio", "run", "--project-dir", str(ROOT / "firmware")]
if args.board != "both": command += ["-e", "main_controller" if args.board == "main" else "supervisor"]
if not args.build_only: command += ["--target", "upload"]
if args.port: command += ["--upload-port", args.port]
raise SystemExit(subprocess.call(command))

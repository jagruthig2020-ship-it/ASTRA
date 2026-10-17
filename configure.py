#!/usr/bin/env python3
"""Create local credentials for the server and BOTH ESP32 builds. Standard library only."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import socket

ROOT = Path(__file__).resolve().parent


def suggested_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))  # route selection only; no packet is sent
            return sock.getsockname()[0]
    except OSError:
        return "192.168.1.100"


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--usb', action='store_true', help='Use USB serial; no Wi-Fi credentials needed')
    args=parser.parse_args()
    if args.usb:
        env=ROOT/'.env'
        key=secrets.token_urlsafe(24)
        if env.exists():
            match=re.search(r'^ASTRA_API_KEY=(.+)$',env.read_text(),re.M)
            if match: key=match.group(1).strip()
        env.write_text(f'ASTRA_MODE=hardware\nASTRA_API_KEY={key}\n')
        (ROOT/'firmware/include/secrets.h').write_text('#pragma once\n#define ASTRA_WIFI_SSID ""\n#define ASTRA_WIFI_PASSWORD ""\n#define ASTRA_SERVER_URL "http://127.0.0.1:8000"\n#define ASTRA_API_KEY ""\n')
        print(f'USB mode configured. Dashboard control key: {key}')
        return
    print("\nASTRA configuration — connect Mac and ESP32s to the same 2.4 GHz-capable network.\n")
    previous = {}
    header = ROOT / "firmware" / "include" / "secrets.h"
    if header.exists():
        for name, literal in re.findall(r'^#define (ASTRA_\w+) (".*")$', header.read_text(), re.M):
            try: previous[name] = json.loads(literal)
            except json.JSONDecodeError: pass
    ssid = input(f"Wi-Fi network name [{previous.get('ASTRA_WIFI_SSID', '')}]: ").strip() or previous.get("ASTRA_WIFI_SSID", "")
    if not ssid: raise SystemExit("Wi-Fi name is required. Run configure.py again.")
    password = getpass.getpass("Wi-Fi password (hidden; Enter keeps the previous one): ") or previous.get("ASTRA_WIFI_PASSWORD", "")
    host = input(f"Mac LAN IP address [{suggested_ip()}]: ").strip() or suggested_ip()
    try: socket.inet_aton(host)
    except OSError: raise SystemExit("Enter the Mac's numeric LAN IPv4 address, for example 192.168.1.100.")
    if host.startswith("127.") or host == "0.0.0.0": raise SystemExit("Use the Mac's LAN address, not localhost or 0.0.0.0.")
    key = previous.get("ASTRA_API_KEY") or secrets.token_urlsafe(24)
    values = {"ASTRA_WIFI_SSID": ssid, "ASTRA_WIFI_PASSWORD": password, "ASTRA_SERVER_URL": f"http://{host}:8000", "ASTRA_API_KEY": key}
    header.write_text("#pragma once\n" + "\n".join(f"#define {k} {json.dumps(v, ensure_ascii=True)}" for k, v in values.items()) + "\n")
    env = ROOT / ".env"
    env.write_text(f"ASTRA_MODE=hardware\nASTRA_API_KEY={key}\n")
    for path in [header, env]:
        try: os.chmod(path, 0o600)
        except OSError: pass
    print(f"\nConfigured server: http://{host}:8000")
    print(f"Dashboard control key: {key}")
    print("\nNext: install requirements-dev.txt, flash both boards, then run start.command.")
    print("Rebuild and reflash BOTH boards whenever you change Wi-Fi, the server IP, or the API key.")


if __name__ == "__main__": main()

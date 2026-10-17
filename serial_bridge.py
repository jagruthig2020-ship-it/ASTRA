#!/usr/bin/env python3
"""Relay real board JSON to FastAPI and return queued commands over USB."""
import argparse
import json
import os
from pathlib import Path
import threading
import time
import urllib.request
import urllib.error
import serial
from serial.tools import list_ports
from dotenv import load_dotenv


def forward(report, role, server, key):
    request=urllib.request.Request(f'{server}/api/devices/{role}/telemetry',
        data=json.dumps(report,allow_nan=False).encode(),
        headers={'Content-Type':'application/json','X-ASTRA-Key':key})
    with urllib.request.urlopen(request,timeout=2) as response:
        return json.load(response)


def worker(role,port,server,key,stop):
    while not stop.is_set():
        try:
            connection=serial.Serial(port=None,baudrate=115200,timeout=.3,write_timeout=1)
            connection.dtr=False; connection.rts=False; connection.port=port
            with connection:
                print(f'{role}: opened {port}',flush=True)
                last_log=0
                while not stop.is_set():
                    raw=connection.readline(4096)
                    try:
                        report=json.loads(raw)
                        if not isinstance(report,dict) or 'boot_id' not in report: continue
                        expected='probe_ok' if role=='main' else 'heartbeat_ok'
                        if expected not in report:
                            raise ValueError(f'Wrong firmware/port: {role} needs {expected}')
                        result=forward(report,role,server,key)
                        command=result.get('command')
                        if command:
                            connection.write((json.dumps(command)+'\n').encode())
                        if time.monotonic()-last_log>2:
                            print(f'{role}: accepted={result.get("accepted")} seq={report["seq"]} '
                                  f'temp={report.get("temperature_c")} V={report.get("voltage_v")} '
                                  f'mA={report.get("current_ma")} fault={report.get("fault")}',flush=True)
                            last_log=time.monotonic()
                    except (json.JSONDecodeError,UnicodeDecodeError): continue
                    except urllib.error.HTTPError as exc:
                        print(f'{role}: HTTP {exc.code}: {exc.read().decode()}',flush=True)
                        stop.wait(1); connection.reset_input_buffer()
                    except (ValueError,urllib.error.URLError,TimeoutError) as exc:
                        print(f'{role}: {exc}',flush=True)
                        stop.wait(1); connection.reset_input_buffer()
        except (serial.SerialException,OSError) as exc:
            print(f'{role}: {exc}; reconnecting',flush=True); stop.wait(2)


def main():
    load_dotenv(Path(__file__).resolve().parent/'.env')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list',action='store_true')
    parser.add_argument('--main'); parser.add_argument('--supervisor')
    parser.add_argument('--server',default='http://127.0.0.1:8000')
    args=parser.parse_args()
    if args.list:
        for p in list_ports.comports(): print(f'{p.device}  {p.description}  serial={p.serial_number}')
        return
    if not args.main and not args.supervisor: parser.error('Supply --main PORT and/or --supervisor PORT')
    if args.main and args.main==args.supervisor: parser.error('Each board requires its own port')
    key=os.getenv('ASTRA_API_KEY','')
    if not key: parser.error('Run python configure.py --usb first')
    stop=threading.Event(); threads=[]
    for role,port in [('main',args.main),('supervisor',args.supervisor)]:
        if port:
            t=threading.Thread(target=worker,args=(role,port,args.server.rstrip('/'),key,stop),daemon=True)
            threads.append(t);t.start()
    try:
        while not stop.wait(.5): pass
    except KeyboardInterrupt:
        stop.set()
        for t in threads:t.join(3)


if __name__=='__main__':main()

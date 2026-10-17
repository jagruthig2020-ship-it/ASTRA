import json
from unittest.mock import patch
import serial_bridge


def test_bridge_preserves_readings_and_returns_commands():
    report={'boot_id':'physical-a','seq':9,'uptime_ms':1234,
            'status':'healthy','temperature_c':29.5,'probe_ok':True}
    class Reply:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self): return b'{"accepted":true,"command":{"id":3,"action":"freeze"}}'
    with patch('urllib.request.urlopen', return_value=Reply()) as request:
        result=serial_bridge.forward(report,'main','http://127.0.0.1:8000','test-key')
    sent=request.call_args.args[0]
    assert json.loads(sent.data)==report
    assert sent.full_url.endswith('/api/devices/main/telemetry')
    assert sent.get_header('X-astra-key')=='test-key'
    assert result['command']=={'id':3,'action':'freeze'}

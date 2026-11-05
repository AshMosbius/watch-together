#!/usr/bin/env python3
"""Set the deployed URL as popup default before distributing the extension."""
import json, pathlib, sys
from urllib.parse import urlparse
endpoint = sys.argv[1].strip()
u = urlparse(endpoint)
if u.scheme != 'wss' or not u.hostname or u.username or u.password:
    raise SystemExit('Usage: python tools/set-endpoint.py wss://YOUR-SERVICE.onrender.com')
p = pathlib.Path(__file__).resolve().parents[1] / 'extension' / 'config.js'
p.write_text('const DEFAULT_ENDPOINT = ' + json.dumps(endpoint) + ';\n')
print('Default endpoint updated. Reload extension; regenerate ZIP before sharing.')

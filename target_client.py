#!/usr/bin/env python

# WS client example

import asyncio
import websockets
import json
import sys
from config import address, port

IP = address['target']
PORT = port['target']

def next_line(fname):
    while True:
        with open(fname, 'r') as file:
            for line in file:
                yield int(line)
            file.close()

async def periodic_publisher(fname, uri):
    target = next_line(fname)
    async for websocket in websockets.connect(uri):
        try:
            message = await websocket.recv()
            packet = json.loads(message)
            # print(packet)
            if packet['type'] == "tgt":
                tgt = next(target)
                data = {'event': 'set_tgt', 'tgt': tgt}
                await websocket.send(json.dumps(data))              
        except websockets.ConnectionClosed:
                print("WS Connection Back-Pressure: Using New Websocket.")
                continue

if (len(sys.argv) < 2) or (sys.argv[1] is None):
    name = 'config/targets.txt'
    print(f'Looking for targets in: {name} (default)')
else:
    name = sys.argv[1]
    print(f'Looking for targets in: {name}')

asyncio.get_event_loop().run_until_complete(periodic_publisher(name, f'ws://{IP}:{PORT}'))

#!/usr/bin/env python

# WS client example

import asyncio
import websockets
import json
import sys

IP = '128.2.244.29'
PORT = 6789

def next_line(fname):
    while True:
        with open(fname, 'r') as file:
            for line in file:
                yield int(line)
            close(file)

async def periodic_publisher(fname, uri):
    next_target = next_line(fname)
    async for websocket in websockets.connect(uri):
        try:
            message = await websocket.recv()
            packet = json.loads(message)
            try:
                if packet['event'] == "get_tgt":
                    tgt = next_target.next()
                    data = {'event': 'set_tgt', 'tgt': tgt}
                    await websocket.send(json.dumps(data))
            except Exception:
                pass                
        except websockets.ConnectionClosed:
                print("WS Connection Back-Pressure: Using New Websocket.")
                continue

if (len(sys.argv) < 2) or (sys.argv[1] is None):
    name = 'targets.txt'
    print("Looking for targets in default: targets.txt")
else:
    name = sys.argv[1]

asyncio.get_event_loop().run_until_complete(periodic_publisher(name, f'ws://{IP}:{PORT}'))

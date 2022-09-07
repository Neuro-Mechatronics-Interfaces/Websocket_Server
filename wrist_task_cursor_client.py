#!/usr/bin/env python

# WS client example

import asyncio
import websockets
import json
import serial
from config import address, port

IP = address['cursor']
PORT = port['cursor']

async def publisher(s, uri):
    async for websocket in websockets.connect(uri, ping_interval=20.0, ping_timeout=0.25):
        try:
            line = s.readline()
            vals = line.decode()
            x, y = vals.split(',')
            data = {'event': 'cursor', 'type': 'none', 'x': int(x), 'y': int(y)}
            await websocket.send(json.dumps(data))
        except (websockets.ConnectionClosed, websockets.ConnectionClosedOK, websockets.ConnectionClosedError):
            print("WS Connection Back-Pressure: Using New Websocket.")
            continue
                
with serial.Serial('/dev/ttyUSB0', 9600) as ser:
    ser.readline()
    asyncio.get_event_loop().run_until_complete(publisher(ser, f'ws://{IP}:{PORT}'))

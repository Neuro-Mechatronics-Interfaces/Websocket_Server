#!/usr/bin/env python

# WS client example

import asyncio
import websockets
import json
import serial

IP = '128.2.244.29'
PORT = 6789

async def publisher():
    uri = f'ws://{IP}:{PORT}'
    async with websockets.connect(uri) as websocket:
        with serial.Serial('/dev/ttyUSB0', 9600, timeout=1) as ser:
            while True:
                line = ser.readline()
                if line:
                    x, y = line.split(',')
                    await websocket.send(json.dumps({'event': 'xy', 'x': int(x), 'y': int(y)}))

asyncio.get_event_loop().run_until_complete(publisher())


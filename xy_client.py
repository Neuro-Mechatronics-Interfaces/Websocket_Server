#!/usr/bin/env python

# WS client example

import asyncio
import websockets
import json
import serial

IP = '128.2.244.29'
PORT = 6789
data = {'x': 0, 'y': 0}

async def publisher():
    async with websockets.connect(uri) as websocket:
        with serial.Serial('/dev/ttyUSB0', 9600, timeout=1) as ser:
            while True:
                line = ser.readline()
                if line:
                    x, y = line.split(',')
                    data['x'] = int(x)
                    data['y'] = int(y)
                    await websocket.send(json.dumps(**data))

asyncio.get_event_loop().run_until_complete(publisher())


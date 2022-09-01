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
        with serial.Serial('/dev/ttyUSB0', 9600) as ser:
            ser.readline()
            while True:
                line = ser.readline()
                vals = line.decode()
                # print(vals)
                x, y = vals.split(',')
                data = {'event': 'xy', 'x': int(x), 'y': int(y)}
                await websocket.send(json.dumps(data))
                print(data)

asyncio.get_event_loop().run_until_complete(publisher())


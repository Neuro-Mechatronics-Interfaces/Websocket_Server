#!/usr/bin/env python

# WS client example

import asyncio
import websockets
from config import address, port

IP = address['demo_server']
PORT = port['demo']

async def hello():
    uri = f"ws://{IP}:{PORT}"
    async with websockets.connect(uri) as websocket:
        name = input("What's your name? ")

        await websocket.send(name)
        print(f"> {name}")

        greeting = await websocket.recv()
        print(f"< {greeting}")

asyncio.get_event_loop().run_until_complete(hello())
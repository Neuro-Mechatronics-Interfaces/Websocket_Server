#!/usr/bin/env python

# WS client example

import asyncio
import websockets

IP = '128.2.244.29'
PORT = 6789

async def hello():
    uri = f"ws://{IP}:{PORT}"
    async with websockets.connect(uri) as websocket:
        name = input("What's your name? ")

        await websocket.send(name)
        print(f"> {name}")

        greeting = await websocket.recv()
        print(f"< {greeting}")

asyncio.get_event_loop().run_until_complete(hello())
#!/usr/bin/env python

# WS server example that synchronizes state across clients

import asyncio
import json
import websockets
from config import address, port

TARGET = {"value": 0,  
          "count": [0, 0, 0, 0, 0, 0, 0, 0]}

USERS = set()
IP = address['target']
PORT = port['target']

def target_event():
    return json.dumps({"event": "none", "type": "tgt", "tgt": TARGET["value"]})

async def notify_target():
    if USERS:
        message = target_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def register(websocket):
    USERS.add(websocket)

async def unregister(websocket):
    USERS.remove(websocket)

async def packet_handler(websocket, path):
    # register(websocket) sends user_event() to websocket
    await register(websocket)
    try:
        # await websocket.send(state_event())
        async for message in websocket:
            data = json.loads(message)
            if data["event"] == "get_tgt":
                await notify_target()
            elif data["event"] == "set_tgt":
                TARGET["value"] = data["tgt"]
                TARGET["count"][data["tgt"]] += 1
    finally:
        await unregister(websocket)
        print(TARGET)

server = websockets.serve(packet_handler, IP, PORT)
asyncio.get_event_loop().run_until_complete(server)
asyncio.get_event_loop().run_forever()

#!/usr/bin/env python

# WS server example that synchronizes state across clients

import asyncio
import json
import websockets
from config import address, port

POSITION = {
    "x": 0, 
    "y": 0
}

USERS = set()
IP = address['xy']
PORT = port['xy']


def users_event():
    return json.dumps({"event": "none", "type": "users", "count": len(USERS)})

def xy_event():
    return json.dumps({"event": "none", "type": "xy", "x": POSITION["x"], "y": POSITION["y"]})

async def notify_users():
    if USERS:  # asyncio.wait doesn't accept an empty list
        message = users_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_xy():
    if USERS:
        message = xy_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def register(websocket):
    USERS.add(websocket)
    await notify_users()


async def unregister(websocket):
    USERS.remove(websocket)
    await notify_users()


async def packet_handler(websocket, path):
    # register(websocket) sends user_event() to websocket
    await register(websocket)
    try:
        # await websocket.send(state_event())
        async for message in websocket:
            data = json.loads(message)
            if data["event"] == "xy":
                POSITION["x"] = data["x"]
                POSITION["y"] = data["y"]
                await notify_xy()
    finally:
        await unregister(websocket)


server = websockets.serve(packet_handler, IP, PORT)

asyncio.get_event_loop().run_until_complete(server)
asyncio.get_event_loop().run_forever()
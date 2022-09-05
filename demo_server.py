#!/usr/bin/env python

# WS server example that synchronizes state across clients

import asyncio
import json
import logging
import websockets
from config import address, port

logging.basicConfig()

STATE = {"value": 0,
         "tgt": 0, 
         "x": 0, 
         "y": 0}

USERS = set()
IP = address['demo']
PORT = port['demo']

def state_event():
    return json.dumps({"event": "none", "type": "state", "value": STATE["value"]})

def users_event():
    return json.dumps({"event": "none", "type": "users", "count": len(USERS)})

def touch_event():
    return json.dumps({"event": "none", "type": "touch", "x": STATE["x"], "y": STATE["y"]})

async def notify_state():
    if USERS:  # asyncio.wait doesn't accept an empty list
        message = state_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_users():
    if USERS:  # asyncio.wait doesn't accept an empty list
        message = users_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_touch():
    if USERS:
        message = touch_event()
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
            if data["event"] == "minus":
                STATE["value"] -= 1
                await notify_state()
            elif data["event"] == "plus":
                STATE["value"] += 1
                await notify_state()
            elif data["event"] == "click":
                STATE["x"] = data["x"]
                STATE["y"] = data["y"]
                await notify_touch()
            else:
                logging.error("unsupported event: %s", data)
    finally:
        await unregister(websocket)


server = websockets.serve(packet_handler, IP, PORT)

asyncio.get_event_loop().run_until_complete(server)
asyncio.get_event_loop().run_forever()
#!/usr/bin/env python

# WS server example that synchronizes state across clients

import asyncio
import json
import logging
import websockets

logging.basicConfig()

STATE = {"value": 0,
         "x": 0, 
         "y": 0}

USERS = set()
LAST = ""

IP = '128.2.244.29'
PORT = 6789

def state_event():
    return json.dumps({"type": "state", "value": STATE["value"]})

def users_event():
    return json.dumps({"type": "users", "count": len(USERS), "last": LAST})

def touch_event():
    return json.dumps({"type": "touch", "x": STATE["x"], "y": STATE["y"]})

def xy_event():
    return json.dumps({"type": "xy", "x": STATE["x"], "y": STATE["y"]})

async def notify_state():
    if USERS:  # asyncio.wait doesn't accept an empty list
        message = state_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_users():
    if USERS:  # asyncio.wait doesn't accept an empty list
        message = users_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_xy():
    if USERS:
        message = xy_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def notify_touch():
    if USERS:
        message = touch_event()
        await asyncio.wait([user.send(message) for user in USERS])

async def register(websocket):
    USERS.add(websocket)
    LAST = websocket
    await notify_users()


async def unregister(websocket):
    USERS.remove(websocket)
    await notify_users()


async def counter(websocket, path):
    # register(websocket) sends user_event() to websocket
    await register(websocket)
    try:
        await websocket.send(state_event())
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
            elif data["event"] == "xy":
                STATE["x"] = data["x"]
                STATE["y"] = data["y"]
                await notify_xy()
            else:
                logging.error("unsupported event: %s", data)
    finally:
        await unregister(websocket)


start_server = websockets.serve(counter, IP, PORT)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
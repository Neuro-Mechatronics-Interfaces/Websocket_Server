#!/usr/bin/env python
# WS server example that synchronizes state across clients
from component import CenterOut
from config import address, port
import asyncio, json, sys, websockets


if __name__ == "__main__":
    if len(sys.argv) == 3:
        t_file = sys.argv[1]
        p_file = sys.argv[2]
    elif len(sys.argv) == 2:
        t_file = sys.argv[1]
        p_file = 'config/params.txt'
    else:
        t_file = 'config/targets.txt'
        p_file = 'config/params.txt'

    game = CenterOut(targets_file = 'config/targets.txt', params_file = 'config/params.txt')
    with open('state_machine.png', 'bw') as f:
        game.get_graph().draw(f, format='png', prog='dot')
    server = websockets.serve(game.cursor_and_task_state_messages, 
                            address['cursor'], 
                            port['cursor'])

    asyncio.get_event_loop().run_until_complete(server)
    asyncio.get_event_loop().run_forever()
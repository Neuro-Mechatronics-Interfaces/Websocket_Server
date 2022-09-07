#!/usr/bin/env python
import asyncio, csv, json, math, websockets
from .enumerations import TaskState, OutcomeState, TaskDirection
from numpy import random as rng
from transitions.extensions import AsyncGraphMachine as AGMachine
from transitions.extensions.states import add_state_features
from transitions.extensions.asyncio import AsyncTimeout


def randomize(min_val: float, max_val: float = None, cdf_bound = 5):
    """Returns a random value (seconds) from an exponential distribution with fixed upper and lower bounds."""
    # Setting exponential cdf: 99.326% of values fall between [0, 5 * (1/lambda)]
    #   Note: lambda is sometimes called "intensity" parameter (it's the mean RATE of "something happens")
    #   So we want to compute intensity to create a good exponential distribution that uses most of the "bandwidth" between t_min and t_max
    #   --> (t_max_s - t_min_s) = beta_upper
    #    --> let beta_upper == cdf_bound / beta
    #    --> beta = beta_upper / cdf_bound
    if max_val is None:
        random_out = min_val
    elif max_val > min_val:
        beta = (max_val - min_val) / cdf_bound
        # Add the minimum number of seconds back onto the value, and clip to t_max_s (should rarely clip if cdf_bound is high enough)
        random_out = min(rng.exponential(scale=beta), max_val) + min_val
    else:
        random_out = min_val
    return random_out


def linear_map(x: float, a: float, b: float, c: float, d: float) -> float:
    """Provide a linear mapping from x in range [a, b] to corresponding value y in [c, d]."""
    return c + (x - a) * (d - c) / (b - a)

def l2norm(dx: float, dy: float) -> float: 
    return math.sqrt(dx * dx + dy * dy)

def ema(alpha: float, x: float, y: float) -> float:
    """Applies EMA coefficient to x given past last sample of x (y)."""
    return (alpha * x) + ((1 - alpha) * y)

@add_state_features(AsyncTimeout)
class TimeoutMachine(AGMachine):
    pass


class CenterOut(object):

    # Define game states for Hierarchical model
    states = [
        {'name': TaskState.idle},  
        {'name': TaskState.t1_pre}, 
        {'name': TaskState.t1_hold_1, 'timeout': 0.500, 'on_timeout': 'instruct'}, 
        {'name': TaskState.t1_hold_2, 'timeout': 1.000, 'on_timeout': 'cue'},
        {'name': TaskState.go,        'timeout': 0.100, 'on_timeout': 'fail'},
        {'name': TaskState.move,      'timeout': 0.750, 'on_timeout': 'fail'},
        {'name': TaskState.t2_hold_1,   'timeout': 0.300, 'on_timeout': 'succeed'},
        {'name': TaskState.overshoot,   'timeout': 0.250, 'on_timeout': 'fail'}, 
        {'name': TaskState.reward,    'timeout': 0.250, 'on_timeout': 'advance'}
    ]

    # Define transitions between the game states
    transitions = [
        {'trigger': 'start', 'source': TaskState.idle, 'dest': TaskState.t1_pre, 'before': 'announce_leaving', 'after': 'announce_entering'},
        {'trigger': 'resume', 'source': TaskState.idle, 'dest': TaskState.t1_pre, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'pause', 'source':'*', 'dest': TaskState.idle, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'stop', 'source':'*', 'dest': TaskState.idle, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'reset', 'source': '*', 'dest': TaskState.t1_pre, 'before': 'announce_leaving_reset', 'after':'announce_entering'}, 
        {'trigger': 'enter_t1', 'source': TaskState.t1_pre, 'dest': TaskState.t1_hold_1, 'before':'announce_leaving', 'after':'announce_entering'}, 
        {'trigger': 'leave_t1', 'source': TaskState.t1_hold_1, 'dest': TaskState.t1_pre, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'instruct', 'source': TaskState.t1_hold_1, 'dest': TaskState.t1_hold_2, 'before':'announce_leaving', 'after':'announce_entering'}, 
        {'trigger': 'cue', 'source': TaskState.t1_hold_2, 'dest': TaskState.go, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'react', 'source': TaskState.go, 'dest': TaskState.move, 'before':'announce_leaving', 'after':'announce_entering'},
        {'trigger': 'enter_t2', 'source': TaskState.move, 'dest': TaskState.t2_hold_1, 'before':'announce_leaving', 'after':'announce_entering'}, 
        {'trigger': 'overshoot', 'source': TaskState.t2_hold_1, 'dest': TaskState.overshoot, 'before':'announce_leaving_on_overshoot', 'after':'announce_entering'}, 
        {'trigger': 'enter_t2', 'source': TaskState.overshoot, 'dest': TaskState.t2_hold_1, 'before':'announce_leaving', 'after':'announce_entering'}, 
        {'trigger': 'succeed', 'source': TaskState.t2_hold_1, 'dest': TaskState.reward, 'before':'announce_leaving', 'after':'signal_reward'}, 
        {'trigger': 'advance', 'source': TaskState.reward, 'dest': TaskState.t1_pre, 'before':'announce_leaving', 'after':'count_good'},
        {'trigger': 'fail', 'source': '*', 'dest': TaskState.t1_pre, 'before': 'announce_leaving', 'after':'count_bad'}
    ]
    

    def __init__(self, targets_file: str = '../config/targets.txt', params_file: str = '../config/params.json'):
        '''Constructor for CenterOut object.'''
        import logging
        logging.getLogger("websockets").addHandler(logging.NullHandler())
        logging.getLogger("websockets").propagate = False
        self.logging = logging
        self.logging.basicConfig(filename='example.log', filemode='w', level=logging.INFO, format='%(asctime)s::CENTER-OUT::%(levelname)s::%(message)s')
        self.w = 1200 # see .canvas in css/main.css --> this is width
        self.h = 800  # see .canvas in css/main.css --> this is height
        self.x = 600  # see .canvas in css/main.css --> this is half of height
        self.y = 400  # see .canvas in css/main.css --> this is half of width
        self.n = {
            'total': 0, 
            'successful': 0, 
            'unsuccessful': 0,
            'overshoots': 0
        }
        self._r = 50.0 # will change
        # Initialize the state machine
        self.machine = TimeoutMachine(model=self, 
                                      states=CenterOut.states, 
                                      transitions=CenterOut.transitions,
                                      initial='idle', 
                                      ignore_invalid_triggers=True, 
                                      queued=True)

        self._t = {
            TaskDirection.IN: [(self.w / 2, self.h / 2)] * 8,
            TaskDirection.OUT: [(self.w / 2, self.h / 2)] * 8 
        }
        self.p = {'Subject': "Unknown"}
        self.update_parameters(params_file)
        self._target = CenterOut._next_line(targets_file)
        self._users = set()

        self.target = next(self._target)
        self.direction = [TaskDirection.IN, TaskDirection.OUT]

    async def check_state(self):
        """ Runs the state machine for the game. """
        s = self.state.name
        if s == 'idle': # Do nothing.
            pass
        elif s == 't1_pre': # Check to see if we have hit T1.
            if self.in_t1():
                await self.enter_t1() # Advances state to t1_hold_1

        elif s == 't1_hold_1': # Check if we haven't left T1 yet (advance state to t1_hold_2 on timeout)
            if not self.in_t1():
                await self.leave_t1() # Failure, but not counted as such (too early in trial).

        elif s == 't1_hold_2': # Check if we haven't left T1 yet (advance state to go on timeout)
            if not self.in_t1():
                await self.fail()  

        elif s == 'go': # Check if we have left T1 yet (fails on timeout)
            if not self.in_t1():
                await self.react()  # Advances state to move

        elif s == 'move': # Check to see if we have hit T2 yet (fails on timeout)
            if self.in_t2():
                await self.enter_t2() # Advances state to t2_hold_1

        elif s == 't2_hold_1': # Check that we have not left T2 yet (advances on timeout)
            if not self.in_t2():
                await self.overshoot() # Advances state to overshoot

        elif s == 'overshoot': # Check to see if we went back into T2 (fails on timeout)
            if self.in_t2():
                await self.enter_t2() # Advances state to t2_hold_1

        elif s == 'reward': # Do nothing.
            pass
    
    def signal_reward(self):
        """ Run reward dispenser here. """
        self.logging.info(f'SIGNAL::{self.state.name}::')

    def count_good(self):
        """ Increment successful and total trial counters. Also, flip order of t1/t2 (inner vs outer). """
        self.n['successful'] += 1
        self.n['total'] += 1
        self.n['overshoots'] = 0
        if self.n.successful % 2 == 0:
            self.direction = [TaskDirection.IN, TaskDirection.OUT]
            self.target = next(self._target)
        else:
            self.direction = [TaskDirection.OUT, TaskDirection.IN]
        self.announce_entering()

    def count_bad(self):
        """ Increment unsuccessful and total trial counters. """
        self.n['unsuccessful'] += 1
        self.n['total'] += 1
        self.n['overshoots'] = 0
        self.announce_entering()

    def in_t1(self) -> bool:
        """ Check if cursor is in primary target. """
        return l2norm(self._t[self.direction[0]][self.target][0] - self.x, 
                      self._t[self.direction[0]][self.target][1] - self.y) < self._r

    def in_t2(self) -> bool:
        """ Check if cursor is in secondary target. """
        return l2norm(self._t[self.direction[1]][self.target][0] - self.x, 
                      self._t[self.direction[1]][self.target][1] - self.y) < self._r

    def _precompute_target_locations(self):
        """ Precomputes target locations (should be called any time target parameters are changed). """
        n = int(self.p['N Targets'])
        r = self.p['Outer Target Circle Radius']
        o = math.radians(self.p['Target Angle Offset'])
        self._t[TaskDirection.IN] = [(self.w/2, self.h/2)] * n
        self._t[TaskDirection.OUT] = [(None, None)] * n
        for i in range(n):
            theta_rad = i * math.pi / n + o
            self._t[TaskDirection.OUT][i] = (self.w/2 + round(r * math.cos(theta_rad)), self.h/2 + round(r * math.sin(theta_rad)))

    def _precompute_state_timeouts(self):
        """ Precomputes state timeouts. """
        self.machine.states[TaskState.t1_hold_1.name].timeout = randomize(self.p['Min T1_HOLD_1 Time'], self.p['Max T1_HOLD_1 Time'])
        self.machine.states[TaskState.t1_hold_2.name].timeout = randomize(self.p['Min T1_HOLD_2 Time'], self.p['Max T1_HOLD_2 Time'])
        self.machine.states[TaskState.go.name].timeout = self.p['Fixed GO Limit']
        self.machine.states[TaskState.move.name].timeout = self.p['Fixed MOVE Limit']
        self.machine.states[TaskState.t2_hold_1.name].timeout = self.p['Fixed T2_HOLD_1 Limit']
        self.machine.states[TaskState.reward.name].timeout = self.p['Fixed REWARD Delay']

    def announce_leaving(self):
        self.logging.info(f'LEFT::{self.state.name}::')
        # Randomize for next time, in case of t1_hold_1 or t1_hold_2:
        if self.state.name == 't1_hold_1': 
            self.machine.states[TaskState.t1_hold_1.name].timeout = randomize(self.p['Min T1_HOLD_1 Time'], self.p['Max T1_HOLD_1 Time'])
        elif self.state.name == 't1_hold_2':
            self.machine.states[TaskState.t1_hold_2.name].timeout = randomize(self.p['Min T1_HOLD_2 Time'], self.p['Max T1_HOLD_2 Time'])

    def announce_leaving_on_overshoot(self):
        self.n['overshoots'] += 1
        self.logging.info(f"LEFT::{self.state.name}::OVERSHOOTS={self.n['overshoots']}")

    def announce_leaving_reset(self):
        self.n['overshoots'] = 0
        self.n['total'] = 0
        self.n['successful'] = 0
        self.n['unsuccessful'] = 0
        self.logging.info(f"LEFT::{self.state.name}::RESET")

    def announce_entering(self):
        self.logging.info(f'ENTERED::{self.state.name}::')

    def update_parameters(self, fname: str):
        with open(fname, 'r') as f:
            tsv_file = csv.reader(f, delimiter="\t")
            for line in tsv_file:
                if line[2]=="None":
                    self.p[line[0]] = line[1]
                elif line[2]=="bool":
                    self.p[line[0]] = line[1] == "True"
                else:
                    self.p[line[0]] = float(line[1])
        self._r = self.p['Target Size'] + self.p['Cursor Size']
        self._precompute_target_locations()
        self._precompute_state_timeouts()

    def update_targets(self, fname: str):
        del self._target
        self._target = CenterOut._next_line(fname)
        self.target = next(self.target)

    def users_event(self):
        return json.dumps({"event": "none", "type": "users", "count": len(self._users)})

    def cursor_event(self):
        return json.dumps({"event": "none", "type": "cursor", "x": int(self.x), "y": int(self.y), "target": self.target, "state": self.state.name, "direction": str(self.direction[1].name).lower()})

    def params_event(self):
        return json.dumps({
            "event": "none", 
            "type": "params", 
            "BaselineTrials": self.p['N Trials Baseline'], 
            "PeturbationTrials": self.p['N Trials Perturbation'], 
            "WashoutTrials": self.p['N Trials Washout'], 
            "VMR_Rotation": self.p['VMR Rotation Angle'],
            "Mode": self.p['Mode'], 
            "TargetRingRadius": self.p['Outer Target Circle Radius'], 
            "TargetSize": self.p['Target Size'], 
            "CursorSize": self.p['Cursor Size'], 
            "JitterAngularVar": self.p['Jitter Angular Variance'], 
            "Alpha": self.p['EMA Alpha'], 
            "ADCLeft": self.p['ADC Left'], 
            "ADCRight": self.p['ADC Right'],
            "ADCTop": self.p['ADC Top'], 
            "ADCBottom": self.p['ADC Bottom']
        })

    async def notify_users(self):
        if self._users:  # asyncio.wait doesn't accept an empty list
            message = self.users_event()
            await asyncio.wait([user.send(message) for user in self._users])

    async def notify_cursor(self):
        if self._users:
            message = self.cursor_event()
            await asyncio.wait([user.send(message) for user in self._users])

    async def notify_params(self):
        if self._users:
            message = self.params_event()
            await asyncio.wait([user.send(message) for user in self._users])

    async def register(self, websocket):
        self._users.add(websocket)
        await self.notify_users()

    async def unregister(self, websocket):
        self._users.remove(websocket)
        await self.notify_users()

    async def cursor_and_task_state_messages(self, websocket, path):
        # register(websocket) sends user_event() to websocket
        await self.register(websocket)
        try:
            # await websocket.send(state_event())
            async for message in websocket:
                data = json.loads(message)
                if data["event"] == "cursor":
                    self.x = ema(self.p['EMA Alpha'], 
                                    linear_map(data["x"], self.p['ADC Left'], self.p['ADC Right'], 0, self.w), 
                                    self.x)
                    self.y = ema(self.p['EMA Alpha'], 
                                    linear_map(data["y"], self.p['ADC Bottom'], self.p['ADC Top'], 0, self.h), 
                                    self.y)
                    await self.check_state()
                    await self.notify_cursor()
                elif data["event"] == "params":
                    self.update_parameters(data["filename"])
                    await self.notify_params()
                elif data["event"] == "targets":
                    self.update_targets(data["filename"])
                elif data["event"] == "start":
                    await self.start()
                elif data["event"] == "pause":
                    await self.pause()
                elif data["event"] == "stop":
                    await self.stop()
                elif data["event"] == "reset":
                    await self.reset()
                elif data["event"] == "resume":
                    await self.resume()
        except (websockets.ConnectionClosed, websockets.exceptions.ConnectionClosedOK, websockets.ConnectionClosedError):
            self.logging.debug('CLOSED::WS::OK')
        finally:
            await self.unregister(websocket)

    @staticmethod
    def _next_line(fname):
        while True:
            with open(fname, 'r') as file:
                for line in file:
                    yield int(line)
                file.close()
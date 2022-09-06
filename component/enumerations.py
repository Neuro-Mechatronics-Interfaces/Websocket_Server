#!/usr/bin/env python3
# -*- coding: utf-8 -*-
""" Module containing enumerations related to task structure.

Note:
    - Modified version from NHP_Radial_Cursor (2022-09-05).

Authors:
    - Jonathan Shulgach
    - Max Murphy
"""
from enum import Enum


class TaskOrientation(Enum):
    """Possible task orientations."""
    MID = 0
    PRO = 1
    SUP = 2
    

class TaskDirection(Enum):
    """Possible task target directions."""
    OUT = 0   # "Center --> Out" version (always starts out on this for basic game)
    IN  = 1   # "Out --> Center" version (after a success, then the same target is held and you return to center)


class TaskMode(Enum):
    """Enumerated modes the game can take, which might influence how it runs (NOT USED AS OF 7/1/21)."""
    standard    = 0
    jitter      = 1
    homing      = 2
    vmr         = 3


class TaskType(Enum):
    """Enumerated types of tasks, which might influence how the game runs (NOT USED AS OF 7/1/21)."""
    standard    = 0
    stimulation = 1
    torque      = 2


class OutcomeState(Enum):
    """Possible integer values results related to a single-trial outcome could take."""
    success = 1
    failure = 0


class TaskState(Enum):
    """Enumerated states the game can take as it runs the finite state machine. These are 'abstract' actions in the game."""
    idle      = 0
    t1_pre    = 1
    t1_hold_1 = 2
    t1_hold_2 = 3
    go        = 4
    move      = 5
    t2_hold_1 = 6
    overshoot = 7
    reward    = 8

    
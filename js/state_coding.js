const validModes = ["standard", "jitter", "homing", "vmr"];
const pars = {
  BaselineTrials: 5, // Total # baseline trials
  PerturbationTrials: 5, // Total # perturbation trials
  WashoutTrials: 5, // Total # washout trials
  VMR_Rotation: 30, // degrees
  TargetRingRadius: 200, // pixels
  TargetSize: 20, // pixels, radius
  CursorSize: 5, // pixels, radius
  JitterAngularVar: 10.0, // degrees (variance)
  Mode: validModes[0], // modified "modes" for task to run in
  T1_Hold_1: 500.0, 
  T1_Hold_2: 750.0,
  T2_Hold_1: 500.0,
  Move: 2000.0,
  Overshoot: 450.0, 
  React: 450.0, 
  Alpha: 0.1, // EMA coefficient
  Beta: 0.9, // 1 - EMA coefficient
  ADC: {
    Left: 0,      // Left-range value from microcontroller
    Right: 675,   // Right-range value from microcontroller.
    Bottom: 600,  // Bottom-range value from microcontroller.
    Top: 0        // Top-range value from microcontroller.
  }
};
const HOLD_PERIOD = 1000;
const TARGET_PERIOD = 500;

// Pre-compute the target locations so that they don't get re-calculated each time the Check is called:
const tx = new Array(8),
  ty = new Array(8),
  ttheta = new Array(8);

const coeffs = butter(0.2, 1.0);
var updated_target_index = 0;

var BoxWidth, BoxHeight,
    users = document.querySelector('.users'),
    canvas = document.querySelector('.task'), 
    trials = document.querySelector('.trials'),
    orientation = document.querySelector('.orientation');

// Create global state and data variables
var state = initState();
var data = initData();

// console.log(history);
state.canvas.width = BoxWidth*2;
state.canvas.height = BoxHeight*2;

const modeButton = document.getElementById("modeButton");
const saveButton = document.getElementById("saveButton");
const startButton = document.getElementById("startButton").classList = "btn btn-success";
const endButton = document.getElementById("endButton").classList = "btn btn-outline-danger";
const context = state.canvas.getContext("2d");

// Precompute target positions
function initPositions(w, h) {
  for (var i = 0; i < 8; i++) {
    ttheta[i] = (i * Math.PI) / 4;
    tx[i] = w + pars.TargetRingRadius * Math.cos(ttheta[i]);
    ty[i] = h + pars.TargetRingRadius * Math.sin(ttheta[i]);
  }
}

// Returns initial state data.
function initState() {
  let content = document.getElementById("task");
  BoxWidth = content.clientWidth / 2;
  BoxHeight = content.clientHeight / 2;
  return {
    running: false,
    taskMode: document.getElementById("modeButton").innerText,
    taskState: "idle",
    trialType: "baseline",
    numTrials: 0,
    numSuccessful: 0, 
    numOvershoots: 0, 
    trialStart: null,
    t1Start: null,
    t2Start: null, 
    moveStart: null, 
    overshootStart: null, 
    direction: "out",
    target: getRandomTargetIndex(),
    canvas: document.getElementById("task"),
  };
}

// Returns initial data structure for stored data.
function initData() {
  return {
    trialID: [], 
    trialNum: [],
    trialAttempt: [], 
    trialOvershoots: [], 
    trialPhase: [],
    trialType: [],
    trialMode: [],
    trialTarget: [],
    trialDirection: [],
    time: [],
    handX: [],
    handY: [],
    cursorX: [],
    cursorY: [],
    // For plotting
  };
}

// Begin a new trial
function newTrial() {
  if (state.direction === "out") {
    console.log("New Target Index: ", updated_target_index);
    state.target = updated_target_index;
  }
  if (state.numSuccessful > pars.BaselineTrials + pars.PerturbationTrials + pars.WashoutTrials) {
    endSession(); // If too many trials, end the session.
  }
  // Determine trial type
  if (state.numSuccessful < pars.BaselineTrials) {
    state.trialType = "baseline";
  } else if (state.numSuccessful < pars.BaselineTrials + pars.PerturbationTrials) {
    state.trialType = "vmr";
  } else {
    state.trialType = "washout";
  }
  state.numAttempts += 1;
  state.numOvershoots = 0;

  // Draw targets and center spot
  baseGraphics("orange", false);
  state.taskState = "pre";
  state.trialStart = getCurrentTime();
}

// End the current trial by updating state parameters.
function endTrial() {
  trials.innerText = `${state.numSuccessful}/${state.numTrials}`
  newTrial();
}

// Draw base graphics on the canvas 2d context
function baseGraphics(c_start, hl_target) {
  context.width = 2 * BoxWidth;
  context.height = 2 * BoxHeight;
//   console.log(context);
  // Background
  context.fillStyle = "black";
  context.fillRect(0, 0, context.width, context.height);

  if (state.direction === "out") {
    // Start
    drawCircle(BoxWidth, BoxHeight, pars.TargetSize, c_start);

    // Target
    if (['t1_hold_2', 'go', 'move', 't2_hold', 'success', 'overshoot'].indexOf(state.taskState) >= 0) {
      drawTarget(state.target, hl_target);
    }
  } else { // "in"
    // Start
    drawCircle(tx[state.target], ty[state.target], pars.TargetSize, c_start);

    // Center
    if (['t1_hold_2', 'go', 'move', 't2_hold', 'success', 'overshoot'].indexOf(state.taskState) >= 0) {
      drawTarget(state.target, hl_target);
    }
  }
}

// Draw a filled circle with color c and radius r centered at <x,y>
function drawCircle(x, y, r, c) {
  context.beginPath();
  context.arc(x, y, r, 0, 2 * Math.PI);
  context.fillStyle = c;
  context.fill();
  context.linewidth = 0;
  context.stroke();
}

// Draw the radially-distributed target circles
function drawTarget(index, hl_target) {
  if (state.direction === "out") {
    if (index == state.target) {
      if (hl_target) {
        c = "cyan";
      } else {
        c = "seagreen";
      }
    } else {
      c = "black";
    }
    drawCircle(tx[index], ty[index], pars.TargetSize, c);
  } else {
    if (hl_target) {
      c = "cyan";
    } else {
      c = "seagreen";
    }
    drawCircle(BoxWidth, BoxHeight, pars.TargetSize, c);
  }
}

// Draw the actual cursor
function drawCursor(x, y, c) {
  drawCircle(x, y, pars.CursorSize, c);
}

// Check if mouse is in start target
function startCheck(x, y) {
  let radius;
  if (state.direction === "out") {
    radius = l2norm(x - BoxWidth, y - BoxHeight);
  } else {
    radius = l2norm(x - tx[state.target], y - ty[state.target]);
  }
  if (radius < pars.TargetSize) {
    return true;
  } else {
    return false;
  }
}

// Check if the cursor has entered the target.
function targetCheck(x, y) {
  let radius;
  if (state.direction === "out") {
    radius = l2norm(tx[state.target] - x, ty[state.target] - y);
  } else {
    radius = l2norm(BoxWidth - x, BoxHeight - y);
  }
  
  if (radius < pars.TargetSize) {
    return true;
  } else {
    return false;
  }
}

function trial_was_successful() {
  state.numSuccessful += 1;
  if (state.direction === "out") {
    state.direction = "in";
  } else {
    state.direction = "out";
  }
}

function trial_was_unsuccessful(h) {
  // state.taskState = "pre";
  baseGraphics("orange", false);
  drawCursor(h.x, h.y, "white");
  newTrial();
}

function indicate_in_t1_hold_1(h) {
  // state.taskState = "t1_hold_1";
  baseGraphics("cyan", false);
  drawCursor(h.x, h.y, "gold");
}

function indicate_in_t1_hold_2(h) {
  // state.taskState = "t1_hold_2";
  baseGraphics("cyan", true);
  drawCursor(h.x, h.y, "blue");
}

function indicate_in_go(h) {
  // state.taskState = "go";
  baseGraphics("black", false);
  drawCursor(h.x, h.y, "blue");
}

function indicate_in_move(h) {
  // state.taskState = "move";
  baseGraphics("black", false);
  drawCursor(h.x, h.y, "blue");
}

function indicate_in_t2_hold_1(h) {
  // state.taskState = "t2_hold_1";
  baseGraphics("black", false);
  drawCursor(h.x, h.y, "gold");
}

function indicate_in_overshoot(h) {
  // state.taskState = "overshoot";
  baseGraphics("black", false);
  drawCursor(c.x, c.y, "red");
}

function indicate_in_success(h) {
  // state.taskState = "success";
  baseGraphics("black", false);
  drawCursor(c.x, c.y, "white");
}

// Handles rescaling the data based on calibration values
function handleCalibratedScaling(x, y) {
  return {
    x: linearMap(packet.x, pars.ADC.Left, pars.ADC.Right, 0, 2*BoxHeight),
    y: linearMap(packet.y, pars.ADC.Bottom, pars.ADC.Top, 0, 2*BoxWidth )
  };
}

// State machine
function handleState(s, h) {
  // Current state options:
  // 0. "idle"      : Paused, etc.
  // 1. "t1_pre"    : Pre-trial
  // 2. "t1_hold_1" : Holding, in trial onset circle
  // 3. "t1_hold_2" : Still holding, in trial onset circle but now see t2.
  // 4. "go"        : In trial onset circle, cue received
  // 5. "move"      : Moving to target (outside onset circle)
  // 6. "t2_hold_1" : Inside the target circle
  // 7. "overshoot" : Already went to "5" on this trial and now outside target
  // 8. "success"   : Successfully completed the trial.

  console.log(s);
  let c = h;  // we can also make c be the "rotated" data or whatever (TODO)
  appendData(c.x, c.y, h.x, h.y);
  if (s === "idle") {
    return;
  }
  if (s === "t1_pre") {
    // 1
    if (startCheck(c.x, c.y)) {
      state.t1Start = getCurrentTime();
      indicate_in_t1_hold_1(c);
      return;
    } else {
      baseGraphics("orange", false);
      drawCursor(c.x, c.y, "white");
      return;
    }
  } else if (s === "t1_hold_1") {
    // 2 : Target is holding in t1
    if (getTimeSince(state.t1Start) > pars.T1_Hold_1) { // held long enough in t1 to complete t1_hold_1
      if (startCheck(c.x, c.y)) { // and we are still in t1
        indicate_in_t1_hold_2(c);
        return;
      } else { // otherwise we left t1 too early.
        trial_was_unsuccessful(c);
        return;
      }
    } else if (startCheck(h.x, h.y) === false) { // moved out of t1
      trial_was_unsuccessful(c);
      return;
    } else { // otherwise we are still waiting in t1_hold_1
      indicate_in_t1_hold_1(c);
      return;
    }
  } else if (s === "t1_hold_2") {
    // 3 : Target is holding in t1; t2 has been shown.
    if (getTimeSince(state.t1Start) > (pars.T1_Hold_1+pars.T1_Hold_2)) { // held long enough in t1 to complete t1_hold_2
      if (startCheck(h.x, h.y)) { // and we are still in t1
        indicate_in_go(c);
        state.moveStart = getCurrentTime();
        return;
      } else { // otherwise we left t1 too early.
        trial_was_unsuccessful(c);
        return;
      }
    } else if (startCheck(h.x, h.y) === false) { // we moved out of t1 too early
      trial_was_unsuccessful(c);
      return;
    } else { // otherwise we are still waiting in t1_hold_2
      indicate_in_t1_hold_2(c);
    }
  } else if (s === "go") {
    // 4 : (Transition) Go-Cue has been observed.
    if (getTimeSince(state.moveStart) > pars.React) { // if we took too long
      if (startCheck(c.x, c.y)) { // if we are still in the start target
        trial_was_unsuccessful(c);
        console.log("Too slow!");
        return;
      } else { // we left in time
        indicate_in_move(c);
        return;
      }
    } else {
      if (startCheck(c.x, c.y)) { // if we are still in the start target
        indicate_in_go(c);
        return;
      } else { // we left in time
        indicate_in_move(c);
        return;
      }
    }
  } else if (s === "move") {
    // 5 : Movement that has not yet reached the target.
    if (getTimeSince(state.moveStart) > pars.Move) { // if we are out of time
      if (targetCheck(c.x, c.y)) { // if we hit the target, we're good
        indicate_in_t2_hold_1(c);
        state.t2Start = getCurrentTime();
        return;
      } else { // otherwise, we have failed.
        trial_was_unsuccessful(c);
        return;
      }
    } else {
      if (targetCheck(c.x, c.y)) { // We hit the target, we're good
        indicate_in_t2_hold_1(c);
        state.t2Start = getCurrentTime();
        return;
      } else { // otherwise we are still in MOVE
        indicate_in_move(c);
        return;
      }
    }
    
  } else if (s === "t2_hold_1") {
    // 6 : Cursor is in the desired target.
    if (getTimeSince(state.t2Start) > pars.T2_Hold_1) {
      if (targetCheck(c.x, c.y)) {
        // cursor stayed in the target long enough for success.
        indicate_in_success(c);
      } else {
        state.numOvershoots += 1;
        indicate_in_overshoot(c);
        state.overshootStart = getCurrentTime();
      }
    } else if (targetCheck(c.x, c.y) === false) {
      // cursor LEFT the target. indicate OVERSHOOT
      state.numOvershoots += 1;
      indicate_in_overshoot(c);
      state.overshootStart = getCurrentTime();
      return;
    } else { // otherwise still holding t2_hold_1
      indicate_in_t2_hold_1(c);
      return;
    }
  } else if (s === "overshoot") {
    // 7 : Cursor has overshot the target
    if (getTimeSince(state.overshootStart) > pars.Overshoot) { // if we are out of time
      if (targetCheck(c.x, c.y)) { // if we hit the target, we're good
        indicate_in_t2_hold_1(c);
        state.t2Start = getCurrentTime();
        return;
      } else { // otherwise, we have failed.
        trial_was_unsuccessful(c);
        return;
      }
    } else {
      if (targetCheck(c.x, c.y)) { // We hit the target, we're good
        indicate_in_t2_hold_1(c);
        state.t2Start = getCurrentTime();
        return;
      } else { // otherwise we are still in MOVE
        indicate_in_overshoot(c);
        return;
      }
    }
  } else if (s === "success") {
    // 8 : (Transition) Trial completed successfully.
    trial_was_successful();
    endTrial();
    return;
  } else {
    throw "Invalid state: '" + s + "'!";
  }
  appendData(h.x, h.y, c.x, c.y);
}

// Collect data helper function -- append data to arrays for each timestep
function appendData(handX, handY, cursorX, cursorY) {
  data.trialID.push(state.numTrials);
  data.trialNum.push(state.numSuccessful);
  data.trialOvershoots.push(state.numOvershoots);
  data.trialPhase.push(state.taskState);
  data.trialType.push(state.trialType);
  data.trialTarget.push(state.target);
  data.trialMode.push(state.taskMode);
  data.trialDirection.push(state.direction);
  data.time.push(getTimeSince(state.trialStart));
  data.handX.push(handX);
  data.handY.push(handY);
  data.cursorX.push(cursorX);
  data.cursorY.push(cursorY);
}

// Save data to a csv file
function saveData() {
  var rows = [
    [
      "trialID", 
      "trialNum",
      "trialOvershoots", 
      "trialPhase",
      "trialType",
      "trialDirection", 
      "time",
      "cursorX",
      "cursorY",
      "handX",
      "handY",
    ],
  ];
  for (let i = 0; i < data.trialID.length; i++) {
    let trialData = [
      data.trialID[i], 
      data.trialNum[i],
      data.trialOvershoots[i], 
      data.trialPhase[i],
      data.trialType[i],
      data.trialDirection[i], 
      data.time[i],
      data.cursorX[i],
      data.cursorY[i],
      data.handX[i],
      data.handY[i],
    ];
    rows.push(trialData);
  }
  let csvContent = "data:text/csv;charset=utf-8,";
  rows.forEach(function (rowArray) {
    let row = rowArray.join(",");
    csvContent += row + "\r\n";
  });
  var encodedURI = encodeURI(csvContent);
  var link = document.createElement("a");
  link.setAttribute("href", encodedURI);
  link.setAttribute("download", "state_data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// * * * HELPER FUNCTIONS * * * //
// Return index of target (1 - 8)
function getRandomTargetIndex() {
  return Math.floor(Math.random() * 8); // since upper bound on Math.random() does not include 1
}

// Return angle (radians)
function getRandomAngle() {
  return deg2rad(Math.floor(Math.random() * (2 * pars.JitterAngularVar) - pars.JitterAngularVar)); // want to be on range [0 - 360]
}

// Helper to convert degrees to radians
function deg2rad(degrees) {
  return (degrees / 180) * Math.PI;
}

// Helper to compute l2 norm (euclidean distance) of a vector
function l2norm(dx, dy) {
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}

// Maps value x from range A to range B.
function linearMap(x, a1, a2, b1, b2) {
    return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
}

// Helper to return radius with respect to center of canvas
function cartesian2polar(c) {
  return {
    r: cartpos2radius(c.x, c.y),
    theta: cartpos2angle(c.x, c.y),
  };
}

// Helper to compute radius with respect to grid center
function cartpos2radius(x, y) {
  return Math.sqrt(Math.pow(BoxHeight - y, 2) + Math.pow(BoxWidth - x, 2));
}

// Helper to compute theta (radians) with respect to grid center
function cartpos2angle(x, y) {
  return Math.atan2(y - BoxHeight, x - BoxWidth);
}

// Helper to convert from polar to cartesian
function polar2cartesian(p) {
  return {
    x: p.r * Math.cos(p.theta) + BoxWidth,
    y: p.r * Math.sin(p.theta) + BoxHeight,
  };
}

// Helper function to get the current time
function getCurrentTime() {
  let d = new Date();
  return d.getTime();
}

// Helper function to get the time since a specified date instant
function getTimeSince(d0) {
  return getCurrentTime() - d0;
}

function calcBiquad(type, Fc, Fs, Q, peakGain) {
	var a0,a1,a2,b1,b2,norm;
	if (Fc > (Fs / 2)) {
        console.error("Fc must be lower than Fs/2.");
        return;
    }
	var V = Math.pow(10, Math.abs(peakGain) / 20);
	var K = Math.tan(Math.PI * (Fc / (Fs / 2)));
	switch (type) {
        case "lowpass":
			norm = 1 / (1 + K / Q + K * K);
			a0 = K * K * norm;
			a1 = 2 * a0;
			a2 = a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K / Q + K * K) * norm;
			break;

		case "highpass":
			norm = 1 / (1 + K / Q + K * K);
			a0 = 1 * norm;
			a1 = -2 * a0;
			a2 = a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K / Q + K * K) * norm;
			break;
		
		case "bandpass":
			norm = 1 / (1 + K / Q + K * K);
			a0 = K / Q * norm;
			a1 = 0;
			a2 = -a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K / Q + K * K) * norm;
			break;
		
		case "notch":
			norm = 1 / (1 + K / Q + K * K);
			a0 = (1 + K * K) * norm;
			a1 = 2 * (K * K - 1) * norm;
			a2 = a0;
			b1 = a1;
			b2 = (1 - K / Q + K * K) * norm;
			break;
		
		case "peak":
			if (peakGain >= 0) {
				norm = 1 / (1 + 1/Q * K + K * K);
				a0 = (1 + V/Q * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - V/Q * K + K * K) * norm;
				b1 = a1;
				b2 = (1 - 1/Q * K + K * K) * norm;
			}
			else {	
				norm = 1 / (1 + V/Q * K + K * K);
				a0 = (1 + 1/Q * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - 1/Q * K + K * K) * norm;
				b1 = a1;
				b2 = (1 - V/Q * K + K * K) * norm;
			}
			break;
    }
    return {b: [1.0, b1, b2], a: [a0, a1, a2]};
}

function butter(fc, fs) {
    let coeffs = calcBiquad("lowpass", fc, fs, 0.7071, 6);
    // console.log(coeffs);
    return coeffs; 
}

function filter(b, a, x) {
    // console.log("b: ", b);
    // console.log("a: ", a);
    let n = x.length;
    let z = new Array(n).fill(0);
    let w = new Array(3).fill(0); // buffer starts with temporary zeros.
    for (let i = 0; i < n; i++) {
        z[i] = b[0]*w[2] + b[1]*w[1] + b[2]*w[0];
        w.shift();
        w.push(x[i] - w[1]*a[1] - w[0]*a[2]);
    }
    return z;
}

// Functions to initialize graphics go after this //
initPositions(BoxWidth, BoxHeight); // Initialize positions of the targets.
baseGraphics("white", false); // Initialize the canvas

const event_data = {
    x: BoxHeight, 
    y: BoxWidth 
};

const ws_xy = new WebSocket(`ws://${address.cursor}:${port.cursor}/`);

ws_xy.onmessage = function (event) {
    let packet = JSON.parse(event.data);
    switch (packet.type) {
        case 'users':
            users.textContent = (
            packet.count.toString() + " client" +
            (packet.count == 1 ? "" : "s"));
            break;
        case 'touch':
            handleState(state.taskState, data);
            break;
        case 'cursor':
          if (state.running) {
            state.taskState = packet.state;
            // console.log(packet);
            handleState(state.taskState, {x: packet.x, y: packet.y});
          }
            
            break;
        case 'tgt': 
            // console.log(packet);
            updated_target_index = packet['tgt'];
            break;
        case 'state':
            console.warn("Nothing implemented yet for `state` event.")
            break;
        case 'none':
            break;
        case 'params':
            break;
        default:
            console.error("unsupported event", data);
            break;
      }
  };

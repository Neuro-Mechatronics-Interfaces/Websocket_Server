const BaselineTrials = 5; // Total number of baseline trials
const PerturbationTrials = 5; // Total number of perturbation trials
const WashoutTrials = 5; // Total number of washout trials
const Rotation = 30; // degrees
const TargetRingRadius = 200; // pixels
const TargetSize = 20; // pixels, radius
const CursorSize = 5; // pixels, radius
const PointerRadius = CursorSize * 2; // Radius of "pointy" part of cursor
const FixedVelocity = 5; // pixels per WASD in "Cartesian" mode
const FixedRadialVelocity = 5; // amount of pixels changed per "step" in "Polar" mode (w/s)
const FixedAngularVelocity = deg2rad(15); //  angular change per "step" in "Polar" mode (a/d)
const MODE = ["Homing", "Jitter"];
const HOLD_PERIOD = 1000;
const TARGET_PERIOD = 500;
const JITTER_VAR = 10; // Jitter (degrees) range
const HOMING_STRENGTH = 0.1; // Scales from 0 - 1, for strength of "homing" director

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
const history = {
    x: new Array(30).fill(BoxWidth), 
    y: new Array(30).fill(BoxHeight)
};
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
    tx[i] = w + TargetRingRadius * Math.cos(ttheta[i]);
    ty[i] = h + TargetRingRadius * Math.sin(ttheta[i]);
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
    trialStart: null,
    targetStart: null,
    direction: "out",
    target: getRandomTargetIndex(),
    canvas: document.getElementById("task"),
  };
}

// Returns initial data structure for stored data.
function initData() {
  return {
    trialNum: [],
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

// Toggle name and class of button
function toggleMode() {
  var label = modeButton.innerText;
  if (label == MODE[0]) {
    modeButton.innerText = MODE[1];
    modeButton.classList = "btn btn-secondary";
    state.taskMode = MODE[1];
  } else if (label == MODE[1]) {
    modeButton.innerText = MODE[0];
    modeButton.classList = "btn btn-primary";
    state.taskMode = MODE[0];
  } else {
    throw (
      "Label should only match either '" + MODE[0] + "' or '" + MODE[1] + "'!"
    );
  }
}

// Does the reset
function resetData() {
  state.taskState = "idle";
  state.trialType = "baseline";
  state.numTrials = 0;
  state.numSuccessful = 0;
  state.trialStart = null;
  data = initData();
  saveButton.style.visibility = "hidden";

  baseGraphics("black", false);
  if (state.running) {
    state.running = false;
    newTrial();
  }
}

// Start the "recording" session.
function startSession() {
  resetData();
  modeButton.disabled = true;
  startButton.classList = "btn btn-success";
  endButton.classList = "btn btn-outline-danger";
//   addMouseEvents();
  state.canvas.style.cursor = "none";
  state.running = true;
  newTrial();
}

// End the "recording" session (no more trials)
function endSession() {
  state.taskState = "done";
  state.running = false;
  modeButton.disabled = false;
  saveButton.style.visibility = "visible";
  startButton.classList = "btn btn-outline-success";
  endButton.classList = "btn btn-danger";
//   removeMouseEvents();
  state = initState(); // reset the state
}

// Begin a new trial
function newTrial() {
  if (state.direction === "out") {
    console.log(updated_target_index);
    state.target = updated_target_index;
  } else {
    ws_tgt.send(JSON.stringify({event: 'get_tgt', type: 'none'}));
  }
  if (state.numTrials > BaselineTrials + PerturbationTrials + WashoutTrials) {
    endSession(); // If too many trials, end the session.
  }
  // Determine trial type
  if (state.numTrials < BaselineTrials) {
    state.trialType = "baseline";
  } else if (state.numTrials < BaselineTrials + PerturbationTrials) {
    state.trialType = "vmr";
  } else {
    state.trialType = "washout";
  }

  // Draw targets and center spot
  baseGraphics("orange", false);
  state.taskState = "pre";
}

// End the current trial by updating state parameters.
function endTrial() {

//   state.target = -1; // "Uncolor" all the circles.
//   baseGraphics("black", false);
  if (state.direction === "out") {
    state.direction = "in";
  } else {
    state.direction = "out";
  }
//   console.log(state.direction);
  state.numTrials += 1;
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
    drawCircle(BoxWidth, BoxHeight, TargetSize, c_start);

    // Target
    for (i = 0; i < 8; i++) {
        drawTarget(i, hl_target);
    }
  } else { // "in"
    // Start
    drawCircle(tx[state.target], ty[state.target], TargetSize, c_start);

    // Center
    drawTarget(state.target, hl_target);
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
    drawCircle(tx[index], ty[index], TargetSize, c);
  } else {
    if (hl_target) {
      c = "cyan";
    } else {
      c = "seagreen";
    }
    drawCircle(BoxWidth, BoxHeight, TargetSize, c);
  }
}

// Draw the actual cursor
function drawCursor(x, y, c) {
  drawCircle(x, y, CursorSize, c);
}

// Check if mouse is in start target for 0.5s
function startCheck(x, y) {
  let radius;
  if (state.direction === "out") {
    radius = l2norm(x - BoxWidth, y - BoxHeight);
  } else {
    radius = l2norm(x - tx[state.target], y - ty[state.target]);
  }
  if (radius < TargetSize) {
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
  
  if (radius < TargetSize) {
    return true;
  } else {
    return false;
  }
}

// State machine
function handleState(s, h) {
  // Current state options:
  // 1. "pre"       : Pre-trial
  // 2. "hold"      : Holding, in trial onset circle
  // 3. "go"        : In trial onset circle, cue received
  // 4. "move"      : Moving to target (outside onset circle)
  // 5. "target"    : Inside the target circle
  // 6. "overshoot" : Already went to "5" on this trial and now outside target
  // 7. "success"   : Successfully completed the trial.

//   var c, p;
//   if (state.trialType === "vmr") {
//     // Handle rotating the data, if needed
//     p = cartesian2polar(h);
//     p.theta = p.theta - (Rotation / 180) * Math.PI;
//   } else {
//     p = cartesian2polar(h);
//   }
//   if (state.taskMode === "Homing") {
//     c = polar2cartesian(p);
//     let d_theta =
//       Math.atan2(ty[state.target] - c.y, tx[state.target] - c.x) - p.theta;
//     p.theta = p.theta + HOMING_STRENGTH * d_theta;
//   } else {
//     // Otherwise add jitter
//     p.theta = (p.theta * p.r + getRandomAngle() * 3) / (p.r + 3);
//   }
//   c = polar2cartesian(p);
  var c = h;
//   console.log(c);

    console.log(s);
  if (s === "idle") {
    return;
  }
  if (s === "pre") {
    // 1
    if (startCheck(h.x, h.y)) {
      state.trialStart = getCurrentTime();
      appendData(h.x, h.y, h.x, h.y);
      state.taskState = "hold";
      baseGraphics("cyan", false);
      drawCursor(h.x, h.y, "gold");
      return;
    } else {
      baseGraphics("orange", false);
      drawCursor(h.x, h.y, "white");
      return;
    }
  } else if (s === "hold") {
    // 2 : Target is holding in the pre-trial target
    if (getTimeSince(state.trialStart) > HOLD_PERIOD) {
      if (startCheck(h.x, h.y)) {
        appendData(h.x, h.y, h.x, h.y);
        state.taskState = "go";
        baseGraphics("black", false);
        drawCursor(h.x, h.y, "dodgerblue");
        return;
      } else {
        baseGraphics("cyan", false);
        drawCursor(h.x, h.y, "gold");
        return;
      }
    } else if (startCheck(h.x, h.y) === false) {
      state.taskState = "pre";
      baseGraphics("orange", false);
      drawCursor(h.x, h.y, "white");
    } else {
      baseGraphics("cyan", false);
      drawCursor(h.x, h.y, "gold");
    }
  } else if (s === "go") {
    // 3 : (Transition) Go-Cue has been observed.
    appendData(c.x, c.y, h.x, h.y);
    baseGraphics("black", false);
    drawCursor(c.x, c.y, "dodgerblue");
    state.taskState = "move";
  } else if (s === "move") {
    // 4 : Movement that has not yet reached the target.
    if (targetCheck(c.x, c.y)) {
      baseGraphics("black", true);
      drawCursor(c.x, c.y, "gold");
      state.taskState = "target";
      state.targetStart = getCurrentTime();
    } else {
      baseGraphics("black", false);
      drawCursor(c.x, c.y, "dodgerblue");
    }
  } else if (s === "target") {
    // 5 : Cursor is in the desired target.
    // console.log("hit");
    if (getTimeSince(state.targetStart) > TARGET_PERIOD) {
      if (targetCheck(c.x, c.y)) {
        // cursor stayed in the target long enough for success.
        state.taskState = "success";
        baseGraphics("black", false);
        drawCursor(c.x, c.y, "white");
      } else {
        state.taskState = "overshoot";
        baseGraphics("black", false);
        drawCursor(c.x, c.y, "red");
      }
    } else if (targetCheck(c.x, c.y) === false) {
      // cursor LEFT the target. indicate OVERSHOOT
      state.taskState = "overshoot";
      baseGraphics("black", false);
      drawCursor(c.x, c.y, "red");
    } else {
      baseGraphics("black", true);
      drawCursor(c.x, c.y, "gold");
    }
  } else if (s === "overshoot") {
    // 6 : Cursor has overshot the target
    if (targetCheck(c.x, c.y) === true) {
      state.taskState = "target";
      baseGraphics("black", true);
      drawCursor(c.x, c.y, "gold");
    } else {
      baseGraphics("black", false);
      drawCursor(c.x, c.y, "red");
    }
  } else if (s === "success") {
    // 7 : (Transition) Trial completed successfully.
    state.numSuccessful += 1;
    endTrial();
    return;
  } else {
    throw "Invalid state: '" + s + "'!";
  }
  appendData(h.x, h.y, c.x, c.y);
}

// Collect data helper function -- append data to arrays for each timestep
function appendData(handX, handY, cursorX, cursorY) {
  data.trialNum.push(state.numTrials);
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
      "trialNum",
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
  for (let i = 0; i < data.trialNum.length; i++) {
    let trialData = [
      data.trialNum[i],
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
  return deg2rad(Math.floor(Math.random() * (2 * JITTER_VAR) - JITTER_VAR)); // want to be on range [0 - 360]
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
    y: BoxHeight, 
    x: BoxWidth 
}
const ALPHA = 0.1; // EMA coefficient
const BETA = 1 - ALPHA;

const ws_xy = new WebSocket(`ws://${address.xy}:${port.xy}/`);
const ws_tgt = new WebSocket(`ws://${address.target}:${port.target}/`);

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
        case 'xy':
            event_data.y = ALPHA * linearMap(packet.x, 675, 0, 0, 2*BoxHeight) + BETA * event_data.y;
            event_data.x = ALPHA * linearMap(packet.y, 670, 0, 0, 2*BoxWidth) + BETA * event_data.x;
            handleState(state.taskState, event_data);
            break;
        case 'tgt': 
            console.log(packet);
            updated_target_index = packet['tgt'];
            break;
        case 'state':
            console.warn("Nothing implemented yet for `state` event.")
            break;
        case 'none':
            break;
        default:
            console.error("unsupported event", data);
            break;
      }
  };

  ws_tgt.onmessage = function (event) {
    let packet = JSON.parse(event.data);
    switch (packet.type) {
        case 'tgt': 
            console.log(packet);
            updated_target_index = packet['tgt'];
            break;
        case 'none':
            break;
        default:
            console.error("unsupported event", data);
            break;
      }
  };
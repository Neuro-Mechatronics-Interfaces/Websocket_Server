const BaselineTrials = 5;                 // Total number of baseline trials
const PerturbationTrials = 5;             // Total number of perturbation trials
const WashoutTrials = 5;                  // Total number of washout trials
const Rotation = 30;                      // degrees
const TargetRingRadius = 200;             // pixels
const TargetSize = 20;                    // pixels, radius
const BoxRadius = 250;                    // pixels
const CursorSize = 5;                     // pixels, radius
const PointerRadius = CursorSize*2;       // Radius of "pointy" part of cursor
const FixedVelocity = 5;                  // pixels per WASD in "Cartesian" mode
const FixedRadialVelocity = 5;            // amount of pixels changed per "step" in "Polar" mode (w/s)
const FixedAngularVelocity = deg2rad(15); //  angular change per "step" in "Polar" mode (a/d)
const MODE = ["Homing", "Jitter"];
const HOLD_PERIOD = 1000;
const TARGET_PERIOD = 500; 
const JITTER_VAR = 10;           // Jitter (degrees) range
const HOMING_STRENGTH = 0.1;    // Scales from 0 - 1, for strength of "homing" director


var users = document.querySelector('.users'),
    canvas = document.querySelector('.task'), 
    subject = document.querySelector('.subject'),
    trials = document.querySelector('.trials'),
    orientation = document.querySelector('.orientation');

var nAttempts = 0;
var nSuccessful = 0;

var websocket = new WebSocket("ws://128.2.244.29:6789/");
  websocket.onmessage = function (event) {
      data = JSON.parse(event.data);
      switch (data.type) {
          case 'users':
              users.textContent = (
                  data.count.toString() + " client" +
                  (data.count == 1 ? "" : "s"));
              break;
          case 'touch':
              cursorGraphicsHandler(data.x, data.y);
              break;
          case 'xy':
              cursorGraphicsHandler(data.x, data.y);
              break;
          default:
              console.error(
                  "unsupported event", data);
      }
  };

  var fsm = new StateMachine({
    init: 'idle',
    transitions: [
      { name: 'resume',     from: 'idle',  to: 't1-hold-1' },
      { name: 'enter',   from: 't1-instruct-1', to: 't1-hold-1'  },
      { name: 'show', from: 't1-hold-1', to: 't2-instruct-1'    },
      { name: 'hide', from: 't2-instruct-1', to: 'go'    },
      { name: 'leave', from: 'go',    to: 'move' },
      { name: 'enter', from: 'move',    to: 't2-hold-1' },
      { name: 'leave', from: 't2-hold-1',    to: 'overshoot' },
      { name: 'enter', from: 'overshoot',    to: 't2-hold-1' },
      { name: 'complete', from: 't2-hold-1',    to: 't2-hold-2' }, 
      { name: 'step', from: 't2-hold-2',    to: 'reward' },
      { name: 'step', from: 'reward',    to: 't1-instruct-1' },
      { name: 'mistake', from: '*',    to: 't1-instruct-1' } ,
      { name: 'pause', from: '*', to: 'idle'}
    ],
    methods: {
      onMistake:     function() { console.log('I melted')    },
      onFreeze:   function() { console.log('I froze')     },
      onVaporize: function() { console.log('I vaporized') },
      onCondense: function() { console.log('I condensed') }
    }
  });

// Pre-compute the target locations so that they don't get re-calculated each time the Check is called:
const tx = new Array(8), 
      ty = new Array(8), 
      ttheta = new Array(8);

// Create global state and data variables
var data = initData()

const modeButton = document.getElementById("modeButton");
const context = state.canvas.getContext('2d');

// Precompute target positions
function initPositions() {
  for (var i = 0; i < 8; i++) {
    ttheta[i] = i * Math.PI / 4;
    tx[i] = BoxRadius + TargetRingRadius * Math.cos(ttheta[i]);
    ty[i] = BoxRadius + TargetRingRadius * Math.sin(ttheta[i]);
  }
}

// Returns initial data structure for stored data.
function initData() {
  return {
    trialNum: [],
    trialPhase:[], 
    trialType: [],
    trialMode: [], 
    trialTarget: [], 
    time: [],
    handX: [],
    handY: [],
    cursorX: [],
    cursorY: []
    // For plotting
  };
}

// Toggle name and class of button
function toggleMode() {
  var label = modeButton.innerText;
  if (label == MODE[0]) {
    modeButton.innerText = MODE[1]
    modeButton.classList = "btn btn-secondary"
    state.taskMode = MODE[1];
  } else if (label == MODE[1]) {
    modeButton.innerText = MODE[0]
    modeButton.classList = "btn btn-primary"
    state.taskMode = MODE[0];
  } else {
    throw ("Label should only match either '" + MODE[0] + "' or '" + MODE[1] + "'!");
  }
}

// Does the reset
function resetData() {
  state.taskState = null;
  state.trialType = null;
  state.numTrials = 0;
  state.trialStart = null;
  data = initData()
  document.getElementById("saveButton").style.visibility = "hidden";
  Plotly.newPlot( state.figure, [{
    x: [], 
    y: [],
    }],
    {
      xaxis: {
        title: "X Position", 
        range: [0, 2*BoxRadius]
      },
      yaxis: {
        title: "Y Position", 
        range: [2*BoxRadius, 0]
      },
    }
  );
  baseGraphics("darkgray", false);
  if (state.running) {
    state.running = false;
    newTrial();
  }
}

// Start the "recording" session.
function startSession() {
  resetData();
  modeButton.disabled = true;
  document.getElementById('startButton').classList = "btn btn-success";
  document.getElementById('endButton').classList = "btn btn-outline-danger";
  addMouseEvents();
  state.canvas.style.cursor = 'none';
  state.running = true;
  newTrial();
}

// End the "recording" session (no more trials)
function endSession() {
  state.taskState = "done";
  state.running = false;
  modeButton.disabled = false;
  document.getElementById("saveButton").style.visibility = "visible";
  document.getElementById('startButton').classList = "btn btn-outline-success";
  document.getElementById('endButton').classList = "btn btn-danger";
  removeMouseEvents();
  state = initState(); // reset the state
}

// Begina  new trial
function newTrial() {
  state.target = getRandomTargetIndex();
  if (state.numTrials > (BaselineTrials + PerturbationTrials + WashoutTrials)) {
    endSession(); // If too many trials, end the session.
  }
  // Determine trial type
  if (state.numTrials < BaselineTrials) {
    state.trialType = "baseline";
  }
  else if (state.numTrials < (BaselineTrials + PerturbationTrials)) {
    state.trialType = "vmr";
  }
  else {
    state.trialType = "washout";
  }

  // Draw targets and center spot
  baseGraphics("orange", false);
  state.taskState = "pre";
}

// End the current trial by updating state parameters.
function endTrial() {
  state.target = -1; // "Uncolor" all the circles.
  baseGraphics("darkgray", false);
  plotData();
  state.numTrials += 1;
  newTrial();
}

// Draw base graphics on the canvas 2d context
function baseGraphics(c_start,hl_target) {
  context.width = 2*BoxRadius
  context.height = 2*BoxRadius

  // Background
  context.fillStyle = "gainsboro";
  context.fillRect(0, 0, state.canvas.width, state.canvas.height);
  
  // Start 
  drawCircle(BoxRadius, BoxRadius, TargetSize, c_start);
  
  // Target
  for (i = 0; i < 8; i++) {
    drawTarget(i, hl_target);
  }
}

// Draw a filled circle with color c and radius r centered at <x,y> 
function drawCircle(x, y, r, c) {
  context.beginPath();
  context.arc(x, y, r, 0, 2*Math.PI);
  context.fillStyle = c;
  context.fill();
  context.linewidth = 0;
  context.stroke();
}

// Draw the radially-distributed target circles
function drawTarget(index, hl_target) {
  if (index == state.target) {
    if (hl_target) {
      c = "cyan";
    } else {
      c = "seagreen";
    }
  } else {
    c = "darkgray";
  }
  drawCircle(tx[index], ty[index], TargetSize, c);
}

// Draw the actual cursor
function drawCursor(x, y, c) {
  drawCircle(x, y, CursorSize, c);
}

// Check if mouse is in start target for 0.5s 
function startCheck(x, y) {
  let radius = l2norm(x - BoxRadius, y - BoxRadius);
  if (radius < TargetSize) {
    return true;
  } else {
    return false;
  }
}

// Check if the cursor has entered the target.
function targetCheck(x, y) {
  let radius = l2norm(tx[state.target] - x, ty[state.target] - y);
  if (radius < TargetSize) {
    return true;
  } else {
    return false;
  }
}

// function addMouseEvents() {
	// // Mouse move handler 
  // state.canvas.addEventListener('mousemove', mouseMovement);
// }

// function removeMouseEvents() {
  // state.canvas.removeEventListener('mousemove', mouseMovement);
// }

// function mouseMovement(e) {
  // if (state.running == false) {
    // removeMouseEvents();
    // return;
  // }
  // cart = {x: e.offsetX, y: e.offsetY}
  // handleState(state.taskState, cart);
// }

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

  var c, p;
  if (state.trialType === "vmr") { // Handle rotating the data, if needed
    p = cartesian2polar(h); 
    p.theta = p.theta - (Rotation / 180 * Math.PI);
  } else {
    p = cartesian2polar(h);
  }
  if (state.taskMode === "Homing") {
    c = polar2cartesian(p);
    let d_theta = (Math.atan2(ty[state.target] - c.y, tx[state.target] - c.x)) - p.theta;
    p.theta = p.theta + HOMING_STRENGTH * d_theta;
  } else { // Otherwise add jitter
    p.theta = (p.theta*p.r + getRandomAngle()*3)/(p.r + 3);
  }
  c = polar2cartesian(p);

  if (s === "pre") { // 1
    if (startCheck(h.x, h.y)) {
      state.trialStart = getCurrentTime();
      appendData(h.x, h.y, h.x, h.y);
      state.taskState = "hold";
      baseGraphics("cyan", false);
      drawCursor(h.x, h.y, "gold");
      return;
    } else {
      baseGraphics("orange", false);
      drawCursor(h.x, h.y, "black");
      return;
    }
  } else if (s === "hold") { // 2 : Target is holding in the pre-trial target
    if (getTimeSince(state.trialStart) > HOLD_PERIOD) {
      if (startCheck(h.x, h.y)) {
        appendData(h.x, h.y, h.x, h.y);
        state.taskState = "go";
        baseGraphics("darkgray", false);
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
      drawCursor(h.x, h.y, "black");
    } else {
      baseGraphics("cyan", false);
      drawCursor(h.x, h.y, "gold");
    }
  } else if (s === "go") { // 3 : (Transition) Go-Cue has been observed.
    appendData(c.x, c.y, h.x, h.y);
    baseGraphics("darkgray", false);
    drawCursor(c.x, c.y, "dodgerblue");
    state.taskState = "move";
  } else if (s === "move") { // 4 : Movement that has not yet reached the target.
    if (targetCheck(c.x, c.y)) {
      baseGraphics("darkgray", true);
      drawCursor(c.x, c.y, "gold");
      state.taskState = "target";
      state.targetStart = getCurrentTime();
    } else {
      baseGraphics("darkgray", false);
      drawCursor(c.x, c.y, "dodgerblue");
    }
  } else if (s === "target") { // 5 : Cursor is in the desired target.
    if (getTimeSince(state.targetStart) > TARGET_PERIOD) {
      if (targetCheck(c.x, c.y)) { // cursor stayed in the target long enough for success.
        state.taskState = "success";
        baseGraphics("darkgray", false);
        drawCursor(c.x, c.y, "black");
      } else {
        state.taskState = "overshoot";
        baseGraphics("darkgray", false);
        drawCursor(c.x, c.y, "red");
      }
    } else if (targetCheck(c.x, c.y) === false) { // cursor LEFT the target. indicate OVERSHOOT
      state.taskState = "overshoot";
      baseGraphics("darkgray", false);
      drawCursor(c.x, c.y, "red");
    } else {
      baseGraphics("darkgray", true);
      drawCursor(c.x, c.y, "gold");
    }
  } else if (s === "overshoot") { // 6 : Cursor has overshot the target
    if (targetCheck(c.x, c.y) === true) { 
      state.taskState = "target";
      baseGraphics("darkgray", true);
      drawCursor(c.x, c.y, "gold");
    } else {
      baseGraphics("darkgray", false);
      drawCursor(c.x, c.y, "red");
    }
  } else if (s === "success") { // 7 : (Transition) Trial completed successfully.
    endTrial();
    return;
  } else {
    throw("Invalid state: '" + s + "'!");
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
  data.time.push(getTimeSince(state.trialStart));
  data.handX.push(handX);
  data.handY.push(handY);
  data.cursorX.push(cursorX);
  data.cursorY.push(cursorY);
}

// Save data to a csv file
function saveData() {
  var rows = [["trialNum", "trialPhase", "trialType", "time",
                "cursorX", "cursorY", "handX", "handY"]];
  for (let i=0; i < data.trialNum.length; i++) {
    let trialData = [data.trialNum[i], data.trialPhase[i], data.trialType[i],
                      data.time[i], data.cursorX[i], data.cursorY[i], data.handX[i], data.handY[i]]; 
    rows.push(trialData);
  }
  let csvContent = "data:text/csv;charset=utf-8,"; 
  rows.forEach(function(rowArray) {
    let row = rowArray.join(",");
    csvContent += row + "\r\n";
  });
  var encodedURI = encodeURI(csvContent);
  var link = document.createElement("a");
  link.setAttribute("href", encodedURI);
  link.setAttribute("download", "state_data.csv");
  document.body.appendChild(link);
  link.click();
}

// Show data on the plot at the right-hand side of interface.
function plotData() {
  let startIdx = data.trialNum.indexOf(state.numTrials);
  let endIdx = data.trialNum.lastIndexOf(state.numTrials);
  let trialX = data.cursorX.slice(startIdx, endIdx);
  let trialY = data.cursorY.slice(startIdx, endIdx);
  let plotColor;
  let opacity;
  if (state.trialType === "baseline") {
    plotColor = 'black';
    opacity = 1;
    plotName = "BL".concat(state.numTrials.toString());
  } else if (state.trialType === "vmr") {
    plotColor = 'blue';
    opacity = (state.numTrials - BaselineTrials) / PerturbationTrials;
    plotName = "VMR".concat(state.numTrials - BaselineTrials.toString());
  } else if (state.trialType === "washout") {
    plotColor = 'pink';
    opacity = (state.numTrials - (PerturbationTrials + BaselineTrials)) / WashoutTrials;
    plotName = "WO".concat((state.numTrials - PerturbationTrials - BaselineTrials).toString());
  }
  Plotly.plot(figure, [{
    x: trialX,
    y: trialY,
    opacity: opacity,
    name: plotName,
    line: {
      color: plotColor,
    }
  }],
    {
      xaxis: {
        title: "X Position",
        range: [0, 2 * BoxRadius]
      },
      yaxis: {
        title: "Y Position",
        range: [2 * BoxRadius, 0]
      },
    }
  );
}

// * * * HELPER FUNCTIONS * * * //
// Return index of target (1 - 8)
function getRandomTargetIndex() {
  return Math.floor(Math.random() * 8); // since upper bound on Math.random() does not include 1
}

// Return angle (radians)
function getRandomAngle() {
  return deg2rad(Math.floor(Math.random() * (2*JITTER_VAR) - JITTER_VAR)); // want to be on range [0 - 360]
}

// Helper to convert degrees to radians
function deg2rad(degrees) {
  return degrees / 180 * Math.PI;
}

// Helper to compute l2 norm (euclidean distance) of a vector
function l2norm(dx, dy) {
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}

// Helper to return radius with respect to center of canvas
function cartesian2polar(c) {
  return {
    r: cartpos2radius(c.x, c.y), 
    theta: cartpos2angle(c.x, c.y)
  };
}

// Helper to compute radius with respect to grid center
function cartpos2radius(x, y) {
  return Math.sqrt(Math.pow(BoxRadius - y, 2) + Math.pow(BoxRadius - x, 2));
}

// Helper to compute theta (radians) with respect to grid center
function cartpos2angle(x, y) {
  return Math.atan2(y - BoxRadius, x - BoxRadius);
}

// Helper to convert from polar to cartesian
function polar2cartesian(p) {
  return {
    x: p.r * Math.cos(p.theta) + BoxRadius, 
    y: p.r * Math.sin(p.theta) + BoxRadius
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

// Functions to initialize graphics go after this //
initPositions();            // Initialize positions of the targets.
baseGraphics("darkgray", false); // Initialize the canvas
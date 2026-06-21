// bees.js
// Max/MSP [js] object — port of Bees.cpp / ofApp.cpp
// by André Perrotta (original), Max port 2024
//
// Inlets:
//   0 — bang / start / stop: manual tick or loop control
//   1 — "collapse <noteName>": trigger a collapse event
//   2 — "redraw <1|2|3>": switch conjunto and re-roll all bees
//   3 — "rollall": roll dice on every bee without changing conjunto
//
// Outlets:
//   0 — flat list [voice freq amp x y] × 64  →  [iter 5] → [poly~ bee.voice~ 64]
//   1 — flat list [x y] × 64                 →  [jsui bees_ui.js]

inlets  = 4;
outlets = 2;

// ─── tuneable constants ────────────────────────────────────────────────────
var NUM_BEES     = 64;
var TICK_MS      = 16;   // ~60 fps internal loop
var SCREEN_W     = 1024; // match ofSetupOpenGL width
var SCREEN_H     = 768;  // match ofSetupOpenGL height

// ─── note tables (copied verbatim from Bees.cpp) ──────────────────────────
function makeNotes() {
	var n = new Array(40);
	n[0]  = 207.65; n[1]  = 233.08; n[2]  = 293.66; n[3]  = 369.99;
	n[4]  = 391.99; n[5]  = 523.25; n[6]  = 659.25;  n[7]  = 880.00;

	n[8]  = n[0]*2.0;       n[9]  = n[0]*1.414*2.0; n[10] = n[0]*1.782*4.0;
	n[11] = n[1]*2.0;       n[12] = n[1]*1.414*2.0; n[13] = n[1]*1.782*4.0;
	n[14] = n[2]*2.0;       n[15] = n[2]*1.414*2.0; n[16] = n[2]*1.782*4.0;
	n[17] = n[3]*2.0;       n[18] = n[3]*1.414*2.0; n[19] = n[3]*1.782*4.0;
	n[20] = n[4]*2.0;       n[21] = n[4]*1.414*2.0; n[22] = n[4]*1.782*4.0;
	n[23] = n[5]*2.0;       n[24] = n[5]*1.414*2.0; n[25] = n[5]*1.782*4.0;
	n[26] = n[6]*2.0;       n[27] = n[6]*1.414*2.0; n[28] = n[6]*1.782*4.0;
	n[29] = n[7]*2.0;       n[30] = n[7]*1.414*2.0; n[31] = n[7]*1.782*4.0;

	n[32] = n[0]*0.25; n[33] = n[1]*0.25; n[34] = n[2]*0.25; n[35] = n[3]*0.25;
	n[36] = n[4]*0.25; n[37] = n[5]*0.25; n[38] = n[6]*0.25; n[39] = n[7]*0.25;
	return n;
}

function makeNotes2() {
	var n = new Array(66);
	n[0]  = 195.99; n[1]  = 220.00; n[2]  = 261.62; n[3]  = 369.99;
	n[4]  = 415.30; n[5]  = 493.88; n[6]  = 587.32;  n[7]  = 659.25;
	n[8]  = 932.32; n[9]  = 1108.73; n[10] = 1244.50;

	for (var i = 0; i <= 10; i++) {
		var base = i * 5 + 11;
		n[base]   = n[i]*2.0*1.122;
		n[base+1] = n[i]*2.0*1.414;
		n[base+2] = n[i]/8.0;
		n[base+3] = n[i]*4.0*1.587;
		n[base+4] = n[i]*8.0*1.888;
	}
	return n;
}

function makeNotes3() {
	var n = new Array(40);
	n[0]  = 195.99; n[1]  = 220.00; n[2]  = 261.62; n[3]  = 369.99;
	n[4]  = 415.30; n[5]  = 493.88; n[6]  = 587.32;  n[7]  = 659.25;
	n[8]  = 932.32; n[9]  = 1108.73; n[10] = 1244.50;

	n[11] = n[5]*2.0;         n[12] = n[5]*2.0*1.414;
	n[13] = n[5]*4.0*1.122;   n[14] = n[5]*0.25/1.414;
	n[15] = n[5]*0.125/1.414;

	for (var i = 0; i <= 10; i++) {
		n[16 + i*2]     = n[i]*2.0*1.587;
		n[16 + i*2 + 1] = n[i]*8.0;
	}
	// n[38], n[39] would be notes3[11]*... but original array only goes to [39]
	n[38] = n[11]*2.0*1.587;
	n[39] = n[11]*8.0;
	return n;
}

// ─── shared note arrays (built once) ──────────────────────────────────────
var NOTES  = makeNotes();
var NOTES2 = makeNotes2();
var NOTES3 = makeNotes3();

// ─── Bee class ─────────────────────────────────────────────────────────────
function Bee() {
	this.x = 0; this.y = 0;
	this.radius  = 0; this.radius0  = 0;
	this.theta   = 0; this.w        = 0;
	this.note    = 0;
	this.amp1    = 0; this.amp2 = 0; this.amp3 = 0; this.amp4 = 0;
	this.vol     = 0.01;
	this.status  = "floating";
	this.gainStatus = "floating";
	this.stayCounter = 0;
	this.collapseRadius = 0;
	this.conjunto = 1;
}

Bee.prototype.setup = function() {
	this.radius  = ofRandom(1200, 1900);
	this.radius0 = this.radius;
	this.theta   = ofRandom(350, 360);
	this.w       = ofRandom(3.0, 9.0);
	this.vol     = 0.01;
	this.status  = "floating";
	this.gainStatus = "floating";
	this.stayCounter = 0;
	this.collapseRadius = ofRandom(0.0, 50.0);
	this.conjunto = 1;

	var path = ofRandom(0, 10);
	var noteIndex;
	if (path < 6.0) {
		noteIndex = Math.floor(ofRandom(0, 8));
	} else {
		noteIndex = Math.floor(ofRandom(9, 40));
	}
	this.note = NOTES[noteIndex];
};

Bee.prototype.rollDice = function() {
	var path, noteIndex;
	if (this.conjunto === 1) {
		path = ofRandom(0, 10);
		noteIndex = (path < 6.0)
			? Math.floor(ofRandom(0, 8))
			: Math.floor(ofRandom(8, 40));
		this.note = NOTES[noteIndex];
		this.w = ofRandom(3.0, 9.0);
	}
	else if (this.conjunto === 2) {
		path = ofRandom(0, 10);
		noteIndex = (path < 4.0)
			? Math.floor(ofRandom(0, 11))
			: Math.floor(ofRandom(11, 66));
		this.note = NOTES2[noteIndex];
		this.w = ofRandom(2.0, 5.0);
	}
	else if (this.conjunto === 3) {
		path = ofRandom(0, 10);
		noteIndex = (path < 5.0)
			? Math.floor(ofRandom(0, 16))
			: Math.floor(ofRandom(16, 40));
		this.note = NOTES3[noteIndex];
		this.w = ofRandom(0.8, 3.0);
	}
};

Bee.prototype.update = function() {
	var b = this;

	if (b.status === "inverseCollapse") {
		b.vol -= b.vol / 25.0;
		if (b.vol < 0.0005) {
			b.vol = 0.0005;
			b.status = "inverseStay";
			b.stayCounter = 0;
		}
	}

	if (b.status === "inverseStay") {
		b.stayCounter++;
		if (b.stayCounter > 60) {
			b.status = "inverseDiscollapse";
			b.rollDice();
		}
	}

	if (b.status === "inverseDiscollapse") {
		b.vol += b.vol / 40.0;
		if (b.vol > 0.01) {
			b.vol = 0.01;
			b.status = "floating";
		}
	}

	if (b.status === "collapse") {
		b.radius -= b.radius / 40.0;
		if (Math.abs(b.radius - b.collapseRadius) < 10.0) {
			b.status = "stay";
			b.stayCounter = 0;
		}
		b.vol += b.vol / 20.0;
		if (b.vol > 0.05) b.vol = 0.05;
	}

	if (b.status === "stay") {
		b.stayCounter++;
		if (b.stayCounter > 20) b.status = "discollapse";
		b.vol += b.vol / 10.0;
		if (b.vol > 0.05) b.vol = 0.05;
	}

	if (b.status === "discollapse") {
		b.radius += (b.radius0 - b.radius) / 30.0;
		if (Math.abs(b.radius - b.radius0) < 10.0) {
			b.radius = b.radius0;
			b.status = "floating";
		}
		b.vol -= b.vol / 25.0;
		if (b.vol < 0.01) b.vol = 0.01;
	}

	// position
	b.theta += b.w;
	b.x = b.radius * Math.cos(b.theta * Math.PI / 180.0) + SCREEN_W * 0.5;
	b.y = b.radius * Math.sin(b.theta * Math.PI / 180.0) + SCREEN_H * 0.5;

	// amplitude — 4-corner spatial mapping
	if (b.gainStatus === "floating") {
		b.amp1 = (1.0 - Math.sqrt(b.x*b.x + b.y*b.y) / 2000.0) * b.vol;
		b.amp2 = (1.0 - Math.sqrt((b.x-2000.0)*(b.x-2000.0) + b.y*b.y) / 2000.0) * b.vol;
		b.amp3 = (1.0 - Math.sqrt(b.x*b.x + (b.y-2000.0)*(b.y-2000.0)) / 2000.0) * b.vol;
		b.amp4 = (1.0 - Math.sqrt((b.x-2000.0)*(b.x-2000.0) + (b.y-2000.0)*(b.y-2000.0)) / 2000.0) * b.vol;
	} else {
		b.amp1 = b.amp2 = b.amp3 = b.amp4 = 0.1;
	}
};

// ─── collapse logic (ported from ofApp::update) ───────────────────────────
// Returns the collapse group indices for each nota, as arrays of note values.
// Rather than repeating the giant if/else, we look up which notes belong together.
function getCollapseNotes(nota) {
	var N = NOTES, N2 = NOTES2, N3 = NOTES3;
	var groups = {
		"G#3":   [N[0],  N[8],  N[9],  N[10], N[32]],
		"Bb3":   [N[1],  N[11], N[12], N[13], N[33]],
		"D4":    [N[2],  N[14], N[15], N[16], N[34]],
		"F#4":   [N[3],  N[17], N[18], N[19], N[35]],
		"G4":    [N[4],  N[20], N[21], N[22], N[36]],
		"C5":    [N[5],  N[23], N[24], N[25], N[31]],
		"E5":    [N[6],  N[26], N[27], N[28], N[35]],
		"A5":    [N[7],  N[29], N[30], N[31]],

		"G3_2":  [N2[0], N2[11],N2[12],N2[13],N2[14],N2[15],
		          N2[1], N2[16],N2[17],N2[18],N2[19],N2[20],N2[21]],
		"F#4_2": [N2[2], N2[22],N2[23],N2[24],N2[25],N2[26],
		          N2[3], N2[27],N2[28],N2[29],N2[30],
		          N2[4], N2[31],N2[32],N2[33],N2[34],N2[35]],
		"D5_2":  [N2[5], N2[36],N2[37],N2[38],N2[39],N2[40],
		          N2[6], N2[41],N2[42],N2[43],N2[44],N2[45]],
		"E5_2":  [N2[7], N2[46],N2[47],N2[48],N2[49],N2[50],
		          N2[10],N2[61],N2[62],N2[63],N2[64],N2[65]],
		"A#5_2": [N2[8], N2[51],N2[52],N2[53],N2[54],N2[55],
		          N2[9], N2[56],N2[57],N2[58],N2[59],N2[60]],

		"B4_3":  [N3[5], N3[11],N3[12],N3[13],N3[14],N3[15]]
	};
	return groups[nota] || null;
}

// Derive the conjunto each nota belongs to
function conjuntoForNota(nota) {
	if (nota.slice(-2) === "_2") return 2;
	if (nota.slice(-2) === "_3") return 3;
	return 1;
}

function applyCollapse(nota) {
	var collapseSet = getCollapseNotes(nota);
	if (!collapseSet) return;
	var targetConjunto = conjuntoForNota(nota);

	// Build a Set-like lookup using a plain object keyed by rounded freq string
	// (float equality is fine here — values come from the same array)
	var inSet = {};
	for (var i = 0; i < collapseSet.length; i++) {
		inSet[collapseSet[i]] = true;
	}

	for (var j = 0; j < bees.length; j++) {
		var b = bees[j];
		if (b.status !== "floating") continue;
		if (inSet[b.note]) {
			b.status  = "collapse";
			b.conjunto = targetConjunto;
		} else {
			b.status  = "inverseCollapse";
			b.conjunto = targetConjunto;
		}
	}
}

// ─── utility ───────────────────────────────────────────────────────────────
function ofRandom(lo, hi) {
	return lo + Math.random() * (hi - lo);
}

// ─── global state ──────────────────────────────────────────────────────────
var bees     = [];
var loopTask = null;

// ─── init ──────────────────────────────────────────────────────────────────
function setupBees() {
	bees = [];
	for (var i = 0; i < NUM_BEES; i++) {
		var b = new Bee();
		b.setup();
		bees.push(b);
	}
}

function tick() {
	var drawData = [];

	for (var i = 0; i < bees.length; i++) {
		var b = bees[i];
		b.update();

		// one message per bee: voice(1-indexed) freq amp x y
		outlet(0, [i + 1, b.note, b.vol, b.x, b.y]);

		// jsui: x and y only
		drawData.push(b.x, b.y);
	}

	outlet(1, drawData);  // flat list [x y] × 64 → jsui
}

function startLoop() {
	if (loopTask) loopTask.cancel();
	loopTask = new Task(tick);
	loopTask.interval = TICK_MS;
	loopTask.repeat();
}

function stopLoop() {
	if (loopTask) { loopTask.cancel(); loopTask = null; }
}

// ─── Max inlet handlers ────────────────────────────────────────────────────

// inlet 0: bang — manual tick (loop is usually running, but useful for debugging)
function bang() {
	if (inlet === 0) tick();
}

// inlet 0: "start" / "stop" — control the internal loop
function start() {
	if (inlet === 0) startLoop();
}

function stop() {
	if (inlet === 0) stopLoop();
}

// inlet 1: "collapse G#3"  or  "collapse B4_3"  etc.
function collapse(nota) {
	if (inlet === 1 && nota) applyCollapse(nota);
}

// inlet 2: "redraw 1" / "redraw 2" / "redraw 3"
function redraw(n) {
	if (inlet !== 2) return;
	var c = parseInt(n);
	if (c < 1 || c > 3) return;
	for (var i = 0; i < bees.length; i++) {
		bees[i].conjunto = c;
		bees[i].rollDice();
	}
}

// inlet 3: "rollall" — roll without changing conjunto
function rollall() {
	if (inlet !== 3) return;
	for (var i = 0; i < bees.length; i++) bees[i].rollDice();
}

// expose as named messages too (Max convention)
function msg_int(v) {
	if (inlet === 2) redraw(v);
}

// ─── lifecycle ─────────────────────────────────────────────────────────────
setupBees();
startLoop();

// Clean up when the patch is closed or the object is freed
function notifydeleted() {
	stopLoop();
}

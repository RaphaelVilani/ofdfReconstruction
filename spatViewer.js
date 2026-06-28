/*
	spatializer.js  –  jsui for Max/MSP
	Spatial audio visualizer with LED-line trail aesthetic.
	Uses mgraphics relative_coords so the view scales with the object size.

	Messages:
	  list id x y     move source 'id' to pixel position (x, y) and redraw
	  reset id         clear the trail of source 'id' — next point starts fresh,
	                   no jump line (source color slot is kept)
	  resetall         clear all trails at once, all color slots kept
	  clearid id       remove source 'id' entirely (trail + color slot)
	  clear            remove all sources and trails
	  bang             force redraw
	  redraw           alias for bang
	  trailLength n    set max trail points (default 120)

	Coordinate input:
	  x and y are expected in the original lcd pixel space [0..460].
	  They are converted internally to relative coords [-1..+1].
*/

mgraphics.init();
mgraphics.relative_coords = 1;
mgraphics.autofill = 0;

autowatch = 1;
inlets    = 1;
outlets   = 0;

// ── Coordinate helpers ─────────────────────────────────────────────────────────
// Original lcd canvas was 460 × 460 pixels.
// relative_coords maps the jsui box to [-1, +1] on both axes,
// with (0,0) at centre, x right, y DOWN (same as lcd pixel direction).
var LCD_W = 460;
var LCD_H = 460;

// Convert a pixel value to relative space
function px(v, total) { return (v / total) * 2 - 1; }
function relX(v)      { return px(v, LCD_W); }
function relY(v)      { return px(v, LCD_H); }

// Convert a pixel length to a relative length (no offset, just scale)
function relLen(v, total) { return (v / total) * 2; }
function relLX(v) { return relLen(v, LCD_W); }
function relLY(v) { return relLen(v, LCD_H); }

// ── Geometry (defined once in relative space) ──────────────────────────────────
// Main oval: lcd frame [5 5 450 450]
var OCX = relX(227.5);   // centre x
var OCY = relY(227.5);   // centre y
var ORX = relLX(222.5);  // horizontal radius
var ORY = relLY(222.5);  // vertical radius
var OVAL_STEPS = 120;

// Cross-hair extents
var CX1 = relX(5),   CX2 = relX(450);   // horizontal line
var CY1 = relY(5),   CY2 = relY(450);   // vertical line

// Speaker positions — converted to relative once at load
var SPEAKERS_PX = [
	[140, 24],
	[317, 24],
	[23,  142],
	[433, 142],
	[24,  316],
	[432, 316],
	[140, 432],
	[317, 432]
];
var SPEAKERS = [];
for (var _s = 0; _s < SPEAKERS_PX.length; _s++) {
	SPEAKERS.push([relX(SPEAKERS_PX[_s][0]), relY(SPEAKERS_PX[_s][1])]);
}

// Speaker dot radius in relative units
var SPK_R = relLX(5);

// Head dot radius
var HEAD_R = relLX(2.5);

// ── Trail settings ─────────────────────────────────────────────────────────────
var TRAIL_MAX = 1200;

// ── Per-source LED color ramps (dark-dim tail → vivid LED head) ───────────────
var RAMPS = [
	[0.00, 0.10, 0.25,   0.10, 0.60, 1.00],   // cyan-blue
	[0.20, 0.05, 0.00,   1.00, 0.42, 0.05],   // amber-orange
	[0.05, 0.20, 0.05,   0.20, 1.00, 0.30],   // green
	[0.18, 0.00, 0.18,   0.90, 0.15, 1.00],   // magenta
	[0.00, 0.15, 0.15,   0.10, 0.95, 0.85],   // teal
	[0.20, 0.00, 0.05,   1.00, 0.10, 0.35],   // red-pink
	[0.12, 0.12, 0.00,   0.95, 0.90, 0.10],   // yellow
	[0.05, 0.00, 0.20,   0.35, 0.20, 1.00]    // indigo
];

// Speaker dot color
var SPK_R_COL = 0.35;
var SPK_G_COL = 0.55;
var SPK_B_COL = 0.70;
var SPK_A_COL = 0.80;

// Ring / crosshair luminance
var RING_L = 0.22;

// ── State ──────────────────────────────────────────────────────────────────────
var sources     = {};
var sourceCount = 0;

// ── Message handlers ───────────────────────────────────────────────────────────
function list() {
	var a  = arrayfromargs(arguments);
	if (a.length < 3) return;
	var id = a[0];
	// Accept incoming coords in lcd pixel space, convert to relative
	var x  = relX(parseFloat(a[1]));
	var y  = relY(parseFloat(a[2]));

	if (!sources[id]) {
		sources[id] = {
			trail:   [],
			rampIdx: sourceCount % RAMPS.length
		};
		sourceCount++;
	}
	var trail = sources[id].trail;
	trail.push([x, y]);
	if (trail.length > TRAIL_MAX) trail.shift();

	mgraphics.redraw();
}

function bang() {
	mgraphics.redraw();
}

function clear() {
	sources     = {};
	sourceCount = 0;
	mgraphics.redraw();
}

// Clear the trail of one source without removing it.
// The color slot is preserved, and the next incoming point
// starts a fresh segment — no jump line across the gap.
function reset() {
	var a  = arrayfromargs(arguments);
	if (a.length < 1) return;
	var id = a[0];
	if (sources[id]) {
		sources[id].trail = [];
		mgraphics.redraw();
	}
}

// Clear all trails at once, keeping every source and its color slot.
function resetall() {
	for (var id in sources) {
		sources[id].trail = [];
	}
	mgraphics.redraw();
}

// Remove one source entirely (trail + color slot freed).
function clearid() {
	var a  = arrayfromargs(arguments);
	if (a.length < 1) return;
	var id = a[0];
	if (sources[id]) {
		delete sources[id];
		mgraphics.redraw();
	}
}

// Explicit redraw — handy to drive from a metro without sending data.
function redraw() {
	mgraphics.redraw();
}

function trailLength(n) {
	TRAIL_MAX = Math.max(2, Math.floor(n));
}

// ── Drawing ────────────────────────────────────────────────────────────────────
function paint() {
	var g = mgraphics;

	// Black background — fill the full [-1,+1] square
	g.set_source_rgba(0, 0, 0, 1);
	g.rectangle(-1, -1, 2, 2);
	g.fill();

	// ── Main oval ──
	drawEllipse(g, OCX, OCY, ORX, ORY, OVAL_STEPS,
	            RING_L, RING_L, RING_L, 0.9, 0.004);

	// ── Cross-hairs ──
	g.set_source_rgba(RING_L, RING_L, RING_L, 0.35);
	g.set_line_width(0.002);
	g.move_to(CX1, OCY);  g.line_to(CX2, OCY);  g.stroke();
	g.move_to(OCX, CY1);  g.line_to(OCX, CY2);  g.stroke();

	// ── Loudspeakers ──
	for (var s = 0; s < SPEAKERS.length; s++) {
		g.set_source_rgba(SPK_R_COL, SPK_G_COL, SPK_B_COL, SPK_A_COL);
		drawDisc(g, SPEAKERS[s][0], SPEAKERS[s][1], SPK_R);
	}

	// ── Trails ──
	for (var id in sources) {
		var src   = sources[id];
		var trail = src.trail;
		var ramp  = RAMPS[src.rampIdx];
		var n     = trail.length;
		if (n < 2) continue;

		var rt = ramp[0], gt = ramp[1], bt = ramp[2];
		var rh = ramp[3], gh = ramp[4], bh = ramp[5];

		for (var i = 1; i < n; i++) {
			var t  = i / (n - 1);
			var tm = ((i - 1) / (n - 1) + t) * 0.5;

			var r  = rt + (rh - rt) * tm;
			var gr = gt + (gh - gt) * tm;
			var b  = bt + (bh - bt) * tm;
			var alpha = 0.15 + 0.85 * tm;

			// line width in relative units (~0.002 thin → ~0.006 at head)
			var lw = 0.002 + 0.004 * tm;

			g.set_source_rgba(r, gr, b, alpha);
			g.set_line_width(lw);
			g.move_to(trail[i - 1][0], trail[i - 1][1]);
			g.line_to(trail[i][0],     trail[i][1]);
			g.stroke();
		}

		// Head dot
		var head = trail[n - 1];
		g.set_source_rgba(rh, gh, bh, 1.0);
		drawDisc(g, head[0], head[1], HEAD_R);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function drawDisc(g, cx, cy, r) {
	var steps = 20;
	var twoPi = 2 * Math.PI;
	g.move_to(cx + r, cy);
	for (var i = 1; i <= steps; i++) {
		var a = (i / steps) * twoPi;
		g.line_to(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
	}
	g.fill();
}

function drawEllipse(g, cx, cy, rx, ry, steps, r, gr, b, a, lw) {
	g.set_source_rgba(r, gr, b, a);
	g.set_line_width(lw);
	g.move_to(cx + rx, cy);
	for (var i = 1; i <= steps; i++) {
		var ang = (i / steps) * 2 * Math.PI;
		g.line_to(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry);
	}
	g.stroke();
}
// bees_ui.js
// Max/MSP [jsui] object
// Receives x/y positions from outlet 4 of bees.js
// Format: x0 y0 x1 y1 ... x63 y63  (128 numbers)
//
// Coordinate space from bees.js:
//   center: (SCREEN_W*0.5, SCREEN_H*0.5) = (512, 384)
//   max radius: 1900  →  x range: [-1388, 1924]  y range: [-1516, 2284]
//   We use a symmetric range around center so orbits look circular.
//
// Manual test: "list 512 384" → one dot at center of jsui box

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill        = 0;

var DOT_R = 2;

// Source coordinate bounds — center + max radius with a small margin
var MAX_RADIUS = 1950;          // slightly beyond the 1900 max so edge bees aren't clipped
var CX = 512;                   // SCREEN_W * 0.5
var CY = 384;                   // SCREEN_H * 0.5
var SRC_LEFT   = CX - MAX_RADIUS;   // -1438
var SRC_TOP    = CY - MAX_RADIUS;   // -1566
var SRC_SPAN   = MAX_RADIUS * 2;    //  3900  (same for x and y → circles stay circular)

var beeData = [];

function store(args) {
	beeData = [];
	for (var i = 0; i < args.length; i++) {
		beeData.push(parseFloat(args[i]));
	}
	mgraphics.redraw();
}

function list()     { store(arrayfromargs(arguments)); }
function anything() { store(arrayfromargs(arguments)); }
function bang()     { mgraphics.redraw(); }

function paint() {
	var w = box.rect[2] - box.rect[0];
	var h = box.rect[3] - box.rect[1];

	// background
	mgraphics.set_source_rgba(0, 0, 0, 1);
	mgraphics.rectangle(0, 0, w, h);
	mgraphics.fill();

	if (!beeData || beeData.length < 2) return;

	// uniform scale: map the square source span onto the shorter jsui dimension
	// so orbits stay circular regardless of box aspect ratio
	var scale = Math.min(w, h) / SRC_SPAN;

	// offset to center the coordinate space inside the jsui box
	var offX = (w - SRC_SPAN * scale) * 0.5;
	var offY = (h - SRC_SPAN * scale) * 0.5;

	mgraphics.set_source_rgba(1, 0, 0, 1);

	for (var i = 0; i + 1 < beeData.length; i += 2) {
		var px = (beeData[i]     - SRC_LEFT) * scale + offX;
		var py = (beeData[i + 1] - SRC_TOP)  * scale + offY;
		mgraphics.arc(px, py, DOT_R, 0, 2 * Math.PI);
		mgraphics.fill();
	}
}
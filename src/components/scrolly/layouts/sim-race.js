import story from "$data/scrolly-story.json";
import rawNodes from "$data/scrolly-nodes.json";
import {
	ATTR_SIZE,
	STRIDE,
	EDGE_BASE,
	TRAIL_SIZE,
	TRAIL_POINTS,
	TRAIL_STRIDE,
	TRAIL_META,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	setTrailPoints,
	collapseTrail,
	CROWD,
	INK,
	SIM_SERIES,
	SIM_LABEL_N,
	SIM_LABEL_IDS,
	SIM_SLOT_BASE
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Simulation race: the reader presses Start and the 10,000 recorded simulation
// runs replay left to right, each contender's cumulative win count climbing as
// a line. x = simulation number, y = wins. The whole run range is mapped to the
// plot width, so unlike the race chapter there is no camera and nothing to pan:
// one screen holds the entire simulation.
//
// The runs are the real ones. `story.genz.runs` is the recorded winner of every
// simulation (see tasks/build-scrolly-nodes.js), so a replay lands on exactly
// the win counts the story quotes, and pressing Start again replays the same race
// rather than a fresh sample of it.
// ---------------------------------------------------------------------------

/** how many simulation runs the recorded sequence holds — the playhead's range */
export const SIM_N_SIMS = story.genz.nSims;
/** the run the first name comes in on: early enough that the reader has most of
 * the race left to follow them, late enough that the field has pulled apart and
 * five names aren't a smudge over each other near the origin */
export const SIM_NAMES_AT = 5000;
/** runs between one name and the next, so they arrive one at a time in win order
 * rather than all five at once — the leader is named first, and each fades up on
 * its own (the .node-label opacity transition) as the replay reaches it */
const SIM_NAME_STAGGER = 500;

/**
 * How many of the leaders' names are due at `runs`. The animation publishes this
 * as it climbs (`story.simNames`) — a handful of writes per run, rather than the
 * playhead itself, which would retarget the tweener every frame.
 * @param {number} runs
 */
export const simNamesDue = (runs) =>
	Math.max(
		0,
		Math.min(
			SIM_LABEL_N,
			Math.floor((runs - SIM_NAMES_AT) / SIM_NAME_STAGGER) + 1
		)
	);

/**
 * Cumulative wins per series after r runs: `WINS_AT[series][r]`. Built once, so
 * a frame reads any playhead in O(1) and the per-frame cost is 21 lines rather
 * than 10,000 runs.
 * @type {Int32Array[]}
 */
const WINS_AT = SIM_SERIES.map(() => new Int32Array(SIM_N_SIMS + 1));
{
	const running = new Int32Array(SIM_SERIES.length);
	for (let run = 0; run < SIM_N_SIMS; run++) {
		// a run's winner is a seat in the win-sorted candidate list, which is the
		// series order too — one line per contender
		running[story.genz.runs[run]]++;
		for (let s = 0; s < running.length; s++) WINS_AT[s][run + 1] = running[s];
	}
}

/**
 * The run indices every line's vertices sit on, fixed for the whole animation:
 * TRAIL_POINTS - 1 even intervals across the full range, so vertex k always
 * reads the same runs however far the replay has got. A growing sample window
 * would slide each vertex through the data every frame and the lines shimmer
 * (see setTrailPoints).
 */
const GRID_RUNS = Int32Array.from({ length: TRAIL_POINTS }, (_v, k) =>
	Math.round((SIM_N_SIMS * k) / (TRAIL_POINTS - 1))
);

/** the tallest line's final count, rounded up to a round hundred */
const SIM_Y_MAX =
	Math.ceil(Math.max(...WINS_AT.map((cum) => cum[SIM_N_SIMS])) / 100) * 100;
// Four ticks, not more: the rotated "Wins" axis title is centred on the plot's
// vertical middle (see ScrollyVisual's overlay), so a denser scale puts a tick
// label right behind it
const Y_STEP = [200, 400, 500, 1000].find((s) => SIM_Y_MAX / s <= 3);

const NARROW = 520;
// the dot's own radius, so the last run's mark sits inside the canvas rather
// than half over its edge. There is no name gutter: the labels sit to the LEFT
// of their dots (see labelDirs below), which buys the plot the full width
const DOT_ROOM = 8;

function simPlot(w, h) {
	return {
		top: MARGIN + 10,
		bottom: plotBottom(h),
		left: MARGIN + 22, // room for the win-count ticks
		right: w - MARGIN - DOT_ROOM
	};
}

const runLabel = (r) => (r === 0 ? "0" : `${r / 1000}k`);

function simAxes(w, plot, xS, yS) {
	const xRuns =
		w < NARROW
			? [0, SIM_N_SIMS / 2, SIM_N_SIMS]
			: [0, 2000, 4000, 6000, 8000, SIM_N_SIMS];
	const y = [];
	for (let v = 0; v <= SIM_Y_MAX; v += Y_STEP) y.push(v);
	return {
		x: xRuns.map((r) => ({ pos: xS(r), label: runLabel(r) })),
		xBase: plot.bottom + 10,
		y: y.map((v) => ({ pos: yS(v), label: String(v) }))
	};
}

/**
 * The one frame writer: the settled layout and every animation frame both go
 * through here, so a run's last frame IS the layout it settles onto.
 * @param {Float32Array|Float64Array} attrs live dot buffer (or a scratch clone)
 * @param {Float32Array|Float64Array} trails live trail buffer (or a scratch clone)
 * @param {number} w
 * @param {number} h
 * @param {number} runs playhead — simulations replayed so far, 0..SIM_N_SIMS
 */
export function writeSimFrame(attrs, trails, w, h, runs) {
	const plot = simPlot(w, h);
	const xS = (r) => lin(r, 0, SIM_N_SIMS, plot.left, plot.right);
	const yS = (v) => lin(v, 0, SIM_Y_MAX, plot.bottom, plot.top);
	const played = Math.max(0, Math.min(SIM_N_SIMS, Math.round(runs)));
	SIM_SERIES.forEach((id, s) => {
		const cum = WINS_AT[s];
		const named = s < SIM_LABEL_N;
		const slot = SIM_SLOT_BASE + s;
		if (played === 0) {
			// nothing has run yet: every line is a dot on the origin, ready to unspool
			collapseTrail(trails, slot, xS(0), yS(0), named ? 0.8 : 0.35);
		} else {
			// every grid vertex the playhead has passed, then the tip at the playhead
			// itself. Only that last segment moves between frames; everything behind
			// it is already at its final position
			const points = [];
			for (let k = 0; k < GRID_RUNS.length && GRID_RUNS[k] <= played; k++) {
				points.push([xS(GRID_RUNS[k]), yS(cum[GRID_RUNS[k]])]);
			}
			if (played > GRID_RUNS[points.length - 1]) {
				points.push([xS(played), yS(cum[played])]);
			}
			setTrailPoints(trails, slot, points, named ? 0.8 : 0.35);
		}
		if (id !== null) {
			set(
				attrs,
				id,
				xS(played),
				yS(cum[played]),
				named ? 5 : 3,
				named ? INK : CROWD,
				named ? 1 : 0.55
			);
		}
	});
	// no furniture above the plot: the x axis already says how many runs have
	// gone by, and the chart is the whole message
	return { axes: simAxes(w, plot, xS, yS) };
}

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutSimRace(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	const onChart = new Set(SIM_SERIES.filter((id) => id !== null));
	// every contender below the cut waits at their scatter spot, invisible, so
	// nothing travels the width of the canvas to get here
	for (const n of nodes) {
		if (onChart.has(n.id)) continue;
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	// the sim slots are the writer's; every other line retracts into the origin
	const simSlots = SIM_SERIES.map((_id, s) => SIM_SLOT_BASE + s);
	const owned = new Set(simSlots);
	const plot = simPlot(w, h);
	TRAIL_META.forEach((_meta, t) => {
		if (owned.has(t)) return;
		collapseTrail(trails, t, plot.left, plot.bottom, 0);
	});
	const { axes } = writeSimFrame(attrs, trails, w, h, params?.runs ?? 0);
	return { attrs, trails, axes };
}

/**
 * The closing beat: an empty canvas, so the last words stand on their own.
 *
 * It is the sim chart with every alpha taken to zero, not a fresh empty buffer:
 * the tween then dissolves whatever the reader was looking at where it lies,
 * instead of sliding the field off to some other parking spot on its way out.
 * The `runs` param comes through the same selector as simRace's, so a reader who
 * never pressed Start fades out the origin they were shown rather than the
 * finished race they weren't.
 * @type {import("../layout-shared.js").LayoutFn}
 */
function layoutOutro(nodes, w, h, edges, params) {
	const { attrs, trails } = layoutSimRace(nodes, w, h, edges, params);
	for (let i = 0; i < EDGE_BASE; i += STRIDE) attrs[i + 6] = 0;
	for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) attrs[i + 1] = 0;
	for (let t = 0; t < TRAIL_META.length; t++) {
		trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
	}
	return { attrs, trails };
}

const SIM_LABEL_DIRS = Object.fromEntries(
	SIM_LABEL_IDS.map((id) => [id, "left"])
);

const simLabelText = () =>
	Object.fromEntries(
		story.genz.candidates
			.slice(0, SIM_LABEL_N)
			.map((c) => [
				c.id,
				`${rawNodes.nodes[c.id][1]} ${(c.winPct * 100).toFixed(1)}%`
			])
	);

const simParams = (s) => ({ runs: s.simRuns ?? 0, names: s.simNames ?? 0 });

export const states = {
	simRace: {
		layout: layoutSimRace,
		// the names arrive one at a time part-way through the race (SIM_NAMES_AT +
		// SIM_NAME_STAGGER), once the field has pulled apart. `names` is what brings
		// them in during the replay itself, whose playhead the layout never sees —
		// the animation writes the canvas directly, so `runs` stays 0 until it
		// finishes (see ScrollyVisual's playSimRun); a settled chart, arrived at
		// however, shows all of them
		labels: (p) =>
			SIM_LABEL_IDS.slice(
				0,
				p?.runs >= SIM_NAMES_AT ? SIM_LABEL_N : (p?.names ?? 0)
			),
		// to the LEFT of the dot, not the right: the names then sit over the plot
		// they belong to instead of a reserved gutter, and the chart gets the
		// canvas's full width
		labelDirs: SIM_LABEL_DIRS,
		// a name carries its contender's win share: it is the number the whole step
		// is about, and the line's own end position is the only other place the
		// reader could read it off
		labelText: simLabelText,
		params: simParams,
		overlay: {
			xLabel: "Simulations run",
			yLabel: "Wins"
		}
	},
	outro: {
		layout: layoutOutro,
		// the same names the chart carries, so each one rides its dot's alpha down
		// to nothing; dropping them from the state instead would unmount the labels
		// the instant the step changed, leaving five names blinking off above a
		// chart still fading
		labels: (p) =>
			SIM_LABEL_IDS.slice(
				0,
				p?.runs >= SIM_NAMES_AT ? SIM_LABEL_N : (p?.names ?? 0)
			),
		labelDirs: SIM_LABEL_DIRS,
		labelText: simLabelText,
		params: simParams
		// no overlay: the axis titles are furniture on a chart that is leaving
	}
};

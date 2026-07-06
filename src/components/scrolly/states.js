import {
	NODE_COUNT,
	EDGE_COUNT,
	ANCHOR_ID,
	INTRO_IDS,
	INTRO_LAYOUT,
	hash01
} from "./nodes.js";
import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";

// x, y, radius, red, green, blue, alpha — one group per node, then one
// (mostly empty) group per edge so the tweener staggers edges individually:
// edge slot 0 = draw progress (0–1, drawn from the anchor outward toward the
// higher-hop endpoint), edge slot 1 = alpha
export const STRIDE = 7;
export const EDGE_BASE = NODE_COUNT * STRIDE;
export const ATTR_SIZE = (NODE_COUNT + EDGE_COUNT) * STRIDE;
// one delay slot per node, then one per edge
export const DELAY_SIZE = NODE_COUNT + EDGE_COUNT;
export const edgeIndex = (e) => EDGE_BASE + e * STRIDE;

/**
 * @typedef {import("./nodes.js").ActorNode} ActorNode
 * @typedef {import("./nodes.js").Edge} Edge
 *
 * @typedef {Object} Tick
 * @property {number} pos px along the axis
 * @property {string} label
 *
 * @typedef {Object} Note
 * @property {number} x px
 * @property {number} y px
 * @property {string} text
 * @property {"left"|"center"|"right"} [align] default "left"
 * @property {boolean} [strong] render emphasised
 * @property {boolean} [wrap] allow multi-line (default nowrap)
 *
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + STRIDE per edge
 * @property {Float64Array} [delays] DELAY_SIZE per-node/per-edge start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 * @property {Float64Array} [trails] TRAIL_SIZE polyline vertices + alpha per trail;
 *   omitted = trails fade out in place
 * @property {Float64Array} [trailDelays] per-trail start delays in ms
 * @property {{ x?: Tick[], y?: Tick[], xBase?: number, yBase?: number }} [axes]
 * @property {Note[]} [notes]
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
 * @param {Edge[]} edges
 * @param {Object} [params] step params merged with interaction state (see STATE_PARAMS)
 * @returns {LayoutResult}
 */

// rgb values of the tokens in src/styles/variables.css (canvas can't read CSS custom properties)
const HOP_RGB = [
	[34, 34, 34], // hop 0 — --color-gray-900
	[238, 102, 119], // hop 1 — --category-red
	[68, 119, 170], // hop 2 — --category-blue
	[102, 204, 238], // hop 3 — --category-cyan
	[187, 187, 187] // hop 4 — --category-gray
];
const INK = [34, 34, 34]; // --color-gray-900
const CROWD = [187, 187, 187]; // --category-gray
const RED = [238, 102, 119]; // --category-red
const BLUE = [68, 119, 170]; // --category-blue
const GREEN = [34, 136, 51]; // --category-green
const YELLOW = [204, 187, 68]; // --category-yellow
const PURPLE = [170, 51, 119]; // --category-purple

const MARGIN = 32;
// charts live in the top ~2/3 of the canvas — the step card owns the bottom,
// and the x-axis ticks need to clear it too
const plotBottom = (h) => h * 0.66;

const lin = (v, d0, d1, r0, r1) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

// unordered endpoint key so an edge can be looked up regardless of orientation
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function set(attrs, id, x, y, r, [red, green, blue], alpha) {
	const i = id * STRIDE;
	attrs[i] = x;
	attrs[i + 1] = y;
	attrs[i + 2] = r;
	attrs[i + 3] = red;
	attrs[i + 4] = green;
	attrs[i + 5] = blue;
	attrs[i + 6] = alpha;
}

function setEdge(attrs, e, progress, alpha) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
}

// ---------------------------------------------------------------------------
// Story data / named actors (module scope: label & trail specs need ids)
// ---------------------------------------------------------------------------

const ID_BY_PID = new Map(rawNodes.nodes.map((n, id) => [n[0], id]));
const idOf = (pid) => {
	const id = ID_BY_PID.get(pid);
	if (id === undefined) throw new Error(`scrolly states: unknown pid ${pid}`);
	return id;
};

const SLJ = idOf(2231);
const HANKS = idOf(31);
const STREEP = idOf(5064);
const DENIRO = idOf(380);
const HACKMAN = idOf(193);
const WELKER = idOf(15831);
const CAGE = idOf(2963);
const WALTERS = idOf(477);
const OLDMAN = idOf(64);
const KIDMAN = idOf(2227);
const CGM = story.genz.candidates[0].id;
const SWEENEY = idOf(115440);
const CHASE = idOf(54812);

// ranked order over the sample (ranks are corpus-global and sparse — plot by
// sampled order, never raw rank; see notes/scrolly-framework.md)
const BY_RANK = rawNodes.nodes
	.map((n, id) => ({ id, rank: n[5] }))
	.sort((a, b) => a.rank - b.rank);
const ORDER_OF = new Map(BY_RANK.map((n, i) => [n.id, i]));

// fixed film-count x-scale shared by every films-scatter variant so dots only
// travel vertically when the y-metric changes
const FILM_LOGS = rawNodes.nodes.map((n) => Math.log(Math.max(1, n[3])));
const FILM_LOG_MIN = Math.min(...FILM_LOGS);
const FILM_LOG_MAX = Math.max(...FILM_LOGS);
const AVG_MIN = Math.min(...rawNodes.nodes.map((n) => n[4]));
const AVG_MAX = Math.max(...rawNodes.nodes.map((n) => n[4]));

/** distance-vs-films position — also the park spot for hidden latecomers */
function scatterPosition(n, w, h) {
	return [
		lin(
			Math.log(Math.max(1, n.films)),
			FILM_LOG_MIN,
			FILM_LOG_MAX,
			MARGIN,
			w - MARGIN
		),
		lin(n.avgDistance, AVG_MIN, AVG_MAX, MARGIN + 8, plotBottom(h))
	];
}

// ---------------------------------------------------------------------------
// Trails: polylines tweened by a second tweener (vertex morphing = object
// constancy for lines). Fixed slots: 15 race anchors, the career trio, 40
// cohort career lines, 1 diagonal (prediction scatter).
// ---------------------------------------------------------------------------

export const TRAIL_POINTS = 48;
export const TRAIL_STRIDE = TRAIL_POINTS * 2 + 1; // vertices + alpha
const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);
const raceRGB = (id) =>
	id === SLJ
		? PURPLE
		: id === HACKMAN
			? BLUE
			: id === DENIRO
				? GREEN
				: id === WELKER
					? YELLOW
					: CROWD;
/** @type {{ id: number|null, rgb: number[], width: number }[]} */
export const TRAIL_META = [
	...RACE_IDS.map((id) => ({
		id,
		rgb: raceRGB(id),
		width: raceRGB(id) === CROWD ? 1 : 1.75
	})),
	{ id: SWEENEY, rgb: RED, width: 2 },
	{ id: DENIRO, rgb: BLUE, width: 2 },
	{ id: CHASE, rgb: YELLOW, width: 2 },
	...story.careers.cohort.map(() => ({ id: null, rgb: CROWD, width: 1 })),
	{ id: null, rgb: CROWD, width: 1 } // prediction diagonal
];
export const TRAIL_SIZE = TRAIL_META.length * TRAIL_STRIDE;
const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));
const SWEENEY_SLOT = RACE_IDS.length;
const DENIRO_SLOT = RACE_IDS.length + 1;
const CHASE_SLOT = RACE_IDS.length + 2;
const COHORT_SLOT = RACE_IDS.length + 3;
const DIAG_SLOT = TRAIL_META.length - 1;

/** writes a polyline (data pairs → px via scales) into trail slot t */
function setTrail(trails, t, pairs, xScale, yScale, alpha) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		// resample the series uniformly in x by walking segments
		const target =
			pairs[0][0] + ((pairs.at(-1)[0] - pairs[0][0]) * k) / (TRAIL_POINTS - 1);
		let j = 1;
		while (j < pairs.length - 1 && pairs[j][0] < target) j++;
		const [x0, y0] = pairs[j - 1];
		const [x1, y1] = pairs[j];
		const t01 = x1 === x0 ? 0 : (target - x0) / (x1 - x0);
		trails[base + k * 2] = xScale(target);
		trails[base + k * 2 + 1] = yScale(y0 + (y1 - y0) * t01);
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/** collapses trail slot t onto a point (line unspools from/retracts into a dot) */
function collapseTrail(trails, t, x, y, alpha = 0) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends */
function clipSeries(pairs, x0, x1) {
	const out = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		if (x < x0) {
			const nxt = pairs[i + 1];
			if (nxt && nxt[0] > x0) {
				out.push([x0, y + ((nxt[1] - y) * (x0 - x)) / (nxt[0] - x)]);
			}
			continue;
		}
		if (x > x1) {
			const prv = pairs[i - 1];
			if (prv && prv[0] < x1 && (!out.length || out.at(-1)[0] < x1)) {
				out.push([x1, prv[1] + ((y - prv[1]) * (x1 - prv[0])) / (x - prv[0])]);
			}
			break;
		}
		out.push([x, y]);
	}
	return out.length >= 2 ? out : null;
}

const NETWORK_ALPHA = [1, 0.9, 0.45, 0.2, 0.12];
const NETWORK_RADIUS = [16, 6, 3.5, 2.5, 2];
const NETWORK_HOP_DELAY_MS = 250;

/**
 * Radial full-graph position — shared so other states can pre-park the crowd.
 * `spread` > 1 inflates the radius: earlier states park the (invisible) crowd
 * spread out, so arriving at `network` contracts everything inward — the
 * whole graph reads as the camera zooming out to reveal the full dataset.
 */
function networkPosition(n, w, h, spread = 1) {
	const maxR = Math.min(w, h) / 2 - MARGIN;
	const angle = hash01(n.id, 1) * Math.PI * 2;
	const radius = maxR * (n.hop / 4) * (0.78 + 0.22 * hash01(n.id, 2)) * spread;
	return [w / 2 + Math.cos(angle) * radius, h / 2 + Math.sin(angle) * radius];
}

// how far beyond their resting radius the crowd parks before fading in
const NETWORK_PRESPREAD = 1.35;

/** hidden park spot for any node not participating in a hop-based state */
function parkHidden(attrs, n, w, h) {
	if (n.hop >= 0) {
		const [x, y] = networkPosition(n, w, h, NETWORK_PRESPREAD);
		set(attrs, n.id, x, y, NETWORK_RADIUS[n.hop], HOP_RGB[n.hop], 0);
	} else {
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
}

// anisotropy cap when fitting the landscape intro layout to portrait screens —
// planarity survives axis scaling, and without it 320px viewports squash the
// graph to ~200px tall with the name labels colliding
const INTRO_MAX_STRETCH = 1.6;

/**
 * Fits the intro network's baked 860×680 planar layout into the top ~72% of
 * the canvas (bottom stays clear of the step card), stretching each axis
 * independently up to INTRO_MAX_STRETCH beyond uniform. Returns the position
 * of intro node k, optionally exaggerated radially away from the anchor
 * (`spread` > 1 pushes nodes outward for "appear far away" starts).
 */
function introPosition(k, w, h, spread = 1) {
	const availW = w - MARGIN * 2;
	const availH = h * 0.72 - MARGIN;
	const sxRaw = availW / INTRO_LAYOUT.w;
	const syRaw = availH / INTRO_LAYOUT.h;
	const sx = Math.min(sxRaw, syRaw * INTRO_MAX_STRETCH);
	const sy = Math.min(syRaw, sxRaw * INTRO_MAX_STRETCH);
	const ox = (w - INTRO_LAYOUT.w * sx) / 2;
	const oy = MARGIN + (availH - INTRO_LAYOUT.h * sy) / 2;
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [
		ox + (ax + (x - ax) * spread) * sx,
		oy + (ay + (y - ay) * spread) * sy
	];
}

const INTRO_ANCHOR_RADIUS = 14;
const INTRO_RADIUS = 7;
const INTRO_EDGE_ALPHA = 0.5;

// Reveal is authored as paths (still keyed source→…→Bacon), but each is walked
// outward from Bacon (id 0, already on screen) to its source actor, so the graph
// grows out of Bacon. Per segment: the line grows from the inner node toward the
// next one, and that next node pops as the line reaches it — so the step reads as
// routes sprouting from Bacon rather than a graph dump. The first two paths
// (Bacon→Ryan→Margot, Bacon→Cumberbatch→Zendaya) play strictly one at a time as a
// deliberate walk; the rest fill in freely afterwards. Shared nodes/lines animate
// once, at first mention. Bacon is the shared origin.
const INTRO_PATHS = [
	[12, 3], // Margot Robbie → Ryan Gosling → Bacon
	[14, 5], // Zendaya → Benedict Cumberbatch → Bacon
	[7, 6], // Timothée Chalamet → Meryl Streep → Bacon
	[11, 4], // Austin Butler → Tom Hanks → Bacon
	[2, 1], // Cillian Murphy → Robert De Niro → Bacon
	[9, 1], // Anya Taylor-Joy → Robert De Niro → Bacon
	[8, 6], // Saoirse Ronan → Meryl Streep → Bacon
	[10, 5], // Jessie Buckley → Benedict Cumberbatch → Bacon
	[11, 13] // Austin Butler → Emma Stone → Bacon
];
// mirrors ScrollyVisual's TWEEN_MS so a node lands just as its line arrives
const INTRO_LINE_MS = 700;
const INTRO_START_DWELL_MS = 350; // beat after a new source appears before its line draws
const INTRO_POP_MS = 0; // no beat between segments so the walk reads continuous
const INTRO_PATH_GAP_MS = 400; // pause after a sequential route reaches Bacon
const INTRO_SEQ_COUNT = 2; // first N routes play strictly one at a time; rest fill freely
const INTRO_PATH_STEP_MS = 500; // stagger between the free-for-all routes
// secondary lines (not on any authored path) draw this long after both ends appear
const INTRO_EDGE_LAG_MS = 400;

/** @type {LayoutFn} */
function layoutLone(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	for (const n of nodes) {
		if (n.id === ANCHOR_ID) {
			set(attrs, n.id, w / 2, h / 2, 18, HOP_RGB[0], 1);
		} else if (introSet.has(n.id)) {
			// parked at their eventual networkIntro spot (alpha 0) so they fade in place
			const [x, y] = introPosition(n.id, w, h);
			set(attrs, n.id, x, y, INTRO_RADIUS, HOP_RGB[n.hop], 0);
		} else {
			parkHidden(attrs, n, w, h);
		}
	}
	return { attrs };
}

/** @type {LayoutFn} */
function layoutNetworkIntro(nodes, w, h, edges) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const introSet = new Set(INTRO_IDS);

	// index edges by unordered endpoint pair so paths can look them up by name
	const edgeByPair = new Map();
	edges.forEach(({ source, target }, e) => {
		edgeByPair.set(pairKey(source, target), e);
	});

	// Walk each path from its source actor inward to Bacon: the source appears and
	// dwells, then each line grows toward the next node while that node pops in step
	// with it, so both finish together as the line arrives. The first INTRO_SEQ_COUNT
	// paths run on one running clock — strictly one at a time — so the opening reads
	// as a single continuous walk to Bacon; the rest start after those complete and
	// overlap on a stagger. Everything animates once, at first mention; Bacon is
	// already on screen.
	const nodeDelay = new Map([[ANCHOR_ID, 0]]);
	const edgeDelay = new Map();
	// Bacon is already on screen, so seed the sequential clock with an opening
	// beat before the first line leaves him (mirrors the source-dwell the old
	// inward walk got for free from its first, appearing, source node)
	let seqClock = INTRO_START_DWELL_MS; // running clock through the sequential routes
	let freeStart = seqClock; // when the free-for-all routes begin
	INTRO_PATHS.forEach((path, k) => {
		const walk = [ANCHOR_ID, ...[...path].reverse()];
		const sequential = k < INTRO_SEQ_COUNT;
		let clock = sequential
			? seqClock
			: freeStart + (k - INTRO_SEQ_COUNT) * INTRO_PATH_STEP_MS;
		const src = walk[0];
		if (!nodeDelay.has(src)) {
			nodeDelay.set(src, clock); // source appears, then dwells before its line leaves
			clock += INTRO_START_DWELL_MS;
		}
		for (let i = 1; i < walk.length; i++) {
			const e = edgeByPair.get(pairKey(walk[i - 1], walk[i]));
			if (e === undefined || edgeDelay.has(e)) continue;
			edgeDelay.set(e, clock); // line leaves the (already-visible) outer node
			// node pops in step with the line so both finish together as it arrives
			if (!nodeDelay.has(walk[i])) nodeDelay.set(walk[i], clock);
			clock += INTRO_LINE_MS + INTRO_POP_MS;
		}
		if (sequential) {
			clock += INTRO_PATH_GAP_MS;
			seqClock = clock;
			freeStart = clock; // free-for-all begins after the last sequential route
		}
	});

	for (const n of nodes) {
		if (introSet.has(n.id)) {
			const [x, y] = introPosition(n.id, w, h);
			set(
				attrs,
				n.id,
				x,
				y,
				n.id === ANCHOR_ID ? INTRO_ANCHOR_RADIUS : INTRO_RADIUS,
				HOP_RGB[n.hop],
				1
			);
			delays[n.id] = nodeDelay.get(n.id) ?? 0;
		} else {
			parkHidden(attrs, n, w, h);
		}
	}
	edges.forEach(({ source, target }, e) => {
		setEdge(attrs, e, 1, INTRO_EDGE_ALPHA);
		// secondary links (not on any path) fill in once both ends are up
		delays[NODE_COUNT + e] =
			edgeDelay.get(e) ??
			Math.max(nodeDelay.get(source) ?? 0, nodeDelay.get(target) ?? 0) +
				INTRO_EDGE_LAG_MS;
	});
	return { attrs, delays };
}

/** @type {LayoutFn} */
function layoutNetwork(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	for (const n of nodes) {
		if (n.hop < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const [x, y] = networkPosition(n, w, h);
		set(
			attrs,
			n.id,
			x,
			y,
			NETWORK_RADIUS[n.hop],
			HOP_RGB[n.hop],
			NETWORK_ALPHA[n.hop]
		);
		// more and more actors: hop ripple plus per-node scatter inside each
		// wave, so the crowd accumulates rather than arriving in 4 blocks
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS + hash01(n.id, 6) * 350;
	}
	// intro edges (progress/alpha 0, delay 0) retract as the crowd fades up
	return { attrs, delays };
}

// ---------------------------------------------------------------------------
// Hop bands (Present chapter): row per degree of separation. Band thickness
// follows the on-screen sample; the notes cite the TRUE corpus bucket totals
// (sample proportions would misstate them — see notes/scrolly-framework.md).
// ---------------------------------------------------------------------------

/** @type {LayoutFn} */
function layoutHopBands(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) if (n.hop >= 0) counts[n.hop]++;
	const top = MARGIN + 12;
	const innerH = plotBottom(h) - top;
	const visible = counts.reduce((s, v) => s + v, 0);
	const bandTops = [];
	let y = top;
	for (const count of counts) {
		bandTops.push(y);
		y += Math.max(0.08, count / visible) * innerH;
	}
	bandTops.push(plotBottom(h));
	for (const n of nodes) {
		if (n.hop < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const pad = 10;
		const bandH = bandTops[n.hop + 1] - bandTops[n.hop] - pad;
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			anchor ? w / 2 : MARGIN + hash01(n.id, 3) * (w - MARGIN * 2),
			bandTops[n.hop] +
				(anchor ? bandH / 2 : pad / 2 + hash01(n.id, 4) * bandH),
			anchor ? 10 : 3,
			HOP_RGB[n.hop],
			anchor ? 1 : 0.75
		);
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS;
	}
	// annotate each band: real corpus counts (and the weighted calc when asked)
	const calc = params?.calc;
	const notes = story.bacon.buckets.map((total, i) => {
		const hop = i + 1;
		const mid = (bandTops[hop] + bandTops[hop + 1]) / 2;
		const count = total.toLocaleString("en-US");
		return {
			x: w - MARGIN,
			y: mid - 8,
			align: /** @type {const} */ ("right"),
			text: calc
				? `${count} × ${hop} movie${hop > 1 ? "s" : ""}`
				: `${count} actor${total === 1 ? "" : "s"} — ${hop} movie${hop > 1 ? "s" : ""} away`
		};
	});
	if (calc) {
		notes.push({
			x: w / 2,
			y: plotBottom(h) + 14,
			align: "center",
			strong: true,
			text: `÷ ${story.bacon.reachable.toLocaleString("en-US")} actors = ${story.bacon.avgDistance} movies on average`
		});
	}
	return { attrs, delays, notes };
}

// ---------------------------------------------------------------------------
// Rank ladder (fisheye): every sampled actor in one vertical line by rank
// order; a window around the focus actor is magnified with rank callouts.
// ---------------------------------------------------------------------------

const LADDER_GAP = 26;
const LADDER_WIN = 3;

/** @type {LayoutFn} */
function layoutRank(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const focusId = params?.focusId ?? ANCHOR_ID;
	const focusOrder = ORDER_OF.get(focusId) ?? 0;
	// the ladder sits right of centre so the rank callouts fit on its left
	const cx = Math.min(Math.max(w / 2, 205), w - 60);
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	// focus sits mid-plot unless it's near an end of the ranking
	const span = LADDER_WIN * LADDER_GAP;
	const yFocus = Math.max(
		top + Math.min(focusOrder, LADDER_WIN) * LADDER_GAP,
		Math.min((top + bottom) / 2, bottom - span - 8)
	);
	const yFor = (order) => {
		const d = order - focusOrder;
		if (Math.abs(d) <= LADDER_WIN) return yFocus + d * LADDER_GAP;
		if (d < 0) {
			// compress everyone above the window into [top, window top)
			return lin(order, 0, focusOrder - LADDER_WIN, top, yFocus - span - 10);
		}
		return lin(
			order,
			focusOrder + LADDER_WIN,
			BY_RANK.length - 1,
			yFocus + span + 10,
			bottom
		);
	};
	const notes = [];
	for (const n of nodes) {
		const order = ORDER_OF.get(n.id);
		const d = Math.abs(order - focusOrder);
		const isFocus = n.id === focusId;
		const inWin = d <= LADDER_WIN;
		set(
			attrs,
			n.id,
			cx + (inWin ? 0 : (hash01(n.id, 5) - 0.5) * 5),
			yFor(order),
			isFocus ? 7 : inWin ? 3.5 : 1.2,
			isFocus ? (n.id === SLJ ? PURPLE : INK) : inWin ? INK : CROWD,
			isFocus ? 1 : inWin ? 0.85 : 0.3
		);
		if (inWin) {
			notes.push({
				x: cx - 18,
				y: yFor(order) - 7,
				align: /** @type {const} */ ("right"),
				strong: isFocus,
				text: isFocus
					? `#${n.rank} ${n.name} (${n.avgDistance})`
					: `#${n.rank} ${n.name}`
			});
		}
	}
	return { attrs, notes };
}

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per era anchor,
// windowed per step. Dots ride the right-hand end of their line; the era
// timeline annotates handovers.
// ---------------------------------------------------------------------------

function raceLayout(windowYears, tickStep, minEraYears, yCap = Infinity) {
	/** @type {LayoutFn} */
	return function layoutRace(nodes, w, h) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const [year0, year1] = windowYears;
		const clipped = new Map();
		let vMin = Infinity;
		let vMax = -Infinity;
		for (const id of RACE_IDS) {
			const c = clipSeries(story.raceSeries[id], year0, year1);
			if (!c) continue;
			// zoomed steps only follow the contenders — actors who never get
			// near the lead in this window stay hidden
			if (Math.min(...c.map(([, v]) => v)) > yCap) continue;
			clipped.set(id, c);
			for (const [, v] of c) {
				vMin = Math.min(vMin, v);
				vMax = Math.max(vMax, v);
			}
		}
		const top = MARGIN + 10;
		const bottom = plotBottom(h);
		const xS = (yr) => lin(yr, year0, year1, MARGIN + 14, w - MARGIN - 6);
		// lower average distance = better = higher up the chart
		const yS = (v) => lin(v, vMin, vMax, top, bottom);
		const raceSet = new Set(clipped.keys());
		for (const n of nodes) {
			if (!raceSet.has(n.id)) {
				const [x, y] = scatterPosition(n, w, h);
				set(attrs, n.id, x, y, 2, CROWD, 0);
				continue;
			}
			const series = clipped.get(n.id);
			const [xe, ve] = series.at(-1);
			const major = raceRGB(n.id) !== CROWD;
			set(
				attrs,
				n.id,
				xS(xe),
				yS(ve),
				major ? 5 : 3,
				raceRGB(n.id),
				major ? 1 : 0.55
			);
		}
		TRAIL_META.forEach((meta, t) => {
			if (
				meta.id !== null &&
				clipped.has(meta.id) &&
				RACE_SLOT.get(meta.id) === t
			) {
				setTrail(
					trails,
					t,
					clipped.get(meta.id),
					xS,
					yS,
					meta.rgb === CROWD ? 0.35 : 0.8
				);
				trailDelays[t] = 250; // dots land first, lines unspool after
			} else {
				const id = meta.id;
				const [x, y] =
					id !== null && clipped.has(id)
						? [attrs[id * STRIDE], attrs[id * STRIDE + 1]]
						: [w / 2, bottom];
				collapseTrail(trails, t, x, y, 0);
			}
		});
		// era handovers long enough to read at this zoom level; alternate the
		// callout height so neighbouring handovers don't collide (narrow
		// screens get only the longest reigns)
		const notes = [];
		const minEra = minEraYears * (w < 480 ? 2.5 : 1);
		for (const era of story.eras) {
			const start = yearOf(era.start);
			const end = era.end ? yearOf(era.end) : year1;
			if (end - start < minEra || start < year0 || start > year1) continue;
			const node = rawNodes.nodes[era.id];
			const series = clipped.get(era.id);
			if (!series) continue;
			const vAt = valueAt(series, Math.max(start, year0));
			notes.push({
				x: xS(Math.max(start, year0)),
				y: yS(vAt) - (notes.length % 2 === 0 ? 24 : 42),
				align: /** @type {const} */ ("center"),
				text: `${node[1]} · ${Math.round(start)}`
			});
		}
		const ticks = [];
		for (
			let yr = Math.ceil(year0 / tickStep) * tickStep;
			yr <= year1;
			yr += tickStep
		) {
			ticks.push({ pos: xS(yr), label: String(yr) });
		}
		const yTicks = [vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: yS(v),
			label: v.toFixed(2)
		}));
		return {
			attrs,
			trails,
			trailDelays,
			notes,
			axes: { x: ticks, xBase: bottom + 10, y: yTicks }
		};
	};
}

const yearOf = (iso) => {
	const [y, m, d] = iso.split("-").map(Number);
	return y + (m - 1) / 12 + (d - 1) / 365;
};
const valueAt = (series, x) => {
	let j = 1;
	while (j < series.length - 1 && series[j][0] < x) j++;
	const [x0, v0] = series[j - 1];
	const [x1, v1] = series[j];
	return x1 === x0 ? v0 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
};

// ---------------------------------------------------------------------------
// Films scatters: shared log-films x-axis, swappable y metric. Non-participants
// (missing metric) hold their distance-scatter spot at alpha 0 so metric swaps
// read as vertical travel, not churn.
// ---------------------------------------------------------------------------

/**
 * @param {Object} cfg
 * @param {(n: ActorNode) => number|null} cfg.yOf
 * @param {[number, number]} [cfg.yDomain] values beyond it clamp to the edge, faded
 * @param {boolean} [cfg.invert] smaller value = higher up (avg-distance charts)
 * @param {(v: number) => string} [cfg.fmt]
 * @param {Map<number, { rgb: number[], r: number, alpha?: number }>} [cfg.highlights]
 */
function filmsScatter(nodes, w, h, cfg) {
	const attrs = new Float64Array(ATTR_SIZE);
	const values = nodes.map((n) => cfg.yOf(n));
	const [vMin, vMax] = cfg.yDomain ?? [
		Math.min(...values.filter((v) => v != null)),
		Math.max(...values.filter((v) => v != null))
	];
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const yS = cfg.invert
		? (v) => lin(v, vMin, vMax, top, bottom)
		: (v) => lin(v, vMin, vMax, bottom, top);
	for (const n of nodes) {
		const v = values[n.id];
		const [sx] = scatterPosition(n, w, h);
		const hi = cfg.highlights?.get(n.id);
		if (v == null) {
			const [, sy] = scatterPosition(n, w, h);
			set(attrs, n.id, sx, sy, 2, CROWD, 0);
			continue;
		}
		const clamped = v < vMin || v > vMax;
		set(
			attrs,
			n.id,
			sx,
			yS(Math.min(vMax, Math.max(vMin, v))),
			hi?.r ?? 2,
			hi?.rgb ?? CROWD,
			(hi ? (hi.alpha ?? 1) : 0.3) * (clamped ? 0.35 : 1)
		);
	}
	const fmt = cfg.fmt ?? ((v) => v.toFixed(2));
	const axes = {
		x: [3, 10, 30, 100]
			.filter((f) => Math.log(f) >= FILM_LOG_MIN && Math.log(f) <= FILM_LOG_MAX)
			.map((f) => ({
				pos: lin(Math.log(f), FILM_LOG_MIN, FILM_LOG_MAX, MARGIN, w - MARGIN),
				label: String(f)
			})),
		xBase: bottom + 10,
		y: [vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: yS(v),
			label: fmt(v)
		}))
	};
	return { attrs, axes };
}

// clamp the long tail of barely-connected actors (max ~4.4) so the story's
// cast isn't squashed into the top third
const AVG_DOMAIN = /** @type {[number, number]} */ ([
	AVG_MIN,
	Math.min(AVG_MAX, 3.2)
]);
const avgScatter = (nodes, w, h, highlights) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.avgDistance,
		yDomain: AVG_DOMAIN,
		invert: true, // lower average distance = better connected = up
		highlights
	});

/** @type {LayoutFn} */
function layoutScatterCenters(nodes, w, h) {
	const result = avgScatter(
		nodes,
		w,
		h,
		new Map([
			[SLJ, { rgb: PURPLE, r: 6 }],
			[CAGE, { rgb: BLUE, r: 4.5 }],
			[ANCHOR_ID, { rgb: INK, r: 4.5 }]
		])
	);
	result.notes = [
		{
			x: attrX(result.attrs, SLJ) - 12,
			y: attrY(result.attrs, SLJ) + 16,
			align: "right",
			text: `${nodes[SLJ].films} films — 20 more than Nicolas Cage`
		}
	];
	return result;
}

const attrX = (attrs, id) => attrs[id * STRIDE];
const attrY = (attrs, id) => attrs[id * STRIDE + 1];

/** @type {LayoutFn} */
function layoutScatterWalters(nodes, w, h) {
	const result = avgScatter(
		nodes,
		w,
		h,
		new Map([
			[WALTERS, { rgb: RED, r: 6 }],
			[OLDMAN, { rgb: BLUE, r: 4 }],
			[KIDMAN, { rgb: BLUE, r: 4 }],
			[STREEP, { rgb: BLUE, r: 4 }]
		])
	);
	result.notes = [
		{
			x: attrX(result.attrs, WALTERS) + 10,
			y: attrY(result.attrs, WALTERS) - 4,
			text: "same films as far better-connected actors"
		}
	];
	return result;
}

const QUIZ_IDS = story.quiz.flatMap((p) => [p.a, p.b]);

/** @type {LayoutFn} */
function layoutScatterQuiz(nodes, w, h, _edges, params) {
	const highlights = new Map();
	const picks = params?.picks ?? {};
	story.quiz.forEach((pair, i) => {
		if (picks[i] === undefined) return;
		const pickedRight = picks[i] === pair.answer;
		highlights.set(pair.answer === 0 ? pair.a : pair.b, {
			rgb: GREEN,
			r: 5.5
		});
		highlights.set(pair.answer === 0 ? pair.b : pair.a, {
			rgb: pickedRight ? BLUE : RED,
			r: 5.5
		});
	});
	return avgScatter(nodes, w, h, highlights);
}

const PAIR_HIGHLIGHTS = new Map([
	[QUIZ_IDS[0], { rgb: BLUE, r: 5.5 }], // Charlize Theron
	[QUIZ_IDS[1], { rgb: RED, r: 5.5 }], // Seth Rogen
	[QUIZ_IDS[2], { rgb: BLUE, r: 4 }],
	[QUIZ_IDS[3], { rgb: RED, r: 4 }],
	[QUIZ_IDS[4], { rgb: BLUE, r: 4 }],
	[QUIZ_IDS[5], { rgb: RED, r: 4 }]
]);

/** @type {LayoutFn} */
const layoutConcScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.conc,
		highlights: PAIR_HIGHLIGHTS
	});

/** @type {LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// ticks in actual costars, not log units
		fmt: (v) => Math.round(Math.exp(v)).toLocaleString("en-US"),
		highlights: PAIR_HIGHLIGHTS
	});

// ---------------------------------------------------------------------------
// Prediction scatter: predicted (x) vs actual (y); toggles swap the predictor.
// ---------------------------------------------------------------------------

const PRED_FIELDS = {
	film: "predFilm",
	filmConc: "predFilmConc",
	filmDeg: "predFilmDeg",
	all: "predAll"
};

/** @type {LayoutFn} */
function layoutPredScatter(nodes, w, h, _edges, params) {
	const mode = params?.mode ?? "film";
	const field = PRED_FIELDS[mode];
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		if (n.predFilm == null) continue;
		vMin = Math.min(vMin, n.avgDistance, n[field]);
		vMax = Math.max(vMax, n.avgDistance, n[field]);
	}
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const xS = (v) => lin(v, vMin, vMax, MARGIN + 14, w - MARGIN);
	const yS = (v) => lin(v, vMin, vMax, bottom, top);
	for (const n of nodes) {
		if (n.predFilm == null) {
			const [x, y] = scatterPosition(n, w, h);
			set(attrs, n.id, x, y, 2, CROWD, 0);
			continue;
		}
		set(attrs, n.id, xS(n[field]), yS(n.avgDistance), 2.2, BLUE, 0.35);
	}
	TRAIL_META.forEach((_meta, t) => {
		if (t === DIAG_SLOT) {
			setTrail(
				trails,
				t,
				[
					[vMin, vMin],
					[vMax, vMax]
				],
				xS,
				yS,
				0.6
			);
		} else {
			collapseTrail(trails, t, w / 2, bottom, 0);
		}
	});
	const r = story.corr[mode];
	const ticks = (S) =>
		[vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: S(v),
			label: v.toFixed(2)
		}));
	return {
		attrs,
		trails,
		notes: [
			{
				x: MARGIN + 20,
				y: top + 4,
				strong: true,
				text: `correlation: ${Math.round(r * 100)}`
			},
			{
				x: xS(vMax) - 8,
				y: yS(vMax) + 14,
				align: "right",
				text: "perfect prediction"
			}
		],
		axes: { x: ticks(xS), xBase: bottom + 10, y: ticks(yS) }
	};
}

/** @type {LayoutFn} */
function layoutScatterGenZ(nodes, w, h) {
	const highlights = new Map(
		story.genz.candidates.map((c) => [c.id, { rgb: GREEN, r: 3.5, alpha: 0.9 }])
	);
	highlights.set(CGM, { rgb: RED, r: 6 });
	highlights.set(SLJ, { rgb: PURPLE, r: 4.5, alpha: 0.9 });
	const result = avgScatter(nodes, w, h, highlights);
	result.notes = [
		{
			x: attrX(result.attrs, CGM) + 10,
			y: attrY(result.attrs, CGM) - 4,
			text: "lowest average distance of any Gen Z actor"
		}
	];
	return result;
}

// ---------------------------------------------------------------------------
// Career lines (Future chapter): cumulative films by career age.
// ---------------------------------------------------------------------------

function careerLayout(showCohort) {
	/** @type {LayoutFn} */
	return function layoutCareer(nodes, w, h) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const named = [
			["sweeney", SWEENEY, SWEENEY_SLOT],
			["deniro", DENIRO, DENIRO_SLOT],
			["chase", CHASE, CHASE_SLOT]
		];
		let ageMax = 0;
		let filmsMax = 0;
		const consider = [
			...named.map(([k]) => story.careers[k]),
			...(showCohort ? story.careers.cohort : [])
		];
		for (const series of consider) {
			ageMax = Math.max(ageMax, series.at(-1)[0]);
			filmsMax = Math.max(filmsMax, ...series.map((p) => p[1]));
		}
		const top = MARGIN + 8;
		const bottom = plotBottom(h);
		const xS = (a) => lin(a, 0, ageMax, MARGIN + 14, w - MARGIN - 6);
		const yS = (f) => lin(f, 0, filmsMax, bottom, top); // more films = up
		const namedIds = new Set(named.map(([, id]) => id));
		for (const n of nodes) {
			if (!namedIds.has(n.id)) {
				const [x, y] = scatterPosition(n, w, h);
				set(attrs, n.id, x, y, 2, CROWD, 0);
				continue;
			}
			const key = named.find(([, id]) => id === n.id)[0];
			const [age, films] = story.careers[key].at(-1);
			const rgb = key === "sweeney" ? RED : key === "deniro" ? BLUE : YELLOW;
			set(attrs, n.id, xS(age), yS(films), 5.5, rgb, 1);
		}
		TRAIL_META.forEach((_meta, t) => {
			const namedEntry = named.find(([, , slot]) => slot === t);
			if (namedEntry) {
				setTrail(trails, t, story.careers[namedEntry[0]], xS, yS, 0.9);
				trailDelays[t] = 150;
			} else if (
				showCohort &&
				t >= COHORT_SLOT &&
				t < COHORT_SLOT + story.careers.cohort.length
			) {
				setTrail(trails, t, story.careers.cohort[t - COHORT_SLOT], xS, yS, 0.2);
				trailDelays[t] = 300 + (t - COHORT_SLOT) * 25;
			} else {
				collapseTrail(trails, t, MARGIN + 14, bottom, 0);
			}
		});
		const notes = [
			{
				x: xS(15) + 10,
				y: yS(16) - 40,
				strong: true,
				text: "all three: 16 films by career age 15"
			}
		];
		const axes = {
			x: [0, 10, 20, 30, 40, 50]
				.filter((a) => a <= ageMax)
				.map((a) => ({ pos: xS(a), label: String(a) })),
			xBase: bottom + 10,
			y: [0, Math.round(filmsMax / 2), filmsMax].map((f) => ({
				pos: yS(f),
				label: String(f)
			}))
		};
		return { attrs, trails, trailDelays, notes, axes };
	};
}

// ---------------------------------------------------------------------------
// Win bars: dots pile into waffle columns, one per top candidate — each dot
// ≈ 25 of the 10,000 simulations.
// ---------------------------------------------------------------------------

const BAR_CANDIDATES = story.genz.candidates.slice(0, 6);
const SIMS_PER_DOT = 25;

/** @type {LayoutFn} */
function layoutWinBars(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const focusId = params?.focus ?? CGM;
	const candidateIds = new Set(story.genz.candidates.map((c) => c.id));
	// deterministic pool of crowd dots to stack into the bars
	const pool = [...Array(NODE_COUNT).keys()]
		.filter((id) => !candidateIds.has(id))
		.sort((a, b) => hash01(a, 7) - hash01(b, 7));
	// tall mobile cards swallow the bottom third — raise the baseline there
	const bottom = w < 480 ? h * 0.5 : plotBottom(h);
	const slotW = (w - MARGIN * 2) / BAR_CANDIDATES.length;
	const cols = Math.max(3, Math.floor(Math.min(slotW * 0.6, 40) / 7));
	const cell = 7;
	const used = new Set();
	const notes = [];
	let p = 0;
	BAR_CANDIDATES.forEach((c, b) => {
		const cx = MARGIN + slotW * (b + 0.5);
		const dots = Math.round((c.winPct * story.genz.nSims) / SIMS_PER_DOT);
		const focused = c.id === focusId;
		for (let k = 0; k < dots; k++) {
			const id = pool[p++];
			used.add(id);
			const col = k % cols;
			const row = Math.floor(k / cols);
			set(
				attrs,
				id,
				cx + (col - (cols - 1) / 2) * cell,
				bottom - 14 - row * cell,
				2.6,
				focused ? (c.id === CGM ? RED : GREEN) : CROWD,
				focused ? 0.95 : 0.55
			);
			delays[id] = row * 22; // bars fill from the bottom up
		}
		// the candidate's own dot caps their bar
		const capRows = Math.ceil(dots / cols);
		set(
			attrs,
			c.id,
			cx,
			bottom - 14 - capRows * cell - 10,
			focused ? 6 : 4,
			c.id === CGM ? RED : GREEN,
			focused ? 1 : 0.8
		);
		notes.push({
			x: cx,
			y: bottom + (b % 2 === 0 ? 2 : 16), // stagger to avoid collisions
			align: /** @type {const} */ ("center"),
			strong: focused,
			text: `${shortName(rawNodes.nodes[c.id][1])} ${(c.winPct * 100).toFixed(0)}%`
		});
	});
	const focus = story.genz.candidates.find((c) => c.id === focusId);
	if (focus) {
		notes.push({
			x: w / 2,
			y: MARGIN,
			align: "center",
			wrap: true,
			text:
				`${rawNodes.nodes[focus.id][1]}: ${focus.films} films at career age ${focus.careerAge}, ` +
				`concurrence ${focus.conc}, avg distance ${focus.mad}`
		});
	}
	for (const n of nodes) {
		if (used.has(n.id) || candidateIds.has(n.id)) continue;
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	return { attrs, delays, notes };
}

const shortName = (name) => {
	const parts = name.split(" ");
	return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : name;
};

// ---------------------------------------------------------------------------
// SLJ trajectory + simulation outcomes (Future chapter close).
// ---------------------------------------------------------------------------

/** @type {LayoutFn} */
function layoutSljFan(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	const HORIZON = 40;
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const [, v] of story.slj) {
		vMin = Math.min(vMin, v);
		vMax = Math.max(vMax, v);
	}
	for (const c of story.genz.candidates) {
		vMin = Math.min(vMin, c.projP10);
		vMax = Math.max(vMax, c.projP90);
	}
	const ageMax = Math.max(HORIZON, story.slj.at(-1)[0]);
	const top = MARGIN + 10;
	const bottom = plotBottom(h);
	const xS = (a) => lin(a, 0, ageMax, MARGIN + 14, w - MARGIN - 6);
	const yS = (v) => lin(v, vMin, vMax, top, bottom); // lower distance = up
	const candidateIds = new Set(story.genz.candidates.map((c) => c.id));
	for (const n of nodes) {
		if (n.id === SLJ) {
			const [age, v] = story.slj.at(-1);
			set(attrs, n.id, xS(age), yS(v), 6, PURPLE, 1);
			continue;
		}
		if (candidateIds.has(n.id)) {
			const c = story.genz.candidates.find((c) => c.id === n.id);
			set(
				attrs,
				n.id,
				xS(HORIZON) + (hash01(n.id, 8) - 0.5) * 28,
				yS(c.projMedian),
				n.id === CGM ? 5.5 : 3,
				n.id === CGM ? RED : GREEN,
				n.id === CGM ? 1 : 0.7
			);
			continue;
		}
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	TRAIL_META.forEach((meta, t) => {
		if (meta.id === SLJ && RACE_SLOT.get(SLJ) === t) {
			setTrail(trails, t, story.slj, xS, yS, 0.85);
		} else {
			collapseTrail(trails, t, xS(0), yS(vMax), 0);
		}
	});
	const notes = [
		{
			x: xS(story.slj.at(-1)[0]) - 10,
			y: yS(story.slj.at(-1)[1]) + 12,
			align: /** @type {const} */ ("right"),
			text: `SLJ today: ${story.slj.at(-1)[1]}`
		},
		{
			x: xS(HORIZON) - 24,
			y: yS(story.genz.avgWinningMad),
			align: /** @type {const} */ ("right"),
			strong: true,
			text: `typical winning score ≈ ${story.genz.avgWinningMad}`
		}
	];
	return {
		attrs,
		trails,
		notes,
		axes: {
			x: [0, 10, 20, 30, 40].map((a) => ({ pos: xS(a), label: String(a) })),
			xBase: bottom + 10,
			y: [vMin, vMax].map((v) => ({ pos: yS(v), label: v.toFixed(2) }))
		}
	};
}

// ---------------------------------------------------------------------------

export const STATES = {
	lone: layoutLone,
	networkIntro: layoutNetworkIntro,
	network: layoutNetwork,
	hopBands: (n, w, h, e) => layoutHopBands(n, w, h, e, {}),
	hopCalc: (n, w, h, e) => layoutHopBands(n, w, h, e, { calc: true }),
	rankFocus: layoutRank,
	rankReveal: (n, w, h, e) => layoutRank(n, w, h, e, { focusId: SLJ }),
	raceRecent: raceLayout([2004, 2026.2], 5, 3, 2.3),
	raceTrades: raceLayout([1998.5, 2007], 2, 0.4, 2.25),
	raceFull: raceLayout([1970, 2026.2], 10, 4),
	scatterCenters: layoutScatterCenters,
	scatterWalters: layoutScatterWalters,
	scatterQuiz: layoutScatterQuiz,
	concurrenceScatter: layoutConcScatter,
	degScatter: layoutDegScatter,
	predictionScatter: layoutPredScatter,
	scatterGenZ: layoutScatterGenZ,
	careerTrio: careerLayout(false),
	careerMany: careerLayout(true),
	winBars: layoutWinBars,
	sljFan: layoutSljFan
};

/** @typedef {keyof typeof STATES} LayoutState */

/**
 * per-state node ids whose names render as HTML labels over the canvas;
 * a function value derives the ids from the current layout params
 * @type {Partial<Record<LayoutState, number[] | ((params?: Object) => number[])>>}
 */
export const STATE_LABELS = {
	lone: [ANCHOR_ID],
	networkIntro: INTRO_IDS,
	// network: none — the zoom-out drops labels and edges (feedback 2026-07-05)
	hopBands: [ANCHOR_ID],
	hopCalc: [ANCHOR_ID],
	// rank states carry names in their #rank notes instead of dot labels
	raceRecent: [SLJ],
	raceTrades: [SLJ, HACKMAN, DENIRO, WELKER],
	raceFull: [HACKMAN],
	scatterCenters: [SLJ, CAGE, ANCHOR_ID],
	scatterWalters: [WALTERS, OLDMAN, KIDMAN, STREEP],
	scatterQuiz: (params) => {
		const picks = params?.picks ?? {};
		return story.quiz.flatMap((pair, i) =>
			picks[i] === undefined ? [] : [pair.a, pair.b]
		);
	},
	concurrenceScatter: [QUIZ_IDS[0], QUIZ_IDS[1]],
	degScatter: [QUIZ_IDS[0], QUIZ_IDS[1], QUIZ_IDS[2], QUIZ_IDS[4]],
	scatterGenZ: [CGM, SLJ],
	careerTrio: [SWEENEY, DENIRO, CHASE],
	careerMany: [SWEENEY, DENIRO, CHASE],
	sljFan: [CGM]
};

/** every id a dynamic STATE_LABELS function could return (for frame tracking) */
export const STATE_TRACKED = [
	SLJ,
	HANKS,
	STREEP,
	DENIRO,
	...QUIZ_IDS,
	...story.genz.candidates.map((c) => c.id)
];

/**
 * Per-state selector plucking the interaction fields a layout consumes from
 * the shared `story` state (see story.svelte.js) merged with the step's
 * static params. Only list states that react to interactions — reading a
 * field here is what subscribes the visual to it.
 * @type {Partial<Record<LayoutState, (story: Object, stepParams?: Object) => Object>>}
 */
export const STATE_PARAMS = {
	rankFocus: (s) => ({ focusId: s.rankGuess ?? ANCHOR_ID }),
	scatterQuiz: (s) => ({ picks: { ...s.quizPicks } }),
	predictionScatter: (s) => ({
		mode:
			s.predictConcurrence && s.predictDegree
				? "all"
				: s.predictConcurrence
					? "filmConc"
					: s.predictDegree
						? "filmDeg"
						: "film"
	}),
	winBars: (s) => ({ focus: s.winFocus ?? CGM })
};

/** ids the interactive step-card components need (see story.svelte.js) */
export const INTERACTIVE_IDS = {
	guessOptions: [SLJ, HANKS, STREEP, DENIRO],
	quiz: story.quiz,
	barCandidates: BAR_CANDIDATES.map((c) => c.id)
};

/** name/rank lookups for the interactive step-card components */
export const nodeName = (id) => rawNodes.nodes[id][1];
export const nodeRank = (id) => rawNodes.nodes[id][5];
export const nodeAvgDistance = (id) => rawNodes.nodes[id][4];

/** per-state "center actor" node id — gets the ripple pulse */
export const STATE_PULSE = {
	lone: ANCHOR_ID,
	networkIntro: ANCHOR_ID,
	network: ANCHOR_ID,
	rankReveal: SLJ,
	scatterCenters: SLJ,
	scatterGenZ: CGM,
	winBars: CGM,
	sljFan: SLJ
};

export const OVERLAYS = {
	lone: { caption: "Kevin Bacon" },
	networkIntro: { caption: "Bacon's costar network" },
	network: { caption: "Bacon's costar network" },
	hopBands: { caption: "Actors by degrees of separation from Bacon" },
	hopCalc: { caption: "Kevin Bacon's average distance" },
	rankFocus: { caption: "All actors, ranked by average distance" },
	rankReveal: { caption: "All actors, ranked by average distance" },
	raceRecent: {
		caption: "Center of Hollywood over time",
		xLabel: "Year",
		yLabel: "Avg distance"
	},
	raceTrades: {
		caption: "Center of Hollywood over time",
		xLabel: "Year",
		yLabel: "Avg distance"
	},
	raceFull: {
		caption: "Center of Hollywood, 1970–2026",
		xLabel: "Year",
		yLabel: "Avg distance"
	},
	scatterCenters: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	},
	scatterWalters: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	},
	scatterQuiz: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	},
	concurrenceScatter: {
		caption: "Concurrence vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Concurrence"
	},
	degScatter: {
		caption: "Top-50 costar degree vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Costar degree (log)"
	},
	predictionScatter: {
		caption: "Predicted vs. actual average distance",
		xLabel: "Predicted",
		yLabel: "Actual"
	},
	scatterGenZ: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	},
	careerTrio: {
		caption: "Films by career age",
		xLabel: "Career age (years)",
		yLabel: "Films"
	},
	careerMany: {
		caption: "Films by career age",
		xLabel: "Career age (years)",
		yLabel: "Films"
	},
	winBars: { caption: "Simulation wins out of 10,000 runs" },
	sljFan: {
		caption: "Can anyone catch Samuel L. Jackson?",
		xLabel: "Career age (years)",
		yLabel: "Avg distance"
	}
};

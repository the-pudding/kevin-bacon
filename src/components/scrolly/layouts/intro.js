import {
	NODE_COUNT,
	ANCHOR_ID,
	INTRO_IDS,
	INTRO_LAYOUT,
	hash01
} from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	MARGIN,
	HOP_RGB,
	set,
	setEdge,
	pairKey,
	parkHidden,
	networkPosition,
	graphCenter,
	INTRO_MAX_STRETCH,
	NETWORK_RADIUS,
	NETWORK_ALPHA,
	NETWORK_HOP_DELAY_MS
} from "../layout-shared.js";

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
	const [cx, cy] = graphCenter(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const ox = cx - ax * sx;
	const oy = cy - ay * sy;
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

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutLone(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	for (const n of nodes) {
		if (n.id === ANCHOR_ID) {
			const [cx, cy] = graphCenter(w, h);
			set(attrs, n.id, cx, cy, 18, HOP_RGB[0], 1);
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

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutNetworkIntro(nodes, w, h, edges) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const introSet = new Set(INTRO_IDS);

	// index edges by unordered endpoint pair so paths can look them up by name
	const edgeByPair = new Map();
	edges.forEach(({ source, target }, e) => {
		edgeByPair.set(pairKey(source, target), e);
	});

	// Walk each path outward from Bacon to its source actor: a line grows from the
	// (already-visible) inner node toward the next one while that node pops in step
	// with it, so both finish together as the line arrives. The first INTRO_SEQ_COUNT
	// paths run on one running clock — strictly one at a time — so the opening reads
	// as a single continuous walk out of Bacon; the rest start after those complete
	// and overlap on a stagger. Everything animates once, at first mention; Bacon is
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

// zoom-out staging: labels and edges dissolve on arrival, the intro cluster
// holds that beat then contracts to its full-graph spot, and the crowd starts
// arriving while the cluster is still shrinking
const NETWORK_ZOOM_DELAY_MS = 200;
const NETWORK_CROWD_START_MS = 350;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutNetwork(nodes, w, h, edges) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const introSet = new Set(INTRO_IDS);
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
		delays[n.id] = introSet.has(n.id)
			? NETWORK_ZOOM_DELAY_MS
			: NETWORK_CROWD_START_MS +
				n.hop * NETWORK_HOP_DELAY_MS +
				hash01(n.id, 6) * 350;
	}
	// intro edges dissolve in place (full length, alpha → 0, delay 0) instead
	// of retracting — the graph fades to dots as the zoom-out begins
	edges.forEach((_, e) => setEdge(attrs, e, 1, 0));
	return { attrs, delays };
}

export const states = {
	lone: {
		layout: layoutLone,
		labels: [ANCHOR_ID],
		pulse: ANCHOR_ID,
		overlay: { caption: "Kevin Bacon" }
	},
	networkIntro: {
		layout: layoutNetworkIntro,
		labels: INTRO_IDS,
		pulse: ANCHOR_ID,
		overlay: { caption: "Bacon's costar network" }
	},
	// network: no labels — the zoom-out drops labels and edges (feedback 2026-07-05)
	network: {
		layout: layoutNetwork,
		pulse: ANCHOR_ID,
		overlay: { caption: "Bacon's costar network" }
	}
};

import { NODE_COUNT, ANCHOR_ID, INTRO_IDS, INTRO_LAYOUT } from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	HOP_RGB,
	CROWD,
	set,
	setEdge,
	pairKey,
	parkHidden,
	networkPosition,
	graphCenter,
	introFrame,
	networkCrowdDelay,
	NETWORK_ZOOM_DELAY_MS,
	NETWORK_INTRO_RADIUS,
	NETWORK_RADIUS,
	NETWORK_ALPHA
} from "../layout-shared.js";

/**
 * Position of intro node k inside the intro fit (see introFrame in
 * layout-shared.js), optionally exaggerated radially away from the anchor
 * (`spread` > 1 pushes nodes outward for "appear far away" starts).
 */
function introPosition(k, w, h, spread = 1) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx * spread, cy + (y - ay) * sy * spread];
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
			set(attrs, n.id, cx, cy, INTRO_ANCHOR_RADIUS, HOP_RGB[0], 1);
		} else if (introSet.has(n.id)) {
			// parked at their eventual networkIntro spot (alpha 0) so they fade in place
			const [x, y] = introPosition(n.id, w, h);
			set(attrs, n.id, x, y, INTRO_RADIUS, CROWD, 0);
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
				NETWORK_INTRO_RADIUS[n.hop],
				n.id === ANCHOR_ID ? HOP_RGB[0] : CROWD,
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

// growth-then-zoom staging: labels and edges dissolve on arrival while the
// inner crowd immediately starts popping in among the still-full-size cluster
// — each dot parked where the network is drawn at the moment it starts fading
// (see parkHidden in layout-shared.js) — and only once that crowding is
// visible does the whole system contract to the full-graph fit, so the
// zoom-out reads as a reaction to the growth needing more space
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
			n.id === ANCHOR_ID ? HOP_RGB[0] : CROWD,
			NETWORK_ALPHA[n.hop]
		);
		// more and more actors: the crowd accumulates inner-first on the shared
		// distance ramp; the cluster holds its beat before contracting
		delays[n.id] = introSet.has(n.id)
			? NETWORK_ZOOM_DELAY_MS
			: networkCrowdDelay(n);
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
		pulse: ANCHOR_ID
	},
	networkIntro: {
		layout: layoutNetworkIntro,
		labels: INTRO_IDS,
		pulse: ANCHOR_ID,
		// the path-walk reveal is authored for the forward arrival from `lone`;
		// scrolling back from `network` just tweens the actors into place
		revealFrom: ["lone"]
	},
	// network: no labels — the zoom-out drops labels and edges (feedback 2026-07-05)
	network: {
		layout: layoutNetwork,
		pulse: ANCHOR_ID,
		// the growth-then-zoom reveal is authored for the forward arrival from
		// `networkIntro`; from `hopBands` backwards the crowd is already visible,
		// so the holds would read as lag — just tween back in unison
		revealFrom: ["networkIntro"]
	}
};

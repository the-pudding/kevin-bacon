import {
	NODE_COUNT,
	EDGE_COUNT,
	ANCHOR_ID,
	INTRO_IDS,
	INTRO_LAYOUT,
	hash01
} from "./nodes.js";

// x, y, radius, red, green, blue, alpha — one group per node, then one
// (mostly empty) group per edge so the tweener staggers edges individually:
// edge slot 0 = draw progress (0–1, drawn from the lower-hop endpoint),
// edge slot 1 = alpha
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
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + STRIDE per edge
 * @property {Float64Array} [delays] DELAY_SIZE per-node/per-edge start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
 * @param {Edge[]} edges
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

const MARGIN = 32;

const lin = (v, d0, d1, r0, r1) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

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

const NETWORK_ALPHA = [1, 0.9, 0.45, 0.2, 0.12];
const NETWORK_RADIUS = [16, 6, 3.5, 2.5, 2];
const NETWORK_HOP_DELAY_MS = 250;

/** radial full-graph position — shared so other states can pre-park the crowd */
function networkPosition(n, w, h) {
	const maxR = Math.min(w, h) / 2 - MARGIN;
	const angle = hash01(n.id, 1) * Math.PI * 2;
	const radius = maxR * (n.hop / 4) * (0.78 + 0.22 * hash01(n.id, 2));
	return [w / 2 + Math.cos(angle) * radius, h / 2 + Math.sin(angle) * radius];
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
const INTRO_NODE_STAGGER_MS = 150;
// a node grows for this long before its connecting line starts drawing
const INTRO_EDGE_LAG_MS = 400;

/** @type {LayoutFn} */
function layoutLone(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	for (const n of nodes) {
		if (n.id === ANCHOR_ID) {
			set(attrs, n.id, w / 2, h / 2, 18, HOP_RGB[0], 1);
		} else if (introSet.has(n.id)) {
			// parked far out along their eventual inbound path (alpha 0)
			const [x, y] = introPosition(n.id, w, h, 1.6);
			set(attrs, n.id, x, y, INTRO_RADIUS, HOP_RGB[n.hop], 0);
		} else {
			// parked at their full-graph spot so a fast 1→3 flick doesn't teleport
			const [x, y] = networkPosition(n, w, h);
			set(attrs, n.id, x, y, NETWORK_RADIUS[n.hop], HOP_RGB[n.hop], 0);
		}
	}
	return { attrs };
}

/** @type {LayoutFn} */
function layoutNetworkIntro(nodes, w, h, edges) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const introSet = new Set(INTRO_IDS);
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
			// INTRO_IDS is reveal order and id order: hubs pop before outer actors
			delays[n.id] = n.id * INTRO_NODE_STAGGER_MS;
		} else {
			const [x, y] = networkPosition(n, w, h);
			set(attrs, n.id, x, y, NETWORK_RADIUS[n.hop], HOP_RGB[n.hop], 0);
		}
	}
	edges.forEach(({ source, target }, e) => {
		setEdge(attrs, e, 1, INTRO_EDGE_ALPHA);
		delays[NODE_COUNT + e] =
			Math.max(delays[source], delays[target]) + INTRO_EDGE_LAG_MS;
	});
	return { attrs, delays };
}

/** @type {LayoutFn} */
function layoutNetwork(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	for (const n of nodes) {
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
		// ripple outward: each hop starts after the previous one
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS;
	}
	// intro edges (progress/alpha 0, delay 0) retract as the crowd fades up
	return { attrs, delays };
}

/** @type {LayoutFn} */
function layoutHopBands(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) counts[n.hop]++;
	const innerH = h - MARGIN * 2;
	const bandTops = [];
	let y = MARGIN;
	for (const count of counts) {
		bandTops.push(y);
		y += Math.max(0.05, count / nodes.length) * innerH;
	}
	for (const n of nodes) {
		const bandH = (bandTops[n.hop + 1] ?? h - MARGIN) - bandTops[n.hop];
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			anchor ? w / 2 : MARGIN + hash01(n.id, 3) * (w - MARGIN * 2),
			bandTops[n.hop] + (anchor ? bandH / 2 : hash01(n.id, 4) * bandH),
			anchor ? 10 : 3,
			HOP_RGB[n.hop],
			anchor ? 1 : 0.8
		);
	}
	return { attrs };
}

/** @type {LayoutFn} */
function layoutRankLine(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const cx = w / 2;
	// ranks are corpus-global (sparse in the sample) — plot by sampled order
	const byRank = [...nodes].sort((a, b) => a.rank - b.rank);
	const orderOf = new Map(byRank.map((n, i) => [n.id, i]));
	const anchorOrder = orderOf.get(ANCHOR_ID);
	for (const n of nodes) {
		const order = orderOf.get(n.id);
		const near = Math.abs(order - anchorOrder) <= 20;
		const anchor = n.id === ANCHOR_ID;
		set(
			attrs,
			n.id,
			cx + (near ? 0 : (hash01(n.id, 5) - 0.5) * 6),
			lin(order, 0, nodes.length - 1, MARGIN, h - MARGIN),
			anchor ? 8 : near ? 3 : 1.5,
			HOP_RGB[n.hop],
			anchor ? 1 : near ? 0.9 : 0.15
		);
	}
	return { attrs };
}

/** @type {LayoutFn} */
function layoutScatter(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	let maxFilms = 1;
	let minD = Infinity;
	let maxD = -Infinity;
	for (const n of nodes) {
		maxFilms = Math.max(maxFilms, n.films);
		minD = Math.min(minD, n.avgDistance);
		maxD = Math.max(maxD, n.avgDistance);
	}
	for (const n of nodes) {
		const anchor = n.id === ANCHOR_ID;
		set(
			attrs,
			n.id,
			lin(Math.log(n.films), 0, Math.log(maxFilms), MARGIN, w - MARGIN),
			lin(n.avgDistance, minD, maxD, MARGIN, h - MARGIN),
			anchor ? 8 : 3,
			HOP_RGB[n.hop],
			anchor ? 1 : 0.55
		);
	}
	return { attrs };
}

export const STATES = {
	lone: layoutLone,
	networkIntro: layoutNetworkIntro,
	network: layoutNetwork,
	hopBands: layoutHopBands,
	rankLine: layoutRankLine,
	scatter: layoutScatter
};

/** @typedef {keyof typeof STATES} LayoutState */

/** per-state node ids whose names render as HTML labels over the canvas */
export const STATE_LABELS = {
	networkIntro: INTRO_IDS
};

/** per-state "center actor" node id — gets the breathing pulse ring */
export const STATE_PULSE = {
	lone: ANCHOR_ID,
	networkIntro: ANCHOR_ID,
	network: ANCHOR_ID
};

export const OVERLAYS = {
	lone: { caption: "Kevin Bacon" },
	networkIntro: { caption: "Bacon's costar network" },
	network: { caption: "Bacon's costar network" },
	hopBands: { caption: "Actors by degrees of separation" },
	rankLine: { caption: "Ranked by average distance" },
	scatter: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	}
};

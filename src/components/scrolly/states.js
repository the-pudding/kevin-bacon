import { NODE_COUNT, hash01 } from "./nodes.js";

// x, y, radius, red, green, blue, alpha
export const STRIDE = 7;
export const EDGE_ALPHA_INDEX = NODE_COUNT * STRIDE;
export const ATTR_SIZE = EDGE_ALPHA_INDEX + 1;
// one delay slot per node, plus one for the edge-alpha group
export const DELAY_SIZE = NODE_COUNT + 1;
export const EDGE_DELAY_INDEX = NODE_COUNT;

/**
 * @typedef {import("./nodes.js").ActorNode} ActorNode
 *
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + edge alpha
 * @property {Float64Array} [delays] DELAY_SIZE per-node start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
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

/** @type {LayoutFn} */
function layoutLone(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const cx = w / 2;
	const cy = h / 2;
	for (const n of nodes) {
		const anchor = n.hop === 0;
		set(attrs, n.id, cx, cy, anchor ? 18 : 2, HOP_RGB[n.hop], anchor ? 1 : 0);
	}
	return { attrs };
}

const NETWORK_ALPHA = [1, 0.9, 0.45, 0.2, 0.12];
const NETWORK_RADIUS = [16, 6, 3.5, 2.5, 2];
const NETWORK_HOP_DELAY_MS = 250;

/** @type {LayoutFn} */
function layoutNetwork(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const cx = w / 2;
	const cy = h / 2;
	const maxR = Math.min(w, h) / 2 - MARGIN;
	for (const n of nodes) {
		const angle = hash01(n.id, 1) * Math.PI * 2;
		const radius = maxR * (n.hop / 4) * (0.78 + 0.22 * hash01(n.id, 2));
		set(
			attrs,
			n.id,
			cx + Math.cos(angle) * radius,
			cy + Math.sin(angle) * radius,
			NETWORK_RADIUS[n.hop],
			HOP_RGB[n.hop],
			NETWORK_ALPHA[n.hop]
		);
		// ripple outward: each hop starts after the previous one
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS;
	}
	attrs[EDGE_ALPHA_INDEX] = 0.2;
	delays[EDGE_DELAY_INDEX] = NETWORK_HOP_DELAY_MS;
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
	const anchorRank = nodes[0].rank;
	for (const n of nodes) {
		const near = Math.abs(n.rank - anchorRank) <= 20;
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			cx + (near ? 0 : (hash01(n.id, 5) - 0.5) * 6),
			lin(n.rank, 0, nodes.length - 1, MARGIN, h - MARGIN),
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
		const anchor = n.hop === 0;
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

/** @type {Record<string, LayoutFn>} */
export const STATES = {
	lone: layoutLone,
	network: layoutNetwork,
	hopBands: layoutHopBands,
	rankLine: layoutRankLine,
	scatter: layoutScatter
};

const STEP_TO_STATE = [
	"lone",
	"network",
	"network",
	"hopBands",
	"hopBands",
	"rankLine",
	"rankLine",
	"rankLine",
	"rankLine",
	"rankLine"
];

/** @param {number} step @returns {string} */
export const stateForStep = (step) => STEP_TO_STATE[step] ?? "scatter";

export const OVERLAYS = {
	lone: { caption: "Kevin Bacon" },
	network: { caption: "Bacon's costar network" },
	hopBands: { caption: "Actors by degrees of separation" },
	rankLine: { caption: "Ranked by average distance" },
	scatter: {
		caption: "Average distance vs. films",
		xLabel: "Films (log scale)",
		yLabel: "Avg distance"
	}
};

import {
	NODE_COUNT,
	EDGE_COUNT,
	ANCHOR_ID,
	INTRO_LAYOUT,
	NETWORK_LAYOUT,
	hash01
} from "./nodes.js";
import { easeCubicInOut } from "./tween.js";
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
export const HOP_RGB = [
	[34, 34, 34], // hop 0 — --color-gray-900
	[238, 102, 119], // hop 1 — --category-red
	[68, 119, 170], // hop 2 — --category-blue
	[102, 204, 238], // hop 3 — --category-cyan
	[187, 187, 187] // hop 4 — --category-gray
];
export const INK = [34, 34, 34]; // --color-gray-900
export const CROWD = [187, 187, 187]; // --category-gray
export const RED = [238, 102, 119]; // --category-red
export const BLUE = [68, 119, 170]; // --category-blue
export const GREEN = [34, 136, 51]; // --category-green
export const YELLOW = [204, 187, 68]; // --category-yellow
export const PURPLE = [170, 51, 119]; // --category-purple

export const MARGIN = 32;
// charts live in the top ~2/3 of the canvas — the step card owns the bottom,
// and the x-axis ticks need to clear it too
export const plotBottom = (h) => h * 0.66;

export const lin = (v, d0, d1, r0, r1) =>
	r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

// unordered endpoint key so an edge can be looked up regardless of orientation
export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function set(attrs, id, x, y, r, [red, green, blue], alpha) {
	const i = id * STRIDE;
	attrs[i] = x;
	attrs[i + 1] = y;
	attrs[i + 2] = r;
	attrs[i + 3] = red;
	attrs[i + 4] = green;
	attrs[i + 5] = blue;
	attrs[i + 6] = alpha;
}

export function setEdge(attrs, e, progress, alpha) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
}

// ---------------------------------------------------------------------------
// Named actors / corpus-wide lookups shared across chapters
// ---------------------------------------------------------------------------

const ID_BY_PID = new Map(rawNodes.nodes.map((n, id) => [n[0], id]));
export const idOf = (pid) => {
	const id = ID_BY_PID.get(pid);
	if (id === undefined) throw new Error(`scrolly states: unknown pid ${pid}`);
	return id;
};

export const SLJ = idOf(2231);
export const HANKS = idOf(31);
export const STREEP = idOf(5064);
export const DENIRO = idOf(380);
export const HACKMAN = idOf(193);
export const WELKER = idOf(15831);
export const CAGE = idOf(2963);
export const WALTERS = idOf(477);
export const OLDMAN = idOf(64);
export const KIDMAN = idOf(2227);
export const CGM = story.genz.candidates[0].id;
export const SWEENEY = idOf(115440);
export const CHASE = idOf(54812);

// ranked order over the sample (ranks are corpus-global and sparse — plot by
// sampled order, never raw rank; see notes/scrolly-framework.md)
export const BY_RANK = rawNodes.nodes
	.map((n, id) => ({ id, rank: n[5] }))
	.sort((a, b) => a.rank - b.rank);
export const ORDER_OF = new Map(BY_RANK.map((n, i) => [n.id, i]));

// fixed film-count x-scale shared by every films-scatter variant so dots only
// travel vertically when the y-metric changes
const FILM_LOGS = rawNodes.nodes.map((n) => Math.log(Math.max(1, n[3])));
export const FILM_LOG_MIN = Math.min(...FILM_LOGS);
export const FILM_LOG_MAX = Math.max(...FILM_LOGS);
export const AVG_MIN = Math.min(...rawNodes.nodes.map((n) => n[4]));
export const AVG_MAX = Math.max(...rawNodes.nodes.map((n) => n[4]));

/** distance-vs-films position — also the park spot for hidden latecomers */
export function scatterPosition(n, w, h) {
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
export const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);
export const raceRGB = (id) =>
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
export const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));
export const SWEENEY_SLOT = RACE_IDS.length;
export const DENIRO_SLOT = RACE_IDS.length + 1;
export const CHASE_SLOT = RACE_IDS.length + 2;
export const COHORT_SLOT = RACE_IDS.length + 3;
export const DIAG_SLOT = TRAIL_META.length - 1;

/** writes a polyline (data pairs → px via scales) into trail slot t */
export function setTrail(trails, t, pairs, xScale, yScale, alpha) {
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
export function collapseTrail(trails, t, x, y, alpha = 0) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends */
export function clipSeries(pairs, x0, x1) {
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

export const NETWORK_RADIUS = [3, 1, 1, 1, 1];
export const NETWORK_ALPHA = [1, 0.9, 0.45, 0.2, 0.12];
export const NETWORK_INTRO_RADIUS = [16, 6, 6, 6, 6];
export const NETWORK_HOP_DELAY_MS = 250;

// anisotropy cap when fitting the landscape intro layout to portrait screens —
// planarity survives axis scaling, and without it 320px viewports squash the
// graph to ~200px tall with the name labels colliding
export const INTRO_MAX_STRETCH = 1.6;

/**
 * The intro fit: scales the baked 860×680 intro layout into the top ~72% of
 * the canvas (per-axis, each capped at INTRO_MAX_STRETCH beyond uniform) and
 * returns the anchor's fitted screen position plus the axis scales — the one
 * frame the intro-chapter layouts hang off, directly (lone/networkIntro) or
 * as the zoom-out's starting scale (network's entry parks).
 */
export function introFrame(w, h) {
	const availW = w - MARGIN * 2;
	const availH = h * 0.72 - MARGIN;
	const sxRaw = availW / INTRO_LAYOUT.w;
	const syRaw = availH / INTRO_LAYOUT.h;
	const sx = Math.min(sxRaw, syRaw * INTRO_MAX_STRETCH);
	const sy = Math.min(syRaw, sxRaw * INTRO_MAX_STRETCH);
	const ox = (w - INTRO_LAYOUT.w * sx) / 2;
	const oy = MARGIN + (availH - INTRO_LAYOUT.h * sy) / 2;
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	return { cx: ox + ax * sx, cy: oy + ay * sy, sx, sy };
}

/**
 * Screen position of the anchor node (Bacon) in the intro fit — the single
 * "center of the network" every hop-based layout (lone/networkIntro/network)
 * anchors on, so Bacon doesn't jump between those states.
 */
export function graphCenter(w, h) {
	const { cx, cy } = introFrame(w, h);
	return [cx, cy];
}

// the baked full-network layout's furthest node from Bacon, in layout units —
// the fit below maps this onto the canvas' inscribed radius
const NETWORK_MAX_DIST = (() => {
	const [ax, ay] = NETWORK_LAYOUT.xy[ANCHOR_ID];
	let max = 0;
	for (const p of NETWORK_LAYOUT.xy) {
		if (p) max = Math.max(max, Math.hypot(p[0] - ax, p[1] - ay));
	}
	return max;
})();

// distance from Bacon in baked layout units, normalized by the furthest node —
// the crowd's reveal ramp and entry parks both key off it (hop >= 0 ids only;
// the rest have no baked network spot)
function networkDistNorm(id) {
	const [ax, ay] = NETWORK_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = NETWORK_LAYOUT.xy[id];
	return Math.hypot(x - ax, y - ay) / NETWORK_MAX_DIST;
}

// how far left of dead-center Bacon sits once the full crowd is on screen, as
// a fraction of the fitted radius — `lone`/`networkIntro` still put him on
// graphCenter (see above), so this offset only takes effect as `network`
// pans away from it, landing the reveal off to a side instead of dead center
// (a Bacon-centered frame reads as "he IS the center", which is the opposite
// of this chapter's point)
const NETWORK_BACON_OFFSET = 0.22;

/**
 * Full-graph position from the baked force-directed layout (NETWORK_LAYOUT),
 * panned so Bacon lands off-center (see NETWORK_BACON_OFFSET) — shared so
 * other states can pre-park the crowd. The intro actors are pinned inside the
 * bake, so their network spots are their intro geometry at the smaller
 * full-graph scale: arriving from `networkIntro` contracts the cluster in
 * place while panning off graphCenter, reading as a zoom-out that drifts.
 * `spread` > 1 inflates radially from Bacon (the entry gradient's residual
 * settle drift below uses it).
 */
export function networkPosition(n, w, h, spread = 1) {
	const [gx, gy] = graphCenter(w, h);
	const r = Math.min(w, h) / 2 - MARGIN;
	const s = (r * (1 - NETWORK_BACON_OFFSET)) / NETWORK_MAX_DIST;
	const cx = gx - r * NETWORK_BACON_OFFSET;
	const [ax, ay] = NETWORK_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = NETWORK_LAYOUT.xy[n.id];
	return [cx + (x - ax) * s * spread, gy + (y - ay) * s * spread];
}

// networkIntro → network choreography: the crowd arrives on a
// distance-from-Bacon ramp (inner neighbours first, fringe last) while the
// intro cluster holds full-size for NETWORK_ZOOM_DELAY_MS — the zoom-out
// starts only once the inner crowd is visibly filling in, so the pull-back
// reads as a reaction to the growth rather than a precondition for it
export const NETWORK_ZOOM_DELAY_MS = 450;
const NETWORK_ZOOM_MS = 700; // mirrors ScrollyVisual's TWEEN_MS (the contraction tween)
const NETWORK_CROWD_START_MS = 80;
const NETWORK_CROWD_RAMP_MS = 3000;
const NETWORK_CROWD_JITTER_MS = 280;
// residual inward drift for dots entering after the zoom has finished
const NETWORK_ENTRY_SETTLE = 1.12;

/** when crowd node n starts fading in during the `network` reveal */
export function networkCrowdDelay(n) {
	return (
		NETWORK_CROWD_START_MS +
		networkDistNorm(n.id) * NETWORK_CROWD_RAMP_MS +
		hash01(n.id, 6) * NETWORK_CROWD_JITTER_MS
	);
}

/**
 * Hidden park spot for crowd node n (hop >= 0 only): where the network is
 * drawn at the moment the dot starts fading in. A dot whose delay lands
 * before the cluster contracts parks at the intro frame's scale — interleaved
 * with the still-full-size cluster — while later dots park progressively
 * closer to their resting spot, tracking the contraction (eased like the
 * tween that drives it). Entering `network`, each dot materializes at the
 * current zoom and rides the pull-back; leaving it, the crowd disperses back
 * out as the cluster grows — the same zoom mirrored. The intro-frame endpoint
 * is exact because the two bakes share offsets-from-Bacon (the intro actors
 * are pinned) — only offsets are comparable; the bakes' absolutes differ.
 */
function networkEntryPosition(n, w, h) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = NETWORK_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = NETWORK_LAYOUT.xy[n.id];
	const ix = cx + (x - ax) * sx;
	const iy = cy + (y - ay) * sy;
	const [fx, fy] = networkPosition(n, w, h, NETWORK_ENTRY_SETTLE);
	const zoomT = Math.min(
		1,
		Math.max(
			0,
			(networkCrowdDelay(n) - NETWORK_ZOOM_DELAY_MS) / NETWORK_ZOOM_MS
		)
	);
	const t = easeCubicInOut(zoomT);
	return [ix + (fx - ix) * t, iy + (fy - iy) * t];
}

/** hidden park spot for any node not participating in a hop-based state */
export function parkHidden(attrs, n, w, h) {
	if (n.hop >= 0) {
		const [x, y] = networkEntryPosition(n, w, h);
		set(attrs, n.id, x, y, NETWORK_RADIUS[n.hop], HOP_RGB[n.hop], 0);
	} else {
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
}

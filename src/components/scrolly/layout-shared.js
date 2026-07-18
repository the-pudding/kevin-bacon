import { NODE_COUNT, EDGE_COUNT, ANCHOR_ID, INTRO_LAYOUT } from "./nodes.js";
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
 * @typedef {Object} LegendItem
 * @property {number[]} color rgb triple
 * @property {string} label
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
 * @property {LegendItem[]} [legend]
 * @property {number} [legendY] px, top of the legend row; omitted = pinned to bottom
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

// how many top-ranked actors RankBars renders — shared with the rank-guess
// search so a search result is never outside the visible/scrollable list
export const RANK_TOP_N = 250;

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

// ---------------------------------------------------------------------------
// Monotone-cubic smoothing (ported from the pudding-post race-chart). A
// Fritsch–Carlson monotone spline never overshoots the data between points, so
// a dot riding the curve never dips below/above the real values. The x control
// points are uniformly spaced within each interval (Bx(t) is linear in t), so a
// screen-x maps to an exact t and the curve can be sampled at any x directly.
// ---------------------------------------------------------------------------

/** monotone-cubic segments through `points`: one cubic [p0, c1, c2, p3] per interval */
export function monotoneSegments(points) {
	const n = points.length;
	if (n < 2) return [];
	// secant slopes between consecutive points
	const h = [];
	const s = [];
	for (let i = 0; i < n - 1; i++) {
		const dx = points[i + 1][0] - points[i][0];
		h.push(dx);
		s.push(dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx);
	}
	// tangents: endpoints take the adjacent secant; interior points use the
	// sign-aware bounded estimate that zeroes at extrema and caps magnitude
	const m = [s[0]];
	for (let i = 1; i < n - 1; i++) {
		const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
		m.push(
			(Math.sign(s[i - 1]) + Math.sign(s[i])) *
				Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0
		);
	}
	m.push(s[n - 2]);
	// one cubic per interval, control points a third of dx along each tangent
	const segs = [];
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		const dx = h[i] / 3;
		segs.push([
			[x0, y0],
			[x0 + dx, y0 + dx * m[i]],
			[x1 - dx, y1 - dx * m[i + 1]],
			[x1, y1]
		]);
	}
	return segs;
}

/** De Casteljau split of cubic [p0, c1, c2, p3] at t → { left, right } */
export function splitCubic(seg, t) {
	const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	const [p0, c1, c2, p3] = seg;
	const a = lerp(p0, c1);
	const b = lerp(c1, c2);
	const c = lerp(c2, p3);
	const d = lerp(a, b);
	const e = lerp(b, c);
	const f = lerp(d, e);
	return { left: [p0, a, d, f], right: [f, e, c, p3] };
}

/** curve y at data-x on monotone segments (Bx linear in t → exact t per segment) */
export function curveYAt(segs, x) {
	if (!segs.length) return null;
	const xa = segs[0][0][0];
	const xb = segs.at(-1)[3][0];
	const cx = Math.max(xa, Math.min(xb, x));
	let seg = segs[0];
	for (const s of segs) {
		if (cx <= s[3][0]) {
			seg = s;
			break;
		}
	}
	const x0 = seg[0][0];
	const x3 = seg[3][0];
	const t = x3 === x0 ? 0 : (cx - x0) / (x3 - x0);
	const u = 1 - t;
	return (
		u * u * u * seg[0][1] +
		3 * u * u * t * seg[1][1] +
		3 * u * t * t * seg[2][1] +
		t * t * t * seg[3][1]
	);
}

/**
 * writes a polyline (data pairs → px via scales) into trail slot t.
 * Resamples along the monotone-cubic curve so the 48 vertices land on a smooth
 * line rather than on chords between data points.
 *
 * Stage-3 note: segments are (re)built from the `pairs` handed in. For a clipped
 * race series that means window-edge tangents come from the clipped set, which is
 * invisible for the static windows but would "snap" when the window animates —
 * the per-frame path animator must instead build segments from the FULL series
 * once and clip/sample those.
 */
export function setTrail(trails, t, pairs, xScale, yScale, alpha) {
	const base = t * TRAIL_STRIDE;
	const segs = monotoneSegments(pairs);
	const x0 = pairs[0][0];
	const xN = pairs.at(-1)[0];
	for (let k = 0; k < TRAIL_POINTS; k++) {
		// resample uniformly in x, reading y off the smooth curve
		const target = x0 + ((xN - x0) * k) / (TRAIL_POINTS - 1);
		const y = segs.length ? curveYAt(segs, target) : pairs[0][1];
		trails[base + k * 2] = xScale(target);
		trails[base + k * 2 + 1] = yScale(y);
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

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends on the curve */
export function clipSeries(pairs, x0, x1) {
	// cut-ends read off the monotone curve of the full series, so the clipped
	// endpoints (and the dot placed at series.at(-1)) sit on the same smooth line
	const segs = monotoneSegments(pairs);
	const out = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		if (x < x0) {
			const nxt = pairs[i + 1];
			if (nxt && nxt[0] > x0) {
				out.push([x0, curveYAt(segs, x0)]);
			}
			continue;
		}
		if (x > x1) {
			const prv = pairs[i - 1];
			if (prv && prv[0] < x1 && (!out.length || out.at(-1)[0] < x1)) {
				out.push([x1, curveYAt(segs, x1)]);
			}
			break;
		}
		out.push([x, y]);
	}
	return out.length >= 2 ? out : null;
}

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

/**
 * Screen position of intro node k in the intro fit — the frame `lone` and
 * `networkIntro` draw the constellation in, and the one the network map's
 * camera 0 reproduces exactly.
 */
export function introPosition(k, w, h) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx, cy + (y - ay) * sy];
}

/**
 * Hidden park spot for any node not placed by the current state: its position
 * on the distance-vs-films scatter (alpha 0), so it fades in where a later
 * scatter chapter will want it and rides one tween into place.
 */
export function parkHidden(attrs, n, w, h) {
	const [x, y] = scatterPosition(n, w, h);
	set(attrs, n.id, x, y, 2, CROWD, 0);
}

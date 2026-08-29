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
// higher-hop endpoint), edge slot 1 = alpha, edge slot 2 = highlight (0–1,
// blends the stroke grey → EDGE_HIGHLIGHT and thickens it; see setEdge)
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
 * @property {number} [wrapWidth] px line width, overriding the default cap (wrap
 *   only). Set as a real `width`, not a max: an absolutely-positioned box is
 *   shrink-to-fit within `containing block - left`, so a centred note at x = w/2
 *   would otherwise never wrap wider than half the canvas.
 *
 * @typedef {Object} LegendItem
 * @property {number[]} color rgb triple
 * @property {string} label
 * @property {number} [x] px, left edge — when set (with `y`), this item renders as
 *   its own pinned label at that position instead of joining the shared bottom row
 * @property {number} [y] px, vertical centre of the pinned label (see `x`)
 *
 * @typedef {Object} Hit
 * @property {number} x px, left edge
 * @property {number} y px, top edge
 * @property {number} w px
 * @property {number} h px
 * @property {string} label accessible name for the region
 * @property {unknown} value handed to the state's `pick` (see STATE_PICK)
 * @property {boolean} [selected] currently the picked region
 * @property {boolean} [round] hover/selected tint is a circle, not a rectangle —
 *   for a region centred on a dot rather than covering a bar
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
 * @property {Hit[]} [hits] tappable regions over the chart (see STATE_PICK)
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
export const CYAN = [102, 204, 238]; // --category-cyan
export const EDGE_GREY = [120, 120, 120]; // network links at rest
export const EDGE_HIGHLIGHT = GREEN; // a highlighted link (see setEdge's `highlight`)

export const MARGIN = 32;
// charts live in the top ~3/5 of the canvas — the step card owns the bottom,
// and the x-axis ticks + axis label (drawn ~32px below this line) need to clear
// the tallest step cards too, so keep the plot clear of the bottom ~40%
export const plotBottom = (h) => h * 0.6;

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

/**
 * Writes one edge's render state. `highlight` (0–1) blends the stroke from the
 * plain grey toward EDGE_HIGHLIGHT and thickens it (see ScrollyVisual's drawScene);
 * a scalar rather than an rgb triple so the untouched slots of every layout that
 * doesn't draw edges still mean "plain grey" rather than black.
 */
export function setEdge(attrs, e, progress, alpha, highlight = 0) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
	attrs[i + 2] = highlight;
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
export const CAGE = idOf(2963);
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

// ---------------------------------------------------------------------------
// Rank hop-breakdown bar: a hop-bands chart turned on its side, hops 1→4 left
// to right, individual actors drawn as dots inside their band. Shared by the
// canvas handoff (layouts/rank.js) and the HTML list it dissolves into
// (RankBars.svelte) so the two land dot-for-dot on the same geometry.
// ---------------------------------------------------------------------------

export const RANK_BAR_H = 10; // px, the dotted strip's height
// px floor per band. Also the minimum-nodes guarantee: dots are units of width,
// so the floor that keeps a sparse hop (hop 4 is ~0.1% of a row) visible is
// what keeps a handful of its dots on screen.
export const RANK_SEG_MIN = 10;
export const RANK_DOT_D = 3; // px dot diameter
export const RANK_DOT_ROWS = 3; // dot rows stacked within RANK_BAR_H
export const RANK_DOT_PITCH = 5; // px between dot columns
// how much of the free space around a dot it may wander into: enough that the
// strip reads as a crowd rather than a stamped lattice, not so much that
// neighbours merge into a solid line at list widths
export const RANK_DOT_JITTER = 0.5;
// How long the list's bars take to collapse into single nodes when the story
// steps on into the race chapter (RankBars' `collapse`). Shared vocabulary: the
// panel owns the clock and the canvas waits for it (story.rankCollapsed), so
// this lives here rather than in either component.
export const RANK_COLLAPSE_MS = 500;

/**
 * Cumulative left edges (length 5) of hop bands 1–4 across `width`: each band
 * gets `minPx` plus its share of what's left, so the proportions still read
 * while no band disappears.
 * @param {number[]} fractions four shares summing to 1
 * @param {number} width px
 * @param {number} [minPx]
 */
export function hopSegmentBounds(fractions, width, minPx = 0) {
	const free = width - minPx * fractions.length;
	const bounds = [0];
	for (const fraction of fractions) {
		bounds.push(bounds[bounds.length - 1] + minPx + free * fraction);
	}
	return bounds;
}

/** an actor's hop 1–4 shares of the corpus, from the rankHopBands export */
export function hopFractions(id) {
	const counts = story.rankHopBands[id];
	const total = counts.reduce((sum, count) => sum + count, 0);
	return counts.map((count) => count / total);
}

/**
 * The dot positions of one actor's bar: per band, a lattice of columns × rows
 * across the band's own width, each dot nudged off the lattice so the strip
 * reads as a crowd. `id` keys that nudge, so a row's dots are stable.
 *
 * Both sides of the rank handoff draw these exact points — the HTML row as one
 * path per band, the canvas as the spot each converging actor lands on — so
 * the frame the canvas settles into is the frame the panel then covers.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @param {number} width px
 * @param {number} id node id keying the jitter
 * @returns {{x: number, y: number}[][]} one array of dots per hop band
 */
export function hopDotSlots(fractions, width, id) {
	const bounds = hopSegmentBounds(fractions, width, RANK_SEG_MIN);
	const rowH = RANK_BAR_H / RANK_DOT_ROWS;
	const jitterY = Math.max(0, (rowH - RANK_DOT_D) / 2) * RANK_DOT_JITTER;
	return fractions.map((_, band) => {
		const x0 = bounds[band];
		const segW = bounds[band + 1] - x0;
		// at least one column: a band this narrow is one the min-width floor is
		// carrying, and it still owes the reader its colour
		const cols = Math.max(1, Math.round(segW / RANK_DOT_PITCH));
		const pitch = segW / cols;
		const jitterX = Math.max(0, (pitch - RANK_DOT_D) / 2) * RANK_DOT_JITTER;
		const dots = [];
		for (let col = 0; col < cols; col++) {
			for (let row = 0; row < RANK_DOT_ROWS; row++) {
				const key = (id * 4 + band) * 512 + col * RANK_DOT_ROWS + row;
				dots.push({
					x: x0 + (col + 0.5) * pitch + (hash01(key, 8) - 0.5) * jitterX * 2,
					y: (row + 0.5) * rowH + (hash01(key, 9) - 0.5) * jitterY * 2
				});
			}
		}
		return dots;
	});
}

// fixed film-count x-scale shared by every films-scatter variant so dots only
// travel vertically when the y-metric changes. Floored at 5 films: below that
// the corpus is mostly one-and-done credits, a low-signal vertical smear on the
// left, so the axis starts here and thinner actors park off the left edge
// (alpha 0). It matches build-scrolly-nodes.js's FILM_MIN exactly — the node
// file carries the *whole* corpus from this count up, so every column of the
// plotted cloud is a full population rather than a sample.
export const FILM_MIN_SHOWN = 5;
const FILM_LOGS = rawNodes.nodes.map((n) => Math.log(Math.max(1, n[3])));
export const FILM_LOG_MIN = Math.log(FILM_MIN_SHOWN);
export const FILM_LOG_MAX = Math.max(...FILM_LOGS);
// inverts top50's log(films + 1) build transform back to a plain film count.
// The raw log value means nothing to a reader, so everything that surfaces
// top50 — the degScatter axis and its labels, the Gen Z breakdown — shows the
// de-logged count instead, and shares this so they all read the same number.
export const deLogFilms = (t) => Math.round(Math.exp(t) - 1);

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
// Simulation race (layouts/sim-race.js): the reader replays the 10,000 recorded
// simulation runs and watches each contender's win count climb. Every contender
// gets a line, so the lines account for all 10,000 runs between them.
// ---------------------------------------------------------------------------

/** one line per contender, in win order */
export const SIM_SERIES = story.genz.candidates.map((c) => c.id);
/** how many of the leaders carry a name beside their dot. Every line is the same
 * grey (see TRAIL_META), so a name is what makes a line followable — and 99
 * names down one edge is a wall of text rather than a legend. */
export const SIM_LABEL_N = 5;
/** the contenders whose line carries their name */
export const SIM_LABEL_IDS = SIM_SERIES.slice(0, SIM_LABEL_N);

// ---------------------------------------------------------------------------
// Trails: polylines tweened by a second tweener (vertex morphing = object
// constancy for lines). Fixed slots, in order: one per race actor (RACE_IDS),
// the career trio, one per cohort career line, 1 reference rule.
// Every slot constant below is derived from those lengths, so the race cast and
// the cohort can grow without touching any index here.
// ---------------------------------------------------------------------------

export const TRAIL_POINTS = 48;
export const TRAIL_STRIDE = TRAIL_POINTS * 2 + 1; // vertices + alpha
export const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);
/** @type {{ id: number|null, rgb: number[], width: number }[]} */
export const TRAIL_META = [
	// The race chart carries no hue at all: every line is the same grey at the
	// same width, and emphasis is per-STEP rather than per-actor — the actors a
	// step is about ride a darker dot and a stronger line alpha (see
	// writeRaceSweepFrame's `major`). A per-actor palette can't express that,
	// since a trail's colour and width here are baked once at module load while
	// which actors matter changes step to step; and with a cast of hundreds a
	// palette would in any case be a handful of hues against a grey field.
	...RACE_IDS.map((id) => ({ id, rgb: CROWD, width: 1 })),
	// career chapter: red hero trajectory, grey comparison lines (the dots are
	// blue marks — see layouts/career.js)
	{ id: SWEENEY, rgb: RED, width: 1.5 },
	{ id: DENIRO, rgb: CROWD, width: 1.5 },
	{ id: CHASE, rgb: CROWD, width: 1.5 },
	...story.careers.cohort.map(() => ({ id: null, rgb: CROWD, width: 1 })),
	// simulation race: one line per contender. Grey like the race chart and for
	// the same reason — emphasis is which lines the step labels, not a palette of
	// 99 hues
	...SIM_SERIES.map((id) => ({ id, rgb: CROWD, width: 1 })),
	{ id: null, rgb: CROWD, width: 1 } // reference rule (prediction diagonal, Gen Z number line)
];
export const TRAIL_SIZE = TRAIL_META.length * TRAIL_STRIDE;
export const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));
export const SWEENEY_SLOT = RACE_IDS.length;
export const DENIRO_SLOT = RACE_IDS.length + 1;
export const CHASE_SLOT = RACE_IDS.length + 2;
export const COHORT_SLOT = RACE_IDS.length + 3;
export const SIM_SLOT_BASE = COHORT_SLOT + story.careers.cohort.length;
export const RULE_SLOT = TRAIL_META.length - 1;

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
 * resamples TRAIL_POINTS vertices uniformly in data-x over [x0, x1], reading y
 * off PRE-BUILT monotone segments, into trail slot t. Because the segments are
 * supplied (not rebuilt from a clipped subset here), the caller can pass segments
 * of the FULL series and sample any window without the window-edge tangents
 * snapping — the per-frame race sweep relies on this. `curveYAt` clamps a target
 * past the segments' x-range to the terminal value, so a window wider than the
 * data samples flat at the ends rather than extrapolating.
 */
export function sampleTrail(trails, t, segs, x0, x1, xScale, yScale, alpha) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		const target = x0 + ((x1 - x0) * k) / (TRAIL_POINTS - 1);
		trails[base + k * 2] = xScale(target);
		trails[base + k * 2 + 1] = yScale(curveYAt(segs, target));
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/**
 * writes a polyline (data pairs → px via scales) into trail slot t, sampled along
 * the monotone-cubic curve of `pairs` so the 48 vertices land on a smooth line.
 * Thin wrapper over `sampleTrail` for callers holding raw pairs; a single data
 * point collapses the slot onto its position.
 */
export function setTrail(trails, t, pairs, xScale, yScale, alpha) {
	const segs = monotoneSegments(pairs);
	if (!segs.length) {
		collapseTrail(trails, t, xScale(pairs[0][0]), yScale(pairs[0][1]), alpha);
		return;
	}
	sampleTrail(
		trails,
		t,
		segs,
		pairs[0][0],
		pairs.at(-1)[0],
		xScale,
		yScale,
		alpha
	);
}

/**
 * Writes an EXPLICIT vertex list (already in px) into trail slot t, padding the
 * unused vertices onto the last point — so a line with fewer than TRAIL_POINTS
 * vertices ends where its data ends, the surplus piling up as zero-length
 * segments at the tip.
 *
 * The counterpart to `sampleTrail`, for a line that GROWS at its tip rather than
 * sliding under a camera: resampling a widening window puts every interior
 * vertex on different data each frame, so the line's real wobble slides
 * backwards through it and the whole thing shimmers. Vertices handed in here
 * stay exactly where the caller put them, frame after frame.
 */
export function setTrailPoints(trails, t, points, alpha) {
	const base = t * TRAIL_STRIDE;
	const last = points.length - 1;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		const [x, y] = points[Math.min(k, last)];
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
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
 * frame every intro-chapter layout hangs off (lone/networkIntro at full size,
 * hopSeed pulled back, see introPosition's `scale`).
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
 * Screen position of intro node k in the intro fit — the frame `lone` and
 * `networkIntro` draw the constellation in.
 *
 * `scale` pulls the camera back about the anchor: every other node collapses
 * toward Bacon while Bacon himself stays exactly where he was, so the one dot
 * the reader has been told is the centre never moves between the full-size
 * constellation and hopSeed's zoomed-out one.
 */
export function introPosition(k, w, h, scale = 1) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx * scale, cy + (y - ay) * sy * scale];
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

// ---------------------------------------------------------------------------
// The pull-back, and the crowd that arrives during it
//
// hopSeed backs the camera off the intro constellation about Bacon (see
// introPosition's `scale`) while a wider crowd of real actors fades in around
// it. The geometry lives here because two chapters need it: hop-bands draws the
// pulled-back frame, and the intro states have to park the same crowd where the
// pull-back would have left it, or stepping backwards drags the whole field
// across the canvas to their scatter spots instead of letting the camera push
// them back out.
// ---------------------------------------------------------------------------

// how far the camera pulls back: far enough that the crowd dots land at the 2px
// the scatter chapters draw the corpus at (and near hopBands' own 3px), so the
// step ends on marks the rest of the story already reads as "one of many"
// rather than on shrunken portraits
export const PULLBACK_DOT_R = 2;
export const PULLBACK_ZOOM = PULLBACK_DOT_R / NETWORK_INTRO_RADIUS[1];

/**
 * The crowd that arrives as the camera pulls back: every actor the corpus can
 * place at hop 1–4 — the exact set hopBands is about to sort into rows, so the
 * bands sort the crowd the reader just met rather than swapping it for a bigger
 * one. Unreachable actors (hop -1) stay out: they have no band to land in.
 *
 * The intro fifteen are excluded: they are drawn by the constellation writer,
 * and including them would drag them out of the graph into the field.
 */
const INTRO_SET = new Set(INTRO_IDS);
export const FIELD_IDS = rawNodes.nodes.reduce(
	(ids, n, id) =>
		n[2] >= 1 && n[2] <= 4 && !INTRO_SET.has(id) ? (ids.push(id), ids) : ids,
	/** @type {number[]} */ ([])
);

// the constellation's own crowd alpha: by the end of the pull-back the fifteen
// are meant to be indistinguishable members of the field, which is the whole
// point of the beat — only Bacon stays darker and larger
const FIELD_ALPHA = 1;
// ramp width, so a dot crossing the plot edge fades up rather than popping
const FIELD_FADE_PX = 40;
// How the field opens, all measured as shares of the camera's travel rather
// than as clocks, so a scrubbed or interrupted pull-back stays consistent with
// itself. The edge ramp alone cannot hold the opening frame clean: a dot has to
// be authored a third of the canvas out from Bacon before full zoom pushes it
// off the edge, which leaves a ring of white between the constellation and the
// nearest field dot. Gating on the camera instead lets a dot be authored right
// up against the constellation — the ones already in frame simply fade up where
// they stand while the outer ones still cross in.
//
// The reader gets the constellation alone for a beat (HOLD) so the camera is
// visibly pulling back off Bacon's network before anything else arrives; then
// the crowd trickles in dot by dot over STAGGER rather than arriving as one
// sheet, each fading up over SHARE. HOLD + STAGGER + SHARE stays under 1 so the
// last dot lands before the camera stops.
//
// SKEW back-loads the trickle: a dot's slot is its hash raised to this power, so
// spreading arrivals evenly over STAGGER is not what the eye reads as gradual.
// A field this size looks full long before it is — the first two thousand dots
// already read as a crowd — so an even rate spends its whole second half adding
// dots nobody can see arriving, and the visible part of the build is over in a
// blink. Below 1 the early arrivals are sparse and countable and the rate climbs
// from there, which tracks how the crowd actually reads.
const FIELD_OPEN_HOLD = 0.12;
const FIELD_OPEN_STAGGER = 0.75;
const FIELD_OPEN_SHARE = 0.08;
const FIELD_OPEN_SKEW = 0.5;
// Keep-out disc around Bacon. The field is authored blind across the whole plot
// rect, and Bacon's fitted spot is the exact horizontal centre of it at every
// viewport width (the baked intro layout puts the anchor at w/2), so a dot whose
// x-hash is ~0.5 sits on his column on every screen — several of the field do,
// and they land under the one dot the reader has been told to watch. Anything
// authored inside the disc is moved out into the annulus just beyond it, on an
// angle and a radius of its own: at this field size a whole handful gets moved,
// and snapping them all to the disc edge would ring Bacon in evenly-spaced dots.
// Sized in constellation units and scaled with the camera, so the gap the reader
// sees is the same at every scale; enforcing it at the landing covers the whole
// leg, since a dot's distance from Bacon only shrinks as the camera pulls back.
const FIELD_KEEPOUT_GAP = 12;
const FIELD_KEEPOUT =
	(NETWORK_INTRO_RADIUS[0] + NETWORK_INTRO_RADIUS[1] + FIELD_KEEPOUT_GAP) *
	PULLBACK_ZOOM;

/**
 * Writes the field into `attrs` at the pull-back's live `scale` (1 = full zoom,
 * PULLBACK_ZOOM = landed), leaving every other slot alone.
 *
 * Each dot is authored at the spot it holds when the camera lands, and its
 * position at any wider scale is that spot pushed out from Bacon — the point the
 * pull-back turns about — so the field contracts into frame exactly as the
 * constellation does, and expands back out of it on the way back. Radius follows
 * the constellation's crowd rather than the landing size, so a dot arrives at
 * whatever the graph's dots are at that moment instead of popping in already
 * shrunk. Opacity is geometry and camera only — the trickle-in is a per-dot
 * offset into the camera's own travel, not a clock — so the same call serves the
 * static frame and every animated one, and a scrub lands on the same frame the
 * animation would have drawn at that scale.
 */
export function writeFieldCrowd(attrs, w, h, scale) {
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	const x0 = MARGIN;
	const x1 = w - MARGIN;
	const y0 = MARGIN;
	const y1 = plotBottom(h);
	const k = scale / PULLBACK_ZOOM;
	// how far through the pull-back the camera is: 0 at full zoom, 1 at landing
	const travel = (1 - scale) / (1 - PULLBACK_ZOOM);
	const r = NETWORK_INTRO_RADIUS[1] * scale;
	for (const id of FIELD_IDS) {
		let fx = x0 + hash01(id, 10) * (x1 - x0);
		let fy = y0 + hash01(id, 11) * (y1 - y0);
		if (Math.hypot(fx - bx, fy - by) < FIELD_KEEPOUT) {
			const a = hash01(id, 12) * Math.PI * 2;
			const d = FIELD_KEEPOUT * (1 + hash01(id, 13));
			fx = bx + Math.cos(a) * d;
			fy = by + Math.sin(a) * d;
		}
		const x = bx + (fx - bx) * k;
		const y = by + (fy - by) * k;
		const inset = Math.min(x - x0, x1 - x, y - y0, y1 - y);
		const edge = Math.max(0, Math.min(1, inset / FIELD_FADE_PX));
		// this dot's own slot in the trickle: the hold, plus its place in the stagger
		const start =
			FIELD_OPEN_HOLD + hash01(id, 14) ** FIELD_OPEN_SKEW * FIELD_OPEN_STAGGER;
		const opening = Math.max(
			0,
			Math.min(1, (travel - start) / FIELD_OPEN_SHARE)
		);
		set(attrs, id, x, y, r, CROWD, FIELD_ALPHA * edge * opening);
	}
}

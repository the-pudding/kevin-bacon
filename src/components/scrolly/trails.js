// Trails: polylines tweened by a second tweener (vertex morphing = object
// constancy for lines). Fixed slots, allocated per cast, and the writers that
// fill them — sampled along a monotone-cubic curve so 48 vertices land on a
// smooth line.
import story from "$data/scrolly-story.json";
import {
	BACKDROP_IDS,
	CHASE,
	DENIRO,
	HACKMAN,
	MIRREN,
	RACE_IDS,
	SIM_SERIES,
	SWEENEY
} from "./cast.js";
import { ANCHOR_ID } from "./nodes.js";
import { CROWD, TRAIL_ACCENT } from "./palette.js";

export const TRAIL_POINTS = 48;

// vertices + alpha + highlight. The last channel (0-1) blends a line's stroke
// from its TRAIL_META colour toward INK and thickens it, exactly as edge slot 2
// does for links (see setEdge and ScrollyVisual's drawScene). It rides the
// buffer rather than being decided at draw time so the trail tweener
// interpolates it: a line that gains or loses the ink between two states
// crossfades instead of flipping.
export const TRAIL_STRIDE = TRAIL_POINTS * 2 + 2;

/** @type {{ id: number|null, rgb: number[], width: number }[]} */
export const TRAIL_META = [
	// The race chart carries no hue at all: every line is the same grey at the
	// same width. The one actor set apart from the field is whoever LEADS at the
	// camera's right edge, and they are set apart in ink (the trail highlight
	// channel above, written per frame by writeRaceSweepFrame) — nobody is
	// identified BY a colour, one is identified as being in front. A per-actor
	// palette would in any case be unworkable with a cast of hundreds.
	...RACE_IDS.map((id) => ({ id, rgb: CROWD, width: 1 })),
	// career chapter: red hero trajectory, grey comparison lines (the dots are
	// blue marks — see layouts/career.js)
	{ id: SWEENEY, rgb: TRAIL_ACCENT, width: 1.5 },
	{ id: DENIRO, rgb: CROWD, width: 1.5 },
	{ id: CHASE, rgb: CROWD, width: 1.5 },
	// the same chart asked about Bacon himself: his own red trajectory, and the
	// two careers that bound what is left of it. A second block rather than a
	// re-use of the three above, because a slot's stroke colour is fixed here —
	// Bacon needs the red De Niro's slot does not have — and because the two
	// steps are two different charts: see the TRAIL_CONSTANCY note below.
	{ id: ANCHOR_ID, rgb: TRAIL_ACCENT, width: 1.5 },
	{ id: HACKMAN, rgb: CROWD, width: 1.5 },
	{ id: MIRREN, rgb: CROWD, width: 1.5 },
	...story.careers.cohort.map(() => ({ id: null, rgb: CROWD, width: 1 })),
	// simulation race: one line per contender. Grey like the race chart and for
	// the same reason — emphasis is which lines the step labels, not a palette of
	// 99 hues
	...SIM_SERIES.map((id) => ({ id, rgb: CROWD, width: 1 })),
	// the Gen-Z step's backdrop field. Grey and 1px like everything else on that
	// chart — what sets it back is alpha, written per frame by the writer, not a
	// colour or a weight here
	...BACKDROP_IDS.map((id) => ({ id, rgb: CROWD, width: 1 })),
	{ id: null, rgb: CROWD, width: 1 } // reference rule (prediction diagonal, Gen Z number line)
];

export const TRAIL_SIZE = TRAIL_META.length * TRAIL_STRIDE;

export const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));

export const SWEENEY_SLOT = RACE_IDS.length;

export const DENIRO_SLOT = RACE_IDS.length + 1;

export const CHASE_SLOT = RACE_IDS.length + 2;

export const BACON_SLOT = RACE_IDS.length + 3;

export const HACKMAN_SLOT = RACE_IDS.length + 4;

export const MIRREN_SLOT = RACE_IDS.length + 5;

export const COHORT_SLOT = RACE_IDS.length + 6;

export const SIM_SLOT_BASE = COHORT_SLOT + story.careers.cohort.length;

/** slot -> contender, and the inverse of SIM_SERIES' index */
export const SIM_SLOT = new Map(
	SIM_SERIES.map((id, i) => [id, SIM_SLOT_BASE + i])
);

/**
 * The simulation block as a set, for the two charts that own it: the simulation
 * race and the race chart's Gen-Z step, which draw the SAME 99 actors and so
 * share one block of slots rather than allocating a second. Reusing them is what
 * lets a contender's trajectory line become their win-count climb four steps
 * later instead of two unrelated lines occupying two slots.
 */
export const SIM_TRAIL_SLOTS = new Set(SIM_SLOT.values());

export const BACKDROP_SLOT_BASE = SIM_SLOT_BASE + SIM_SERIES.length;

/** slot -> backdrop actor */
export const BACKDROP_SLOT = new Map(
	BACKDROP_IDS.map((id, i) => [id, BACKDROP_SLOT_BASE + i])
);

/** the backdrop block, owned by the one step that draws it */
export const BACKDROP_TRAIL_SLOTS = new Set(BACKDROP_SLOT.values());

export const RULE_SLOT = TRAIL_META.length - 1;

/**
 * The race chapter's own block — one line per cast member. Everything a race
 * frame writes lives in RACE_CAST (dots) and these (lines); every other slot on
 * the canvas belongs to whatever chapter the reader came from.
 */
export const RACE_TRAIL_SLOTS = new Set(RACE_SLOT.values());

/** the career chapter's: the hero, the two comparisons and the cohort fan */
export const CAREER_TRAIL_SLOTS = new Set([
	SWEENEY_SLOT,
	DENIRO_SLOT,
	CHASE_SLOT,
	...story.careers.cohort.map((_c, i) => COHORT_SLOT + i)
]);

/** the Bacon step's three lines */
export const BACON_TRAIL_SLOTS = new Set([
	BACON_SLOT,
	HACKMAN_SLOT,
	MIRREN_SLOT
]);

/**
 * Which states agree that a shared slot is ONE LINE — the object constancy a
 * block was allocated for, declared rather than inferred.
 *
 * A slot alive in two states that are not listed together here is a line from
 * one chart being bent into a line from another (a win-count climb into a
 * projection curve, a prediction diagonal into a Gen-Z number line), which is a
 * shape that exists in neither chart: it fades out where it lies and re-enters
 * instead of morphing (see ScrollyVisual's departTrails). RULE_SLOT and the
 * simulation block are deliberately absent for exactly that reason.
 *
 * BACON_TRAIL_SLOTS are deliberately absent for the same reason, and it is the
 * whole of how that step arrives: Sweeney's trio is not the same thing as
 * Bacon's, so the trio fades out where it lies before the crowd moves and
 * Bacon's line is drawn onto an empty chart after it has landed.
 *
 * Inferring this from the geometry is not an option: the live frame is Float32
 * and a target is Float64, so identical lines differ by rounding — and the race
 * chart's slots change geometry between every race step and must morph, so a
 * geometry test would flash the whole chart out and in on 9 → 10.
 * @type {{ slots: Set<number>, states: string[] }[]}
 */
export const TRAIL_CONSTANCY = [
	{
		slots: RACE_TRAIL_SLOTS,
		states: ["raceRecent", "raceFull", "raceFuture", "raceGenz", "raceClose"]
	},
	{ slots: BACKDROP_TRAIL_SLOTS, states: ["raceGenz"] },
	{ slots: CAREER_TRAIL_SLOTS, states: ["careerTrio", "careerMany"] }
];

/** do `a` and `b` draw trail slot `t` as the same line? */
export const sameLine = (t, a, b) =>
	TRAIL_CONSTANCY.some(
		(g) => g.slots.has(t) && g.states.includes(a) && g.states.includes(b)
	);

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
	// the first segment ending at or past cx, by bisection: segment ends never
	// decrease, and this is called per vertex per trail per frame
	let lo = 0;
	let hi = segs.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cx <= segs[mid][3][0]) hi = mid;
		else lo = mid + 1;
	}
	const seg = segs[lo];
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
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
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
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
}

/** collapses trail slot t onto a point (line unspools from/retracts into a dot) */
export function collapseTrail(trails, t, x, y, alpha = 0) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
}

/**
 * Sets trail slot t's ink (0-1). Every other trail writer ZEROES this channel,
 * so a slot can only carry ink while the writer that owns it keeps saying so —
 * which is what stops a chapter inheriting the previous one's emphasis in the
 * live buffer, where nothing is re-allocated between frames.
 */
export function setTrailHighlight(trails, t, hi) {
	trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2 + 1] = hi;
}

/**
 * The first point past the window leaves on the curve at its edge — unless the
 * series already ends exactly there, or began past it.
 * @param {[number, number][]} pairs
 * @param {number} i the first index past x1
 * @param {[number, number][]} out the clipped series so far
 */
const leavesAt = (pairs, i, out, x1) =>
	pairs[i - 1]?.[0] < x1 && out.at(-1)?.[0] !== x1;

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends on the curve */
export function clipSeries(pairs, x0, x1) {
	// cut-ends read off the monotone curve of the full series, so the clipped
	// endpoints (and the dot placed at series.at(-1)) sit on the same smooth line
	const segs = monotoneSegments(pairs);
	const cut = (x) => [x, curveYAt(segs, x)];
	const out = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		if (x < x0) {
			// the last point before the window: enter on the curve at its edge
			if (pairs[i + 1]?.[0] > x0) out.push(cut(x0));
			continue;
		}
		if (x > x1) {
			if (leavesAt(pairs, i, out, x1)) out.push(cut(x1));
			break;
		}
		out.push([x, y]);
	}
	return out.length >= 2 ? out : null;
}

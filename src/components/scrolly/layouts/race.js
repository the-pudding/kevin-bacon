import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	CROWD,
	SLJ,
	HACKMAN,
	set,
	scatterPosition,
	raceRGB,
	RACE_IDS,
	TRAIL_META,
	RACE_SLOT,
	sampleTrail,
	collapseTrail,
	clipSeries,
	monotoneSegments,
	curveYAt,
	curveYRange
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per era anchor.
//
// The x axis is FIXED-SCALE: PX_PER_YEAR pixels per year on every race step and
// every viewport, so a year is always the same distance from its neighbour and
// every visible year gets its own label. The chart therefore holds more years
// than fit on screen, and each step is a *camera* over its content extent (see
// raceCamera) that the reader pans and the entry choreographies drive.
//
// Three concepts, deliberately separate:
//   content extent  [e0,e1]  baked per state, width-independent — drives the
//                            cast, the y-fit, era candidacy and the pan bounds,
//                            so panning NEVER moves the y axis or changes who is
//                            on the chart. The y-fit is fixed for a whole state
//                            and a whole animation phase; the one exception is
//                            the raceRecent -> raceTrades rewind leg, whose axis
//                            pans with its camera (raceRewindYFit) because each
//                            of those steps is fitted to its own decade.
//   camera          playhead the year at the plot's right edge; with
//                            PX_PER_YEAR this fixes the whole x scale.
//   reveal          0..1     the entry draw-on only: how much of the visible
//                            span has unspooled (right to left).
// ---------------------------------------------------------------------------

// px between consecutive years. The one dial for axis density: a horizontal
// 4-digit `.tick` label (0.65rem) is ~24px, so this leaves ~14px of clear space
// between neighbouring years. Paired with the name-gutter fraction in racePlot —
// those two decide how many years a phone can show at once, so buying more
// padding here costs visible years.
export const PX_PER_YEAR = 38;

// minimum gap between two era callouts. In year units, which is now the same
// thing as a pixel budget (PX_PER_YEAR is fixed), so this reads the same on
// every screen — no width branch.
const NOTE_MIN_GAP_YEARS = 2;

// full-series monotone-cubic segments per race actor, built once (the data is
// static). Shared by the static layout and the per-frame sweep so both read the
// same curve — window-edge tangents never come from a clipped subset.
const RACE_SEGS = new Map(
	RACE_IDS.map((id) => [id, monotoneSegments(story.raceSeries[id])])
);
// [firstYear, lastYear] per actor, so a frame can clamp a trail to the actor's
// real data extent rather than drawing flat stubs where it has no points
const RACE_RANGE = new Map(
	RACE_IDS.map((id) => {
		const s = story.raceSeries[id];
		return [id, [s[0][0], s.at(-1)[0]]];
	})
);

// the race actors who count as contenders over [year0, year1]: their clipped
// series must exist and dip to (or below) yCap. Reached through raceStepCast, never
// called directly by a state, and every caller passes a state's *content extent*,
// so the cast is fixed for a whole step (panning can hide an actor off-camera,
// never un-cast it).
export function raceContenders(year0, year1, yCap) {
	const ids = new Set();
	for (const id of RACE_IDS) {
		const c = clipSeries(story.raceSeries[id], year0, year1);
		if (!c) continue;
		if (Math.min(...c.map(([, v]) => v)) > yCap) continue;
		ids.add(id);
	}
	return ids;
}

// padded y-extent over [year0, year1] read off the curves (6% headroom so dots
// riding near the extremes don't touch the plot edge — matches the reference)
/** @returns {[number, number, number, number]} */
function raceYFit(segsList, year0, year1) {
	const [lo, hi] = curveYRange(segsList, year0, year1) ?? [0, 1];
	const pad = (hi - lo) * 0.06 || 0.05;
	return [lo - pad, hi + pad, lo, hi];
}

/**
 * Walking left from `to`, the year where a curve last leaves [vMin, vMax] — i.e.
 * where its line should enter the plot. Returns `from` when the curve stays in
 * range all the way, so a line that never goes off-scale is drawn in full.
 *
 * Bisects on a coarse scan rather than solving the cubics: the vertex spacing is
 * ~8px, so landing within a fraction of a year of the true crossing puts the
 * line's end on the plot edge to the pixel.
 *
 * @param {ReturnType<typeof monotoneSegments>} segs
 * @param {number} to right end of the drawn range (in range by construction)
 * @param {number} from furthest left the line could be drawn
 */
function curveEntry(segs, to, from, vMin, vMax) {
	if (to <= from) return from;
	const inRange = (x) => {
		const v = curveYAt(segs, x);
		return v >= vMin && v <= vMax;
	};
	const STEPS = 48;
	let lastIn = to;
	for (let i = 1; i <= STEPS; i++) {
		const x = to - ((to - from) * i) / STEPS;
		if (!inRange(x)) {
			// crossing is between x (out) and lastIn — bisect to the pixel
			let out = x;
			for (let j = 0; j < 12; j++) {
				const mid = (out + lastIn) / 2;
				if (inRange(mid)) lastIn = mid;
				else out = mid;
			}
			return lastIn;
		}
		lastIn = x;
	}
	return from;
}

/**
 * The y-fit for the rewind's second leg: an axis that PANS with the camera instead
 * of holding still, easing from `a` (raceRecent's) to `b` (raceTrades' resting fit)
 * while always containing the dots at the frame's playhead.
 *
 * Both parts are needed. The ease is what keeps the handoff from snapping between
 * two steps fitted to different decades. The dot envelope is what lets each step's
 * fit be tight: a straight interpolation between them passes above the actors' late
 * 1990s values — the dots would ride out over the axis furniture ~40px above the
 * plot — because the pan's corridor dips below both endpoints. Widening either
 * endpoint to cover the corridor instead is what left raceTrades' resting axis with
 * a third of its height empty.
 *
 * Hand the result to runSweepPhase in place of a constant fit.
 *
 * @param {[number,number,number,number]} a fit at progress 0
 * @param {[number,number,number,number]} b fit at progress 1
 * @param {number} fromP playhead at progress 0
 * @param {number} toP playhead at progress 1
 * @param {number[]} ids the actors whose dots must stay on screen
 * @returns {(e: number) => [number,number,number,number]}
 */
export function raceRewindYFit(a, b, fromP, toP, ids) {
	const segsList = ids.map((id) => RACE_SEGS.get(id));
	return (e) => {
		const playhead = fromP + (toP - fromP) * e;
		let lo = Infinity;
		let hi = -Infinity;
		for (const segs of segsList) {
			const v = curveYAt(segs, playhead);
			lo = Math.min(lo, v);
			hi = Math.max(hi, v);
		}
		const [vMin, vMax, vLo, vHi] = a.map((v, i) => v + (b[i] - v) * e);
		// same 6% breathing room raceYFit gives a static fit, so a dot the envelope
		// pulls the axis onto still doesn't touch the plot edge
		const pad = (vMax - vMin) * 0.06;
		return [
			Math.min(vMin, lo - pad),
			Math.max(vMax, hi + pad),
			Math.min(vLo, lo),
			Math.max(vHi, hi)
		];
	};
}

// The plot rectangle. The plot spans only the left 2/3 of the inner width — the
// right third is a gutter reserved for the actor name labels (which sit beside
// the right-edge dots), so names never clip off the canvas.
function racePlot(w, h) {
	const left = MARGIN + 14;
	return {
		top: MARGIN + 10,
		bottom: plotBottom(h),
		left,
		right: left + ((w - MARGIN - 6 - left) * 2) / 3
	};
}

/** years that fit across the plot at the fixed scale — a function of width only */
export function raceVisibleSpan(w, h) {
	const plot = racePlot(w, h);
	return (plot.right - plot.left) / PX_PER_YEAR;
}

/**
 * The camera for one race frame.
 *
 * `playhead` is the year at the plot's RIGHT edge, so xS(playhead) === right —
 * that's what keeps the long-standing "dots ride the right end of their line"
 * convention true under a fixed scale. The x scale is PX_PER_YEAR and is never
 * fitted to a domain, so nothing zooms: moving the playhead only slides camLeft.
 *
 * Deliberately a pure function of (playhead, width, height) with NO extent and
 * NO clamping. That is what makes an animated frame and the static layout it
 * settles onto pixel-identical even when a choreography drives the camera across
 * a step's own extent (the rewind pans raceRecent back to the waypoint). Reader
 * input is clamped at its source
 * instead — see racePanBounds.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} playhead year at the plot's right edge
 */
function raceCamera(w, h, playhead) {
	const plot = racePlot(w, h);
	const visibleSpan = (plot.right - plot.left) / PX_PER_YEAR;
	const camLeft = playhead - visibleSpan;
	return {
		...plot,
		visibleSpan,
		camLeft,
		camRight: playhead,
		playhead,
		xS: (yr) => plot.left + (yr - camLeft) * PX_PER_YEAR
	};
}

/**
 * How far a *reader* may pan a race step: never right of its content extent, and
 * never so far left that the camera runs off the front of it. `playhead` (the
 * camera's current year) widens the floor, so a grab that starts after a
 * choreography has parked the camera further back doesn't jerk forward.
 * `pannable` is false when the whole extent already fits on screen.
 *
 * @param {number} w @param {number} h
 * @param {[number, number]} extent @param {number} playhead
 */
export function racePanBounds(w, h, extent, playhead) {
	const [e0, e1] = extent;
	const panMax = e1;
	const panMin = Math.min(
		panMax,
		Math.min(e0 + raceVisibleSpan(w, h), playhead)
	);
	return { panMin, panMax, pannable: panMax - panMin > 0.01 };
}

// x (year) + y (avg distance) tick furniture for one frame — shared by the
// static layout and the per-frame sweep/pan writers so animated axes read off
// the exact same rule as the static end-states.
function raceAxes(cam, yS, vLo, vHi, e1) {
	// every visible year gets its own horizontal 4-digit label — no thinning, no
	// width branch: PX_PER_YEAR guarantees the gap. Ticks travel with their years
	// during a pan, which is the whole point of a fixed scale.
	const x = [];
	const last = Math.floor(Math.min(cam.camRight, e1) + 1e-9);
	for (let yr = Math.ceil(cam.camLeft - 1e-9); yr <= last; yr++) {
		const pos = cam.xS(yr);
		// cull a label whose centre has left the plot (can happen for one frame
		// after a resize changes visibleSpan) so it never lands on the y ticks
		if (pos < cam.left - 0.5 || pos > cam.right + 0.5) continue;
		x.push({ pos, label: String(yr) });
	}
	// ticks label the raw data extent (not the padded scale domain) so the
	// numbers read as real values and sit just inside the plot
	const y = Array.from({ length: 5 }, (_, i) => {
		const v = vLo + ((vHi - vLo) * i) / 4;
		return { pos: yS(v), label: v.toFixed(2) };
	});
	return { x, xBase: cam.bottom + 10, y };
}

/**
 * @typedef {Object} RaceFrame
 * @property {[number, number]} extent content extent — fixed for a whole step
 * (and a whole animation phase), so the cast and the y-fit never shift under a
 * moving camera
 * @property {number} [playhead] year at the plot's right edge (default: extent
 * end); clamped to the camera's pan bounds
 * @property {number} [reveal] entry draw-on progress 0..1 across the VISIBLE
 * span (1 = fully drawn). Only the draw-on passes it.
 * @property {number[]} [highlight] the contenders this step is *about*. Any other
 * coloured contender drops to the background treatment (crowd radius and alpha,
 * its own colour kept), so the step reads as being about two lines instead of
 * four. Omitted → every coloured contender is foreground.
 * @property {number[]} [only] the exact cast, naming it instead of deriving it from
 * yCap (raceTrades lists the centres of its window). Baked into the step
 * descriptor, so the animated frames and the static settle draw the same ids.
 */

/**
 * Writes ONLY the ~15 race dot slots + 15 race trail slots for one frame,
 * directly into the live Float32 tweener buffers (no allocation, crowd/other
 * trails left untouched). Actors ride their curves; a dot whose playhead runs
 * past its data clamps to the curve endpoint.
 *
 * Trails are sampled over the CAMERA's interval, not the content extent:
 * sampleTrail lays its vertices uniformly in data-x, so sampling all 55 years
 * of raceFull would leave ~5 vertices on a phone's 6-year viewport and turn the
 * monotone curve into a visible polyline. Sampling [camLeft, playhead] puts
 * every vertex on screen — and, with the off-camera alpha gate below, keeps
 * every vertex inside the plot so no canvas clip region is needed.
 *
 * @param {Float32Array|Float64Array} attrsBuf live dot buffer (or a scratch clone)
 * @param {Float32Array|Float64Array} trailBuf live trail buffer (or a scratch clone)
 * @param {number} w
 * @param {number} h
 * @param {RaceFrame} frame
 * @param {number} [yCap] the state's contender cap — applied over the frame's
 * content extent, so cast membership is constant for a whole phase
 * @param {[number,number,number,number]} [fixedYFit] overrides the extent y-fit
 * with an explicit [vMin,vMax,vLo,vHi] so a sweep lands on the axis its state
 * settles onto instead of one derived from the phase's camera travel. Animators
 * pass their state's own fit (STATE_YFIT), or — across the raceRecent ->
 * raceTrades rewind, the one phase whose axis is meant to move — the fit
 * raceRewindYFit has resolved for this frame
 * @param {(id: number) => number} [alphaOf] per-actor alpha multiplier (0–1) for
 * this frame — the sweep animators use it to fade actors who join or leave the
 * cast across a phase, so the final frame's visibility matches the static state
 * it settles onto instead of everyone popping at the settle. Omitted → the
 * frame's own cast at full strength, everyone else hidden.
 * @returns {{axes: {x: {pos:number,label:string}[], xBase:number, y: {pos:number,label:string}[]}, cam: ReturnType<typeof raceCamera>, yS: (v:number)=>number, cast: Set<number>}}
 */
export function writeRaceSweepFrame(
	attrsBuf,
	trailBuf,
	w,
	h,
	frame,
	yCap = Infinity,
	fixedYFit = null,
	alphaOf = null
) {
	const [e0, e1] = frame.extent;
	const cast = raceStepCast(frame, yCap);
	const segsList = [...cast].map((id) => RACE_SEGS.get(id));
	const [vMin, vMax, vLo, vHi] = fixedYFit ?? raceYFit(segsList, e0, e1);
	const cam = raceCamera(w, h, frame.playhead ?? e1);
	const yS = (v) => lin(v, vMin, vMax, cam.top, cam.bottom);
	// draw-on: the lines unspool leftward from the right-hand end of the data
	const revealRight = Math.min(cam.camRight, e1);
	const revealFrom =
		revealRight - (revealRight - cam.camLeft) * (frame.reveal ?? 1);
	const highlight = frame.highlight ? new Set(frame.highlight) : null;
	for (const id of RACE_IDS) {
		const rgb = raceRGB(id);
		// "foreground" = a coloured contender this step is about. Everyone else
		// (the grey crowd, and the contenders a highlighted step isn't about) rides
		// the smaller, fainter background treatment.
		const major = rgb !== CROWD && (!highlight || highlight.has(id));
		const segs = RACE_SEGS.get(id);
		const slot = RACE_SLOT.get(id);
		const [ds, de] = RACE_RANGE.get(id);
		// an actor whose data has scrolled off the camera fades out over its last
		// visible year rather than popping — and once out, its dot must not be
		// placed (it would sit over the y ticks or in the name gutter, dragging a
		// collapsed 48-vertex trail with it).
		const onCamera = de >= cam.camLeft && ds <= cam.playhead;
		const edgeFade = Math.min(1, Math.max(0, de - cam.camLeft));
		const m =
			(alphaOf ? alphaOf(id) : cast.has(id) ? 1 : 0) *
			(onCamera ? edgeFade : 0);
		// the camera's left edge, not the extent's, is the draw floor: when the
		// viewport is wider than the step's extent (or a choreography has panned
		// behind it) the cast's lines simply extend further back rather than
		// leaving the axis empty. The extent still caps the right edge, so a step
		// never shows years past the one it is about.
		const sx1 = Math.min(cam.playhead, de, e1);
		const sx0 = Math.max(
			cam.camLeft,
			revealFrom,
			ds,
			// ...and a line stops where it leaves the y scale, entering the plot
			// through an edge like any line chart. That is what lets a step fit its
			// axis to the years it is ABOUT: the further history its camera happens
			// to cover goes off-scale instead of stretching the axis to hold it.
			curveEntry(segs, sx1, Math.max(cam.camLeft, ds), vMin, vMax)
		);
		// the dot rides the RIGHT END OF THE VISIBLE LINE, not the raw playhead:
		// when the playhead is within the actor's data the two coincide (dot pinned
		// to the plot's right edge), but once the playhead runs past the data the
		// dot stays glued to the curve's endpoint instead of floating ahead of a
		// shorter line.
		const dotYr = Math.min(Math.max(cam.playhead, ds), de);
		const dx = cam.xS(dotYr);
		const dy = yS(curveYAt(segs, dotYr));
		set(attrsBuf, id, dx, dy, major ? 5 : 3, rgb, (major ? 1 : 0.55) * m);
		if (sx1 > sx0) {
			sampleTrail(
				trailBuf,
				slot,
				segs,
				sx0,
				sx1,
				cam.xS,
				yS,
				(major ? 0.8 : 0.35) * m
			);
		} else {
			// nothing of this actor is drawn yet (or at all) → park on the dot
			collapseTrail(trailBuf, slot, dx, dy, (major ? 0.8 : 0.35) * m);
		}
	}
	return { axes: raceAxes(cam, yS, vLo, vHi, e1), cam, yS, cast };
}

// Era handovers long enough to read, and far enough apart not to collide, whose
// reign OVERLAPS the camera. Overlap rather than "starts inside the camera": at a
// fixed scale the camera can be narrower than a reign, and the reader needs to
// know whose stretch they are looking at — so a reign already in progress gets
// its callout anchored at the camera's left edge (still labelled with its real
// start year). The NOTE_MIN_GAP_YEARS check then keeps at most one of those, the
// longest-running one, instead of stacking every ongoing reign on the edge.
//
// The callout height alternates on the era's own index (not the pushed-note
// count) — with a camera-dependent filter, a count parity would make a note hop
// vertically as earlier notes pan out of view.
function raceNotes(cam, yS, extent, cast, minEraYears) {
	const [e0, e1] = extent;
	const notes = [];
	let lastAnchor = -Infinity;
	story.eras.forEach((era, i) => {
		const start = yearOf(era.start);
		const end = era.end ? yearOf(era.end) : e1;
		if (end - start < minEraYears) return;
		if (start < e0 || start > e1) return;
		if (end < cam.camLeft || start > cam.playhead) return;
		if (!cast.has(era.id)) return;
		const anchor = Math.max(start, cam.camLeft);
		if (anchor - lastAnchor < NOTE_MIN_GAP_YEARS) return;
		const series = clipSeries(story.raceSeries[era.id], e0, e1);
		if (!series) return;
		const vAt = valueAt(series, Math.max(anchor, e0));
		const text = `${rawNodes.nodes[era.id][1]} · ${Math.round(start)}`;
		// centre-anchored notes clip when their anchor sits within half a label
		// width of a plot edge, so clamp the centre inward to keep the whole label
		// inside the plot
		const hw = text.length * 3.4;
		const cx = Math.min(
			Math.max(cam.xS(anchor), cam.left + hw),
			cam.right - hw
		);
		notes.push({
			x: cx,
			y: yS(vAt) - (i % 2 === 0 ? 24 : 42),
			align: /** @type {const} */ ("center"),
			text
		});
		lastAnchor = anchor;
	});
	return notes;
}

/**
 * @param {{extent: [number, number], highlight?: number[]}} step the state's race
 * descriptor — its content extent (also the resting playhead: every race step
 * opens with the camera at the right-hand end of its data) and, optionally, the
 * contenders it is about (see RaceFrame.highlight)
 */
function raceLayout(
	step,
	minEraYears,
	yCap = Infinity,
	showEraNotes = true,
	fixedYFit = null
) {
	const { extent } = step;
	/** @type {import("../layout-shared.js").LayoutFn} */
	return function layoutRace(nodes, w, h, _edges, params) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		// park every node hidden at its scatter spot first; the frame writer then
		// places the race cast on their curves. Sharing that writer with the sweep
		// animators is what makes a settle byte-identical to its animation's last
		// frame — there is only one placer of race dots and trails.
		for (const n of nodes) {
			const [x, y] = scatterPosition(n, w, h);
			set(attrs, n.id, x, y, 2, CROWD, 0);
		}
		const { axes, cam, yS, cast } = writeRaceSweepFrame(
			attrs,
			trails,
			w,
			h,
			{
				...step,
				playhead: params?.playhead ?? extent[1],
				reveal: 1
			},
			yCap,
			fixedYFit
		);
		// race actors the cap excludes go back to their scatter spot (still alpha
		// 0), so the next chapter's arrival doesn't fly hidden dots in off the plot
		for (const id of RACE_IDS) {
			if (cast.has(id)) continue;
			const [x, y] = scatterPosition(nodes[id], w, h);
			set(attrs, id, x, y, 2, CROWD, 0);
		}
		const raceSlots = new Set(RACE_SLOT.values());
		TRAIL_META.forEach((meta, t) => {
			// the writer owns every race slot; the rest (career trio, cohort lines,
			// prediction diagonal) retract into the middle of the plot
			if (raceSlots.has(t)) {
				if (meta.id !== null && cast.has(meta.id)) trailDelays[t] = 250;
				return;
			}
			collapseTrail(trails, t, w / 2, cam.bottom, 0);
		});
		return {
			attrs,
			trails,
			trailDelays,
			notes: showEraNotes ? raceNotes(cam, yS, extent, cast, minEraYears) : [],
			axes
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

const OVERLAY = {
	xLabel: "Year",
	yLabel: "Avg distance"
};

// optional runtime override of the camera ({ playhead }); null while idle, so
// normal stepping keeps its resting playhead and stays on the reveal path
const params = (s) => s.raceView;

// Content extents. Width-independent by construction, so every constant derived
// from them (notably the per-state y-fits) can be computed at module load. The
// data ends in 2025, and each step's resting playhead is its extent's end, so
// the dots land on the plot's right edge with no dead strip.
export const RACE_RECENT_EXTENT = /** @type {[number, number]} */ ([
	2004, 2025
]);
// The decade whose centres raceTrades is about: everyone who held the crown across
// these years is its cast (RACE_TRADES_HOLDERS) and its axis is fitted to them
// here, so the swaps the camera pans through read against each other.
const RACE_TRADES_DECADE = /** @type {[number, number]} */ ([1994, 2004]);
// The step itself RESTS on 1994 — the rewind runs until the dots are sitting on
// the handover year, which is the moment it exists for. The camera is
// right-anchored, so the decade above ends up off-camera to the right and the
// run-up to 1994 is what's on screen; the cast climbs out of the axis back there,
// and those lines stop at the plot edge (curveEntry) instead of widening it.
export const RACE_TRADES_EXTENT = /** @type {[number, number]} */ ([
	1990, 1994
]);
export const RACE_FULL_EXTENT = /** @type {[number, number]} */ ([1970, 2025]);

// yCap for the states that pick their cast by "who gets near the top",
// re-exported alongside each layout (as STATE_YCAP in states.js) so the
// ScrollyVisual sweep/pan animators fit their y-scale the same way the static
// layout does — see writeRaceSweepFrame's yCap param. raceTrades doesn't have one:
// it names its cast outright (RACE_TRADES_HOLDERS).
const RACE_RECENT_YCAP = 2.3;

// waypoint year where raceRecent's own chained rewind (leg 1, played
// automatically as part of its arrival) stops; raceTrades' own arrival then
// plays leg 2, continuing the same camera pan on from here to its own resting
// year — so the "camera moving back in time" motion is split visibly across
// both steps instead of raceTrades being a no-op. The year itself is chosen for
// what leg 1 ENDS on: the camera parks a year after SLJ's 2006 takeover, so the
// crossing the step's copy is about is the last thing it leaves on the right edge.
export const RACE_REWIND_WAYPOINT_YEAR = 2007;

// The earliest year raceRecent's camera can ever DRAW. Its own extent starts at
// 2004, but the camera's left edge is the draw floor (see writeRaceSweepFrame),
// and its chained rewind parks the camera at RACE_REWIND_WAYPOINT_YEAR — so the
// fit has to cover one visible span behind that waypoint or the pre-2004 tails
// would run off the plot. raceVisibleSpan tops out near 10.8 years at the story
// column's 700px cap, so this floor holds on every viewport and the fit stays
// width-independent (i.e. still computable at module load). It costs nothing: the
// series are flat back to here, so this is the same axis as fitting from 2004.
const RACE_RECENT_REACH_FLOOR = 1996;

// The years raceTrades' RESTING axis is fitted to: the run-up its camera shows once
// the rewind has parked on 1994, and nothing else. Not the corridor the arrival pan
// travels through — the actors dip to ~2.14 out there in the 2000s, and reserving
// that on the resting axis left a third of the plot empty; raceRewindYFit pans the
// axis across the corridor instead. Not the mid-eighties either, where the field
// spreads over 0.8 — curveEntry ends those lines at the plot edge.
const RACE_TRADES_FIT = /** @type {[number, number]} */ ([1990, 1994]);

// The race descriptors each state exposes as `race` (STATE_RACE) — the frame
// animators in ScrollyVisual build their frames from these, so an animated frame
// and the static layout it settles onto agree on the extent, the highlight AND
// the cast.
// raceRecent is about SLJ taking over from Hackman, so only those two ride the
// foreground treatment there; De Niro and Welker stay on the chart in their own
// colours, dimmed.
export const RACE_RECENT_STEP = { extent: RACE_RECENT_EXTENT, highlight: [SLJ, HACKMAN] }; // prettier-ignore
export const RACE_FULL_STEP = { extent: RACE_FULL_EXTENT };

/**
 * The ids one state puts on the chart. A step either names its cast outright
 * (`only` — raceTrades lists the centres of its window) or takes everyone whose
 * line dips to its yCap. Every reader of a cast goes through here, so an animated
 * frame, its settle and the sweep animators' fade sets can't disagree.
 */
export function raceStepCast(step, yCap) {
	if (step.only) return new Set(step.only);
	return raceContenders(step.extent[0], step.extent[1], yCap);
}

/** everyone who held the centre during [year0, year1], in first-reign order */
function raceHolders(year0, year1) {
	const ids = new Set();
	for (const era of story.eras) {
		const start = yearOf(era.start);
		const end = era.end ? yearOf(era.end) : Infinity;
		if (end > year0 && start < year1) ids.add(era.id);
	}
	return [...ids];
}

// Everyone who was the centre of Hollywood between 1994 and 2004 — Walsh handing
// on in late 1994, then Starr, then Hackman, Welker and De Niro trading it. This
// is raceTrades' whole point, so its cast is this list rather than a yCap
// threshold that would both miss holders and admit non-holders.
const RACE_TRADES_HOLDERS = raceHolders(...RACE_TRADES_DECADE);
export const RACE_TRADES_STEP = {
	extent: RACE_TRADES_EXTENT,
	only: RACE_TRADES_HOLDERS
};

const raceCastSegs = (step, cap) =>
	[...raceStepCast(step, cap)].map((id) => RACE_SEGS.get(id));

// raceRecent's own y-fit: its cast over the years it can reach. The modern range
// is ~0.3 wide against the 1970s' ~1.6, so sharing raceTrades' axis (as this step
// used to) squashed SLJ and Hackman into the top fifth of the plot and hid the
// handover the step is about.
export const RACE_RECENT_YFIT = raceYFit(
	raceCastSegs(RACE_RECENT_STEP, RACE_RECENT_YCAP),
	RACE_RECENT_REACH_FLOOR,
	RACE_RECENT_EXTENT[1]
);

// raceTrades' resting y-fit: its centres across RACE_TRADES_FIT, i.e. what its
// camera actually holds once parked on 1994. raceFull fits itself from [1970, 2025]
// (yFit: null) and lands much wider, but that arrival is a plain tween — the dots
// and trails glide into the new scale rather than snapping to it.
export const RACE_TRADES_YFIT = raceYFit(
	raceCastSegs(RACE_TRADES_STEP),
	...RACE_TRADES_FIT
);

export const states = {
	raceRecent: {
		// no era-handover note here: the step's two actors are already named beside
		// their dots (labels below), so a callout would just repeat a name
		layout: raceLayout(
			RACE_RECENT_STEP,
			3,
			RACE_RECENT_YCAP,
			false,
			RACE_RECENT_YFIT
		),
		race: RACE_RECENT_STEP,
		yCap: RACE_RECENT_YCAP,
		yFit: RACE_RECENT_YFIT,
		// only the highlighted pair is named: the dimmed contenders read as
		// background, and a name on them would argue otherwise
		labels: [SLJ, HACKMAN],
		// names sit in the reserved right gutter, beside the right-edge dots;
		// ScrollyVisual's label de-collider keeps them apart when their dots land
		// close together
		labelDirs: {
			[SLJ]: "right",
			[HACKMAN]: "right"
		},
		overlay: OVERLAY,
		params,
		// entry choreography: draw the lines on when arriving from the rank chapter
		revealFrom: ["rankReveal"]
	},
	raceTrades: {
		// no yCap: the cast is named outright (RACE_TRADES_STEP.only)
		layout: raceLayout(
			RACE_TRADES_STEP,
			0.4,
			undefined,
			true,
			RACE_TRADES_YFIT
		),
		race: RACE_TRADES_STEP,
		yFit: RACE_TRADES_YFIT,
		// every centre of the window is named — that's what the step is showing, and
		// two of them (Walsh, Starr) hold it only briefly, so a name is the only way
		// to read their handover
		labels: RACE_TRADES_HOLDERS,
		labelDirs: Object.fromEntries(
			RACE_TRADES_HOLDERS.map((id) => [id, "right"])
		),
		overlay: OVERLAY,
		params,
		// rewind choreography: continue the camera pan further back (from
		// RACE_REWIND_WAYPOINT_YEAR, where raceRecent's own leg-1 pan stopped)
		// when arriving from it — leg 2 of one continuous back-through-time
		// motion split across both steps
		revealFrom: ["raceRecent"]
	},
	raceFull: {
		layout: raceLayout(RACE_FULL_STEP, 4),
		race: RACE_FULL_STEP,
		yFit: null,
		labels: [HACKMAN],
		labelDirs: { [HACKMAN]: "right" },
		overlay: OVERLAY,
		params
	}
};

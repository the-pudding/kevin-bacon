import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	CROWD,
	INK,
	SLJ,
	HACKMAN,
	set,
	scatterPosition,
	RACE_IDS,
	TRAIL_META,
	RACE_SLOT,
	sampleTrail,
	collapseTrail,
	clipSeries,
	monotoneSegments,
	curveYAt
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per race actor.
//
// The chart is monochrome by design: no line carries a hue, and nothing is
// identified by colour. What separates the actors a step is about from the field
// behind them is weight — an ink dot and a stronger line alpha against grey —
// plus the name labels in the right-hand gutter. Emphasis is therefore per STEP
// (see `subject` in writeRaceSweepFrame), not a property of an actor.
//
// The x axis is FIXED-SCALE: PX_PER_YEAR pixels per year on every race step and
// every viewport, so a year is always the same distance from its neighbour and
// every visible year gets its own label. The chart therefore holds more years
// than fit on screen, and each step is a *camera* over its content extent (see
// raceCamera) that the reader pans and the entry choreographies drive.
//
// BOTH axes follow that camera. The y axis is a fixed band under the centre-of-
// Hollywood record over the years currently on screen (raceWindowYFit) — so no
// step owns an axis, no animator carries one, and the axis pans with x. That is
// what makes an animated frame and the static layout it settles onto agree: they
// are the same pure function of (playhead, width, height), not two places passed
// the same constant.
//
// Three concepts, deliberately separate:
//   content extent  [e0,e1]  baked per state, width-independent — drives who the
//                            step SHOWS, era candidacy and the pan bounds, so
//                            panning never changes who is visible. (The cast
//                            itself is RACE_CAST on every race step — an actor a
//                            step doesn't show still rides their own curve at
//                            alpha 0, so the chapter only ever fades lines in and
//                            out in place.)
//   camera          playhead the year at the plot's right edge; with PX_PER_YEAR
//                            this fixes the x scale, and with the record above it
//                            fixes the y scale too.
//   reveal          0..1     the entry draw-on only: how much of the visible
//                            span has unspooled (right to left).
// ---------------------------------------------------------------------------

// px between consecutive years. The one dial for axis density: a horizontal
// 4-digit `.tick` label (0.65rem) is ~24px, so this leaves ~14px of clear space
// between neighbouring years. Paired with the name-gutter fraction in racePlot —
// those two decide how many years a phone can show at once, so buying more
// padding here costs visible years.
export const PX_PER_YEAR = 38;

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

// fractional year of an ISO date, so an era boundary mid-year lands between two
// of the annual data points rather than snapping to January
const yearOf = (iso) => {
	const [y, m, d] = iso.split("-").map(Number);
	return y + (m - 1) / 12 + (d - 1) / 365;
};

// ---------------------------------------------------------------------------
// The y scale: one record of where the centre of Hollywood sat, per year.
//
// The whole chapter reads its axis off this one table. Each year holds the
// avg-distance of whoever held the crown that year (story.eras x
// story.raceSeries — the same two inputs the old per-state fits read, tabulated
// per year instead of per era-slice). Derived here rather than baked into
// scrolly-story.json so a change never needs an ANALYSIS_REPO rebuild.
//
// What makes this the right table to hang the axis on: it is the chart's exact
// CEILING. No actor in the cast sits below the crown holder in any year
// (measured deficit 0.0000 across all 224 series), so the record's end of the
// scale needs no guesswork and nothing can clip off the top of the plot.
//
// The other end is RACE_Y_BAND below it, and it is deliberately tight: the chart
// holds the leaders and lets the rest of the field run off the bottom edge. The
// axis is that same band tall on every step and every viewport, which makes a
// vertical distance mean one thing across the whole chapter — the y counterpart
// of PX_PER_YEAR's fixed x scale. What moves is where the band SITS, riding the
// record down from ~2.82 in 1971 to ~2.09 in 2025.
// ---------------------------------------------------------------------------

const RACE_ANCHOR_FIRST = Math.floor(yearOf(story.eras[0].start));
const RACE_ANCHOR_LAST = Math.max(
	...RACE_IDS.map((id) => RACE_RANGE.get(id)[1])
);

/**
 * The record, indexed from RACE_ANCHOR_FIRST. Read through raceAnchorAt, never
 * directly — the camera reaches years the eras don't cover (raceFull's left edge
 * sits on 1970, and the first era only opens in December 1971).
 */
function buildRaceAnchor() {
	const values = new Float64Array(
		RACE_ANCHOR_LAST - RACE_ANCHOR_FIRST + 1
	).fill(Infinity);
	for (const era of story.eras) {
		const start = yearOf(era.start);
		const end = era.end ? yearOf(era.end) : Infinity;
		// year y belongs to a reign iff the reign overlaps [y, y+1)
		const from = Math.max(RACE_ANCHOR_FIRST, Math.floor(start));
		const to = Math.min(RACE_ANCHOR_LAST, Math.ceil(end) - 1);
		const segs = RACE_SEGS.get(era.id);
		for (let y = from; y <= to; y++) {
			const i = y - RACE_ANCHOR_FIRST;
			// curveYAt rather than a raw series lookup: it clamps, so the years a
			// holder reigned before their own series starts still get a value
			values[i] = Math.min(values[i], curveYAt(segs, y));
		}
	}
	// the eras are contiguous by construction, so a hole can only mean a rebuild
	// changed the timeline — fail loudly rather than draw an axis off Infinity
	const gap = values.findIndex((v) => !Number.isFinite(v));
	if (gap !== -1) {
		throw new Error(
			`scrolly race: no crown holder for ${RACE_ANCHOR_FIRST + gap}`
		);
	}
	return values;
}
const RACE_ANCHOR = buildRaceAnchor();

/**
 * The record at any year, clamped past both ends and interpolated in between.
 *
 * Interpolating is load-bearing, not a nicety: sampled only on whole years, the
 * window fit below would be a step function of the camera and the axis would
 * visibly tick every time a year crossed the plot edge mid-pan. The risk it
 * trades in — an actor's monotone cubic sagging below the straight line between
 * two record points — is what RACE_Y_PAD sizes the top of the plot to absorb, so
 * a dot can't slip out through the top of the band.
 */
function raceAnchorAt(year) {
	const t = Math.min(RACE_ANCHOR_LAST, Math.max(RACE_ANCHOR_FIRST, year));
	const i = Math.floor(t) - RACE_ANCHOR_FIRST;
	const f = t - Math.floor(t);
	if (f === 0 || i + 1 >= RACE_ANCHOR.length) return RACE_ANCHOR[i];
	return RACE_ANCHOR[i] + (RACE_ANCHOR[i + 1] - RACE_ANCHOR[i]) * f;
}

// How many lines the plot holds. THE dial for the chart: the crown runs along the
// top and this says how much of the chasing field comes with it — few enough that
// every dot on the plot can carry a name (see raceLabelIds).
//
// A COUNT rather than a distance, because the field's density around the record
// changes completely across the chapter: 8 lines is 0.069 of avg-distance in
// 2025, where SLJ has pulled clear, but only 0.038 in 2007, where a dozen actors
// were trading tenths of a hop. One fixed height therefore cannot hold the same
// chart at both ends of a single step's rewind — it shows one line at 2025 or
// fifty at 2007. Fitting to the count is what keeps the plot looking the same
// while the camera moves.
const RACE_Y_LINES = 6;

// Guards on the fitted band, for cameras where the count alone misbehaves: a
// dead heat near the record would collapse the axis onto the noise, and a year
// where the field is strung out would open it onto the whole crowd.
const RACE_Y_BAND_MIN = 0.015;
const RACE_Y_BAND_MAX = 0.16;

// The record's own sub-year wobble, which the top of the plot has to absorb:
// raceAnchorAt interpolates between whole years, and an actor's monotone cubic
// can sag under that chord — measured at most 0.0019 over the playheads a camera
// can reach (1980 onwards). 6% of the old half-unit axis covered that with room
// to spare; 12% of the tightest band this fit can pick does not, hence the
// absolute floor under it. (The 0.021 sag at 1971.55 is a LINE, never a dot: the
// pan floor keeps every playhead at 1980 or later, and a line above the plot is
// trimmed at the edge by curveEntry.)
const RACE_Y_PAD = 0.12;
const RACE_Y_PAD_MIN = 0.0025;

/**
 * Where the RACE_Y_LINES'th-closest line to the centre sits at one year — the
 * bottom of the plot, before the guards.
 *
 * Read at the camera's right edge only, so the band is a function of the
 * playhead and nothing else: the same year fits the same axis on a phone and a
 * desktop, where fitting over the visible window would give two different
 * charts. An actor whose series doesn't cover the year is skipped rather than
 * clamped — the chart isn't drawing them there either.
 *
 * Continuous in `year` (an order statistic of continuous curves), so the axis
 * eases rather than jumping when two actors swap places mid-pan.
 * @param {number} year
 */
function raceNthValue(year) {
	const vals = [];
	for (const id of RACE_IDS) {
		const [ds, de] = RACE_RANGE.get(id);
		if (year < ds || year > de) continue;
		vals.push(curveYAt(RACE_SEGS.get(id), year));
	}
	vals.sort((a, b) => a - b);
	return vals[Math.min(RACE_Y_LINES, vals.length) - 1];
}

/**
 * The axis for a camera window: the record over the years on screen at the top,
 * and enough room under it for RACE_Y_LINES of the chasing field, padded so a
 * dot riding an extreme doesn't touch the plot edge.
 *
 * The window is still scanned for the record's LOW point, which is what pins the
 * top of the plot and guarantees nothing clips off it. What it deliberately does
 * NOT do is stretch to the record's HIGH point: over a wide camera the crown
 * itself moves (0.06 across raceRecent's 11 years, 0.57 across raceFull's
 * 1970s), and fitting to that reopens the axis onto the whole field.
 *
 * This is the whole y-scale rule. Because it reads the CAMERA rather than a
 * step's content extent, no step owns an axis and nothing has to be handed
 * across a transition — the axis pans with x, and an animated frame agrees with
 * the settle it lands on by construction rather than by passing the same
 * constant to both.
 *
 * @returns {[number, number]} the padded scale domain [vMin, vMax]
 */
function raceWindowYFit(camLeft, camRight) {
	// both fractional edges, then every whole year between them (<= 11 of them at
	// any viewport width, so this is nothing per frame)
	let lo = Math.min(raceAnchorAt(camLeft), raceAnchorAt(camRight));
	for (let y = Math.ceil(camLeft); y <= Math.floor(camRight); y++) {
		lo = Math.min(lo, raceAnchorAt(y));
	}
	const band = Math.min(
		RACE_Y_BAND_MAX,
		Math.max(RACE_Y_BAND_MIN, raceNthValue(camRight) - lo)
	);
	const pad = Math.max(band * RACE_Y_PAD, RACE_Y_PAD_MIN);
	return [lo - pad, lo + band + pad];
}

/**
 * The cast: every tracked actor, on every race step. One shared cast is what
 * gives the chapter object constancy — an actor a step doesn't show still sits
 * on their own curve at alpha 0 rather than being taken off the chart, so
 * stepping between race steps only ever fades lines in and out in place.
 *
 * Which of them a given step SHOWS is a separate question — see
 * raceStepVisible.
 */
export const RACE_CAST = new Set(RACE_IDS);

// the race actors who count as contenders over [year0, year1]: their clipped
// series must exist and dip to (or below) yCap. Reached through
// raceStepVisible, never called directly by a state, and every caller passes a
// state's *content extent*, so what a step shows is fixed for the whole step
// (panning can move an actor off-camera, never out of the visible set).
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
 * Walking left from `to`, the first year where the curve is back inside
 * [vMin, vMax] — i.e. where the line's right-hand end belongs when the curve has
 * already run off scale at `to`. Returns `to` when it is in range to start with,
 * and null when nothing between `from` and `to` is on scale.
 *
 * The mirror of curveEntry, and the reason it exists: curveEntry assumes its `to`
 * is in range, so a step whose axis is fitted to a later window (raceTrades,
 * raceFull) needs the right-hand end trimmed first or the line — and the dot
 * riding it — would be drawn below the x axis.
 *
 * @param {ReturnType<typeof monotoneSegments>} segs
 * @param {number} to right end of the drawn range
 * @param {number} from furthest left the line could be drawn
 */
function curveExit(segs, to, from, vMin, vMax) {
	const inRange = (x) => {
		const v = curveYAt(segs, x);
		return v >= vMin && v <= vMax;
	};
	if (inRange(to)) return to;
	if (to <= from) return null;
	const STEPS = 48;
	let lastOut = to;
	for (let i = 1; i <= STEPS; i++) {
		const x = to - ((to - from) * i) / STEPS;
		if (inRange(x)) {
			// crossing is between x (in) and lastOut — bisect to the pixel
			let inX = x;
			for (let j = 0; j < 12; j++) {
				const mid = (inX + lastOut) / 2;
				if (inRange(mid)) inX = mid;
				else lastOut = mid;
			}
			return inX;
		}
		lastOut = x;
	}
	return null;
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
 * a step's own extent (the rewind pans raceRecent back to the waypoint). Since
 * the y fit is derived from this camera too, that purity now covers the whole
 * frame rather than just the x scale. Reader input is clamped at its source
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
 * How far a *reader* may pan a race step: never right of its content extent,
 * never so far left that the camera runs off the front of it, and never back
 * past the step's own `minPlayhead` (the earliest year it lets the reader put on
 * the right edge — raceFull stops at 1980 even though its lines run back to
 * 1970). `playhead` (the camera's current year) widens the floor, so a grab that
 * starts after a choreography has parked the camera further back doesn't jerk
 * forward. `pannable` is false when the whole extent already fits on screen.
 *
 * @param {number} w @param {number} h
 * @param {{extent: [number, number], minPlayhead?: number}} step
 * @param {number} playhead
 */
export function racePanBounds(w, h, step, playhead) {
	const panMax = step.extent[1];
	const panMin = Math.min(
		panMax,
		Math.min(raceFloorPlayhead(w, h, step), playhead)
	);
	return { panMin, panMax, pannable: panMax - panMin > 0.01 };
}

/**
 * The earliest playhead a step allows: far enough forward that the camera's left
 * edge still sits inside the extent, and no earlier than `minPlayhead` where the
 * step declares one. The camera-off-the-front rule wins when the viewport is
 * wide enough to make it the later of the two.
 *
 * @param {number} w @param {number} h
 * @param {{extent: [number, number], minPlayhead?: number}} step
 */
function raceFloorPlayhead(w, h, step) {
	const front = step.extent[0] + raceVisibleSpan(w, h);
	return step.minPlayhead === undefined
		? front
		: Math.max(front, step.minPlayhead);
}

// x (year) + y (avg distance) tick furniture for one frame — shared by the
// static layout and the per-frame sweep/pan writers so animated axes read off
// the exact same rule as the static end-states.
function raceAxes(cam, yS, vMin, vMax, e1) {
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
	// y ticks sit on round values and SLIDE, exactly as the x ticks travel with
	// their years — the same fixed-scale logic. Spacing the labels evenly across
	// the domain instead would pin them to fixed pixel rows and roll their digits
	// on every frame of a pan, which reads as churn rather than as a camera.
	//
	// The ladder runs down to hundredths because the band is only ~0.037 tall
	// padded: round tenths would leave most cameras with a single label, or none.
	// Same idiom as the sim race's Y_STEP.
	const step =
		[0.01, 0.02, 0.05, 0.1, 0.2].find((s) => (vMax - vMin) / s <= 5) ?? 0.5;
	const dec = step < 0.1 ? 2 : 1;
	const y = [];
	// stepped on an integer multiplier rather than by repeated addition, so the
	// tick values stay exactly on the round numbers they label
	for (let k = Math.ceil(vMin / step - 1e-9); k * step <= vMax + 1e-9; k++) {
		y.push({ pos: yS(k * step), label: (k * step).toFixed(dec) });
	}
	return { x, xBase: cam.bottom + 10, y };
}

/**
 * @typedef {Object} RaceFrame
 * @property {[number, number]} extent content extent — fixed for a whole step
 * (and a whole animation phase), so the cast never shifts under a moving camera
 * @property {number} [playhead] year at the plot's right edge (default: extent
 * end); clamped to the camera's pan bounds
 * @property {number} [reveal] entry draw-on progress 0..1 across the VISIBLE
 * span (1 = fully drawn). Only the draw-on passes it.
 * @property {number[]} [highlight] the actors this step is *about*: they get the
 * ink dot and the stronger line, everyone else it shows drops to the grey
 * background treatment, so the step reads as being about two lines rather than
 * its whole field. Omitted → everything the step shows is foreground, which is
 * only right for a step whose entire field is its subject (raceTrades).
 */

/**
 * Who a frame is ABOUT: exactly its `highlight` if it names one, otherwise
 * everything it shows (see RaceFrame.highlight).
 * @param {{highlight?: number[]}} frame
 * @param {Set<number>} visible
 */
export const raceSubjectOf = (frame, visible) =>
	frame.highlight ? new Set(frame.highlight) : visible;

/**
 * One actor's dot treatment on the race chart — the ONE definition of it, so
 * anything drawing a race dot outside this module (the rank list's collapsed
 * nodes, RankBars.svelte) is pixel-identical to what the canvas draws and the
 * HTML→canvas swap at the chapter handoff has nothing to give away.
 * `alpha` is the dot's settled alpha, before any per-frame multiplier.
 * @param {number} id
 * @param {Set<number>} subject who the frame is about (see raceSubjectOf)
 * @returns {{r: number, rgb: [number, number, number], alpha: number}}
 */
export function raceDotSpec(id, subject) {
	const major = subject.has(id);
	return {
		r: major ? 5 : 3,
		rgb: major ? INK : CROWD,
		alpha: major ? 1 : 0.55
	};
}

/**
 * Writes ONLY the race cast's dot slots + trail slots (one each per RACE_IDS)
 * for one frame, directly into the live Float32 tweener buffers (no allocation,
 * crowd/other trails left untouched). Actors ride their curves; a dot whose
 * playhead runs past its data clamps to the curve endpoint. The whole cast is
 * written every frame, visible or not — see the alpha fast path below.
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
 * @param {(id: number) => number} [alphaOf] per-actor alpha multiplier (0–1) for
 * this frame — the sweep animators use it to fade actors who join or leave the
 * cast across a phase, so the final frame's visibility matches the static state
 * it settles onto instead of everyone popping at the settle. Omitted → the
 * frame's own visible set at full strength, everyone else hidden.
 * @returns {{axes: {x: {pos:number,label:string}[], xBase:number, y: {pos:number,label:string}[]}, cam: ReturnType<typeof raceCamera>, yS: (v:number)=>number, visible: Set<number>}}
 */
export function writeRaceSweepFrame(
	attrsBuf,
	trailBuf,
	w,
	h,
	frame,
	yCap = Infinity,
	alphaOf = null
) {
	const [, e1] = frame.extent;
	const visible = raceStepVisible(frame, yCap);
	const cam = raceCamera(w, h, frame.playhead ?? e1);
	const [vMin, vMax] = raceWindowYFit(cam.camLeft, cam.camRight);
	const yS = (v) => lin(v, vMin, vMax, cam.top, cam.bottom);
	// draw-on: the lines unspool leftward from the right-hand end of the data
	const revealRight = Math.min(cam.camRight, e1);
	const revealFrom =
		revealRight - (revealRight - cam.camLeft) * (frame.reveal ?? 1);
	// who this step is ABOUT. A step that names a highlight gets exactly those;
	// one that doesn't is about everything it shows (raceTrades — every line on
	// it is one of its handover holders). Never the whole cast: on a step showing
	// a wide field, the ones it isn't about have to stay background.
	const subject = raceSubjectOf(frame, visible);
	for (const id of RACE_IDS) {
		// "foreground" = an actor this step is about. The chart carries no hue, so
		// this is the ONLY thing separating a line the reader should follow from
		// the field behind it: a darker dot, a bigger one, and a stronger line
		// alpha. Emphasis is per-step, not per-actor — the same actor is
		// foreground on the step about them and background everywhere else.
		const major = subject.has(id);
		const dot = raceDotSpec(id, subject);
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
			(alphaOf ? alphaOf(id) : visible.has(id) ? 1 : 0) *
			(onCamera ? edgeFade : 0);
		// the dot rides the RIGHT END OF THE VISIBLE LINE, not the raw playhead:
		// when the playhead is within the actor's data the two coincide (dot pinned
		// to the plot's right edge), but once the playhead runs past the data the
		// dot stays glued to the curve's endpoint instead of floating ahead of a
		// shorter line.
		const dotYr = Math.min(Math.max(cam.playhead, ds), de);
		const dotV = curveYAt(segs, dotYr);
		const dx = cam.xS(dotYr);
		const dy = yS(dotV);
		// a dot whose value has left the fitted scale is hidden outright rather than
		// pinned to the plot edge: it would otherwise be drawn below the x axis (or
		// above the plot, over the axis furniture), showing a value the chart isn't
		// showing. Its line already ends at that edge (curveExit).
		const dotM = dotV >= vMin && dotV <= vMax ? m : 0;
		set(attrsBuf, id, dx, dy, dot.r, dot.rgb, dot.alpha * dotM);
		// Fast path for an actor this ANIMATED frame can't show: keep the dot
		// placement (it is what holds them on their own curve) and skip the line
		// work below, which is the expensive part — curveEntry and curveExit each
		// scan and bisect the curve (~60 curveYAt calls apiece) and sampleTrail
		// resamples 48 vertices. Most of the cast is hidden on most steps, so this
		// is what keeps a wide cast affordable across the 4s sweep.
		//
		// Only for animated frames (alphaOf), never for a static layout. A static
		// layout is the geometry the trail TWEENER interpolates out of, so a hidden
		// line has to hold its true shape there: collapse it to a point and the
		// next step that reveals it would unspool it from that point instead of
		// fading it in where it already is. Mid-sweep there is nothing to tween
		// from — the sweep writes the live buffers every frame, and an actor at any
		// alpha above this floor takes the full path — so stale geometry for one
		// invisible frame can't be seen. Static layouts run once per state change,
		// so paying full price there costs nothing per frame.
		if (alphaOf && m <= 0.002) {
			collapseTrail(trailBuf, slot, dx, dy, 0);
			continue;
		}
		// the camera's left edge, not the extent's, is the draw floor: when the
		// viewport is wider than the step's extent (or a choreography has panned
		// behind it) the cast's lines simply extend further back rather than
		// leaving the axis empty. The extent still caps the right edge, so a step
		// never shows years past the one it is about.
		// ...and its right-hand end stops where the curve LEAVES the y scale, so a
		// line whose recent years sit below the fitted axis ends at the plot's
		// bottom edge instead of being drawn under the x axis. null = this actor is
		// entirely off scale over the drawn window, so nothing of it is shown.
		const drawFloor = Math.max(cam.camLeft, ds);
		const sx1 = curveExit(
			segs,
			Math.min(cam.playhead, de, e1),
			drawFloor,
			vMin,
			vMax
		);
		const sx0 =
			sx1 === null
				? 0
				: Math.max(
						cam.camLeft,
						revealFrom,
						ds,
						// ...and a line STARTS where it re-enters the y scale, entering the
						// plot through an edge like any line chart. That is what lets a step
						// fit its axis to the years it is ABOUT: the further history its
						// camera happens to cover goes off-scale instead of stretching the
						// axis to hold it.
						curveEntry(segs, sx1, drawFloor, vMin, vMax)
					);
		if (sx1 !== null && sx1 > sx0) {
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
			// nothing of this actor is drawn yet (or at all) → park on the dot, and
			// ride the dot's alpha so a collapsed trail doesn't sit off scale where
			// the dot itself is hidden
			collapseTrail(trailBuf, slot, dx, dy, (major ? 0.8 : 0.35) * dotM);
		}
	}
	return { axes: raceAxes(cam, yS, vMin, vMax, e1), cam, yS, visible };
}

/**
 * @param {{extent: [number, number], highlight?: number[]}} step the state's race
 * descriptor — its content extent (also the resting playhead: every race step
 * opens with the camera at the right-hand end of its data) and, optionally, the
 * contenders it is about (see RaceFrame.highlight)
 */
function raceLayout(step, yCap = Infinity) {
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
		const { axes, cam, visible } = writeRaceSweepFrame(
			attrs,
			trails,
			w,
			h,
			{
				...step,
				playhead: params?.playhead ?? extent[1],
				reveal: 1
			},
			yCap
		);
		// NOTE: the actors this step doesn't show are deliberately left where the
		// writer put them — on their own curve, at alpha 0 — rather than parked
		// back at their scatter spot. Parking them is what used to make a dot
		// travel the width of the canvas between two race steps to arrive, since
		// the tweener interpolates position while alpha goes 0 -> 1. The outbound
		// transition doesn't need the park either: raceFull shows the whole cast,
		// so by the time the story leaves the chapter there is nobody hidden left
		// to fly in from off the plot.
		const raceSlots = new Set(RACE_SLOT.values());
		TRAIL_META.forEach((meta, t) => {
			// the writer owns every race slot; the rest (career trio, cohort lines,
			// prediction diagonal) retract into the middle of the plot
			if (raceSlots.has(t)) {
				if (meta.id !== null && visible.has(meta.id)) trailDelays[t] = 250;
				return;
			}
			collapseTrail(trails, t, w / 2, cam.bottom, 0);
		});
		return {
			attrs,
			trails,
			trailDelays,
			axes
		};
	};
}

const OVERLAY = {
	xLabel: "Year",
	yLabel: "Avg distance"
};

// optional runtime override of the camera ({ playhead }); null while idle, so
// normal stepping keeps its resting playhead and stays on the reveal path
const params = (s) => s.raceView;

// Content extents. Width-independent by construction, so the constants derived
// from them (the per-state yCaps) can be computed at module load. The data ends
// in 2025, and each step's resting playhead is its extent's end, so the dots land
// on the plot's right edge with no dead strip.
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
// The earliest year raceFull lets the reader put on the plot's right edge. The
// extent — and so the x axis and the lines — still starts at
// 1970; this only stops the camera, which on a wide viewport already rests with
// 1970 at its left edge and 1980-ish on the right. It's the narrow viewports
// this exists for: a phone shows ~5.5 years, so without a floor the camera would
// park on 1975 and the reader would open the step on the emptiest stretch of the
// timeline.
const RACE_FULL_PAN_FLOOR = 1980;

// How close to the centre of Hollywood an actor has to come, somewhere in a
// step's extent, for that step to SHOW them (see raceStepCap). Expressed as a
// distance FROM the centre rather than an absolute avg-distance because the whole
// field drifts with the era: the crown itself moves from ~2.82 in 1971 to ~2.09
// in 2025, so one absolute cap cannot mean the same thing on two steps a decade
// apart — raceRecent's old hand-picked 2.3 would have shown raceTrades only 16 of
// its 224 lines, emptying it out to the five holders it is meant to sit behind.
// 0.213 is that same 2.3 read against the 2025 centre, so raceRecent's field is
// unchanged and raceTrades' is now derived the same way instead of falling out of
// a y-fit constant.
//
// It deliberately reaches seven times FURTHER than the axis does (RACE_Y_BAND):
// the field a step shows is not the field that fits on its plot. The lines in
// between are still drawn, entering and leaving through the bottom edge
// (curveEntry/curveExit), so the crowd presses up from under the floor instead
// of the chart emptying out to the handful of leaders on scale.
const RACE_YCAP_REACH = 0.213;

/** the yCap for a step: the centre at its resting year, plus the shared reach */
const raceStepCap = (step) => raceAnchorAt(step.extent[1]) + RACE_YCAP_REACH;

// waypoint year where raceRecent's own chained rewind (leg 1, played
// automatically as part of its arrival) stops; raceTrades' own arrival then
// plays leg 2, continuing the same camera pan on from here to its own resting
// year — so the "camera moving back in time" motion is split visibly across
// both steps instead of raceTrades being a no-op. The year itself is chosen for
// what leg 1 ENDS on: the camera parks on SLJ's 2006 takeover, so the crossing
// the step's copy is about is sitting on the right edge when the pan stops.
export const RACE_REWIND_WAYPOINT_YEAR = 2006;

// The race descriptors each state exposes as `race` (STATE_RACE) — the frame
// animators in ScrollyVisual build their frames from these, so an animated frame
// and the static layout it settles onto agree on the extent, the highlight AND
// the cast.
// raceRecent is about SLJ taking over from Hackman, so only those two ride the
// foreground treatment there; the rest of its field stays on the chart, dimmed.
export const RACE_RECENT_STEP = { extent: RACE_RECENT_EXTENT, highlight: [SLJ, HACKMAN] }; // prettier-ignore
// raceFull shows the whole cast, so it has to name its subject: without a
// highlight, `subject` falls back to everything visible and every line on the
// chart would claim the foreground at once. Hackman is the one it labels, so he
// is the one it emphasises — keep this list and the state's `labels` in step.
export const RACE_FULL_STEP = {
	extent: RACE_FULL_EXTENT,
	minPlayhead: RACE_FULL_PAN_FLOOR,
	highlight: [HACKMAN]
};

/**
 * The ids one state SHOWS: everyone whose line dips to its yCap somewhere in its
 * extent, i.e. everyone who comes onto its axis. Every reader goes through here,
 * so an animated frame, its settle and the sweep animators' fade sets can't
 * disagree.
 *
 * This is visibility, not membership: the cast itself is RACE_CAST on every race
 * step, and an actor this set leaves out still rides its own curve at alpha 0
 * (see writeRaceSweepFrame). That is what lets the reader step between race
 * steps without a hidden dot travelling across the canvas to arrive.
 */
export function raceStepVisible(step, yCap) {
	return raceContenders(step.extent[0], step.extent[1], yCap);
}

// How many names one camera contributes, how many cameras a step samples across
// its pan, and how many names the right-hand gutter holds in total. Only ~10 are
// ever on the plot at once (RACE_Y_LINES) — the rest of the pool sits at alpha 0
// waiting for the camera that puts its dot on scale.
const RACE_LABEL_PER_CAMERA = 12;
const RACE_LABEL_CAMERAS = 4;
const RACE_LABEL_MAX = 24;

/**
 * The names one race step carries, for the whole step.
 *
 * Every dot on the plot gets one, nearest the crown first: at this axis height
 * the chart holds only the actors near the centre, so naming the ones the step
 * is *about* and leaving the rest anonymous no longer says anything the weight
 * isn't already saying.
 *
 * Deliberately a CONSTANT per step rather than a function of the live camera.
 * The camera moves during an arrival (raceRecent rewinds to
 * RACE_REWIND_WAYPOINT_YEAR, raceFull to its pan floor) but story.raceView is
 * only published when that pan settles, so a camera-derived set changes in one
 * frame at the end of the animation — a dozen names appearing at once on a chart
 * that has just stopped moving. Fixing the set instead lets each name ride its
 * dot's alpha (see ScrollyVisual's labelAlpha): it fades up exactly when the pan
 * brings its dot onto the plot, and nothing happens at the settle.
 *
 * That is also why there is no scale test here, and why the set is sampled at
 * several cameras spread from the year the step rests on to its extent end,
 * round-robin so no one camera eats the budget: wherever the pan is, the names
 * for it are already declared, and the ones for the other cameras are sitting at
 * alpha 0 on their own dots. Sampling only the two ends left raceFull's
 * mid-1980s cameras with unnamed dots on the plot.
 *
 * The step's own subject is kept whatever the cap says — raceFull rests on a
 * camera where Hackman, the one line it is about, is not among the closest to
 * the centre.
 *
 * @param {{extent: [number, number], highlight?: number[]}} step
 * @param {Set<number>} visible who the step shows (raceStepVisible)
 * @param {number} restYear the year the step's camera comes to rest on
 */
function raceLabelIds(step, visible, restYear) {
	const end = step.extent[1];
	const years = [
		...new Set(
			Array.from({ length: RACE_LABEL_CAMERAS }, (_v, k) =>
				RACE_LABEL_CAMERAS === 1
					? restYear
					: restYear + ((end - restYear) * k) / (RACE_LABEL_CAMERAS - 1)
			)
		)
	];
	const ranked = years.map((year) => {
		const valued = [];
		for (const id of visible) {
			const [ds, de] = RACE_RANGE.get(id);
			const v = curveYAt(RACE_SEGS.get(id), Math.min(Math.max(year, ds), de));
			valued.push([id, v]);
		}
		valued.sort((a, b) => a[1] - b[1]);
		return valued.map(([id]) => id);
	});
	const ids = new Set(step.highlight ?? []);
	// the resting camera first and in full — that is where the reader actually
	// sits, so it gets named completely rather than sharing the budget with the
	// years the pan only passes through
	for (const id of ranked[0].slice(0, RACE_LABEL_PER_CAMERA)) ids.add(id);
	for (let k = 0; k < RACE_LABEL_PER_CAMERA && ids.size < RACE_LABEL_MAX; k++) {
		for (const rank of ranked.slice(1)) {
			if (ids.size >= RACE_LABEL_MAX) break;
			if (rank[k] !== undefined) ids.add(rank[k]);
		}
	}
	return [...ids];
}

/** the states' `labels`/`labelDirs` pair, so the two can't fall out of step */
function raceLabelSpec(step, visible, restYear) {
	const labels = raceLabelIds(step, visible, restYear);
	return {
		labels,
		// names sit in the reserved right gutter, beside the right-edge dots;
		// ScrollyVisual's label de-collider keeps them apart when their dots land
		// close together
		labelDirs: Object.fromEntries(labels.map((id) => [id, "right"]))
	};
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
// The holders are what this step is ABOUT, not the only thing it draws: the
// field carries over from raceRecent so the reader keeps the same chart rather
// than watching it empty out to five lines and refill.
export const RACE_TRADES_STEP = {
	extent: RACE_TRADES_EXTENT,
	highlight: RACE_TRADES_HOLDERS
};

// The two steps that pick their field by "who gets near the centre", derived
// through the one shared reach so they can't drift apart. raceFull has no cap —
// it shows the whole cast by design.
const RACE_RECENT_YCAP = raceStepCap(RACE_RECENT_STEP);
const RACE_TRADES_YCAP = raceStepCap(RACE_TRADES_STEP);

// What raceRecent shows, and who it is about. Derived here, once, because three
// places need to agree on them: the state's own layout, the arrival choreography
// (ScrollyVisual's raceEntry) and the rank list's collapsed nodes
// (RankBars.svelte), which are the same dots handed over as HTML.
export const RACE_RECENT_VISIBLE = raceStepVisible(
	RACE_RECENT_STEP,
	RACE_RECENT_YCAP
);
export const RACE_RECENT_SUBJECT = raceSubjectOf(
	RACE_RECENT_STEP,
	RACE_RECENT_VISIBLE
);

// raceFull's resting camera: 1970 at the plot's left edge, or RACE_FULL_PAN_FLOOR
// on its right edge where the viewport is too narrow to show both at once. Same
// rule as the pan floor by construction — resting anywhere the reader can't pan
// back to would re-open that floor (racePanBounds widens it to the live
// playhead) and undo the limit. This is the state's true resting playhead
// regardless of arrival path — the rewind's third leg (see ScrollyVisual's
// playRaceFullEntry) just animates getting there instead of snapping.
export function raceFullRestPlayhead(w, h) {
	return Math.min(RACE_FULL_EXTENT[1], raceFloorPlayhead(w, h, RACE_FULL_STEP));
}

export const states = {
	raceRecent: {
		layout: raceLayout(RACE_RECENT_STEP, RACE_RECENT_YCAP),
		race: RACE_RECENT_STEP,
		yCap: RACE_RECENT_YCAP,
		// its arrival rewinds the camera to the waypoint, so that is the year its
		// names are chosen for — they fade in as the pan reaches their dots
		...raceLabelSpec(
			RACE_RECENT_STEP,
			RACE_RECENT_VISIBLE,
			RACE_REWIND_WAYPOINT_YEAR
		),
		overlay: OVERLAY,
		params,
		// entry choreography: draw the lines on when arriving from the rank chapter
		revealFrom: ["rankReveal"]
	},
	raceTrades: {
		layout: raceLayout(RACE_TRADES_STEP, RACE_TRADES_YCAP),
		race: RACE_TRADES_STEP,
		yCap: RACE_TRADES_YCAP,
		// the step rests on its own extent end (1994, the handover), so one camera
		// covers it
		...raceLabelSpec(
			RACE_TRADES_STEP,
			raceStepVisible(RACE_TRADES_STEP, RACE_TRADES_YCAP),
			RACE_TRADES_EXTENT[1]
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
		layout: raceLayout(RACE_FULL_STEP, Infinity),
		race: RACE_FULL_STEP,
		// its camera rests on the pan floor (later on a wide viewport, where the
		// step's own extent end covers the modern years anyway)
		...raceLabelSpec(RACE_FULL_STEP, RACE_CAST, RACE_FULL_PAN_FLOOR),
		overlay: OVERLAY,
		params,
		// rewind choreography: continue the camera pan further back (leg 3, from
		// wherever raceTrades' own leg-2 pan parked) when arriving from it, all
		// the way to 1970 — see playRaceFullEntry
		revealFrom: ["raceTrades"]
	}
};

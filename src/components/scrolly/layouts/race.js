import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	INK,
	plotBottom,
	lin,
	CROWD,
	SLJ,
	HACKMAN,
	set,
	scatterPosition,
	RACE_IDS,
	TRAIL_META,
	RACE_SLOT,
	sampleTrail,
	collapseTrail,
	setTrailHighlight,
	clipSeries,
	monotoneSegments,
	curveYAt
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per race actor.
//
// The chart is monochrome by design: no line carries a hue, and no actor is
// identified BY a colour — the field is distinguished only by the name labels in
// the right-hand gutter. The one exception is not an exception to that rule: the
// actor LEADING at the camera's right edge is drawn in ink (see raceLeadBy and
// raceDotSpec), so being in front is visible without reading the gutter, and the
// crown visibly changes hands as the reader pans across the takeover. It is a
// property of the camera, not of the actor: pan back past 2005 and the ink is
// Hackman's.
//
// The x axis is FIXED-SCALE: PX_PER_YEAR pixels per year on every race step and
// every viewport, so a year is always the same distance from its neighbour and
// every visible year gets its own label. The chart therefore holds more years
// than fit on screen, and each step is a *camera* over its content extent (see
// raceCamera) that the reader pans and the entry choreographies drive.
//
// That holds for every year the DATA covers. Past it — the future strip on
// raceFuture — the axis is fitted instead, because five years at PX_PER_YEAR
// need more plot than the container has to give (see raceFutureScale, the one
// fitted scale in the chapter and the one place it branches on width).
//
// BOTH axes follow that camera (raceWindowYFit), and from 2004 on the y axis
// stops moving altogether: the years the reader spends the chapter in are drawn
// on two constants (the FIXED WINDOW below), and only the older cameras hang
// their axis off the centre-of-Hollywood record. Either way the axis is a pure
// function of (playhead, width, height) — no step owns one, no animator carries
// one — which is what makes an animated frame and the static layout it settles
// onto agree rather than two places being passed the same constant.
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
// 4-digit `.tick` label (0.65rem) is ~24px, so this leaves clear space between
// neighbouring years. Paired with the name-gutter fraction in racePlot — those
// two decide how many years a phone can show at once, so buying more padding
// here costs visible years.
//
// A plain module variable rather than a const: RacePxPerYearDev (DEV only)
// tunes it live through setRacePxPerYear. Kept as a bare variable, not a rune,
// so the per-frame draw loop below never touches reactive state — same
// rationale as devBandSegs.
let pxPerYear = 76;
export function setRacePxPerYear(px) {
	pxPerYear = px;
}
export function getRacePxPerYear() {
	return pxPerYear;
}

// Multiplies every choreographed race animation's duration (the entry draw-on
// and every rewind leg, in ScrollyVisual.svelte's runSweepPhase/rewindMs): 1 is
// the originally-tuned pace, >1 slows it down, <1 speeds it up. 1.5 is the
// shipped default — the widened x scale above (pxPerYear) made the rewind pans
// read as noticeably faster, so this pulls the pace back down.
//
// Same plain-module-variable pattern as pxPerYear: RaceSpeedDev (DEV only)
// tunes it live through setRaceSpeedScale. It never needs to bump a story
// revision or clear the layout cache the way pxPerYear does — nothing here is
// cached, each animation only reads the current scale once, when it starts.
let speedScale = 1.5;
export function setRaceSpeedScale(scale) {
	speedScale = scale;
}
export function getRaceSpeedScale() {
	return speedScale;
}

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

// The last year the DATA reaches. Three separate things hang off it: every
// step's content extent ends here, the historical x axis stops here (raceAxes),
// and the future strip starts here (raceFutureScale).
export const RACE_DATA_END = 2025;

// Asserted, not assumed, because the constant above is load-bearing three times
// over and every one of those uses reads it as "where the data ends" rather than
// "where THIS actor's data ends". An actor whose series stopped earlier would
// have their line correctly faded off the left edge by writeRaceSweepFrame's
// edgeFade, but the axis would still break at 2025 and raceFuture's dot column
// would quietly be missing them. Fail loudly rather than ship a chart that is
// wrong in a way nobody would look for. Same idiom as buildRaceAnchor's gap
// throw below.
{
	const ends = [...RACE_RANGE.values()].map(([, de]) => de);
	if (
		Math.min(...ends) !== RACE_DATA_END ||
		Math.max(...ends) !== RACE_DATA_END
	) {
		throw new Error(
			`scrolly race: every series must end at ${RACE_DATA_END} (got ${Math.min(...ends)}-${Math.max(...ends)})`
		);
	}
}

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
// band is a function of the year alone, so a given year fits the same axis on a
// phone and on a desktop. What moves is where the band SITS, riding the record
// down from ~2.82 in 1971 to ~2.09 in 2025.
//
// All of which describes the years BEFORE 2004. From there to the present the
// axis is two constants and reads neither table (see the fixed window below);
// the record is still what those constants are sized against.
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

// ---------------------------------------------------------------------------
// The takeover: the point where SLJ's line crosses Hackman's and the crown
// changes hands. The chapter's whole claim ("Samuel L. Jackson took the crown")
// happens at one intersection, and the reader has to be pointed at it.
//
// Solved against the SAME monotone segments the chart draws, rather than read
// off story.eras, and this is the load-bearing part: raceSeries is sampled on
// whole years, so the drawn curves cross at 2005.11 while the era record puts
// the real handover at 2006-02-17 (a whole ~0.9yr, ~68px, further right, by
// which point the two lines have visibly separated). A marker on the era date
// would not be on the crossing it points at. Derived rather than baked so it
// can never drift from the lines: change the series and the marker follows.
// ---------------------------------------------------------------------------
const RACE_TAKEOVER = solveTakeover();

/** the year SLJ's curve crosses Hackman's, and the value they cross at */
function solveTakeover() {
	const a = RACE_SEGS.get(SLJ);
	const b = RACE_SEGS.get(HACKMAN);
	// SLJ trails Hackman at the low end and leads at the high end, so the bracket
	// holds exactly one crossing; f is monotone enough over it for a bisection
	const f = (yr) => curveYAt(a, yr) - curveYAt(b, yr);
	let lo = 2004;
	let hi = 2007;
	// a rebuild that moves the handover out of the bracket must fail loudly
	// rather than park the marker on an arbitrary year, same as buildRaceAnchor
	if (f(lo) <= 0 || f(hi) >= 0) {
		throw new Error("scrolly race: no SLJ/Hackman crossing in 2004–2007");
	}
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (f(mid) > 0) lo = mid;
		else hi = mid;
	}
	const year = (lo + hi) / 2;
	return { year, value: curveYAt(a, year) };
}

// The record's own sub-year wobble, which the top of the plot has to absorb:
// raceAnchorAt interpolates between whole years, and an actor's monotone cubic
// can sag under that chord — measured at most 0.0019 over the playheads a camera
// can reach (1980 onwards). 12% of the tightest band the curve below reaches
// doesn't cover that, hence the absolute floor under it. (The 0.021 sag at
// 1971.55 is a LINE, never a dot: the pan floor keeps every playhead at 1980 or
// later, and a line above the plot is trimmed at the edge by curveEntry.)
const RACE_Y_PAD = 0.12;
const RACE_Y_PAD_MIN = 0.0025;

// ---------------------------------------------------------------------------
// The band: how much of the chasing field comes along with the crown.
//
// THE dial for the chart. The crown runs along the top of the plot and this says
// how far below it the bottom edge sits — few enough lines that every dot on the
// plot can carry a name (see raceLabelIds), enough that the step's story has
// company on screen.
//
// It runs 1980 to RACE_Y_FIXED_FROM and no further: the years after that are the
// fixed window's, and it reads no band at all.
//
// It is a CURVE over those years rather than one constant, because the field's
// density around the record changes completely across them: 0.068 of avg-distance
// puts three lines on the plot in 1980, where the crown ran well clear of a
// sparse field, and twenty-four in the mid-2000s, where a dozen actors were
// trading hundredths. One height for both ends would rest raceFull on a
// near-empty chart. It is also not a per-year table: a handful of control points
// run through the same monotone cubic the chart's own lines use is continuous in
// `year` for free, which the axis needs — sampled per year, the band would be a
// step function of the camera and the axis would tick every time a year crossed
// the plot edge mid-pan.
//
// The points are drawn by eye against the live chart, not fitted: an earlier
// rule fitted the band to a fixed COUNT of lines at the playhead, which tracked
// the crowd's noise instead of the story and made the plot breathe on every pan.
// RaceYBandDev.svelte is the editor they were drawn in; it seeds itself from
// this table and hands an edited one back through setRaceDevBands.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The fixed window: 2004 to the present, where the axis holds still.
//
// PRD P-08-1. Every camera from RACE_Y_FIXED_FROM on is drawn on two constants
// instead of the fit below, so raceRecent's rewind — 2025 back to the 2006
// takeover, the chapter's one animated camera — moves the LINES and nothing
// else. No band height can buy that from the fit: the record the fit hangs off
// falls 0.05 across those years, 57% of a plot, so the axis slides with it
// however tightly the plot is scaled.
//
// The two bounds ARE the domain, taken with no RACE_Y_PAD — they read as the
// plot's edges, which is what puts the y ticks (0.05 apart at this height) on
// 2.05 and 2.20 exactly. Their cost is at the top: the record's best year in the
// window is 2.0839, so ~23% of the plot is always empty above the crown, and at
// the 2006 end the crown rides 57% of the way down. That trade is what
// RaceYBandDev's "min y" slider is for — it moves this top edge live
// (setRaceDevFixedYMin) and touches nothing else.
//
// Below the window the fit takes back over, RAMPED in over
// RACE_Y_FIXED_FADE..RACE_Y_FIXED_FROM rather than switched: raceFull's entry
// pans from 2006 back through 2004 to ~1980, and a hard swap would tick the axis
// half a plot height in one frame mid-pan. Ramping keeps the whole rule a pure
// function of the camera, which is what still leaves no step owning an axis and
// nothing to hand across a transition.
// ---------------------------------------------------------------------------

/** first year of the window; raceRecent's extent starts here too */
export const RACE_Y_FIXED_FROM = 2004;
/** ...and where, panning back, the camera fit has fully taken over again */
const RACE_Y_FIXED_FADE = 2000;
/** the window's bottom edge (the HIGHER avg distance of the two) */
export const RACE_Y_FIXED_MAX = 2.2;
/** its top edge, and the shipped value of the dev slider below */
export const RACE_Y_FIXED_MIN = 2.05;

/**
 * The window's live top edge. A plain module variable rather than a rune for the
 * same reason as devBandSegs: the per-frame draw path reads it.
 */
let raceYFixedMin = RACE_Y_FIXED_MIN;

/**
 * Dev hook: move the fixed window's top edge — the LOWER of its two
 * avg-distances, so the higher edge of the plot. Called only from
 * RaceYBandDev.svelte, which only mounts under `npm run dev`.
 * @param {number} v
 */
export function setRaceDevFixedYMin(v) {
	raceYFixedMin = v;
}

// The first year a camera can put on its right edge: every step's playhead is
// clamped to at least this by raceFloorPlayhead, and the band is read at the
// right edge only, so nothing earlier is reachable. (RACE_FULL_PAN_FLOOR is
// this same year, declared here because it is needed at module init.)
export const RACE_BAND_FIRST = 1980;
// ...and the last year it covers, which is where the fixed window starts. Past
// that the band would describe a plot the axis no longer draws.
export const RACE_BAND_LAST = RACE_Y_FIXED_FROM;

/** the band's control points, [year, band], ascending in year */
export const RACE_Y_BAND_POINTS = /** @type {[number, number][]} */ ([
	[1980, 0.1121],
	[1985, 0.0993],
	[1990, 0.0913],
	[1993, 0.0897],
	[1996, 0.0825],
	[2000, 0.0756],
	[RACE_BAND_LAST, 0.0699]
]);
const RACE_Y_BAND_SEGS = monotoneSegments(RACE_Y_BAND_POINTS);

/**
 * A curve the dev editor has installed in place of the table, as monotone
 * segments. Null in every normal run; written ONLY by setRaceDevBands.
 */
let devBandSegs = null;

/**
 * Dev hook: install an edited band curve (or null to go back to the table).
 * Called only from RaceYBandDev.svelte, which only mounts under `npm run dev`.
 * @param {[number, number][] | null} points [year, band], ascending in year
 */
export function setRaceDevBands(points) {
	devBandSegs = points && points.length > 1 ? monotoneSegments(points) : null;
}

/**
 * The band at any year. `curveYAt` clamps past both ends of the control points,
 * so the years outside the table hold its terminal value rather than
 * extrapolating off the chart.
 * @param {number} year
 */
function raceBandAt(year) {
	return curveYAt(devBandSegs ?? RACE_Y_BAND_SEGS, year);
}

/**
 * The axis for a camera window, and the whole y-scale rule: the fixed window's
 * two constants from 2004 on, the camera fit below RACE_Y_FIXED_FADE, and a ramp
 * between the two over the four years in between.
 *
 * Because every branch of it reads the CAMERA rather than a step's content
 * extent, no step owns an axis and nothing has to be handed across a transition
 * — and an animated frame agrees with the settle it lands on by construction
 * rather than by passing the same constant to both.
 *
 * @returns {[number, number]} the scale domain [vMin, vMax]
 */
function raceWindowYFit(camLeft, camRight) {
	if (camRight >= RACE_Y_FIXED_FROM) return [raceYFixedMin, RACE_Y_FIXED_MAX];
	const fit = raceCameraYFit(camLeft, camRight);
	if (camRight <= RACE_Y_FIXED_FADE) return fit;
	const t =
		(camRight - RACE_Y_FIXED_FADE) / (RACE_Y_FIXED_FROM - RACE_Y_FIXED_FADE);
	return [
		fit[0] + (raceYFixedMin - fit[0]) * t,
		fit[1] + (RACE_Y_FIXED_MAX - fit[1]) * t
	];
}

/**
 * The axis a camera window fits itself: the record over the years on screen at
 * the top, and the right edge's band (raceBandAt) of the chasing field under it,
 * padded so a dot riding an extreme doesn't touch the plot edge. What the chart
 * ran on everywhere before the fixed window, and still runs on behind it.
 *
 * The window is scanned for the record's LOW point, which is what pins the top of
 * the plot and guarantees nothing clips off it. What it deliberately does NOT do
 * is stretch to the record's HIGH point: over a wide camera the crown itself
 * moves (0.57 across raceFull's 1970s), and fitting to that reopens the axis onto
 * the whole field.
 *
 * @returns {[number, number]} the padded scale domain [vMin, vMax]
 */
function raceCameraYFit(camLeft, camRight) {
	// both fractional edges, then every whole year between them (<= 11 of them at
	// any viewport width, so this is nothing per frame)
	let lo = Math.min(raceAnchorAt(camLeft), raceAnchorAt(camRight));
	for (let y = Math.ceil(camLeft); y <= Math.floor(camRight); y++) {
		lo = Math.min(lo, raceAnchorAt(y));
	}
	// the bottom hangs off the RIGHT EDGE's own record, not off `lo`: the band is
	// tabulated per year (raceBandAt), so it has to be measured from the same
	// year's anchor for the table to mean one thing. The record mostly falls, so
	// the two agree on most cameras; where it rises inside the window (1981-85,
	// 1990-93) `lo` sits below the right edge and only the TOP opens up, which is
	// exactly what keeps the earlier crown on the plot.
	const bottom = raceAnchorAt(camRight) + raceBandAt(camRight);
	const pad = Math.max((bottom - lo) * RACE_Y_PAD, RACE_Y_PAD_MIN);
	return [lo - pad, bottom + pad];
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

/**
 * The trail slots the chapter owns — one line per cast member. Everything a
 * race frame writes lives in RACE_CAST (dots) and these (lines); every other
 * slot on the canvas belongs to whatever chapter the reader came from.
 */
export const RACE_TRAIL_SLOTS = new Set(RACE_SLOT.values());

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
 * is in range, so a step whose axis is fitted to a later window (raceFull) needs
 * the right-hand end trimmed first or the line — and the dot riding it — would
 * be drawn below the x axis.
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
//
// Exported because the DRAW pass needs it too: the frame writer below keeps
// every dot it places inside this rectangle, but the tweener that carries the
// reader between two race steps does not (see ScrollyVisual's drawScene).
export function racePlot(w, h) {
	const left = MARGIN + 14;
	const innerRight = w - MARGIN - 6;
	return {
		top: MARGIN + 10,
		bottom: plotBottom(h),
		left,
		right: left + ((innerRight - left) * 2) / 3,
		// The full inner width, gutter included — where the DATA's plot stops
		// reserving room for names. raceFuture's future strip runs out to here
		// instead of to `right`: its dot column is pinned at the left, so the
		// right-hand third that exists to keep right-edge names off the canvas
		// edge is empty on that step, and the strip is the one thing with any use
		// for it. Nothing about the data's own geometry reads this — the camera,
		// the y fit, the dots and the trails all stop at `right`.
		fullRight: innerRight
	};
}

/** years that fit across the plot at the fixed scale — a function of width only */
export function raceVisibleSpan(w, h) {
	const plot = racePlot(w, h);
	return (plot.right - plot.left) / pxPerYear;
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
	const visibleSpan = (plot.right - plot.left) / pxPerYear;
	const camLeft = playhead - visibleSpan;
	return {
		...plot,
		visibleSpan,
		camLeft,
		camRight: playhead,
		playhead,
		xS: (yr) => plot.left + (yr - camLeft) * pxPerYear
	};
}

/**
 * The latest year a step lets the camera rest on, and so — since a race step's
 * right edge is its playhead — its resting camera and its pan ceiling. The
 * mirror of `minPlayhead`, and the two together are the window of years this
 * step's camera may sit on.
 *
 * It used to be the step's last x tick as well, all three off one field. That
 * came apart with the future strip: the historical axis now stops where the
 * DATA stops (RACE_DATA_END, see raceAxes) and the years past it are ticked on
 * the strip's own fitted scale (raceFutureTicks), so a step's camera ceiling and
 * its last label are no longer the same question.
 *
 * Defaults to the content extent's end: every step but raceFuture stops where
 * its data does.
 *
 * `tailPx` is the other way to answer it, and raceFuture is the only step that
 * uses it: instead of naming the year on the RIGHT edge it says how many PX of
 * history to keep behind the data's own end at the LEFT, and the resting
 * playhead follows the viewport from there. That is what the strip needs — it is
 * anchored on where the data ends, not on where the timeline does, so it gets
 * whatever width is left over rather than a fixed five years the plot may have
 * no room for. It also makes the step unpannable by construction rather than by
 * coincidence: raceFloorPlayhead returns the same year, so racePanBounds is left
 * with nothing between its two ends. Precedent for a width-dependent camera
 * rest: raceFullRestPlayhead.
 *
 * @param {number} w @param {number} h
 * @param {{extent: [number, number], maxPlayhead?: number, tailPx?: number}} step
 */
export function raceMaxPlayhead(w, h, step) {
	if (step.tailPx !== undefined) {
		return RACE_DATA_END - step.tailPx / pxPerYear + raceVisibleSpan(w, h);
	}
	return step.maxPlayhead ?? step.extent[1];
}

/**
 * How far a *reader* may pan a race step: never past its `maxPlayhead`, never so
 * far left that the camera runs off the front of its extent, and never back
 * past the step's own `minPlayhead` (the earliest year it lets the reader put on
 * the right edge — raceFull stops at 1980 even though its lines run back to
 * 1970). `playhead` (the camera's current year) widens the floor, so a grab that
 * starts after a choreography has parked the camera further back doesn't jerk
 * forward. `pannable` is false when the whole extent already fits on screen —
 * which a step can also declare outright by setting min and max to the same
 * year, as raceFuture does.
 *
 * @param {number} w @param {number} h
 * @param {{extent: [number, number], minPlayhead?: number, maxPlayhead?: number}} step
 * @param {number} playhead
 */
export function racePanBounds(w, h, step, playhead) {
	const panMax = raceMaxPlayhead(w, h, step);
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
 * @param {{extent: [number, number], minPlayhead?: number, tailPx?: number}} step
 */
function raceFloorPlayhead(w, h, step) {
	// a step that pins its camera by its LEFT edge has exactly one legal
	// playhead, so its floor is its ceiling — which is what leaves racePanBounds
	// with nothing between its two ends and reports the step as unpannable
	if (step.tailPx !== undefined) return raceMaxPlayhead(w, h, step);
	const front = step.extent[0] + raceVisibleSpan(w, h);
	return step.minPlayhead === undefined
		? front
		: Math.max(front, step.minPlayhead);
}

// ---------------------------------------------------------------------------
// The takeover callout: the ring on the crossing, a note that says what
// happened, and a leader tying the two together. The chapter's whole claim is
// this one intersection, so the claim is set on the plot rather than behind a
// click.
//
// The note sits BELOW the ring, never beside it, and that is the load-bearing
// choice. Beside reads better on a wide canvas — but the ring is not parked, it
// travels: it enters at the plot's LEFT edge as the rewind pans back and slides
// right until it rests at ~68px from the right edge, so a note held left of it
// is behind it for most of the pan and the leader points backwards. And on a
// narrow canvas beside is unreachable at any playhead: plot.left + a legible
// box + a leader's worth of gap already overshoots where the ring rests. Below
// is one rule at every width and every playhead, and it keeps the leader
// vertical-dominated, which is what stops it ever reading as reversed.
// ---------------------------------------------------------------------------

const RING_R = 5.5; // half the ring's 11px box (see .takeover-mark)
const NOTE_MAX_W = 220; // px, the widest the note box gets
const NOTE_EDGE = 4; // clearance from the plot's left edge
// clearance from the right edge. Wider than NOTE_EDGE on purpose, not for
// symmetry's sake: every actor's dot is pinned to the plot's right edge at the
// playhead, so that column occupies [cam.right, cam.right + r] with r up to 4,
// and a 4px gap puts the note's last characters under the dots.
const DOT_CLEAR = 10;
const NOTE_DROP = 48; // ring centre -> note top, where there is room for it
const NOTE_MIN_DROP = 24; // ...and the least it may shrink to
// The tallest the note is assumed to render: five lines of its 16px line box.
// An assumption rather than a measurement because this runs in the frame
// writer, which has no DOM — it only has to be generous enough that the drop
// clamp below keeps the last line off the x-axis row.
const NOTE_MAX_H = 80;
const ARROW_INSET = 12; // how far in from the note's corners the leader may start
const ARROW_LIFT = 6; // gap between the note's top edge and the leader
const ARROW_HEAD = 7; // head length, px
const ARROW_HEAD_W = 3; // head half-width, px
// The last px of travel at each plot edge, over which the callout fades. The
// ring alone could pop — an 11px circle blinking off reads as a cull. A 220px
// block of prose doing it reads as a bug, and there is no CSS out-transition
// here to lean on ({#if} unmounts it).
const CALLOUT_FADE = 24;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * The takeover callout's pixel geometry for one frame, or null when the crossing
 * is off camera (the reader has panned past it, or raceRecent is still resting
 * on 2025 before the Start rewind brings it in). Culled on the same rule as the
 * x ticks below, so it leaves the plot rather than sliding over the y axis.
 *
 * Everything comes off `cam` (which carries the plot rect) and `yS`, so it
 * tracks both the camera and the per-camera y fit without being told about
 * either.
 */
function raceTakeoverCallout(cam, yS) {
	const rx = cam.xS(RACE_TAKEOVER.year);
	if (rx < cam.left - 0.5 || rx > cam.right + 0.5) return null;
	const ry = yS(RACE_TAKEOVER.value);

	const width = Math.min(
		NOTE_MAX_W,
		cam.right - cam.left - NOTE_EDGE - DOT_CLEAR
	);
	// centred under the ring, then held inside the plot. The two bounds meet
	// exactly when the plot is too narrow for NOTE_MAX_W (the width above is what
	// makes them meet rather than cross), so the note pins to the left edge
	// instead of inverting.
	const nx = clamp(
		rx - width / 2,
		cam.left + NOTE_EDGE,
		cam.right - DOT_CLEAR - width
	);
	// The drop shortens rather than letting the note run onto the x-axis row —
	// the one thing that bites on a landscape phone, where the plot is only ~170px
	// tall and the scrubber's year slider sits just under it.
	const drop = clamp(
		cam.bottom - 8 - NOTE_MAX_H - ry,
		NOTE_MIN_DROP,
		NOTE_DROP
	);
	const ny = ry + drop;

	// The leader leaves the note's top edge at the point nearest the ring, which
	// is what lets one rule serve every case: the ring far to the right of the box
	// (wide canvas, at rest), directly above it (narrow canvas), or a little to
	// its left (a reader scrubbing raceFull toward the plot's left edge).
	const ax = clamp(rx, nx + ARROW_INSET, nx + width - ARROW_INSET);
	const ay = ny - ARROW_LIFT;
	const dx = rx - ax;
	const dy = ry - ay;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	// stop short of the ring so the head touches the circle, not its centre
	const back = RING_R + 3;
	const bx = rx - ux * back;
	const by = ry - uy * back;

	return {
		ring: { x: rx, y: ry },
		note: { x: nx, y: ny, width },
		arrow: {
			ax,
			ay,
			bx,
			by,
			// the head's two trailing corners; the tip is (bx, by)
			h1x: bx - ux * ARROW_HEAD - uy * ARROW_HEAD_W,
			h1y: by - uy * ARROW_HEAD + ux * ARROW_HEAD_W,
			h2x: bx - ux * ARROW_HEAD + uy * ARROW_HEAD_W,
			h2y: by - uy * ARROW_HEAD - ux * ARROW_HEAD_W
		},
		alpha: clamp(Math.min(rx - cam.left, cam.right - rx) / CALLOUT_FADE, 0, 1)
	};
}

// ---------------------------------------------------------------------------
// The future strip: the ground past the end of the data, on its own x scale.
//
// The historical axis is FIXED (pxPerYear) and this one is FITTED, and this is
// the only place in the chapter the two rules differ. It has to be. The strip is
// five years wide, so at 76px/yr it needs 380px of plot before any data fits
// beside it — about 1050px of canvas, which the 700px `#scrolly` container makes
// unreachable at every viewport. That is what made the old step render its whole
// cast at ~12% opacity on a desktop and nothing at all on a phone (PRD P-11-1).
// Fitting the five years to whatever plot width is LEFT once the camera has
// parked is what lets the strip exist at 320px.
//
// Deliberately NOT folded into raceCamera.xS as a piecewise branch. raceCamera
// is pure in (playhead, w, h) and that purity is what makes an animated frame
// and its settle pixel-identical; keying xS off an animated frontier would put
// the animation back inside the scale. It would also silently reroute every
// consumer of xS — dot placement, sampleTrail, collapseTrail, the takeover ring
// — for anything that ever reaches past RACE_DATA_END. Nothing does today, and
// the Gen-Z steps (PRD P-21-1/P-22-1) are asking to. Read here by the future
// ticks and the band, and by nothing else.
// ---------------------------------------------------------------------------

// The far end of the strip. A SCALE bound, not a camera bound — no playhead ever
// reaches it, which is why it is no longer named for a year the camera rests on.
export const RACE_FUTURE_END = 2030;

/** @param {{left: number, right: number, xS: (yr: number) => number}} cam */
function raceFutureScale(cam) {
	const x0 = cam.xS(RACE_DATA_END);
	// out to `fullRight`, the whole inner width: the name gutter the data's plot
	// reserves is dead space on this step (its dot column is at the LEFT), and
	// the strip is the one thing with any use for it. See racePlot.
	const right = cam.fullRight;
	const pitch = (right - x0) / (RACE_FUTURE_END - RACE_DATA_END);
	return { x0, right, pitch, xS: (yr) => x0 + (yr - RACE_DATA_END) * pitch };
}

/**
 * Every year label on the race chart, in two digits.
 *
 * One formatter for the whole chapter — the fixed-scale historical axis and the
 * future strip's fitted one both go through it, so the axis reads the same
 * either side of the break and the strip's years are not a special case. It also
 * buys the strip its density: a 4-digit label is 30.7px wide against 15.4px for
 * two, and the strip is only ~97px across on a phone at the narrow end.
 *
 * Lossy on purpose, so nothing may key off the text: ticks carry a numeric
 * `year` alongside.
 */
const raceTickLabel = (yr) => String(yr).slice(2);

// Tick label box width, measured against a real `.tick` element rather than
// estimated: the face is Atlas Typewriter at 0.65rem, so it is monospaced at
// 7.68px per character and a 2-digit year renders 15.4px wide. Centred with
// translateX(-50%), so a pair of neighbours needs half of each box plus a gap.
const TICK_W_YY = 16;
// The last px of a line's travel at the plot's left edge, over which it fades
// out instead of popping. Short: it is a cull softener, not an effect.
const RACE_EDGE_FADE_PX = 12;

// The narrowest pitch two adjacent 2-digit strip labels may sit on. Tight — a
// 3px gap — on purpose, and the exact value earns its keep: a 375px viewport
// gives a pitch of 19.33, so anything above that flips the strip to a stride of
// 2 and drops the reader from four future years to two. In a monospaced face at
// this size the digits stay separable at 3px.
const FUTURE_TICK_MIN_PITCH = TICK_W_YY + 3;
// ...and the clearance the FIRST strip label needs from the present's, which the
// stride knows nothing about because that label belongs to the other scale. Half
// of each box plus a hair, so the two can never touch.
const FUTURE_TICK_BOUNDARY = TICK_W_YY + 2.5;
// How far the strip's years have faded by the horizon. They recede with the
// block they sit under rather than staying flat under a fading box — the
// uncertainty is the point, and a crisp 2030 under a dissolved right edge reads
// as a rendering slip. Not 0: the horizon year still has to be readable.
const FUTURE_TICK_HORIZON_ALPHA = 0.45;

/**
 * The strip's ticks: the years the frontier has reached, on the strip's own
 * scale, in TWO DIGITS.
 *
 * Two digits rather than four is a legibility trade, not a style: the strip is
 * ~97px wide at a 375px viewport, and five 4-digit labels need ~170px there. It
 * also marks the years apart from the present's full 2025, which is the one
 * measured year on the axis.
 *
 * This is the one place in the chapter that BRANCHES ON WIDTH, and the branch is
 * honest rather than a lapse. The historical axis below needs no thinning
 * because pxPerYear guarantees the gap — but that guarantee is a property of a
 * FIXED scale and a fitted one cannot make it: the pitch here is ~63px on a
 * desktop, ~19px at a 375px viewport, ~12px at 320px. So the rule is keyed off
 * the COMPUTED pitch, never off the viewport, which keeps it a pure function of
 * the same geometry every other number on the frame comes from.
 *
 * Counted DOWN from RACE_FUTURE_END so the far end — the year the block's label
 * is about — is the one tick that survives every thinning, and so a stride of 2
 * gives 30/28/26 rather than 29/27.
 *
 * The stride spaces the strip's ticks against EACH OTHER; the boundary needs its
 * own rule, because the tick at RACE_DATA_END is the last of the historical axis
 * and sits at x0 on the fixed scale, four digits wide. A stride wide enough for
 * the strip can still drop its first year on top of it, so anything crowding
 * that label is dropped outright — the present owns that space, and the block's
 * own label already says what the ground to its right is.
 */
function raceFutureTicks(cam, frontier) {
	if (!(frontier > RACE_DATA_END)) return [];
	const { x0, right, pitch, xS } = raceFutureScale(cam);
	// no strip at all: no room to the right of the data's column
	if (pitch <= 0) return [];
	const stride =
		pitch >= FUTURE_TICK_MIN_PITCH
			? 1
			: pitch * 2 >= FUTURE_TICK_MIN_PITCH
				? 2
				: RACE_FUTURE_END - RACE_DATA_END;
	const span = RACE_FUTURE_END - RACE_DATA_END;
	const out = [];
	for (let yr = RACE_FUTURE_END; yr > RACE_DATA_END + 1e-9; yr -= stride) {
		if (yr > frontier + 1e-9) continue;
		const pos = xS(yr);
		if (pos < cam.left - 0.5 || pos > right + 0.5) continue;
		// ...and not on top of the boundary label (see above)
		if (pos - x0 < FUTURE_TICK_BOUNDARY) continue;
		out.push({
			pos,
			label: raceTickLabel(yr),
			year: yr,
			alpha: 1 - (1 - FUTURE_TICK_HORIZON_ALPHA) * ((yr - RACE_DATA_END) / span)
		});
	}
	return out.reverse();
}

// The block's label sits ABOVE its top edge rather than inside the corner, and
// that is a requirement rather than a preference: the crown's own name renders
// at x(RACE_DATA_END) + 7 (labelDirs "right"), and on a landscape phone the plot
// is only ~190px tall, which would put that name's line box inside the label's.
// The ~42px of headroom above the plot is empty at every width.
const BAND_LABEL_LIFT = 16;

/**
 * The future block's pixel geometry for one frame, or null when the strip is
 * shut (every step but raceFuture, and the whole of its first leg).
 *
 * No `alpha`, and that is the difference from raceTakeoverCallout: the callout
 * needs one because it TRAVELS and culls at each plot edge, where a block of
 * prose popping off reads as a bug. This exists only on a parked camera, so it
 * never travels and never culls — it is simply absent instead. Its two opacity
 * concerns are both CSS: the mount fade on the wrapper, and the right-edge
 * gradient masked onto the box. A frontier-driven ramp, if one is ever wanted,
 * has to ride the CHILD for the reason spelled out on the callout's markup — an
 * animation with fill-mode `both` outranks an inline opacity for good.
 */
function raceFutureBand(cam, frontier) {
	if (!(frontier > RACE_DATA_END)) return null;
	const { x0, right, pitch, xS } = raceFutureScale(cam);
	if (pitch <= 0 || x0 > right - 1) return null;
	return {
		x: x0,
		y: cam.top,
		width: Math.min(xS(frontier), right) - x0,
		height: cam.bottom - cam.top,
		label: { x: x0 + 2, y: cam.top - BAND_LABEL_LIFT }
	};
}

// x (year) + y (avg distance) tick furniture for one frame — shared by the
// static layout and the per-frame sweep/pan writers so animated axes read off
// the exact same rule as the static end-states.
//
// `frontier` is how far the future strip has opened; the years past the data get
// their positions from its fitted scale (raceFutureTicks) and land in the SAME
// `x` array, so one renderer draws both and the two can never drift apart.
function raceAxes(cam, yS, vMin, vMax, frontier) {
	// every visible year gets its own horizontal 4-digit label — no thinning, no
	// width branch: PX_PER_YEAR guarantees the gap. Ticks travel with their years
	// during a pan, which is the whole point of a fixed scale.
	const x = [];
	// The historical axis stops where the DATA stops. This used to run to the
	// step's timeline end (raceMaxPlayhead), which is what put 2026-2030 on the
	// plot at 76px each and made raceFuture five years of empty ground instead of
	// a labelled block. Those years now belong to the strip's own scale, never to
	// pxPerYear. Every other step is unaffected: their timeline end IS the data's.
	const last = Math.floor(Math.min(cam.camRight, RACE_DATA_END) + 1e-9);
	for (let yr = Math.ceil(cam.camLeft - 1e-9); yr <= last; yr++) {
		const pos = cam.xS(yr);
		// cull a label whose centre has left the plot (can happen for one frame
		// after a resize changes visibleSpan) so it never lands on the y ticks
		if (pos < cam.left - 0.5 || pos > cam.right + 0.5) continue;
		// TWO DIGITS on every race step, so the axis reads the same everywhere and
		// the strip's fitted years are not a special case (see raceFutureTicks).
		// `year` rides along because a label is now lossy — anything keying off a
		// particular year reads this, never the text.
		x.push({ pos, label: raceTickLabel(yr), year: yr });
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
	// the strip's years join the historical ones in one array, so they inherit
	// `.tick.tick-x` and `xBase` verbatim and sit on the same row by construction
	return {
		x: [...x, ...raceFutureTicks(cam, frontier)],
		xBase: cam.bottom + 10,
		y
	};
}

/**
 * @typedef {Object} RaceFrame
 * @property {[number, number]} extent content extent — fixed for a whole step
 * (and a whole animation phase), so the cast never shifts under a moving camera
 * @property {number} [playhead] year at the plot's right edge (default: extent
 * end); clamped to the camera's pan bounds
 * @property {number} [reveal] entry draw-on progress 0..1 across the VISIBLE
 * span (1 = fully drawn). Only the draw-on passes it.
 * @property {number} [frontier] the year the future strip has opened out to
 * (default RACE_DATA_END, i.e. shut). Read ONLY by the strip's ticks and its
 * block — no dot, trail, label, takeover callout or y fit sees it, which is what
 * lets the strip carry its own fitted x scale without a second scale leaking
 * into the chart. raceStepVisible, raceAnchorAt and raceBandAt all clamp at
 * RACE_DATA_END, so a frontier past it changes nothing they compute.
 * @property {number[]} [highlight] the actors this step is *about*: they are
 * guaranteed a name label even if they aren't among the nearest-to-centre cut
 * (see ScrollyVisual's raceLabelCut). It buys a NAME and nothing else — the only
 * ink on the chart belongs to whoever leads at the camera, which is a property
 * of the frame rather than of the step.
 */

/**
 * One actor's dot treatment on the race chart — the ONE definition of it, so
 * anything drawing a race dot outside this module (the rank list's collapsed
 * nodes, RankBars.svelte) is pixel-identical to what the canvas draws and the
 * HTML→canvas swap at the chapter handoff has nothing to give away.
 *
 * Two treatments, not one per step: the actor leading at the camera's right edge
 * carries the ink, everyone else the grey field treatment. `lead` is therefore a
 * question about a FRAME (who is in front right now), never about a step — the
 * chart still carries no per-step emphasis.
 *
 * `alpha` is the dot's settled alpha, before any per-frame multiplier.
 * @param {boolean} [lead] this actor is the crown holder at the frame's camera
 * @returns {{r: number, rgb: [number, number, number], alpha: number}}
 */
export function raceDotSpec(lead = false) {
	return lead
		? { r: 4, rgb: INK, alpha: 1 }
		: { r: 3, rgb: CROWD, alpha: 0.55 };
}

// ---------------------------------------------------------------------------
// The lead: who is in front.
//
// Always the LOWEST dot on the plot, which is the same question as "who holds
// the crown at the camera's right edge" — the axis is hung under the record
// (raceWindowYFit), and no actor sits below the crown holder in any year, so
// nearest-the-top and in-front are one order. Reading it as a minimum over the
// dots the frame has already placed rather than off story.eras is what keeps the
// ink on the line the reader can see is in front, including through the
// crossing: the drawn curves change places at 2005.11, ~0.9yr before the era
// record's handover date (the same discrepancy solveTakeover exists for).
//
// Because the two lines are coincident at that crossing, the swap has nothing to
// show — the ink passes across at the one pixel where the dots meet.
// ---------------------------------------------------------------------------

/**
 * The eligible actor with the lowest value. Split out so the per-frame writer
 * and the static readers (RACE_RECENT_LEAD, for the rank handoff) share one
 * definition of "in front" rather than two that can drift.
 * @param {(id: number) => boolean} eligible
 * @param {(id: number) => number} valueOf
 * @returns {number} the actor's id, or -1 when nobody is eligible
 */
function raceLeadBy(eligible, valueOf) {
	let lead = -1;
	let best = Infinity;
	for (const id of RACE_IDS) {
		if (!eligible(id)) continue;
		const v = valueOf(id);
		if (v < best) {
			best = v;
			lead = id;
		}
	}
	return lead;
}

/** an actor's dot value at `year` — their curve, clamped to their own data */
function raceDotValueAt(id, year) {
	const [ds, de] = RACE_RANGE.get(id);
	return curveYAt(RACE_SEGS.get(id), Math.min(Math.max(year, ds), de));
}

/**
 * Who leads at a resting camera, with no frame to read. The camera gates a
 * frame applies (on scale, on camera) are left out deliberately: they can only
 * ever remove an actor whose data has scrolled away behind the camera, and an
 * actor stranded in the past cannot be under a crown that only falls with time.
 *
 * @param {number} year the camera's right edge
 * @param {Set<number>} [visible] the step's visible set, when it caps its field
 */
export function raceLeadAt(year, visible) {
	return raceLeadBy(
		(id) => !visible || visible.has(id),
		(id) => raceDotValueAt(id, year)
	);
}

// Scratch for writeRaceSweepFrame's two passes, indexed by position in RACE_IDS
// (which is RACE_SLOT's index). Module-scope and reused every frame for the same
// reason pxPerYear is a plain variable: nothing in the per-frame path allocates.
const dotYrs = new Float64Array(RACE_IDS.length);
const dotVs = new Float64Array(RACE_IDS.length);
const dotMs = new Float64Array(RACE_IDS.length);
const lineMs = new Float64Array(RACE_IDS.length);

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
 * @returns {{axes: {x: import("../layout-shared.js").Tick[], xBase:number, y: import("../layout-shared.js").Tick[]}, takeover: import("../layout-shared.js").TakeoverCallout|null, band: import("../layout-shared.js").FutureBand|null, frontier: number, cam: ReturnType<typeof raceCamera>, yS: (v:number)=>number, visible: Set<number>, lead: number}}
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
	// How far the future strip has opened. Read only by the strip's own ticks and
	// its block — no dot, trail, label, takeover callout or y fit ever sees it,
	// which is what lets the strip carry a second x scale with nothing leaking
	// into the chart. Shut by default, so every other step and both static
	// layouts get no strip without having to say so.
	const frontier = frame.frontier ?? RACE_DATA_END;
	const visible = raceStepVisible(frame, yCap);
	const cam = raceCamera(w, h, frame.playhead ?? raceMaxPlayhead(w, h, frame));
	const [vMin, vMax] = raceWindowYFit(cam.camLeft, cam.camRight);
	const yS = (v) => lin(v, vMin, vMax, cam.top, cam.bottom);
	// draw-on: the lines unspool leftward from the right-hand end of the data
	const revealRight = Math.min(cam.camRight, e1);
	const revealFrom =
		revealRight - (revealRight - cam.camLeft) * (frame.reveal ?? 1);
	// Pass one places every dot; pass two writes them. They are separate only so
	// the LEAD can be picked in between: it is the lowest dot the frame shows, so
	// nothing can be inked until every dot has been placed.
	for (let i = 0; i < RACE_IDS.length; i++) {
		const id = RACE_IDS[i];
		const [ds, de] = RACE_RANGE.get(id);
		// an actor whose data has scrolled off the camera fades out over the last
		// few px of its travel rather than popping — and once out, its dot must not
		// be placed (it would sit over the y ticks or in the name gutter, dragging
		// a collapsed 48-vertex trail with it).
		//
		// Measured in PX off the plot's left edge, not in years off camLeft. Those
		// are the same rule when the ramp is a year long, but only then — and
		// raceFuture parks its camera RACE_FUTURE_TAIL_PX inside the data, which is
		// a fraction of a year. In years, that step's whole cast came out at the
		// fraction of full strength the tail happened to be (~12% on the widest
		// canvas, 0 on a phone): PRD P-11-1. In px it is a property of where the
		// line's end actually sits, which is what the fade was always about.
		const onCamera = de >= cam.camLeft && ds <= cam.playhead;
		const endX = cam.xS(Math.min(de, e1));
		const edgeFade = clamp((endX - cam.left) / RACE_EDGE_FADE_PX, 0, 1);
		lineMs[i] =
			(alphaOf ? alphaOf(id) : visible.has(id) ? 1 : 0) *
			(onCamera ? edgeFade : 0);
		// the dot rides the RIGHT END OF THE VISIBLE LINE, not the raw playhead:
		// when the playhead is within the actor's data the two coincide (dot pinned
		// to the plot's right edge), but once the playhead runs past the data the
		// dot stays glued to the curve's endpoint instead of floating ahead of a
		// shorter line.
		dotYrs[i] = Math.min(Math.max(cam.playhead, ds), de);
		dotVs[i] = curveYAt(RACE_SEGS.get(id), dotYrs[i]);
		// a dot whose value has left the fitted scale is hidden outright rather than
		// pinned to the plot edge: it would otherwise be drawn below the x axis (or
		// above the plot, over the axis furniture), showing a value the chart isn't
		// showing. Its line already ends at that edge (curveExit).
		dotMs[i] = dotVs[i] >= vMin && dotVs[i] <= vMax ? lineMs[i] : 0;
	}
	// The crown at this camera. Picked from the dots the frame is actually
	// SHOWING — reusing dotM rather than testing the same gates again is what
	// keeps "inked" and "on the plot" from ever disagreeing, so a frame can never
	// ink a dot it is hiding.
	const lead = raceLeadBy(
		(id) => dotMs[RACE_SLOT.get(id)] > 0,
		(id) => dotVs[RACE_SLOT.get(id)]
	);
	for (let i = 0; i < RACE_IDS.length; i++) {
		const id = RACE_IDS[i];
		const isLead = id === lead;
		const dot = raceDotSpec(isLead);
		const segs = RACE_SEGS.get(id);
		const slot = RACE_SLOT.get(id);
		const [ds, de] = RACE_RANGE.get(id);
		const m = lineMs[i];
		const dotM = dotMs[i];
		const dx = cam.xS(dotYrs[i]);
		const dy = yS(dotVs[i]);
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
		// (no highlight to write on this path: a frame that can't show an actor
		// can't have picked them as its lead, and collapseTrail zeroes the channel)
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
			sampleTrail(trailBuf, slot, segs, sx0, sx1, cam.xS, yS, 0.35 * m);
		} else {
			// nothing of this actor is drawn yet (or at all) → park on the dot, and
			// ride the dot's alpha so a collapsed trail doesn't sit off scale where
			// the dot itself is hidden
			collapseTrail(trailBuf, slot, dx, dy, 0.35 * dotM);
		}
		// after the line is written, never before — every trail writer zeroes this
		// channel. Written for the whole cast every frame (0 for the field), so the
		// ink can only be on one line and can never linger on one it has left.
		setTrailHighlight(trailBuf, slot, isLead ? 1 : 0);
	}
	return {
		axes: raceAxes(cam, yS, vMin, vMax, frontier),
		takeover: raceTakeoverCallout(cam, yS),
		band: raceFutureBand(cam, frontier),
		// the RESOLVED frontier, so a caller snapshotting the live frame (see
		// ScrollyVisual's renderFrontier) reads what was drawn rather than what
		// was asked for
		frontier,
		cam,
		yS,
		visible,
		lead
	};
}

/**
 * @param {{extent: [number, number], highlight?: number[]}} step the state's race
 * descriptor — its content extent (also the resting playhead: every race step
 * opens with the camera at the right-hand end of its data) and, optionally, the
 * contenders it is about (see RaceFrame.highlight)
 */
function raceLayout(step, yCap = Infinity) {
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
		const { axes, takeover, band, cam, visible } = writeRaceSweepFrame(
			attrs,
			trails,
			w,
			h,
			{
				...step,
				playhead: params?.playhead ?? raceMaxPlayhead(w, h, step),
				// the step's own resting frontier, so a COLD MOUNT, a RESIZE and the
				// reduced-motion snap all land on the fully-open strip with nothing
				// left to play — the same contract a STATE_ENTRY's last leg has to
				// meet, discharged here by construction rather than by an animation
				frontier: params?.frontier ?? step.frontier ?? RACE_DATA_END,
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
		TRAIL_META.forEach((meta, t) => {
			// the writer owns every race slot; the rest (career trio, cohort lines,
			// prediction diagonal) retract into the middle of the plot
			if (RACE_TRAIL_SLOTS.has(t)) {
				if (meta.id !== null && visible.has(meta.id)) trailDelays[t] = 250;
				return;
			}
			collapseTrail(trails, t, w / 2, cam.bottom, 0);
		});
		return {
			attrs,
			trails,
			trailDelays,
			axes,
			takeover,
			band
		};
	};
}

const OVERLAY = {
	xLabel: "Year",
	yLabel: "Remoteness",
	// these render inside writing-mode: vertical-rl + rotate(180deg) (see
	// ScrollyVisual's .y-hint), which visually rotates → to ↑ and ← to ↓
	yTopLabel: "lower →",
	yBottomLabel: "← higher"
};

// optional runtime override of the camera ({ playhead }); null while idle, so
// normal stepping keeps its resting playhead and stays on the reveal path
const params = (s) => s.raceView;

// Content extents. Width-independent by construction, so the constants derived
// from them (the per-state yCaps) can be computed at module load. A step's
// resting playhead defaults to its extent's end, so the dots land on the plot's
// right edge with no dead strip — unless the step pins its camera by the left
// edge instead, as raceFuture does (see RACE_FUTURE_TAIL_PX).
// Shares its first year with RACE_Y_FIXED_FROM, which is what puts this step's
// whole camera range inside the fixed window: the rewind pans back to 2006 and
// the reader can pan on to the extent's own front, and neither moves the axis.
export const RACE_RECENT_EXTENT = /** @type {[number, number]} */ ([
	RACE_Y_FIXED_FROM,
	RACE_DATA_END
]);
export const RACE_FULL_EXTENT = /** @type {[number, number]} */ ([
	1970,
	RACE_DATA_END
]);
// How much history raceFuture keeps on the plot behind its dot column, in PX.
//
// A pixel budget rather than a year, and it used to be a whole year (76px). That
// left a visible gap between the plot's left edge and the present, which reads
// as a missing label — the reader asks where the year before this one went. A
// short stub of each actor's own curve is all the tail is for.
//
// Pixels rather than years also means the camera lands on a FRACTIONAL year, so
// the historical axis emits exactly one label (the present) with no special
// casing: `Math.ceil` of a fractional camLeft is already the present.
//
// Shortening it below a year is what forced `edgeFade` to become a pixel ramp
// too — at a year it was the same length as the tail, and the whole cast sat at
// full opacity by luck of that coincidence. See writeRaceSweepFrame.
const RACE_FUTURE_TAIL_PX = 24;
// The earliest year raceFull lets the reader put on the plot's right edge. The
// extent — and so the x axis and the lines — still starts at
// 1970; this only stops the camera, which on a wide viewport already rests with
// 1970 at its left edge and 1980-ish on the right. It's the narrow viewports
// this exists for: a phone shows ~5.5 years, so without a floor the camera would
// park on 1975 and the reader would open the step on the emptiest stretch of the
// timeline. Shares its value with RACE_BAND_FIRST, which is what makes the band
// table's range exactly the set of years a camera can rest on.
const RACE_FULL_PAN_FLOOR = RACE_BAND_FIRST;

// How close to the centre of Hollywood an actor has to come, somewhere in a
// step's extent, for that step to SHOW them (see raceStepCap). Expressed as a
// distance FROM the centre rather than an absolute avg-distance because the whole
// field drifts with the era: the crown itself moves from ~2.82 in 1971 to ~2.09
// in 2025, so one absolute cap cannot mean the same thing on two steps a decade
// apart. 0.213 is raceRecent's old hand-picked 2.3 read against the 2025 centre,
// so its field is unchanged from before this was derived as a reach.
//
// It deliberately reaches seven times FURTHER than the axis does (RACE_Y_BAND):
// the field a step shows is not the field that fits on its plot. The lines in
// between are still drawn, entering and leaving through the bottom edge
// (curveEntry/curveExit), so the crowd presses up from under the floor instead
// of the chart emptying out to the handful of leaders on scale.
const RACE_YCAP_REACH = 0.213;

/** the yCap for a step: the centre at its resting year, plus the shared reach */
const raceStepCap = (step) => raceAnchorAt(step.extent[1]) + RACE_YCAP_REACH;

// waypoint year where raceRecent's rewind leg (fired by the Start button) stops;
// raceFull's own arrival then continues the same camera pan on from wherever it
// parked, all the way to raceFull's resting year — so the "camera moving back in
// time" motion is split visibly across the two steps instead of happening all at
// once. The year itself is chosen for what the first leg ENDS on: the camera
// parks on SLJ's 2006 takeover, so the crossing raceRecent's second copy is about
// is sitting on the right edge when the pan stops.
export const RACE_REWIND_WAYPOINT_YEAR = 2006;

// The race descriptors each state exposes as `race` (STATE_RACE) — the frame
// animators in ScrollyVisual build their frames from these, so an animated frame
// and the static layout it settles onto agree on the extent, the highlight AND
// the cast.
// raceRecent is about SLJ taking over from Hackman, so those two are the names
// it guarantees; the ink is separate and belongs to whoever leads at the camera.
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
// raceFuture: raceFull's chart with the camera run forward to the present, and a
// fitted strip of future ground opened out to the right of it.
//
// The DATA is raceFull's, unchanged — same extent, same cast, same lines, all
// still ending in 2025. Only the camera and the strip differ:
//
// `tailPx` pins the camera by its LEFT edge instead of its right, so the resting
// playhead follows the viewport (raceMaxPlayhead). A short stub of history stays
// on the plot and every dot comes to rest in a column just inside the left edge,
// at FULL opacity — which is PRD P-11-1. Nothing caps the lines to keep them off
// the strip; writeRaceSweepFrame already ends each one at that actor's own last
// data year.
//
// `frontier` is where the strip RESTS, fully open. Declaring it on the step
// rather than only in the animation is what makes a cold mount, a resize and the
// reduced-motion snap all land on the finished state (see raceLayout).
//
// tailPx is also how the step declares itself NOT PANNABLE, by construction
// rather than by coincidence: raceFloorPlayhead returns the same year as the
// ceiling, so racePanBounds is left with nothing between its two ends. That is the honest half of "no interactivity" (and what stops
// publishRaceCam clamping the camera back onto the data); the enforcing half is
// Index.svelte not mounting RaceScrubber on it.
//
// Its subject is SLJ — the copy asks who takes the crown FROM him, and a step
// without a highlight falls back to claiming the whole field as its subject.
export const RACE_FUTURE_STEP = {
	extent: RACE_FULL_EXTENT,
	tailPx: RACE_FUTURE_TAIL_PX,
	frontier: RACE_FUTURE_END,
	highlight: [SLJ]
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

// ---------------------------------------------------------------------------
// Names.
//
// One rule for the whole chapter: at every camera a step can reach, the ten
// actors nearest the centre of Hollywood carry their name. A step's declared
// set is therefore the union of that top ten over its own camera range —
// nothing about a resting year, a per-camera budget or a total cap, all of
// which this replaces.
//
// The rule holds itself up because the top ten are never off the plot: no actor
// sits below the crown, so the ten closest to it are the ten closest to the top
// of the band. Where the band holds fewer than ten dots (1980-91, 2020-23) the
// surplus names ride their own off-scale dots at alpha 0 and simply don't
// appear.
//
// Still a CONSTANT per step rather than a function of the live camera, for the
// same reason as before: the camera moves during an arrival but story.raceView
// is only published when that pan settles, so a camera-derived set would change
// in one frame at the end of the animation — a dozen names appearing at once on
// a chart that has just stopped moving. A fixed superset lets each name ride its
// dot's alpha (see ScrollyVisual's labelAlpha) and fade up exactly when the pan
// brings its dot onto the plot.
//
// The step's `highlight` needs no special case: every subject the chapter names
// is in its own step's top ten somewhere in range.
// ---------------------------------------------------------------------------

/**
 * How many of the leaders carry a name at any one camera. Read twice, and the
 * two readings are what make the rule exact rather than approximate: here it
 * decides what each step DECLARES (the union over its camera range, a superset),
 * and in ScrollyVisual's drawScene it decides what the current camera SHOWS
 * (that same top ten, live). The declaration guarantees the renderer always has
 * the ten it needs; the renderer guarantees the gutter never holds more.
 */
export const RACE_LABEL_TOP = 10;
// how finely the range is walked. The camera is continuous, so the union has to
// be sampled; a quarter of a year is ~9px at PX_PER_YEAR, far finer than the
// rank order changes, so nothing can slip between two samples.
const RACE_LABEL_SAMPLE = 0.25;

/**
 * The states' `labels`/`labelDirs` pair for a step whose camera can rest
 * anywhere in [from, to] — so the two can't fall out of step.
 *
 * @param {number} from earliest year the camera can put on the plot's right edge
 * @param {number} to latest
 */
function raceLabelSpec(from, to) {
	const ids = new Set();
	for (let year = from; year <= to + 1e-9; year += RACE_LABEL_SAMPLE) {
		const ranked = RACE_IDS.map((id) => {
			const [ds, de] = RACE_RANGE.get(id);
			return [
				id,
				curveYAt(RACE_SEGS.get(id), Math.min(Math.max(year, ds), de))
			];
		}).sort((a, b) => a[1] - b[1]);
		for (const [id] of ranked.slice(0, RACE_LABEL_TOP)) ids.add(id);
	}
	const labels = [...ids];
	return {
		labels,
		// beside the dot, always to its right. On raceRecent and raceFull that puts
		// them in the reserved gutter, since the dots ride the plot's right edge; on
		// raceFuture the column sits at the far left instead, so the names render
		// out across the future block — which is why that block carries no fill.
		// ScrollyVisual's label de-collider keeps them apart when their dots land
		// close together, and it reads only y, so the move costs it nothing.
		labelDirs: Object.fromEntries(labels.map((id) => [id, "right"]))
	};
}

// raceRecent picks its field by "who gets near the centre" — raceFull has no
// cap, it shows the whole cast by design.
const RACE_RECENT_YCAP = raceStepCap(RACE_RECENT_STEP);

// What raceRecent shows. Derived here, once, because three places need to
// agree on it: the state's own layout, the arrival choreography
// (ScrollyVisual's raceEntry) and the rank list's collapsed nodes
// (RankBars.svelte), which are the same dots handed over as HTML.
export const RACE_RECENT_VISIBLE = raceStepVisible(
	RACE_RECENT_STEP,
	RACE_RECENT_YCAP
);

// Who carries the ink on raceRecent at rest (2025) — SLJ, the chapter's whole
// point. Exported because the rank chapter's collapsed nodes are these same dots
// handed over as HTML (RankBars.svelte) and the flight that follows writes them
// on the canvas: all three read raceDotSpec against this, so the #1 row is
// already inked in the list and the swap has nothing to give away.
export const RACE_RECENT_LEAD = raceLeadAt(
	RACE_RECENT_EXTENT[1],
	RACE_RECENT_VISIBLE
);

// raceFull's resting camera: 1970 at the plot's left edge, or RACE_FULL_PAN_FLOOR
// on its right edge where the viewport is too narrow to show both at once. Same
// rule as the pan floor by construction — resting anywhere the reader can't pan
// back to would re-open that floor (racePanBounds widens it to the live
// playhead) and undo the limit. This is the state's true resting playhead
// regardless of arrival path — the rewind's second leg (see ScrollyVisual's
// playRaceFullEntry) just animates getting there instead of snapping.
export function raceFullRestPlayhead(w, h) {
	return Math.min(RACE_FULL_EXTENT[1], raceFloorPlayhead(w, h, RACE_FULL_STEP));
}

// raceFull and raceFuture declare the SAME names, and that is the honest
// statement of what raceFuture is: the same chart with the camera moved. Their
// camera ranges differ only past RACE_DATA_END, and raceLabelSpec clamps every
// sample into the actor's own data before ranking it, so the years out on the
// strip rank exactly as the present does and contribute nothing. Shared rather
// than written twice, so the two can't drift apart.
const RACE_FULL_LABELS = raceLabelSpec(RACE_FULL_PAN_FLOOR, RACE_DATA_END);

export const states = {
	raceRecent: {
		layout: raceLayout(RACE_RECENT_STEP, RACE_RECENT_YCAP),
		race: RACE_RECENT_STEP,
		yCap: RACE_RECENT_YCAP,
		// its camera runs between its own extent's ends — the arrival rewind parks
		// it on RACE_REWIND_WAYPOINT_YEAR, which sits inside that range
		...raceLabelSpec(...RACE_RECENT_EXTENT),
		overlay: OVERLAY,
		params,
		// entry choreography: draw the lines on when arriving from the rank chapter
		revealFrom: ["rankReveal"]
	},
	raceFull: {
		layout: raceLayout(RACE_FULL_STEP, Infinity),
		race: RACE_FULL_STEP,
		// the whole chapter's span: its camera floor is the pan floor on a narrow
		// viewport and later on a wide one (raceFullRestPlayhead), and the reader
		// can pan it forward to the present — so the range covers every width
		// rather than a resting year that only one width actually lands on
		...RACE_FULL_LABELS,
		overlay: OVERLAY,
		params,
		// rewind choreography: continue the camera pan further back (leg 2, from
		// wherever raceRecent's leg-1 pan parked, or from the present if the
		// reader never pressed Start) when arriving from it, all the way to 1970
		// — see playRaceFullEntry
		revealFrom: ["raceRecent"]
	},
	raceFuture: {
		// no yCap, same as raceFull: the whole cast, on a chart whose camera has
		// run forward to the present with a fitted strip of future beside it
		layout: raceLayout(RACE_FUTURE_STEP, Infinity),
		race: RACE_FUTURE_STEP,
		// raceFull's names exactly — the union over the arrival pan's range, which
		// covers every year the forward leg crosses. See RACE_FULL_LABELS.
		...RACE_FULL_LABELS,
		overlay: OVERLAY,
		params,
		// the rewind run FORWARDS: the camera leaves the past and carries on past
		// the end of the data — see playRaceFuture
		revealFrom: ["raceFull"]
	}
};

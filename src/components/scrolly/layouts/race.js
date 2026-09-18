import story from "$data/scrolly-story.json";
import { ATTR_SIZE, EDGE_BASE, set, dissolve, STRIDE } from "../attr-buffer.js";
import {
	ORDER_OF,
	SLJ,
	HACKMAN,
	RACE_IDS,
	SIM_SERIES,
	SIM_LABEL_IDS,
	BACKDROP_IDS,
	GENZ_NAMED_IDS,
	FIELD_IDS
} from "../cast.js";
import {
	PULLBACK_ZOOM,
	introPosition,
	NETWORK_INTRO_RADIUS
} from "../intro-geometry.js";
import { INK, CROWD } from "../palette.js";
import { MARGIN, plotBottom, lin, NO_BLEED } from "../plot.js";
import { scatterPosition } from "../scatter-scales.js";
import {
	writeFieldCrowd,
	galaxyBox,
	FIELD_ALPHA,
	makeFlight,
	fieldDepth,
	depthSize,
	depthFade,
	flightWindow,
	skyFrac
} from "../sky.js";
import {
	TRAIL_SIZE,
	TRAIL_STRIDE,
	TRAIL_POINTS,
	TRAIL_META,
	RACE_SLOT,
	SIM_SLOT,
	SIM_TRAIL_SLOTS,
	BACKDROP_SLOT,
	BACKDROP_TRAIL_SLOTS,
	sampleTrail,
	collapseTrail,
	setTrailHighlight,
	clipSeries,
	monotoneSegments,
	curveYAt
} from "../trails.js";
import { ANCHOR_ID } from "../nodes.js";
import { PULLBACK_ZOOM_MS } from "./hop-bands.js";

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

// Multiplies every choreographed race animation's duration (the draw-on and
// every camera leg — see `scaled` and rewindMs under "Choreographies"): 1 is
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

// ---------------------------------------------------------------------------
// The Gen-Z field (the raceGenz step). The same shape as the race cast above,
// on the same metric and the same axis — mean distance to the whole giant
// component, top_n 0 — so the two sets of lines need no conversion between them.
//
// They are a separate cast rather than extra members of RACE_CAST because they
// are a separate QUESTION: the race cast is everyone who has ever led, and only
// one step ever draws these 99. Keeping them apart is what leaves every other
// race step byte-identical to what it drew before.
//
// Ragged where the race cast is not: first_year runs 2001-2022, so these series
// are 4 to 25 points long. Nothing below assumes otherwise — each line is
// clamped to its own GENZ_RANGE exactly as a race line is.
// ---------------------------------------------------------------------------
const GENZ_SEGS = new Map(
	SIM_SERIES.map((id) => [id, monotoneSegments(story.genzSeries[id])])
);
const GENZ_RANGE = new Map(
	SIM_SERIES.map((id) => {
		const s = story.genzSeries[id];
		return [id, [s[0][0], s.at(-1)[0]]];
	})
);
/** the seven the step names, as a set — read once per candidate per frame */
const GENZ_NAMED = new Set(GENZ_NAMED_IDS);

// The backdrop field behind them, on the same metric and the same axis again.
// Disjoint from both casts above by construction (the build strips anyone else
// draws), so no node and no trail slot has two writers.
const BACKDROP_SEGS = new Map(
	BACKDROP_IDS.map((id) => [id, monotoneSegments(story.backdropSeries[id])])
);
const BACKDROP_RANGE = new Map(
	BACKDROP_IDS.map((id) => {
		const s = story.backdropSeries[id];
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

// ---------------------------------------------------------------------------
// The camera's Y degree of freedom: `yOpen`.
//
// Every camera above answers "which years am I looking at" and the axis follows.
// The Gen-Z step asks the chart a question no playhead can express — look at a
// different STRETCH of remoteness, the one the contenders actually live on,
// which sits a long way below the crown. So the camera gains a second axis of
// travel, 0 at the chapter's own window and 1 at the Gen-Z window below it.
//
// It is a property of the CAMERA, not of the step, and that is the whole design:
// `raceWindowYFit` stays a pure function of its arguments, so an animated frame
// and the settle it lands on still agree by construction rather than by both
// being handed the same constant. A step declares where it RESTS (yOpen: 1 on
// RACE_GENZ_STEP, exactly as raceFuture declares its frontier), which is what
// makes a cold mount, a resize and the reduced-motion snap all land on the
// panned-down view with no animation having run.
//
// The window itself is two constants, drawn by eye against the live chart the
// same way the fixed window's are (RaceYBandDev's Gen Z sliders), not fitted:
// fitting it to the field would put its edges on whichever candidate happened to
// be the most remote that year, which is nobody's story. Measured over the
// step's own camera range (2022-2025) the seven named contenders span
// 2.3433-2.9461 and the whole field 2.3530-3.3848 — so the named seven sit
// inside this window with room and the top decile of the field presses up
// through the floor, which is the chapter's existing idiom, not a clipping bug.
// ---------------------------------------------------------------------------

/** the Gen-Z window's top edge (the LOWER avg distance, nearer the centre) */
export const RACE_GENZ_Y_MIN = 2.3;
/** ...and its bottom edge */
export const RACE_GENZ_Y_MAX = 3.0;

/** live values, plain module variables for the same reason as raceYFixedMin */
let genzYMin = RACE_GENZ_Y_MIN;
let genzYMax = RACE_GENZ_Y_MAX;

/**
 * Dev hook: move the Gen-Z window's two edges. Called only from
 * RaceYBandDev.svelte, which only mounts under `npm run dev`.
 * @param {number} lo top edge @param {number} hi bottom edge
 */
export function setRaceDevGenzWindow(lo, hi) {
	genzYMin = lo;
	genzYMax = hi;
}

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
 * The axis for a camera window, and the whole y-scale rule: the chapter's own
 * fit (the fixed window's two constants from 2004 on, the camera fit below
 * RACE_Y_FIXED_FADE, and a ramp between the two over the four years in between),
 * then the camera's y travel lerped on top of it.
 *
 * Because every branch of it reads the CAMERA — including yOpen, which is a
 * camera parameter and not a step's — rather than a step's content extent, no
 * step owns an axis and nothing has to be handed across a transition, and an
 * animated frame agrees with the settle it lands on by construction rather than
 * by passing the same constant to both.
 *
 * @param {number} camLeft @param {number} camRight
 * @param {number} [yOpen] the camera's y travel, 0 = the chapter's own window,
 *   1 = the Gen-Z window below it
 * @param {number} [yClose] the camera's y ZOOM, 0 = wherever yOpen left it, 1 =
 *   the CLOSING window, sized to the five contenders that step draws
 * @returns {[number, number]} the scale domain [vMin, vMax]
 */
function raceWindowYFit(camLeft, camRight, yOpen = 0, yClose = 0) {
	const base = raceChapterYFit(camLeft, camRight);
	// ...and the same lerp again for the camera's y travel. Both ends move, so
	// this is a pan and a zoom at once: the crown leaves through the top while
	// the ground opens below it.
	const win = yOpen
		? [
				base[0] + (genzYMin - base[0]) * yOpen,
				base[1] + (genzYMax - base[1]) * yOpen
			]
		: base;
	if (!yClose) return /** @type {[number, number]} */ (win);
	// The closing window is sized to the five contenders that step draws and to
	// nothing else (see RACE_CLOSE_Y_MIN/MAX, which are read off their own
	// numbers). It is deliberately TIGHTER than anything else in the chapter: it
	// is what puts SLJ — 2.087 today, above its top edge — off the plot at the
	// axis break, so his descent onto the authored 2.55 landing is him arriving
	// through the top rather than an animation pretending he did.
	return [
		win[0] + (RACE_CLOSE_Y_MIN - win[0]) * yClose,
		win[1] + (RACE_CLOSE_Y_MAX - win[1]) * yClose
	];
}

/** the chapter's own axis at a camera — everything above yOpen 0 */
function raceChapterYFit(camLeft, camRight) {
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
 * A TAIL is the other way to answer it, and the two future-facing steps are the
 * ones that use it (`tailPx` on raceFuture, `tailYears` on raceGenz — see
 * raceTailPx): instead of naming the year on the RIGHT edge it says how much
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
 * @param {{extent: [number, number], maxPlayhead?: number, tailPx?: number, tailYears?: number}} step
 */
export function raceMaxPlayhead(w, h, step) {
	const tail = raceTailPx(w, h, step);
	if (tail !== null) {
		return RACE_DATA_END - tail / pxPerYear + raceVisibleSpan(w, h);
	}
	return step.maxPlayhead ?? step.extent[1];
}

/**
 * Where a step's camera RESTS: its own declared `restPlayhead`, else the last
 * year it may rest on. The static layout (raceLayout) and the live camera's
 * reset (race-camera.js) both read it, so a state change, a cold mount and a
 * resize all put the chart on the same year.
 * @param {number} w @param {number} h
 * @param {{extent: [number, number], restPlayhead?: number, maxPlayhead?: number, tailPx?: number, tailYears?: number}} step
 */
export function raceRestPlayhead(w, h, step) {
	return step.restPlayhead ?? raceMaxPlayhead(w, h, step);
}

// The most of the data plot a step's tail of history may take, leaving the rest
// for the future strip beside it. Only `tailYears` is clamped by it: `tailPx` is
// already a pixel budget its author has sized against the plot.
const RACE_TAIL_MAX_FRAC = 0.6;

/**
 * How much history a left-pinned step keeps behind the data's end, in px — or
 * null for the steps that pin their camera by the right edge instead.
 *
 * Two ways to say it. `tailPx` is a flat budget (raceFuture's 24px stub, small
 * enough to fit any viewport). `tailYears` asks for a real span of history —
 * which at the chapter's fixed 76px/year does NOT fit everywhere: three years is
 * 228px against a data plot of ~389px at 700px, ~173px at 375px and ~136px at
 * 320px. So it is capped at a fraction of the plot, and a phone gets less
 * history rather than the chart getting a second x scale. The alternative —
 * fitting x to the span — is the one thing the chapter refuses to do (see the
 * header): every visible year carries its own label because the scale never
 * moves.
 *
 * One helper because raceMaxPlayhead and raceFloorPlayhead must agree on the
 * answer to the character: that they return the same year is what leaves
 * racePanBounds with nothing between its two ends, i.e. what makes a left-pinned
 * step unpannable by construction rather than by coincidence.
 *
 * @param {number} w @param {number} h
 * @param {{tailPx?: number, tailYears?: number}} step
 */
function raceTailPx(w, h, step) {
	if (step.tailPx !== undefined) return step.tailPx;
	if (step.tailYears === undefined) return null;
	const plot = racePlot(w, h);
	return Math.min(
		step.tailYears * pxPerYear,
		(plot.right - plot.left) * RACE_TAIL_MAX_FRAC
	);
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
 * @param {{extent: [number, number], minPlayhead?: number, tailPx?: number, tailYears?: number}} step
 */
function raceFloorPlayhead(w, h, step) {
	// a step that pins its camera by its LEFT edge has exactly one legal
	// playhead, so its floor is its ceiling — which is what leaves racePanBounds
	// with nothing between its two ends and reports the step as unpannable
	if (raceTailPx(w, h, step) !== null) return raceMaxPlayhead(w, h, step);
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
// — for anything that ever reaches past RACE_DATA_END.
//
// One frame kind does now reach past it: the closing step's projected segments
// (writeProjectionLines, PRD P-27-1). It gets there WITHOUT rerouting xS, by
// composing a local piecewise scale inside that one writer and handing it to
// sampleTrail as its x argument. The difference is containment, not taste: a
// local is built per frame, applies to one family of polylines, and is handed to
// nothing else, where a piecewise xS would reroute every consumer above for
// every step and every year past 2025. Read here by the future ticks, the band
// and that one writer, and by nothing else.
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
function raceFutureBand(cam, frontier, labelInside = false) {
	if (!(frontier > RACE_DATA_END)) return null;
	const { x0, right, pitch, xS } = raceFutureScale(cam);
	if (pitch <= 0 || x0 > right - 1) return null;
	return {
		x: x0,
		y: cam.top,
		width: Math.min(xS(frontier), right) - x0,
		height: cam.bottom - cam.top,
		// ...unless the step asks for it INSIDE the box's top-left corner. The lift
		// above is there because the crown's own name renders just inside that
		// corner on raceFuture; the closing step's names are all out at the strip's
		// far edge, so the corner is free — and the lift is actively wrong there,
		// because a year of history in front of the block pushes its left edge into
		// the middle of the canvas, straight under the centred chart title.
		label: labelInside
			? { x: x0 + 6, y: cam.top + 4 }
			: { x: x0 + 2, y: cam.top - BAND_LABEL_LIFT }
	};
}

/**
 * The y ladder for one frame. Ticks sit on round values and SLIDE, exactly as
 * the x ticks travel with their years — the same fixed-scale logic. Spacing the
 * labels evenly across the domain instead would pin them to fixed pixel rows and
 * roll their digits on every frame of a pan, which reads as churn rather than as
 * a camera.
 *
 * The ladder runs down to hundredths because the band is only ~0.037 tall
 * padded: round tenths would leave most cameras with a single label, or none.
 * Same idiom as the sim race's Y_STEP.
 */
function raceYTicks(yS, vMin, vMax) {
	const step =
		[0.01, 0.02, 0.05, 0.1, 0.2].find((s) => (vMax - vMin) / s <= 5) ?? 0.5;
	const dec = step < 0.1 ? 2 : 1;
	const y = [];
	// stepped on an integer multiplier rather than by repeated addition, so the
	// tick values stay exactly on the round numbers they label
	for (let k = Math.ceil(vMin / step - 1e-9); k * step <= vMax + 1e-9; k++) {
		y.push({ pos: yS(k * step), label: (k * step).toFixed(dec) });
	}
	return y;
}

// x (year) + y (avg distance) tick furniture for one frame — shared by the
// static layout and the per-frame sweep/pan writers so animated axes read off
// the exact same rule as the static end-states.
//
// `frontier` is how far the future strip has opened; the years past the data get
// their positions from its fitted scale (raceFutureTicks) and land in the SAME
// `x` array, so one renderer draws both and the two can never drift apart.
function raceAxes(
	cam,
	yS,
	vMin,
	vMax,
	frontier,
	futureTicks = true,
	xTicks = true
) {
	// every visible year gets its own horizontal 4-digit label — no thinning, no
	// width branch: PX_PER_YEAR guarantees the gap. Ticks travel with their years
	// during a pan, which is the whole point of a fixed scale.
	const x = [];
	// ...on every step but the closing one, which has no x axis at all. Not the
	// same switch as `futureTicks`, which drops the STRIP's years and keeps the
	// historical ones: this drops the row entirely, because on that chart a
	// year is a claim the marks cannot support (the projections' horizon is each
	// contender's career age 40, not a calendar year). The block's own label is
	// what says which way time runs.
	if (!xTicks) {
		return { x: [], xBase: cam.bottom + 10, y: raceYTicks(yS, vMin, vMax) };
	}
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
	const y = raceYTicks(yS, vMin, vMax);
	// the strip's years join the historical ones in one array, so they inherit
	// `.tick.tick-x` and `xBase` verbatim and sit on the same row by construction
	//
	// ...unless the step turns them off. Two pitches on one axis row only reads as
	// one axis while the eye has a reason to accept the break, and that reason is
	// raceFuture's subject: the step is ABOUT the empty ground ahead, so its years
	// are what make the strip five years rather than a blank. On raceGenz the
	// strip is context behind 99 lines the reader is actually looking at, and the
	// fitted pitch sitting next to the fixed one just reads as a broken scale. The
	// block keeps its own "the future" label either way, so nothing that is turned
	// off here was carrying meaning.
	return {
		x: [...x, ...(futureTicks ? raceFutureTicks(cam, frontier) : [])],
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
 * @property {boolean} [futureTicks] emit the strip's own year labels (default
 * true). raceGenz turns them off — see raceAxes.
 * @property {number} [yOpen] the camera's y travel, 0 = the chapter's own
 * window, 1 = the Gen-Z window below it (see raceWindowYFit). A camera
 * parameter, not a step's, which is what keeps the axis rule pure.
 * @property {number} [yClose] the camera's y ZOOM, 0 = wherever yOpen left it,
 * 1 = the closing step's own window (see raceWindowYFit). A camera parameter for
 * the same reason yOpen is.
 * @property {number} [proj] the closing step's draw-on progress 0..1: how far
 * out across the future strip the projections have been drawn. The one frame
 * kind whose marks pass RACE_DATA_END (see writeProjectionLines).
 *
 * ABSENT on every other step, and that is load-bearing rather than incidental:
 * 0 is a real value here (the frame the draw starts from, everything standing on
 * the present), so "is this a projection frame" is `proj !== undefined` and never
 * a truthiness test. It is what hands SLJ to the projection pass, so a truthiness
 * test would let the race pass draw him for the one frame the draw begins on.
 * @property {number} [genz] the Gen-Z field's draw-on progress 0..1; 0 (or
 * absent) leaves those 99 lines off the frame entirely.
 * @property {boolean} [backdrop] draw the backdrop sample.
 * @property {boolean} [lead] ink the crown holder at this camera (default true).
 * false on a step whose camera has travelled off the race entirely. No progress value: the
 * camera decides whether it is seen (see writeBackdropLines).
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

/**
 * A NAMED Gen-Z contender's dot, on the one step that draws them. Lifted
 * verbatim from `scatterGenZ`'s GENZ_NAMED_MARK so the seven wear the same mark
 * on both charts: a name beside an identical grey dot in a column of identical
 * grey dots reads as a caption on the cluster rather than on one actor. The
 * other 92 take raceDotSpec's field treatment unchanged.
 */
const GENZ_NAMED_DOT = { r: 5, rgb: INK, alpha: 1 };

/**
 * ...and the backdrop field's, which has to sit UNDER both. Three depths on one
 * monochrome chart, separated by alpha and radius alone: the backdrop at 0.3,
 * the 92 unnamed contenders at raceDotSpec's 0.55, the seven named in ink. A
 * hue for any of them would break the chapter's rule and would not read as depth
 * anyway — receding is what distance looks like.
 */
const BACKDROP_DOT = { r: 2.5, rgb: CROWD, alpha: 0.3 };
/** ...and its line, likewise half the contenders' 0.35 */
const BACKDROP_TRAIL_ALPHA = 0.18;

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

// Where the Gen-Z field's arrival sweep starts, as a fraction of the camera's
// own span back from the plot's LEFT edge. Slightly off-plot rather than exactly
// on it, so the column of dots is already moving when it crosses into view
// instead of materialising on the edge itself.
const GENZ_ARRIVE_LEAD = 0.06;

/**
 * The backdrop: 279 working actors spread across the window the Gen-Z step pans
 * down onto, so the camera lands on a crowd rather than on empty axes.
 *
 * It takes NO progress parameter, and that is the point. These lines are always
 * written, and the CAMERA decides whether they are seen: at yOpen 0 the window is
 * the crown's [2.05, 2.20] and every one of them sits below it, so curveExit
 * finds nothing on scale and each collapses onto a hidden dot. As the window
 * opens downward they enter through the bottom edge on their own, exactly as the
 * race cast leaves through the top. No fade to schedule, nothing for an animator
 * to carry, and a resize or a reduced-motion arrival lands on the right frame
 * because the frame is a pure function of the camera — the same property the
 * whole chapter's axis rests on.
 *
 * @param {Float64Array} attrsBuf @param {Float64Array} trailBuf
 * @param {ReturnType<typeof raceCamera>} cam
 * @param {(v: number) => number} yS
 * @param {number} vMin @param {number} vMax
 */
function writeBackdropLines(attrsBuf, trailBuf, cam, yS, vMin, vMax) {
	for (const id of BACKDROP_IDS) {
		const segs = BACKDROP_SEGS.get(id);
		const slot = BACKDROP_SLOT.get(id);
		const [ds, de] = BACKDROP_RANGE.get(id);
		const dotYr = Math.min(Math.max(cam.playhead, ds), de);
		const onCamera = de >= cam.camLeft && ds <= cam.playhead;
		const edgeFade = clamp(
			(cam.xS(dotYr) - cam.left) / RACE_EDGE_FADE_PX,
			0,
			1
		);
		const m = onCamera ? edgeFade : 0;
		const dotV = curveYAt(segs, dotYr);
		const dotM = dotV >= vMin && dotV <= vMax ? m : 0;
		const dx = cam.xS(dotYr);
		const dy = yS(dotV);
		set(
			attrsBuf,
			id,
			dx,
			dy,
			BACKDROP_DOT.r,
			BACKDROP_DOT.rgb,
			BACKDROP_DOT.alpha * dotM
		);
		if (m <= 0.002) {
			collapseTrail(trailBuf, slot, dx, dy, 0);
			continue;
		}
		const drawFloor = Math.max(cam.camLeft, ds);
		const sx1 = curveExit(segs, dotYr, drawFloor, vMin, vMax);
		const sx0 =
			sx1 === null
				? 0
				: Math.max(
						cam.camLeft,
						ds,
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
				BACKDROP_TRAIL_ALPHA * m
			);
		} else {
			collapseTrail(trailBuf, slot, dx, dy, BACKDROP_TRAIL_ALPHA * dotM);
		}
		setTrailHighlight(trailBuf, slot, 0);
	}
}

// ---------------------------------------------------------------------------
// The closing step's projections (PRD P-27-1) — the one family of marks on this
// chart that lives PAST the end of the data.
//
// Two different kinds of number are drawn here, and the difference matters more
// than anything else in this section:
//
//   The 99 contenders' endpoints are MODELLED. `projMedian` is the median of
//   10,000 k-NN bootstrap simulations — the same runs the reader just watched
//   replay on the simulation chart, so the line that climbed to a win count
//   becomes the line that lands on that simulation's own answer.
//
//   SLJ's endpoint is AUTHORED. The simulation projects the 99 Gen Z candidates
//   and nobody else, so there is no forecast of his to draw. RACE_CLOSE_SLJ_END
//   is the chapter's claim — "we're counting on this happening to Samuel L.
//   Jackson", which is what the step's own copy says out loud — drawn on the
//   axis. It is not a prediction and nothing downstream may treat it as one.
//
// One more honest caveat, recorded here because the chart cannot show it: the
// bootstrap's horizon is each contender's CAREER AGE 40, not the calendar year
// 2030. Their endpoints sit at the strip's far edge because that is where the
// chart's future ends, not because the model named that year.
// ---------------------------------------------------------------------------

// How much measured history the closing step keeps on the plot behind the
// present. raceFuture's 24px stub is a fraction of a year — enough to park a dot
// column against, not enough to see where anyone is COMING FROM, which is half
// of what this chart claims. A year gives every line a real segment of record
// before the break, so the projections read as a continuation of something
// rather than as a hundred marks that start out of nowhere. Clamped on a narrow
// viewport rather than shrinking the x scale — see raceTailPx.
const RACE_CLOSE_TAIL_YEARS = 1;

/**
 * Where the closing step lands Samuel L. Jackson. An EDITORIAL ASSUMPTION, not a
 * model output — see the block above.
 *
 * Clear of all five the step draws, and clear of them by a distance: the step's
 * sentence is that the crown LEAVES him, and a landing inside their band says
 * "he is overtaken by some of them" instead — as well as putting his mark under
 * a stack of theirs, since every line on this chart ends at the same x. The
 * value was chosen when the chart drew all 99 (it clears those too, which 2.30
 * did not); it is kept because nothing about the sentence changed when the field
 * came off. Asserted below rather than left to the eye.
 */
export const RACE_CLOSE_SLJ_END = 2.55;

// How much of his measured past the stub grows out of. Three real points before
// the break, so the ramp BENDS out of his own trajectory at the axis break
// instead of elbowing off a single one — the knee comes free from the same
// monotone spline every other line on this chart rides.
const CLOSE_SLJ_STUB_FROM = RACE_DATA_END - 2;

/**
 * SLJ's line on the closing step: his real trajectory over the last years of the
 * data, continued to the authored 2030 landing. One curve, not a measured line
 * plus a drawn-on stub, so the join is a curve point rather than a seam.
 */
const CLOSE_SLJ_SEGS = monotoneSegments([
	...story.raceSeries[SLJ].filter(([yr]) => yr >= CLOSE_SLJ_STUB_FROM),
	[RACE_FUTURE_END, RACE_CLOSE_SLJ_END]
]);

/**
 * ...and one per contender: their last year of measured trajectory, then their
 * simulated median at the far edge, as ONE curve on the same monotone spline
 * every other line on this chart rides — so a line carries on through the break
 * instead of restarting at it, which is what the year of history is for.
 *
 * Worth saying plainly: past the break there are two numbers and nothing
 * modelled in between, so the shape there is drawn, not computed. The spline is
 * monotone, so it stays between the two endpoints and invents no wobble — but it
 * is a continuation of the measured tangent, not a forecast of the path.
 *
 * Ragged, like the rest of the Gen-Z data: a contender with no film in the tail
 * year has no point in it, and their line simply starts at the break. Every
 * series ends on RACE_DATA_END (asserted at module load), so there is always at
 * least that one measured point to leave from.
 */
const CLOSE_PROJ_SEGS = new Map(
	story.genz.candidates.map((c) => [
		c.id,
		monotoneSegments([
			...story.genzSeries[c.id].filter(
				([yr]) => yr >= RACE_DATA_END - RACE_CLOSE_TAIL_YEARS
			),
			[RACE_FUTURE_END, c.projMedian]
		])
	])
);

/** where each of those curves starts, so a frame draws no flat stub in front of
 * a contender who has no film in the tail year */
const CLOSE_PROJ_FROM = new Map(
	story.genz.candidates.map((c) => [
		c.id,
		Math.max(
			RACE_DATA_END - RACE_CLOSE_TAIL_YEARS,
			story.genzSeries[c.id].find(
				([yr]) => yr >= RACE_DATA_END - RACE_CLOSE_TAIL_YEARS
			)[0]
		)
	])
);

/**
 * The contenders the closing step DRAWS: the five the SIMULATION named, not the
 * seven raceGenz did, and not the whole field. The reader arrives from the
 * simulation chart, where those five carried a dot, a name and a win share, so
 * the same five here says "these are the people you just watched win" rather
 * than offering a second shortlist — and five lines are five people, where the
 * 99 this step used to draw were one 99-high wall of line-ends at the strip's
 * far edge, since every projection lands at the same x.
 *
 * Chosen by WIN SHARE, which is not the same order as the projected finish: id
 * 10949 lands second-nearest the centre (2.2127) and is not on this chart at
 * all. That was always true — it was unmarked before — but the field standing
 * behind the marks used to say so. Now it does not, so it is said here.
 *
 * The other 94 are not retracted or parked: they stay on their own projection
 * curves at alpha 0, the same rule every race step follows (see raceLayout's
 * NOTE), so nothing travels across the canvas to arrive when the reader steps
 * back onto this chart from the outro.
 */
const CLOSE_CAST = new Set(SIM_LABEL_IDS);

/** ...as the candidate records themselves, in win order */
const CLOSE_CANDIDATES = story.genz.candidates.filter((c) =>
	CLOSE_CAST.has(c.id)
);

/**
 * Whoever ends the strip nearest the centre — SLJ or one of the five. The
 * chapter's own rule (the ink means "in front"), evaluated at the one camera
 * that has marks out at the far edge, which is what makes the crown visibly
 * change hands. Picked from what the step DRAWS, so the ink can never land on a
 * line that is not there.
 */
const CLOSE_LEAD = [
	[SLJ, RACE_CLOSE_SLJ_END],
	...CLOSE_CANDIDATES.map((c) => [c.id, c.projMedian])
].sort((a, b) => a[1] - b[1])[0][0];

/** the race slots the projection pass owns, so the race pass leaves them alone */
const CLOSE_OWNED = new Set([SLJ]);

/**
 * Breathing room between the closing window's edges and the marks that set them,
 * so the first dot and the last dot are not drawn riding the plot's edge.
 */
const RACE_CLOSE_Y_PAD = 0.02;

/**
 * The closing window, read off the five contenders the step draws rather than
 * authored as a pair of constants — "the axis is floored by these five" is a
 * statement about their data, so a rebuild that moves them moves the axis.
 *
 * The top is their best projected landing, which is where the whole field of
 * lines ends up. SLJ starts ABOVE it (2.087 against ~2.17) and that is the
 * point: see raceWindowYFit's yClose arm, and the assert by RACE_CLOSE_YCAP
 * that keeps it true.
 *
 * The floor is the most remote of them over the years the step actually DRAWS,
 * not over 2025 alone: the step keeps a year of history behind the present, and
 * Hechinger's 2024 (2.6531) sits below Hawke's 2025 (2.641). Reading the drawn
 * range is the same intent — the lowest of the five at the present — measured
 * against what is on the plot.
 */
export const RACE_CLOSE_Y_MIN =
	Math.min(...CLOSE_CANDIDATES.map((c) => c.projMedian)) - RACE_CLOSE_Y_PAD;
export const RACE_CLOSE_Y_MAX =
	Math.max(
		...CLOSE_CANDIDATES.flatMap((c) =>
			story.genzSeries[c.id]
				.filter(([yr]) => yr >= RACE_DATA_END - RACE_CLOSE_TAIL_YEARS)
				.map(([, v]) => v)
		)
	) + RACE_CLOSE_Y_PAD;

/**
 * One projected curve — a contender's or SLJ's — drawn out to wherever the
 * step's draw-on has reached.
 *
 * SLJ and the five go through the SAME writer, where they used to have a loop
 * each. They now answer the same question: ride the draw playhead, clip to the
 * window, hide a dot the window isn't showing. The only thing that differs
 * between them is which slot block their line lives in.
 *
 * @param {Float32Array|Float64Array} attrsBuf @param {Float32Array|Float64Array} trailBuf
 * @param {number} id @param {any} segs the curve, through the break to 2030
 * @param {number} from its first year on this camera
 * @param {number} slot its trail slot
 * @param {number} m alpha multiplier: 1 for the five and SLJ, 0 for the rest of
 *   the field, who still ride their own curve so nothing travels to arrive
 * @param {number} drawYr the draw-on playhead, in years
 * @param {(yr: number) => number} projX @param {(v: number) => number} yS
 * @param {number} vMin @param {number} vMax
 */
function writeProjectionCurve(
	attrsBuf,
	trailBuf,
	id,
	segs,
	from,
	slot,
	m,
	drawYr,
	projX,
	yS,
	vMin,
	vMax
) {
	// the dot rides the draw playhead — the line's own right-hand end — the way
	// the Gen-Z field's dots ride their arrival, so what the reader follows out
	// across the strip is a mark travelling rather than a line growing under a
	// stationary one
	const dotYr = clamp(drawYr, from, RACE_FUTURE_END);
	const dotV = curveYAt(segs, dotYr);
	const dx = projX(dotYr);
	const dy = yS(dotV);
	// a dot whose value is off the window is hidden outright, as everywhere else
	// on this chart. It is what makes SLJ's entrance: he leaves 2025 above the
	// window's top edge, so for the first part of the draw there is no dot and no
	// line, and he comes in through the top as his own curve descends onto it.
	const dotM = dotV >= vMin && dotV <= vMax ? m : 0;
	set(
		attrsBuf,
		id,
		dx,
		dy,
		GENZ_NAMED_DOT.r,
		GENZ_NAMED_DOT.rgb,
		GENZ_NAMED_DOT.alpha * dotM
	);
	// ...and the line is clipped to the window at both ends, which this pass used
	// not to need: everything it drew was inside by assertion. SLJ's line crosses
	// the top edge now, which is the step.
	const sx1 = curveExit(segs, dotYr, from, vMin, vMax);
	const sx0 =
		sx1 === null ? 0 : Math.max(from, curveEntry(segs, sx1, from, vMin, vMax));
	if (sx1 !== null && sx1 > sx0) {
		sampleTrail(trailBuf, slot, segs, sx0, sx1, projX, yS, 0.35 * m);
	} else {
		collapseTrail(trailBuf, slot, dx, dy, 0.35 * dotM);
	}
	// after the line, never before — every trail writer zeroes this channel
	setTrailHighlight(trailBuf, slot, id === CLOSE_LEAD ? 1 : 0);
}

/**
 * The closing step's projected segments, written out on the future strip.
 *
 * Called from inside writeRaceSweepFrame for the same reason writeGenzLines is:
 * that function stays the SINGLE placer of everything on this chart, which is
 * what makes a settle byte-identical to its animation's last frame by
 * construction rather than by review.
 *
 * The five keep their SIM_SLOT trail block — the slots their win-count climbs
 * occupy on the simulation chart three steps earlier — so a line morphs into a
 * line rather than one retracting while another unspools.
 *
 * @param {number} proj the draw-on progress 0..1
 */
function writeProjectionLines(attrsBuf, trailBuf, cam, yS, vMin, vMax, proj) {
	const fs = raceFutureScale(cam);
	// no strip, nothing to draw — the same guard the strip's own ticks take
	if (fs.pitch <= 0) return;
	// The ONE place the strip's fitted scale touches a mark. Piecewise in YEAR,
	// and continuous at the break by construction: fs.x0 IS cam.xS(RACE_DATA_END).
	// A local, handed to sampleTrail and to nothing else — see raceFutureScale's
	// header for why this is not folded into cam.xS.
	const projX = (yr) => (yr <= RACE_DATA_END ? cam.xS(yr) : fs.xS(yr));
	// The draw-on playhead, in years: the present at 0, 2030 at 1. It starts at
	// the PRESENT rather than at the camera's left edge — the beat is the future
	// being drawn out of the record, so the year of measured history behind the
	// break is already there when the draw begins, and what travels is the part
	// nobody has measured.
	const drawYr = RACE_DATA_END + (RACE_FUTURE_END - RACE_DATA_END) * proj;
	for (const c of story.genz.candidates) {
		writeProjectionCurve(
			attrsBuf,
			trailBuf,
			c.id,
			CLOSE_PROJ_SEGS.get(c.id),
			Math.max(cam.camLeft, CLOSE_PROJ_FROM.get(c.id)),
			SIM_SLOT.get(c.id),
			CLOSE_CAST.has(c.id) ? 1 : 0,
			drawYr,
			projX,
			yS,
			vMin,
			vMax
		);
	}
	writeProjectionCurve(
		attrsBuf,
		trailBuf,
		SLJ,
		CLOSE_SLJ_SEGS,
		Math.max(cam.camLeft, CLOSE_SLJ_STUB_FROM),
		RACE_SLOT.get(SLJ),
		1,
		drawYr,
		projX,
		yS,
		vMin,
		vMax
	);
}

/**
 * The 99 Gen-Z contenders' trajectories, on the frame's own camera and axis.
 *
 * A near-copy of the race pass above rather than a shared loop, and deliberately
 * so: the two casts answer different questions and differ in three ways that
 * would each need a branch — these lines are ragged (4 to 25 points against the
 * race cast's uniform series), they carry no `visible` set and no lead, and
 * their emphasis is a fixed seven rather than whoever is in front. Folding them
 * together would cost more in conditionals than it saves in lines.
 *
 * The ink here is NOT the chapter's crown ink, and it is not an exception to the
 * rule either. On this step no race actor is on the plot at all — the camera has
 * panned off them — so nothing is being identified as "in front"; these seven
 * are the ones the story names, drawn exactly as `scatterGenZ` already draws
 * them (INK at r 5), so a reader meets the same seven marks on both charts.
 *
 * @param {Float64Array} attrsBuf @param {Float64Array} trailBuf
 * @param {ReturnType<typeof raceCamera>} cam
 * @param {(v: number) => number} yS
 * @param {number} vMin @param {number} vMax
 * @param {number} reveal arrival progress 0..1. The field TRAVELS: each dot
 *   enters at the plot's left edge and rides its own curve rightward until it
 *   reaches the present, trailing its history behind it. At 1 every dot has
 *   landed on its last data year, which is where the static layout puts it.
 */
function writeGenzLines(attrsBuf, trailBuf, cam, yS, vMin, vMax, reveal) {
	// The arrival playhead — a year, swept left to right, shared by all 99 so they
	// cross the plot as one cohort rather than 99 independent draw-ons.
	//
	// This is the opposite of the race chapter's entry, which unspools a line
	// leftward from a dot pinned at the right edge, and the difference is the
	// story each one is telling. There, the camera is a time machine and the
	// reader is being shown history that already happened. Here the actors are
	// ARRIVING: they come in from the past at the left and travel into the
	// present, which is the beat the chapter is about — and a tail growing
	// backwards out of a stationary dot says the reverse of that.
	const arriveFrom = cam.camLeft - cam.visibleSpan * GENZ_ARRIVE_LEAD;
	const arriveYr = arriveFrom + (RACE_DATA_END - arriveFrom) * reveal;
	for (const id of SIM_SERIES) {
		const segs = GENZ_SEGS.get(id);
		const slot = SIM_SLOT.get(id);
		const [ds, de] = GENZ_RANGE.get(id);
		const named = GENZ_NAMED.has(id);
		// the dot rides the arrival playhead, clamped to the actor's own data: one
		// who debuts inside the window waits at their first year rather than
		// sliding along a curve that does not exist yet, and every dot stops dead
		// on its last data year (2025 for all 99) instead of running on with the
		// camera, which this step parks past the present to make room for the strip
		const dotYr = Math.min(Math.max(arriveYr, ds), de);
		// ...so the line's right-hand end is the dot, and the SAME pixel ramp the
		// race pass uses for a line leaving at the left edge becomes this one's
		// entrance for free: it measures where the end actually sits, and here that
		// end is what is moving. No separate fade-in constant to keep in step.
		const onCamera = de >= cam.camLeft && ds <= cam.playhead && arriveYr >= ds;
		const edgeFade = clamp(
			(cam.xS(dotYr) - cam.left) / RACE_EDGE_FADE_PX,
			0,
			1
		);
		const m = onCamera ? edgeFade : 0;
		const dotV = curveYAt(segs, dotYr);
		const dotM = dotV >= vMin && dotV <= vMax ? m : 0;
		const dx = cam.xS(dotYr);
		const dy = yS(dotV);
		const dot = named ? GENZ_NAMED_DOT : raceDotSpec(false);
		set(attrsBuf, id, dx, dy, dot.r, dot.rgb, dot.alpha * dotM);
		if (m <= 0.002) {
			collapseTrail(trailBuf, slot, dx, dy, 0);
			continue;
		}
		const drawFloor = Math.max(cam.camLeft, ds);
		// the history trailing the dot, ending wherever the dot has got to
		const sx1 = curveExit(segs, dotYr, drawFloor, vMin, vMax);
		const sx0 =
			sx1 === null
				? 0
				: Math.max(
						cam.camLeft,
						ds,
						curveEntry(segs, sx1, drawFloor, vMin, vMax)
					);
		if (sx1 !== null && sx1 > sx0) {
			sampleTrail(trailBuf, slot, segs, sx0, sx1, cam.xS, yS, 0.35 * m);
		} else {
			collapseTrail(trailBuf, slot, dx, dy, 0.35 * dotM);
		}
		// after the line, never before — every trail writer zeroes this channel
		setTrailHighlight(trailBuf, slot, named ? 1 : 0);
	}
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
 * @returns {{axes: {x: import("../layout-types.js").Tick[], xBase:number, y: import("../layout-types.js").Tick[]}, takeover: import("../layout-types.js").TakeoverCallout|null, band: import("../layout-types.js").FutureBand|null, frontier: number, cam: ReturnType<typeof raceCamera>, yS: (v:number)=>number, visible: Set<number>, lead: number}}
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
	const [vMin, vMax] = raceWindowYFit(
		cam.camLeft,
		cam.camRight,
		frame.yOpen ?? 0,
		frame.yClose ?? 0
	);
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
		// ...unless the projection pass owns this actor, which writes both his dot
		// and his line out past the end of the data. Zeroed rather than skipped so
		// he is also out of the lead pick below: on a frame whose marks reach 2030,
		// "in front" is a question about where the lines END, not about the
		// stub of history left of the break (see CLOSE_LEAD).
		lineMs[i] =
			frame.proj !== undefined && CLOSE_OWNED.has(id)
				? 0
				: (alphaOf ? alphaOf(id) : visible.has(id) ? 1 : 0) *
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
	// The crown at this camera — unless the frame says there is no crown to show.
	// The ink means "in front of the race", and a step whose camera has travelled
	// off the race has nobody in front: left to itself this would hand the ink to
	// whichever straggler happens to sit nearest the top of the new window, which
	// says something false about them in the chapter's most loaded mark.
	const lead =
		frame.lead === false
			? null
			: raceLeadBy(
					(id) => dotMs[RACE_SLOT.get(id)] > 0,
					(id) => dotVs[RACE_SLOT.get(id)]
				);
	for (let i = 0; i < RACE_IDS.length; i++) {
		const id = RACE_IDS[i];
		// one writer per slot: an actor the projection pass places is not touched
		// here at all, or the two would fight over his dot and his trail
		if (frame.proj !== undefined && CLOSE_OWNED.has(id)) continue;
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
	// The Gen-Z field, on the same camera and the same axis. Written from inside
	// this function rather than beside it so that writeRaceSweepFrame stays the
	// SINGLE placer of everything on this chart — which is what makes a settle
	// byte-identical to its animation's last frame by construction rather than by
	// review, for the new lines exactly as for the old ones.
	// the backdrop first, so the contenders' lines are written over it
	if (frame.backdrop)
		writeBackdropLines(attrsBuf, trailBuf, cam, yS, vMin, vMax);
	if (frame.genz)
		writeGenzLines(attrsBuf, trailBuf, cam, yS, vMin, vMax, frame.genz);
	// ...and the closing step's projections, last: they are the only marks that
	// live out on the strip, and they own the slots they write. Tested against
	// undefined, not for truth: 0 is a real progress there (see RaceFrame.proj).
	if (frame.proj !== undefined)
		writeProjectionLines(attrsBuf, trailBuf, cam, yS, vMin, vMax, frame.proj);

	return {
		axes: raceAxes(
			cam,
			yS,
			vMin,
			vMax,
			frontier,
			frame.futureTicks !== false,
			frame.xTicks !== false
		),
		takeover: raceTakeoverCallout(cam, yS),
		band: raceFutureBand(cam, frontier, frame.proj !== undefined),
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
	/** @type {import("../layout-types.js").LayoutFn} */
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
				playhead: params?.playhead ?? raceRestPlayhead(w, h, step),
				// the step's own resting frontier, so a COLD MOUNT, a RESIZE and the
				// reduced-motion snap all land on the fully-open strip with nothing
				// left to play — the same contract an entry's last leg has to
				// meet, discharged here by construction rather than by an animation
				frontier: params?.frontier ?? step.frontier ?? RACE_DATA_END,
				// ...and the same contract for the camera's y travel and for the Gen-Z
				// draw-on: both rest where the step says, so every path that arrives
				// without an animation (cold mount, resize, reduced motion) lands on
				// the finished frame. `genzShown` is the reader's own press — the step
				// rests with the lines NOT drawn until they ask for them, which is why
				// this one reads a param before the step's declaration rather than
				// after it.
				yOpen: params?.yOpen ?? step.yOpen ?? 0,
				yClose: params?.yClose ?? step.yClose ?? 0,
				// ...and the closing step's draw-on, which rests DRAWN (proj: 1 on the
				// step). Left undefined on every other step rather than defaulted to
				// 0: absent means "not a projection frame", where 0 means "a
				// projection frame with nothing drawn yet" — the frame the arrival
				// animation starts from.
				proj: step.proj === undefined ? undefined : (params?.proj ?? step.proj),
				genz: step.genz ? (params?.genzShown ? 1 : 0) : 0,
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
			// ...and on the Gen-Z step the simulation block too: those 99 slots hold
			// the contenders' trajectories here and their win counts four steps
			// later, so this step must not retract what it is itself drawing.
			if ((step.genz || step.proj !== undefined) && SIM_TRAIL_SLOTS.has(t))
				return;
			if (step.backdrop && BACKDROP_TRAIL_SLOTS.has(t)) return;
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

const CLOSE_OVERLAY = {
	yLabel: "Remoteness",
	yTopLabel: "lower →",
	yBottomLabel: "← higher"
};

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

// ...and the Gen-Z step's, which consumes one interaction as well: whether the
// reader has asked for the lines yet. Spread rather than nested so the camera
// override keeps reading exactly as it does on every other race step.
const genzParams = (s) => ({ ...s.raceView, genzShown: s.genzLinesShown });

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
	// Its resting camera is the rewind's waypoint, not its extent's end: every
	// arrival path settles here — the retrace out of raceFuture pans back to it,
	// the forward step out of raceRecent lands on it, a cold mount opens on it —
	// so the reader always has the slider immediately usable from the same year,
	// and the crossing raceRecent's second step is about is still on the plot.
	restPlayhead: RACE_REWIND_WAYPOINT_YEAR,
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

// How much recent history the Gen-Z step keeps on the plot behind the present.
// THE dial for that step: three years is long enough for 99 lines to read as
// trajectories rather than as a column of dots, and short enough to leave the
// future strip most of the plot beside them. Clamped on a narrow viewport rather
// than shrinking the x scale — see raceTailPx.
export const RACE_GENZ_TAIL_YEARS = 3;

// raceGenz: raceFuture's view, with the camera panned DOWN onto the stretch of
// remoteness the Gen-Z contenders live on, and their 99 trajectories drawn under
// it when the reader asks.
//
// The DATA behind the race lines is raceFull's, unchanged, which is the point:
// the reader arrives on the chart they left and watches the camera travel off
// it. What is new is `yOpen`, the camera's y degree of freedom (see
// raceWindowYFit): at 1 the window is [2.3, 3.0], and the crown — which never
// comes within 2.09 of the centre — has left through the top.
//
// `yCap: RACE_GENZ_YCAP` (below) is what makes the race cast's departure a
// STATIC fact rather than something an animator has to remember: the step shows
// none of them, so its resting frame carries no race line at all and the pan's
// last frame lands on exactly that. The 224 lines are still placed on their own
// curves at alpha 0, as on every race step, so nothing flies in from off the
// plot when the reader steps away.
//
// `genz` says this step owns the simulation's trail block, and `tailYears` pins
// its camera by the left edge the way raceFuture's `tailPx` does — so it is
// unpannable by construction, and Index.svelte mounts no scrubber on it.
//
// Its subject is the seven the story names, which is what buys them a label:
// `highlight` is exempt from ScrollyVisual's ten-nearest cut.
export const RACE_GENZ_STEP = {
	extent: RACE_FULL_EXTENT,
	tailYears: RACE_GENZ_TAIL_YEARS,
	frontier: RACE_FUTURE_END,
	yOpen: 1,
	genz: true,
	// the camera has left the race, so no dot is "in front" — see the lead pick
	lead: false,
	// the backdrop, on for the whole step — the camera reveals it, see
	// writeBackdropLines
	backdrop: true,
	// the strip keeps its block and its label, but not its years — see raceAxes
	futureTicks: false,
	highlight: GENZ_NAMED_IDS
};

// ...and the cap on who it shows: none, the same as raceFull. The camera removes
// the crown race on this step, not a filter — a line either rides up and off the
// top edge as the window travels or is genuinely inside the ground the step lands
// on, and the ~128 race actors who sit in [2.30, 3.00] today are Hollywood at that
// remoteness as much as any sampled backdrop actor is. Capping them out would
// mean fading lines in the middle of the plot, which reads as the chart giving up
// rather than as a camera moving away from it.
const RACE_GENZ_YCAP = Infinity;

// The seven named contenders have to be ON the Gen-Z window, over every year the
// step's camera can reach. They are what the step is about, and a name in the
// gutter pointing at a dot the frame has hidden is worse than no name — so a
// data rebuild that moves one of them out of the window fails here rather than
// shipping a chart with a label attached to nothing. Same idiom as
// buildRaceAnchor's gap throw and solveTakeover's.
{
	const from = RACE_DATA_END - RACE_GENZ_TAIL_YEARS;
	for (const id of GENZ_NAMED_IDS) {
		const segs = GENZ_SEGS.get(id);
		if (!segs) throw new Error(`scrolly race: no Gen Z series for ${id}`);
		for (let yr = from; yr <= RACE_DATA_END; yr += 0.25) {
			const v = curveYAt(segs, yr);
			if (v < RACE_GENZ_Y_MIN || v > RACE_GENZ_Y_MAX) {
				throw new Error(
					`scrolly race: Gen Z name ${id} is off the window at ${yr} (${v})`
				);
			}
		}
	}
}

// raceClose: the story's last chart (PRD P-27-1). raceFuture's camera, with a
// year of measured history behind the present and the strip open to 2030 — plus
// two changes.
//
// `yClose: 1` puts it on a window of its own, read off the five contenders it
// draws (RACE_CLOSE_Y_MIN/MAX) and tighter than anything else in the chapter.
// SLJ is ABOVE its top edge today, which is what the step is: he is not on the
// chart when it opens, and arrives through the top as his line descends onto the
// ground the five are rising into.
//
// `proj` is the other: the frame draws marks out on the strip, which no other
// frame in the chapter does (see writeProjectionLines). It rests at 1 — fully
// drawn — so a cold mount, a resize and the reduced-motion snap all land on the
// finished frame with no animation having run; the arrival ramps it from 0
// (`drawProjections`, under "Choreographies").
//
// `lead: false` because the chapter's ink rule cannot be evaluated the usual way
// here. raceLeadBy ranks the RACE cast at the camera's right edge, and at this
// camera the right edge is 2030, where the only race actor is SLJ — it would
// hand him the crown on the very frame that shows him losing it. The projection
// pass picks the lead from where the lines END instead (CLOSE_LEAD), which is
// the same rule applied to the marks the step actually has.
//
// Its subject is SLJ and the contender who takes the crown from him.
export const RACE_CLOSE_STEP = {
	extent: RACE_FULL_EXTENT,
	tailYears: RACE_CLOSE_TAIL_YEARS,
	frontier: RACE_FUTURE_END,
	yClose: 1,
	proj: 1,
	// no x axis. The projections' horizon is each contender's career age 40, not
	// a calendar year, so a row of years under them labels the one thing on this
	// chart that is not being measured. What time does here — the present on the
	// left, the future on the right — is said by the block instead.
	xTicks: false,
	lead: false,
	highlight: [SLJ, CLOSE_LEAD]
};

// ...and the cap on who it shows: SLJ alone. Every one of the 224 race actors is
// on scale in 2025 at a window this wide, and with a one-year tail they would
// pile up as 200+ grey stubs in the sliver left of the axis break — at the one
// place on the chart that has to be read. The gap the cap sits in is real and
// asserted below: SLJ's record is 2.084 and the next-lowest race actor's is
// 2.115.
const RACE_CLOSE_YCAP = 2.1;

// Four things the step claims, in the idiom of the Gen-Z window check above. A
// data rebuild that breaks any of them fails here rather than shipping a chart
// whose picture contradicts its copy.
{
	const visible = raceContenders(
		RACE_FULL_EXTENT[0],
		RACE_FULL_EXTENT[1],
		RACE_CLOSE_YCAP
	);
	if (visible.size !== 1 || !visible.has(SLJ)) {
		throw new Error(
			`scrolly race: the closing step must show SLJ alone (got ${[...visible]})`
		);
	}
	const now = curveYAt(RACE_SEGS.get(SLJ), RACE_DATA_END);
	if (!(RACE_CLOSE_SLJ_END > now)) {
		throw new Error(
			`scrolly race: SLJ's closing landing ${RACE_CLOSE_SLJ_END} is not a recession from ${now}`
		);
	}
	// ...and he has to LEAVE from above the window, or he is simply on the chart
	// from the first frame and the step's whole arrival — a line coming in through
	// the top edge — silently becomes a line that was always there
	if (!(now < RACE_CLOSE_Y_MIN)) {
		throw new Error(
			`scrolly race: SLJ starts at ${now}, inside the closing window from ${RACE_CLOSE_Y_MIN}`
		);
	}
	if (RACE_CLOSE_SLJ_END > RACE_CLOSE_Y_MAX) {
		throw new Error(
			`scrolly race: SLJ's landing ${RACE_CLOSE_SLJ_END} is below the closing window`
		);
	}
	if (CLOSE_LEAD === SLJ) {
		throw new Error("scrolly race: nobody passes SLJ on the closing step");
	}
	for (const c of CLOSE_CANDIDATES) {
		// every year of every curve the step draws, not just its endpoints: the
		// window is read off these same numbers, so this is what catches a rebuild
		// where one of the five wanders out of the ground the other four set
		const drawn = [
			...story.genzSeries[c.id]
				.filter(([yr]) => yr >= RACE_DATA_END - RACE_CLOSE_TAIL_YEARS)
				.map(([, v]) => v),
			c.projMedian
		];
		for (const v of drawn) {
			if (!Number.isFinite(v)) {
				throw new Error(`scrolly race: contender ${c.id} has a missing value`);
			}
			if (v < RACE_CLOSE_Y_MIN || v > RACE_CLOSE_Y_MAX) {
				throw new Error(
					`scrolly race: contender ${c.id} draws ${v}, off the closing window [${RACE_CLOSE_Y_MIN}, ${RACE_CLOSE_Y_MAX}]`
				);
			}
		}
		if (!(c.projMedian < RACE_CLOSE_SLJ_END)) {
			throw new Error(
				`scrolly race: contender ${c.id} ends at ${c.projMedian}, behind SLJ's ${RACE_CLOSE_SLJ_END}`
			);
		}
	}
}

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
// regardless of arrival path; the retrace out of raceFuture (`closeFuture`)
// animates getting there instead of snapping.
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

// One layout instance for the closing chart and for the dissolve that follows
// it, so the last two steps of the story cannot drift apart.
const RACE_CLOSE_LAYOUT = raceLayout(RACE_CLOSE_STEP, RACE_CLOSE_YCAP);

/**
 * The ids the closing chart actually draws, read off the alpha its frame
 * writer left behind rather than off the step's `visible` set: that set is the
 * race cast alone, which on this step is SLJ and nobody else (see the
 * assertion under RACE_CLOSE_CANDIDATES), while the chart also carries the
 * five simulated contenders through the trail slots. All of them have to ride
 * the camera out together, so the alpha is the honest test of who is on screen.
 */
function outroCast(nodes, rawAttrs) {
	/** @type {Set<number>} */
	const cast = new Set();
	for (const n of nodes) if (rawAttrs[n.id * STRIDE + 6] > 0) cast.add(n.id);
	return cast;
}

/**
 * The closing chart's own dots, `e` of the way through the pull-back: scaled
 * about the same focal point the crowd pulls back around, and greying into
 * that crowd as they shrink, so by the settle they are indistinguishable from
 * the twelve thousand around them. hopSeed's beat — the fifteen greying into
 * the field as the camera leaves them — played on the closing chart's cast.
 *
 * At e = 0 this reproduces the charted frame exactly, which is what lets the
 * arrival tween fade the lines out underneath a set of dots that have not
 * moved yet; the leg then carries them out.
 *
 * One writer for the animated leg and the static settle both, so the two
 * cannot disagree about where the beat lands.
 */
function writeOutroCast(attrs, rawAttrs, cast, bx, by, e) {
	const scale = 1 + (PULLBACK_ZOOM - 1) * e;
	const crowdR = NETWORK_INTRO_RADIUS[1] * scale;
	for (const id of cast) {
		const i = id * STRIDE;
		// they land in the crowd's DEPTH as well as its size and grey, each at the
		// place in the volume the sky already has them — six dots at one flat
		// distance would be a plane laid across a sky that has a front and a back
		const d = fieldDepth(id);
		const landR = crowdR * depthSize(d);
		const landA = FIELD_ALPHA * depthFade(d) * flightWindow(skyFrac(id, 0));
		set(
			attrs,
			id,
			bx + (rawAttrs[i] - bx) * scale,
			by + (rawAttrs[i + 1] - by) * scale,
			rawAttrs[i + 2] + (landR - rawAttrs[i + 2]) * e,
			[
				rawAttrs[i + 3] + (CROWD[0] - rawAttrs[i + 3]) * e,
				rawAttrs[i + 4] + (CROWD[1] - rawAttrs[i + 4]) * e,
				rawAttrs[i + 5] + (CROWD[2] - rawAttrs[i + 5]) * e
			],
			rawAttrs[i + 6] + (landA - rawAttrs[i + 6]) * e
		);
	}
}

/**
 * outro's static frame: the closing chart's furniture gone — axes, lines,
 * names — and its dots pulled back into the full-bleed crowd, greyed into it
 * where the camera leaves them. Unlike hopSeed this does NOT redraw the
 * fifteen-actor constellation (`writeNetwork`): that beat belongs to the
 * story's opening, and reintroducing Bacon and his co-stars here would read as
 * jumping back into the intro rather than closing on the corpus the whole
 * story has been drawn from.
 * @type {import("../layout-types.js").LayoutFn}
 */
function layoutOutroGalaxy(nodes, w, h, edges, params, bleed = NO_BLEED) {
	const raw = RACE_CLOSE_LAYOUT(nodes, w, h, edges, params);
	const { attrs, trails } = dissolve(RACE_CLOSE_LAYOUT)(
		nodes,
		w,
		h,
		edges,
		params
	);
	const cast = outroCast(nodes, raw.attrs);
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	// the cast is skipped by the crowd sweep and written by the cast writer
	// instead: they are already somewhere meaningful, and a fieldSpot of their
	// own would fly them off the chart they are standing on
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM, galaxyBox(w, h, bleed), cast);
	writeOutroCast(attrs, raw.attrs, cast, bx, by, 1);
	return { attrs, trails };
}

/**
 * outro's pull-back: hopSeed's bloom, with the closing chart's own cast riding
 * the camera out in place of the intro constellation — see `layoutOutroGalaxy`
 * for why the fifteen stay out of it.
 *
 * The chart's LINES are not this writer's business. They go down over the
 * arrival tween, before the leg starts, so the reader watches the graph empty
 * out and then the camera leave — the same two-beat shape the other line
 * charts arrive with, not a zoom through a chart still fading.
 *
 * `raw`, `cast` and the focal point are struck once outside the closure,
 * alongside `box`, for the same reason as hopSeed's own leg: a frame built
 * against a different cast or box than the static layout settles onto would
 * snap on landing.
 */
function outroGalaxyFrames(nodes, w, h, _edges, params, bleed = NO_BLEED) {
	const box = galaxyBox(w, h, bleed);
	const raw = RACE_CLOSE_LAYOUT(nodes, w, h, null, params);
	const cast = outroCast(nodes, raw.attrs);
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	return (attrs, _trails, _phase, e) => {
		writeFieldCrowd(attrs, w, h, 1 + (PULLBACK_ZOOM - 1) * e, box, cast);
		writeOutroCast(attrs, raw.attrs, cast, bx, by, e);
	};
}

// Every line on the closing chart carries its name. It used to carry two, and
// the reason was crowding: the five land between 2.1925 and 2.2472, which was
// 0.055 of a 0.95 domain — under 6% of the plot's height, close enough that the
// de-collider would have hung every one of them off a leader line. The closing
// window is half as tall, so the same band is now ~11%, and with the field gone
// there are six lines on the chart in total. An unnamed line among six is a
// person the chart is pointing at without saying who.
//
// To the LEFT of the dot, unlike every other race step: the dot column is out at
// the strip's far edge (fullRight), so a name to its right would run off the
// canvas. It is also the side simRace puts its names on, so the names the reader
// is carrying keep their side of the dot through the morph.
const RACE_CLOSE_LABEL_IDS = [SLJ, ...CLOSE_CANDIDATES.map((c) => c.id)];
const RACE_CLOSE_LABELS = {
	labels: RACE_CLOSE_LABEL_IDS,
	labelDirs: Object.fromEntries(RACE_CLOSE_LABEL_IDS.map((id) => [id, "left"]))
};

// ---------------------------------------------------------------------------
// Choreographies. The chapter's arrivals and the reader's asks, declared on the
// states below as EntryAnim / RequestAnim (see states.js) and run by
// ScrollyVisual's generic runner. Every leg moves one camera or reveal
// parameter over a RaceFrame and writes it through writeRaceSweepFrame, so the
// frame writer stays the SINGLE placer of everything on this chart — which is
// what makes a leg's last frame the layout it hands off to by construction
// rather than by review. Each leg publishes the frame's axes, callout and
// future block as decor and its camera as the live camera (FrameOutput), and
// every choreography finishes by holding the camera where it stopped
// (story.raceView), so the param retarget that follows moves nothing.
// ---------------------------------------------------------------------------

/** the draw-on's length: the lines unspool leftward across the visible span */
const SWEEP_MS = 4000;
// px/sec the camera pans during a rewind leg — one consistent on-screen speed
// for every leg, rather than a fixed duration regardless of how many years it
// covers (a 19yr and a 12yr leg at the same duration read as two different
// speeds). Deriving the duration from distance also keeps that speed constant
// if pxPerYear is retuned live: the pixel distance a leg travels is
// `years * pxPerYear`, so a wider x scale gets a proportionally longer pan
// instead of covering the same time in more pixels.
const REWIND_PX_PER_SEC = 300;
const REWIND_MS_MIN = 1200;
const REWIND_MS_MAX = 6000;
// How long raceFuture's second leg takes to open the future strip. A duration
// rather than a px/sec like every other leg, because this leg moves no camera:
// the distance its frontier covers is the strip's own width — ~313px on a
// desktop, ~60px on a phone — so held to a constant speed the phone would open
// in 200ms and the desktop in a second, the opposite of a consistent beat.
const FUTURE_OPEN_MS = 1400;
// raceGenz's pan down off the crown, and the arrival the reader asks for after
// it — slower than the pan by design: 99 actors travelling in from the left is
// the thing they pressed a button to watch, a real journey across the plot
// rather than a reveal.
const GENZ_OPEN_MS = 2200;
const GENZ_DRAW_MS = 2600;
// The closing chart's projections travelling out to 2030. Slower than the strip
// merely opening: there the reader watches empty ground appear, here six lines
// cross it and change places, and the crown changing hands is the last thing
// the story says.
const CLOSE_DRAW_MS = 2600;
// how far into a leg a departing actor is fully gone. Departures finish EARLY
// rather than riding the whole leg for the way it reads: the modern crowd drops
// away first, leaving the actors the step is about.
const SHOWN_DEPART_END = 0.35;
// how far into raceRecent's draw-on its actors fade fully in. Short, relative
// to the 4s sweep — they should read as "arriving" once the rank crowd has
// cleared, not as a second slow reveal riding the whole draw-on.
const SHOWN_ARRIVE_END = 0.15;

// every duration above is multiplied by the live speed scale (see
// setRaceSpeedScale), so the dev tuner retimes the whole chapter at once
const scaled = (ms) => ms * speedScale;

/** how long a camera pan from one year to another takes, at REWIND_PX_PER_SEC */
function rewindMs(fromP, toP) {
	const px = Math.abs(toP - fromP) * pxPerYear;
	return scaled(
		clamp((px / REWIND_PX_PER_SEC) * 1000, REWIND_MS_MIN, REWIND_MS_MAX)
	);
}

// The frame builders. All of them hold the state's content extent fixed — only
// the camera (playhead) or a reveal moves — so what's shown, the y-fit and the
// x scale are constant for a whole leg.
//
// draw-on: the camera stands still at the resting playhead while the lines
// unspool leftward across the visible span, so e = 1 is byte-identical to the
// static layout (both sample exactly [camLeft, playhead]). `step` is the state's
// race descriptor — its extent AND its highlight, so an animated frame dims
// exactly what its settle dims.
const entryFrame = (step) => (e) => ({
	...step,
	playhead: step.extent[1],
	reveal: e
});
// a camera pan from fromP to toP. At a fixed px-per-year this is a pure
// translation by construction — dots stay pinned to the plot's right edge (see
// writeRaceSweepFrame's dotYr) while the ticks and curves slide beneath them.
const rewindFrame = (step, legExtent, fromP, toP) => (e) => ({
	...step,
	extent: legExtent,
	playhead: fromP + (toP - fromP) * e
});
// The content extent a leg runs under: every year the camera will put on the
// plot across the whole pan, whichever direction it travels. Held constant for
// the leg (rather than tracking the moving camera) so what the leg shows, its
// y fit and its tick range can't change under the reader mid-pan.
const raceLegExtent = (w, h, fromP, toP) =>
	/** @type {[number, number]} */ ([
		Math.min(fromP, toP) - raceVisibleSpan(w, h),
		Math.max(fromP, toP)
	]);
// raceFuture leg 0 — "fast-forward to the present". The same pure translation
// rewindFrame does, with the strip explicitly SHUT: RACE_FUTURE_STEP carries its
// own resting frontier, and the spread would otherwise open the block on the
// pan's very first frame.
const futurePanFrame = (legExtent, fromP, toP) => (e) => ({
	...RACE_FUTURE_STEP,
	extent: legExtent,
	playhead: fromP + (toP - fromP) * e,
	frontier: RACE_DATA_END
});
// raceFuture leg 1 — "the future opens". NOT a camera move: the camera is parked
// and only the frontier advances. The extent stays the STEP's, because e = 1 has
// to reproduce the static settle and the settle's extent is the step's.
const futureOpenFrame = (restP, fromF, toF) => (e) => ({
	...RACE_FUTURE_STEP,
	playhead: restP,
	frontier: fromF + (toF - fromF) * e
});
// raceGenz's pan — "the camera pans down". Not a camera move in x: the playhead
// is parked and only yOpen travels, so the lines hold still while the axis under
// them opens onto the Gen-Z window (see raceWindowYFit). The strip stays open
// throughout: the reader arrived looking at it and it is not what this leg is
// about.
const genzOpenFrame = (restP) => (e) => ({
	...RACE_GENZ_STEP,
	playhead: restP,
	yOpen: e,
	genz: 0
});
// the Gen Z field's arrival, the reader's own press. The camera is settled on
// both axes and only the arrival playhead moves, so e = 1 is byte-identical to
// the static layout with `genzShown` set, which is what the settle lands on.
const genzDrawFrame = (restP) => (e) => ({
	...RACE_GENZ_STEP,
	playhead: restP,
	yOpen: 1,
	genz: e
});
// raceClose — "the projections are drawn out of the present". The camera is
// parked on both axes and only `proj` travels, so e = 1 is byte-identical to
// the static layout (RACE_CLOSE_STEP rests at proj 1).
const closeDrawFrame = (restP) => (e) => ({
	...RACE_CLOSE_STEP,
	playhead: restP,
	proj: e
});
/** a reader-driven pan or a settled hold: the step's chart at one playhead year */
export const racePanFrame = (step, playhead) => ({ ...step, playhead });

// Per-frame alpha for one leg. `shown` is {from, to}: what the step being left
// showed and what the landing step shows — NOT cast membership, which is
// RACE_CAST on every race step. Actors the landing step adds fade in over the
// leg, ones it drops fade out over SHOWN_DEPART_END, everyone else rides at full
// strength, so a visibility change glides across the leg instead of popping
// when the settle layout's filter kicks in.
const shownAlpha = (shown) => (e) => (id) =>
	shown.to.has(id)
		? shown.from.has(id)
			? 1
			: e
		: shown.from.has(id)
			? Math.max(0, 1 - e / SHOWN_DEPART_END)
			: 0;

/**
 * @typedef {Object} RaceLeg
 * @property {number} ms
 * @property {(e: number) => Object} frame the RaceFrame at eased progress e
 * @property {number} yCap
 * @property {(e: number) => (id: number) => number} [alpha]
 */

/** one frame of a leg into the live buffers; what it returns is what ScrollyVisual publishes */
function writeLeg(attrs, trails, w, h, leg, e) {
	const { axes, takeover, band, frontier, cam } = writeRaceSweepFrame(
		attrs,
		trails,
		w,
		h,
		leg.frame(e),
		leg.yCap,
		leg.alpha ? leg.alpha(e) : null
	);
	return {
		decor: { axes, takeover, band },
		camera: { playhead: cam.playhead, frontier }
	};
}

/**
 * An EntryAnim / RequestAnim whose legs are planned per arrival: `plan(ctx)`
 * returns the RaceLegs to play (possibly none), and `fields` are the rest of the
 * declaration. `phases` and `frames` both derive from the same plan, so they
 * cannot disagree about how many legs there are.
 * @param {(ctx: import("../states.js").ArrivalContext) => RaceLeg[]} plan
 * @param {Object} [fields]
 */
function raceChoreography(plan, fields = {}) {
	return {
		...fields,
		phases: (ctx) => plan(ctx).map((leg) => leg.ms),
		frames: (_nodes, w, h, _edges, _params, _bleed, ctx) => {
			const legs = plan(ctx);
			return (attrs, trails, i, e) => writeLeg(attrs, trails, w, h, legs[i], e);
		}
	};
}

// The finish the chapter's choreographies share: hold the camera where the last
// frame left it, as the step's `raceView` param. The layout at that param IS the
// last frame, so the param retarget that follows moves nothing.
const holdCamera = (s, cam) => {
	s.raceView = { playhead: cam.playhead, frontier: cam.frontier };
};
// ...and the one for a retrace, which lands on a named year whether or not it
// had any pan left to play
const landAt = (playhead) => (s) => {
	s.raceView = { playhead };
};

// -- raceRecent: the rank list hands over, and the lines draw on --------------
// The canvas parks on a copy of the collapsed rank list — every bar folded into
// the node that IS its dot on this chart (raceDotSpec: the same spot, radius,
// colour and alpha RankBars' HTML circle reads), the rest of the rank scene at
// alpha 0 — and waits for the overlay to stand down (story.rankCollapsed:
// RankBars owns that clock). When it does, the canvas underneath is holding the
// identical nodes, so the swap has nothing to show, and the flight carries them
// up onto the chart. Ranks past the bottom of the panel — most of the cast; the
// list shows the top 250 and only ~20 rows fit — depart from its bottom edge at
// alpha 0: the reader never saw those rows, so there is no node to hand over,
// and anything parked further down would draw over the step's prose.
function collapsedFrame(_nodes, _w, _h, _edges, _params, _bleed, ctx) {
	const rows = ctx.story.rankListRows;
	return (attrs, trails) => {
		for (let i = 0, id = 0; i < EDGE_BASE; i += STRIDE, id++) {
			if (rows && RACE_RECENT_VISIBLE.has(id)) {
				const dot = raceDotSpec(id === RACE_RECENT_LEAD);
				const y = rows.top + ORDER_OF.get(id) * rows.pitch;
				const offList = y > rows.bottom;
				set(
					attrs,
					id,
					rows.cx,
					offList ? rows.bottom : y,
					dot.r,
					dot.rgb,
					offList ? 0 : dot.alpha
				);
			} else {
				attrs[i + 6] = 0;
			}
		}
		// the intro network's links go with the crowd: a reader who got here
		// faster than they could fade would otherwise keep them, drawn between
		// two live dots, right through the flight
		for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) attrs[i + 1] = 0;
		// ...and no line is drawn under the list
		for (let t = 0; t < TRAIL_META.length; t++) {
			trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
		}
	};
}

// The frame the flight lands on: the draw-on's frame 0, but with every trail
// collapsed at alpha 0 rather than carrying its stroke alpha. The flight TWEENS
// onto this frame, and on a re-entry (the reader stepped back to the rank
// chapter and forward again) the buffer still holds the previous visit's curve
// geometry — a non-zero alpha here would fade those lines in, squeezing toward
// the present edge, before the draw-on has drawn anything. The dots keep the
// alpha the chart gives them when they were flown in out of the list already
// lit; dipping them back to nothing would blink the whole cast off.
function drawOnSeed(_nodes, w, h, _edges, _params, _bleed, ctx) {
	const flownIn = Boolean(ctx.story.rankListRows);
	const frame = entryFrame(RACE_RECENT_STEP)(0);
	return (attrs, trails) => {
		writeRaceSweepFrame(attrs, trails, w, h, frame, RACE_RECENT_YCAP, () => 0);
		if (!flownIn) return;
		const lit = new Float64Array(ATTR_SIZE);
		writeRaceSweepFrame(
			lit,
			new Float64Array(TRAIL_SIZE),
			w,
			h,
			frame,
			RACE_RECENT_YCAP,
			() => 1
		);
		for (const id of RACE_RECENT_VISIBLE) {
			attrs[id * STRIDE + 6] = lit[id * STRIDE + 6];
		}
	};
}

// The draw-on itself: the actors' lines unspool leftward across the visible
// span and settle on the present-day view. It removes no information, so it
// needs no consent; the rewind that follows does (see `rewind`). Its alpha is a
// plain fade-in over SHOWN_ARRIVE_END — every contender is arriving fresh, with
// no prior membership to compare against — unless the flight already carried
// them in lit out of the rank list.
const drawOn = raceChoreography(
	(ctx) => {
		const flownIn = Boolean(ctx.story.rankListRows);
		const arrive = (e) => (id) =>
			RACE_RECENT_VISIBLE.has(id)
				? flownIn
					? 1
					: Math.min(1, e / SHOWN_ARRIVE_END)
				: 0;
		return [
			{
				ms: scaled(SWEEP_MS),
				frame: entryFrame(RACE_RECENT_STEP),
				yCap: RACE_RECENT_YCAP,
				alpha: arrive
			}
		];
	},
	{
		// the chart's furniture waits behind the rank list until the flight lands
		veil: true,
		// the flight is the list re-spacing itself into the chart; a hashed
		// per-node start would scramble the top-to-bottom order the reader reads
		arrivalJitter: 0,
		// the names ride their dots once the flight has landed them on the chart
		labelsAfter: [[]],
		hold: { until: (s) => s.rankCollapsed, frame: collapsedFrame },
		seed: drawOnSeed,
		finish: holdCamera
	}
);

// Stepping BACK into raceRecent from raceFull retraces the rewind instead of
// cutting to a tween, landing on RACE_REWIND_WAYPOINT_YEAR — where raceRecent
// rests once its own rewind has run, so stepping forward again picks up from
// the same place. Starts from the camera raceFull was actually on (a reader's
// own pan, or a pan mid-flight), so nothing jumps to a resting year first. The
// whole cast raceFull shows drops back to the field raceRecent does, over the
// same early departure window every leg uses.
const retraceRewind = raceChoreography(
	(ctx) => {
		const { w, h } = ctx;
		const fromP = ctx.exit.playhead ?? raceFullRestPlayhead(w, h);
		const toP = RACE_REWIND_WAYPOINT_YEAR;
		// the camera already sits at or ahead of the waypoint — on a viewport wide
		// enough for that there was no pan to retrace
		if (fromP >= toP) return [];
		return [
			{
				ms: rewindMs(fromP, toP),
				frame: rewindFrame(
					RACE_RECENT_STEP,
					raceLegExtent(w, h, fromP, toP),
					fromP,
					toP
				),
				yCap: RACE_RECENT_YCAP,
				alpha: shownAlpha({
					from: raceStepVisible(RACE_FULL_STEP, Infinity),
					to: RACE_RECENT_VISIBLE
				})
			}
		];
	},
	{
		from: ["raceFull"],
		ownsArrival: true,
		finish: landAt(RACE_REWIND_WAYPOINT_YEAR)
	}
);

// The rewind, once the reader presses Start: the camera pans back from wherever
// it is to the waypoint and stops there, within raceRecent — raceFull then rests
// on the same year, so the "camera moving back in time" reads as one motion
// across two steps. It starts from the LIVE camera, so an ask that lands
// mid-draw-on continues from where the reader can see the camera rather than
// snapping to the present first; and a chart already parked at the waypoint has
// no pan left to play, so that ask is dropped rather than running a full
// REWIND_MS_MIN of zero travel. The visible set is passed in rather than read
// off the leg's wider extent, so nobody leaks in from the years the pan crosses.
const rewind = raceChoreography(
	(ctx) => {
		const { w, h } = ctx;
		const fromP = ctx.camera.playhead;
		const toP = RACE_REWIND_WAYPOINT_YEAR;
		if (fromP <= toP) return [];
		return [
			{
				ms: rewindMs(fromP, toP),
				frame: rewindFrame(
					RACE_RECENT_STEP,
					raceLegExtent(w, h, fromP, toP),
					fromP,
					toP
				),
				yCap: RACE_RECENT_YCAP,
				alpha: shownAlpha({
					from: RACE_RECENT_VISIBLE,
					to: RACE_RECENT_VISIBLE
				})
			}
		];
	},
	{ finish: holdCamera }
);

// -- raceFull <-> raceFuture ---------------------------------------------------
// Forward, in two legs. Leg 0, "fast-forward to the present": the camera leaves
// the past and pans forward until a stub of history is all that is left on the
// plot, so the lines slide off to the left and every dot comes to rest in a
// column just inside the left edge, at full opacity. Leg 1, "the future opens":
// the camera is PARKED and a frontier advances across the plot width the pan
// left over, growing the future block and bringing its ticks in behind it.
// Skipping the pan when there is none left still plays the opening — the strip
// is the step's whole subject, not a flourish on the way in.
const openFuture = raceChoreography(
	(ctx) => {
		const { w, h } = ctx;
		const restP = raceMaxPlayhead(w, h, RACE_FUTURE_STEP);
		const fromP = ctx.exit.playhead ?? RACE_REWIND_WAYPOINT_YEAR;
		const open = {
			ms: scaled(FUTURE_OPEN_MS),
			frame: futureOpenFrame(restP, RACE_DATA_END, RACE_FUTURE_END),
			yCap: Infinity
		};
		if (fromP >= restP) return [open];
		return [
			{
				ms: rewindMs(fromP, restP),
				frame: futurePanFrame(raceLegExtent(w, h, fromP, restP), fromP, restP),
				yCap: Infinity
			},
			open
		];
	},
	{ ownsArrival: true, finish: holdCamera }
);

// ...and both legs retraced, stepping back: the strip closes from wherever it
// had got to (a reader who stepped back during leg 0 has a shut strip and an
// off-rest camera, and nothing to close), then the camera pans back to the
// waypoint raceFull rests on by every path.
const closeFuture = raceChoreography(
	(ctx) => {
		const { w, h } = ctx;
		const fromP = ctx.exit.playhead ?? raceMaxPlayhead(w, h, RACE_FUTURE_STEP);
		const fromF = ctx.exit.frontier;
		const toP = RACE_REWIND_WAYPOINT_YEAR;
		const legs = [];
		if (fromF > RACE_DATA_END) {
			legs.push({
				// proportional to how far it actually has to close
				ms:
					scaled(FUTURE_OPEN_MS) *
					((fromF - RACE_DATA_END) / (RACE_FUTURE_END - RACE_DATA_END)),
				frame: futureOpenFrame(fromP, fromF, RACE_DATA_END),
				yCap: Infinity
			});
		}
		if (fromP > toP) {
			// RACE_FULL_STEP, not RACE_FUTURE_STEP: the leg lands on raceFull, so its
			// highlight has to be the one the settle uses; its frame carries no
			// frontier, so the strip stays shut for the whole pan
			legs.push({
				ms: rewindMs(fromP, toP),
				frame: rewindFrame(
					RACE_FULL_STEP,
					raceLegExtent(w, h, fromP, toP),
					fromP,
					toP
				),
				yCap: Infinity
			});
		}
		return legs;
	},
	{
		from: ["raceFuture"],
		ownsArrival: true,
		finish: landAt(RACE_REWIND_WAYPOINT_YEAR)
	}
);

// -- raceGenz: the camera pans down, then the field arrives -------------------
// The arrival tween flies the crowd onto the chart the reader left at the end
// of the race chapter — the pan's frame 0: the crown window, the whole cast,
// the strip already open — and the pan down off the crown is chained off it.
// No fade for the cast: the camera is what removes the crown race. Every line
// either rides up and off the top edge as the window travels (curveExit ends
// it there, like any line chart) or is genuinely inside the ground the step
// lands on and stays as part of the crowd. The names are held through the
// arrival: the contenders' dots are still fading out of the chapter card's
// crowd, nowhere near where they are about to be.
const panDown = raceChoreography(
	(ctx) => {
		const restP = raceMaxPlayhead(ctx.w, ctx.h, RACE_GENZ_STEP);
		return [
			{ ms: scaled(GENZ_OPEN_MS), frame: genzOpenFrame(restP), yCap: Infinity }
		];
	},
	{ labelsAfter: [[]], finish: holdCamera }
);
// the reader's press: the 99 travel in from the past at the left into the
// present, and the story moves on when they land (the step's `advanceon`
// watches `genzLinesShown`)
const drawGenz = raceChoreography(
	(ctx) => {
		const restP = raceMaxPlayhead(ctx.w, ctx.h, RACE_GENZ_STEP);
		return [
			{ ms: scaled(GENZ_DRAW_MS), frame: genzDrawFrame(restP), yCap: Infinity }
		];
	},
	{
		finish: (s, cam) => {
			s.genzLinesShown = true;
			holdCamera(s, cam);
		}
	}
);

// -- raceClose: the projections draw out of the present -----------------------
// Two beats, and the first is the plain arrival tween aimed at the draw's frame
// 0: every line standing on the present with nothing yet out on the strip, the
// 94 contenders this step does not draw already at alpha 0 on their own curves.
// The five keep the trail slots their win-count climbs occupy on the simulation
// chart, so a line morphs into a line — the object constancy those slots were
// shared for. SLJ's entrance is not scheduled here: he leaves 2025 above the
// window's top edge, so the frame writer's own clip brings him in through the
// top as the draw passes the year his line descends onto the plot.
const drawProjections = raceChoreography(
	(ctx) => {
		const restP = raceMaxPlayhead(ctx.w, ctx.h, RACE_CLOSE_STEP);
		return [
			{
				ms: scaled(CLOSE_DRAW_MS),
				frame: closeDrawFrame(restP),
				yCap: RACE_CLOSE_YCAP
			}
		];
	},
	{ finish: holdCamera }
);

export const states = {
	raceRecent: {
		layout: raceLayout(RACE_RECENT_STEP, RACE_RECENT_YCAP),
		title: "The center of Hollywood, over time",
		race: RACE_RECENT_STEP,
		yCap: RACE_RECENT_YCAP,
		// its camera runs between its own extent's ends — the rewind parks it on
		// RACE_REWIND_WAYPOINT_YEAR, which sits inside that range
		...raceLabelSpec(...RACE_RECENT_EXTENT),
		overlay: OVERLAY,
		params,
		// the draw-on plays on the forward arrival out of the rank chapter; the
		// retrace, on the step back from raceFull, carries its own `from`
		revealFrom: ["rankReveal"],
		entry: [drawOn, retraceRewind],
		requests: { rewind }
	},
	raceFull: {
		layout: raceLayout(RACE_FULL_STEP, Infinity),
		title: "The center of Hollywood, over time",
		race: RACE_FULL_STEP,
		// the whole chapter's span: its camera floor is the pan floor on a narrow
		// viewport and later on a wide one (raceFullRestPlayhead), and the reader
		// can pan it forward to the present — so the range covers every width
		// rather than a resting year that only one width actually lands on
		...RACE_FULL_LABELS,
		overlay: OVERLAY,
		params,
		// No choreography of its own on the forward arrival: the reader lands with
		// the camera already resting on the waypoint (ScrollyVisual's camera reset
		// puts raceFull there by every path) and the scrubber usable at once,
		// rather than watching a forced pan before getting control. Stepping back
		// from raceFuture retraces that step's two legs.
		entry: closeFuture
	},
	raceGenz: {
		// no yCap in the raceFull sense — a cap BELOW the field, so the race cast
		// is off this step entirely and the Gen-Z lines have the plot to themselves
		layout: raceLayout(RACE_GENZ_STEP, RACE_GENZ_YCAP),
		title: "The center of Hollywood, over time",
		race: RACE_GENZ_STEP,
		yCap: RACE_GENZ_YCAP,
		// the seven the story names, in the chapter's own gutter position. Not
		// raceLabelSpec's top ten: that rule answers "who is nearest the centre at
		// this camera", and at this camera the answer is nobody — every race actor
		// is above the window.
		labels: GENZ_NAMED_IDS,
		labelDirs: Object.fromEntries(GENZ_NAMED_IDS.map((id) => [id, "right"])),
		overlay: OVERLAY,
		params: genzParams,
		// the camera pans down off the crown on arrival from the chapter card, and
		// the field arrives when the reader asks
		revealFrom: ["chapterCenters"],
		entry: panDown,
		requests: { genzLines: drawGenz }
	},
	raceClose: {
		layout: RACE_CLOSE_LAYOUT,
		// not the chapter's shared title: two thirds of the ink on this chart is
		// modelled, and the axis it is drawn on runs past the end of the record
		title: "Where the center of Hollywood could be in 2030",
		race: RACE_CLOSE_STEP,
		yCap: RACE_CLOSE_YCAP,
		...RACE_CLOSE_LABELS,
		// the chapter's overlay without its x title: there is no x axis on this
		// step for it to name (see RACE_CLOSE_STEP's xTicks)
		overlay: CLOSE_OVERLAY,
		params,
		// Scoped to the forward arrival: stepping back out of the outro is a state
		// change into this one, and replaying the draw there would animate the
		// reader backwards into a beat they have already been shown.
		revealFrom: ["simRace"],
		entry: drawProjections
	},
	outro: {
		// the closing beat: the chart the reader is on dissolves exactly where it
		// lies — nothing on it moves — while the anonymous corpus it was drawn
		// from blooms up around it at hopSeed's own pull-back, echoing the
		// story's opening at its close. Built on the SAME RACE_CLOSE_LAYOUT
		// instance as raceClose so the two can never disagree about what is
		// being faded out.
		layout: layoutOutroGalaxy,
		// NO `race` descriptor, and so no `yCap` either, though the layout is
		// still built on the closing chart. Three things follow from the state
		// declaring itself a race step, and this beat wants none of them: the
		// label cut seeds its keep-list from `race.highlight` and would hold
		// SLJ's name up over an anonymous crowd whatever `labels` says
		// (ScrollyVisual's raceLabelCut); the draw pass culls the cast to the
		// plot rectangle, which would clip a sky authored past it; and the pan
		// loop would answer a drag by writing a race frame straight over the
		// galaxy (ScrollyVisual's scrubLoop).
		params,
		// no overlay: the axis titles are furniture on a chart that is leaving
		//
		// forward-only: outro is the last step, so this never actually replays on
		// a backward arrival, but every other bespoke choreography in this file
		// scopes itself explicitly rather than leaving it implicit
		revealFrom: ["raceClose"],
		entry: { phases: [PULLBACK_ZOOM_MS], frames: outroGalaxyFrames },
		// the story ends on a sky that is still moving. FIELD_IDS covers the
		// closing chart's cast too — they are actors with hops like anyone else,
		// and the base each dot flies from is read back out of the layout, so it
		// makes no difference which writer put a given dot there. The fifteen
		// are the only ones left out, and this state never draws them.
		ambient: { frames: makeFlight(layoutOutroGalaxy, FIELD_IDS) }
	},
	raceFuture: {
		// no yCap, same as raceFull: the whole cast, on a chart whose camera has
		// run forward to the present with a fitted strip of future beside it
		layout: raceLayout(RACE_FUTURE_STEP, Infinity),
		title: "The center of Hollywood, over time",
		race: RACE_FUTURE_STEP,
		// raceFull's names exactly — the union over the arrival pan's range, which
		// covers every year the forward leg crosses. See RACE_FULL_LABELS.
		...RACE_FULL_LABELS,
		overlay: OVERLAY,
		params,
		// the rewind run FORWARDS: the camera leaves the past and carries on past
		// the end of the data, then the strip opens
		revealFrom: ["raceFull"],
		entry: openFuture
	}
};

// The race chart's callouts: which one a frame draws, and where its note lands.
// The pick is a rule about the camera (raceCallout) and the placement is a rule
// about the room the plot has (raceCalloutGeometry) — both pure functions of the
// frame, so both are asserted here rather than watched for on a contact sheet.
import { beforeEach, describe, expect, test } from "vitest";
import { ATTR_SIZE } from "../attr-buffer.js";
import { TRAIL_SIZE } from "../trails.js";
import { PLOT_BOTTOM_STACKED, setPlotBottomFrac } from "../plot.js";
import {
	writeRaceSweepFrame,
	racePanFrame,
	racePlot,
	raceVisibleSpan,
	RACE_FULL_STEP,
	RACE_DATA_END,
	RACE_BAND_FIRST
} from "../layouts/race.js";
import { STATE_RACE } from "../states.js";
import { BOXES } from "./helpers.js";

// the waypoint raceFull rests on by every path, which is where the crossing sits
const REST = 2006;
/** the shipped phone box, whose plot is the narrowest the chapter draws */
const PHONE = { w: 375, h: 667 };

/** one race frame at one box and playhead, with only its furniture read back */
function frameAt({ w, h }, playhead = REST, step = RACE_FULL_STEP) {
	return writeRaceSweepFrame(
		new Float64Array(ATTR_SIZE),
		new Float64Array(TRAIL_SIZE),
		w,
		h,
		racePanFrame(step, playhead),
		Infinity
	);
}

// the plot's own fraction of the canvas is module state on plot.js, and these
// tests read the plot floor — so pin it rather than inherit whatever ran last
beforeEach(() => setPlotBottomFrac(PLOT_BOTTOM_STACKED));

describe("raceCallout", () => {
	test("a step gets the chapter's callout while its moment is on the plot", () => {
		const { callout, cam } = frameAt(PHONE);
		expect(callout).not.toBeNull();
		expect(callout.ring.x).toBeGreaterThanOrEqual(cam.left);
		expect(callout.ring.x).toBeLessThanOrEqual(cam.right);
	});

	test("...and nothing once the camera has panned past it", () => {
		// the present is two decades on from the crossing, and the plot holds at
		// most five years — so there is nothing left to point at
		expect(frameAt(PHONE, RACE_DATA_END).callout).toBeNull();
	});

	test("raceFull marks the woman's peak too, and it wins where it is on plot", () => {
		// her ring is 2012 and the crossing is 2005.11: seven years apart, which is
		// more than any plot holds, so the camera that shows one has culled the other
		const { callout } = frameAt(PHONE, 2012);
		expect(callout).not.toBeNull();
		expect(callout.text).toMatch(/Sarandon/);
	});

	test("...and Dafoe's 2021 step up, nine years on from her ring", () => {
		// the most present of the three, so it is the one a camera on 2021 draws
		// even though the other two are declared after it
		const { callout } = frameAt(PHONE, 2021);
		expect(callout).not.toBeNull();
		expect(callout.text).toMatch(/Dafoe/);
	});

	test("...and the takeover where THAT is", () => {
		expect(frameAt(PHONE).callout.text).toMatch(/Jackson/);
	});

	test("no camera can put two marked moments on one plot", () => {
		// what makes "most present wins" unobservable at the shipped pxPerYear: the
		// order guarantees the pick, but the cull is what decides it. Asserted over
		// every playhead the reader can reach, at every box, rather than at the two
		// the other tests happen to use — a moment added inside a plot's width of
		// another has to fail here rather than flicker between the two on a drag.
		for (const box of BOXES) {
			setPlotBottomFrac(box.plotFrac);
			const span = raceVisibleSpan(box.w, box.h);
			for (let p = RACE_BAND_FIRST; p <= RACE_DATA_END; p += 0.25) {
				const on = RACE_FULL_STEP.callouts.filter(
					(c) => c.year > p - span && c.year < p
				);
				expect(on.length, `${box.name} @${p}`).toBeLessThanOrEqual(1);
			}
		}
	});

	test("a step that names none gets the chapter's alone", () => {
		// raceRecent, raceFuture, raceGenz and raceClose all fall through to the
		// default, so the woman's peak is raceFull's and no one else's
		for (const name of ["raceRecent", "raceFuture", "raceGenz", "raceClose"]) {
			const step = STATE_RACE[name];
			expect(step.callouts, name).toBeUndefined();
		}
	});

	test("the note's prose rides the payload, not the component", () => {
		// two callouts cannot share one constant in ScrollyVisual: the layout picks
		// which moment is live, so the text it picked has to travel with it
		const { callout } = frameAt(PHONE);
		expect(typeof callout.text).toBe("string");
		expect(callout.text.length).toBeGreaterThan(0);
	});
});

describe("raceCalloutGeometry", () => {
	test("the note sits below its ring where the plot has room", () => {
		const box = { w: 700, h: 820 };
		const { callout } = frameAt(box);
		expect(callout.above).toBe(false);
		expect(callout.note.y).toBeGreaterThan(callout.ring.y);
		expect(callout.note.y).toBeLessThan(racePlot(box.w, box.h).bottom);
		// the leader leaves the top edge and points UP at the ring
		expect(callout.arrow.ay).toBeLessThan(callout.note.y);
		expect(callout.arrow.by).toBeLessThan(callout.arrow.ay);
	});

	test("...and above it on the phone, where the note is too tall to fit under", () => {
		// the takeover's note wraps to seven lines on this box. Below the ring that
		// ran it under the x-axis row and clipped the last line, which is what the
		// flip is for — and why the height is estimated from the text rather than
		// capped at a flat five lines.
		const { callout } = frameAt(PHONE);
		expect(callout.above).toBe(true);
		// `note.y` is the BOTTOM edge once flipped — the markup lifts the box by its
		// own rendered height, so this is the edge facing the ring
		expect(callout.note.y).toBeLessThan(callout.ring.y);
		expect(callout.note.y).toBeGreaterThan(racePlot(PHONE.w, PHONE.h).top);
		// ...and the leader leaves that edge pointing DOWN at the ring
		expect(callout.arrow.ay).toBeGreaterThan(callout.note.y);
		expect(callout.arrow.by).toBeGreaterThan(callout.arrow.ay);
	});

	test("...and below at the shortest drop when neither side fits", () => {
		// the landscape phone the drop clamp was written for: a seven-line note fits
		// nowhere on a ~200px plot, so it keeps the shortest drop and the axis row
		// takes the overlap. Flipping here would only move the problem.
		const { callout } = frameAt({ w: 375, h: 400 });
		expect(callout.above).toBe(false);
		expect(callout.note.y - callout.ring.y).toBeCloseTo(24, 5);
	});

	test("the note stays inside the plot at every width", () => {
		for (const w of [320, 375, 700]) {
			const { callout, cam } = frameAt({ w, h: 667 });
			expect(callout.note.x, `${w}px left edge`).toBeGreaterThanOrEqual(
				cam.left
			);
			// the dot column rides the right edge, so the note stops short of it
			expect(
				callout.note.x + callout.note.width,
				`${w}px right edge`
			).toBeLessThanOrEqual(cam.right);
		}
	});
});

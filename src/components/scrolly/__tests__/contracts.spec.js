// The framework's frame contracts (notes/scrolly-framework.md, "Entry
// choreographies" and "Ambient loops"): an animation's join with its static
// layout must move nothing. Each is an equality over pure functions, so it is
// asserted here rather than watched for.
import { describe, expect, test } from "vitest";
import {
	STATES,
	STATE_ENTRY,
	STATE_AMBIENT,
	STATE_RACE,
	STATE_YCAP
} from "../states.js";
import { TRAIL_SIZE } from "../layout-shared.js";
import {
	writeRaceSweepFrame,
	raceMaxPlayhead,
	RACE_DATA_END
} from "../layouts/race.js";
import { writeSimFrame, SIM_N_SIMS } from "../layouts/sim-race.js";
import {
	BOXES,
	buildLayout,
	edges,
	layoutParamsFor,
	maxAbsDiff,
	nodes
} from "./helpers.js";

// px or alpha: invisible, and inside the rounding of the Float32 frame buffers
// the live canvas draws from
const TOLERANCE = 1e-3;

function expectSameFrame(actual, expected, what) {
	const { max, at } = maxAbsDiff(actual, expected);
	expect(max, `${what}: slot ${at} differs by ${max}`).toBeLessThanOrEqual(
		TOLERANCE
	);
}
const trailsOf = (layout) => layout.trails ?? new Float64Array(TRAIL_SIZE);
const copy = (layout) => ({
	attrs: Float64Array.from(layout.attrs),
	trails: Float64Array.from(trailsOf(layout))
});

describe("entry choreography: the last leg lands on the static layout", () => {
	for (const [state, entry] of Object.entries(STATE_ENTRY)) {
		for (const box of BOXES) {
			test(`${state} @${box.name}`, () => {
				const params = layoutParamsFor(state);
				const layout = buildLayout(state, box, params);
				const write = entry.frames(
					nodes,
					box.w,
					box.h,
					edges,
					params,
					box.bleed
				);
				const { attrs, trails } = copy(layout);
				const last = entry.phases.length - 1;
				write(attrs, trails, last, 1, entry.phases[last]);
				expectSameFrame(attrs, layout.attrs, "attrs");
				expectSameFrame(trails, trailsOf(layout), "trails");
			});
		}
	}
});

describe("ambient loop: t = 0 reproduces the static layout", () => {
	for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
		for (const box of BOXES) {
			test(`${state} @${box.name}`, () => {
				const params = layoutParamsFor(state);
				const layout = buildLayout(state, box, params);
				const write = ambient.frames(
					nodes,
					box.w,
					box.h,
					edges,
					params,
					box.bleed
				);
				const { attrs, trails } = copy(layout);
				write(attrs, trails, 0);
				expectSameFrame(attrs, layout.attrs, "attrs");
				expectSameFrame(trails, trailsOf(layout), "trails");
			});
		}
	}
});

describe("race steps: the resting frame is a fixed point of the frame writer", () => {
	for (const [state, step] of Object.entries(STATE_RACE)) {
		for (const box of BOXES) {
			test(`${state} @${box.name}`, () => {
				const layout = buildLayout(state, box);
				const { attrs, trails } = copy(layout);
				// the frame the static layout rests on. Mirrors raceLayout in
				// layouts/race.js until Phase 1 declares the legs on the state, at
				// which point the entry contract above covers the race chapter too.
				const frame = {
					...step,
					playhead: raceMaxPlayhead(box.w, box.h, step),
					frontier: step.frontier ?? RACE_DATA_END,
					yOpen: step.yOpen ?? 0,
					yClose: step.yClose ?? 0,
					proj: step.proj,
					genz: 0,
					reveal: 1
				};
				writeRaceSweepFrame(
					attrs,
					trails,
					box.w,
					box.h,
					frame,
					STATE_YCAP[state] ?? Infinity
				);
				expectSameFrame(attrs, layout.attrs, "attrs");
				expectSameFrame(trails, layout.trails, "trails");
			});
		}
	}
});

describe("simulation race: the replay's frames are the settled layouts", () => {
	for (const box of BOXES) {
		for (const runs of [0, SIM_N_SIMS]) {
			test(`${runs} runs @${box.name}`, () => {
				const params = { runs, names: runs ? 5 : 0 };
				const layout = STATES.simRace(
					nodes,
					box.w,
					box.h,
					edges,
					params,
					box.bleed
				);
				const { attrs, trails } = copy(layout);
				writeSimFrame(attrs, trails, box.w, box.h, runs);
				expectSameFrame(attrs, layout.attrs, "attrs");
				expectSameFrame(trails, layout.trails, "trails");
			});
		}
	}
});

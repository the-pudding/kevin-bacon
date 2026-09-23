// The framework's frame contracts (notes/scrolly-framework.md and the
// EntryAnim / RequestAnim / AmbientAnim typedefs in states.js): an animation's
// join with the layout it hands off to must move nothing. Each is an equality
// over pure functions, so it is asserted here rather than watched for.
import { describe, expect, test } from "vitest";
import {
	STATES,
	STATE_ENTRIES,
	STATE_REQUESTS,
	STATE_AMBIENT,
	STATE_RACE,
	STATE_YCAP
} from "../states.js";
import { TRAIL_SIZE, TRAIL_STRIDE, TRAIL_POINTS } from "../trails.js";
import { EDGE_BASE, STRIDE } from "../attr-buffer.js";
import {
	writeRaceSweepFrame,
	raceRestPlayhead,
	RACE_DATA_END,
	RACE_FUTURE_END
} from "../layouts/race.js";
import { writeSimFrame, SIM_N_SIMS } from "../layouts/sim-race.js";
import {
	BOXES,
	arrivalContext,
	buildLayout,
	edges,
	layoutParamsFor,
	maxAbsDiff,
	nodes,
	phasesOf,
	storyWith,
	published
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
// Trails compare by what is DRAWN: a slot invisible in both frames may hold
// different geometry (a leg collapses a hidden line to a point, the static
// layout keeps its true shape at alpha 0 — see writeRaceSweepFrame), and the
// param retarget that follows moves it unseen.
function expectSameVisibleTrails(actual, expected) {
	for (let t = 0; t * TRAIL_STRIDE < actual.length; t++) {
		const base = t * TRAIL_STRIDE;
		const a = base + TRAIL_POINTS * 2;
		const shown = Math.max(actual[a], expected[a]) > TOLERANCE;
		const from = shown ? base : a;
		const { max, at } = maxAbsDiff(
			actual.subarray(from, base + TRAIL_STRIDE),
			expected.subarray(from, base + TRAIL_STRIDE)
		);
		expect(max, `trail ${t}: slot ${at} differs by ${max}`).toBeLessThanOrEqual(
			TOLERANCE
		);
	}
}
/** every node's x and y, and nothing else */
const positions = (attrs) => {
	const out = new Float64Array((EDGE_BASE / STRIDE) * 2);
	for (let i = 0, k = 0; i < EDGE_BASE; i += STRIDE, k += 2) {
		out[k] = attrs[i];
		out[k + 1] = attrs[i + 1];
	}
	return out;
};
const trailsOf = (layout) => layout.trails ?? new Float64Array(TRAIL_SIZE);
const copy = (layout) => ({
	attrs: Float64Array.from(layout.attrs),
	trails: Float64Array.from(trailsOf(layout))
});

// the arrivals a choreography is planned against: from nowhere in particular
// with no race camera to pick up, and out of a race step left mid-pan with the
// future strip half open
const ARRIVALS = [
	{ name: "at rest", ctx: (box) => arrivalContext(box) },
	{
		name: "mid-pan",
		ctx: (box) =>
			arrivalContext(box, {
				exit: {
					playhead: 2015,
					frontier: (RACE_DATA_END + RACE_FUTURE_END) / 2
				}
			})
	}
];

/**
 * Runs a choreography's last leg to its end over a copy of the layout it
 * starts from, and compares with the layout it hands off to: the static layout,
 * or the layout at the params its `finish` publishes.
 */
function expectLastLegLandsOnLayout(state, anim, box, ctx, s = storyWith()) {
	const phases = phasesOf(anim, ctx);
	if (phases.length === 0) return false;
	const params = layoutParamsFor(state, undefined, s);
	const layout = buildLayout(state, box, params);
	const write = anim.frames(nodes, box.w, box.h, edges, params, box.bleed, ctx);
	const { attrs, trails } = copy(layout);
	const last = phases.length - 1;
	const out = write(attrs, trails, last, 1, phases[last]) ?? {};
	// what the run published on its way: the frame's story fields, then finish
	const after = published(s, out.story);
	if (anim.finish) {
		anim.finish(after, out.camera ? { ...out.camera } : undefined);
	}
	const expected = anim.finish
		? buildLayout(state, box, layoutParamsFor(state, undefined, after))
		: layout;
	expectSameFrame(attrs, expected.attrs, "attrs");
	expectSameVisibleTrails(trails, trailsOf(expected));
	return true;
}

describe("entry choreography: the last leg lands on the layout it hands off to", () => {
	for (const [state, entries] of Object.entries(STATE_ENTRIES)) {
		entries.forEach((entry, n) => {
			for (const box of BOXES) {
				for (const arrival of ARRIVALS) {
					test(`${state}#${n} ${arrival.name} @${box.name}`, () => {
						expectLastLegLandsOnLayout(state, entry, box, arrival.ctx(box));
					});
				}
			}
		});
	}
});

describe("entry choreography: hold and seed frames", () => {
	const rows = { cx: 200, top: 120, pitch: 22, bottom: 480 };
	for (const [state, entries] of Object.entries(STATE_ENTRIES)) {
		for (const entry of entries.filter((e) => e.hold || e.seed)) {
			for (const box of BOXES) {
				for (const s of [
					storyWith(),
					storyWith({ rank: { listRows: rows } })
				]) {
					const label = s.rank.listRows ? "with rows" : "without rows";
					test(`${state} ${label} @${box.name}`, () => {
						const ctx = arrivalContext(box, { story: s });
						const params = layoutParamsFor(state, undefined, s);
						const layout = buildLayout(state, box, params);
						if (entry.hold) {
							const { attrs, trails } = copy(layout);
							entry.hold.frame(
								nodes,
								box.w,
								box.h,
								edges,
								params,
								box.bleed,
								ctx
							)(attrs, trails);
							expect(attrs.every(Number.isFinite), "hold attrs finite").toBe(
								true
							);
							expect(trails.every(Number.isFinite), "hold trails finite").toBe(
								true
							);
							expect(entry.hold.until(s)).toBeTypeOf("boolean");
						}
						if (entry.seed) {
							// the seed exists to land the arrival with nothing drawn as a line
							const { attrs, trails } = copy(layout);
							entry.seed(
								nodes,
								box.w,
								box.h,
								edges,
								params,
								box.bleed,
								ctx
							)(attrs, trails);
							for (let t = 0; t * TRAIL_STRIDE < trails.length; t++) {
								expect(
									trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2],
									`trail ${t}`
								).toBe(0);
							}
						}
					});
				}
			}
		}
	}
});

describe("requests: the last frame lands on the layout the finish publishes", () => {
	for (const [state, requests] of Object.entries(STATE_REQUESTS)) {
		for (const [kind, anim] of Object.entries(requests)) {
			for (const box of BOXES) {
				test(`${state}.${kind} @${box.name}`, () => {
					const s = storyWith();
					anim.start?.(s);
					const ctx = arrivalContext(box, { story: s });
					const played = expectLastLegLandsOnLayout(state, anim, box, ctx, s);
					expect(played, "an ask at rest has something to play").toBe(true);
				});
			}
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

// A carried arrival (AmbientAnim.carryFrom) has no tween: the arriving loop's
// first frame, started at the clock the departing flight stopped on, must put
// every dot where the departing flight had it at that clock. Positions only —
// what the departing loop draws ON the flight (the title card's beat: ink,
// size, spokes) is not the arriving one's to reproduce, and fades out as a
// residual instead (ScrollyVisual's carryResidual). Checked a few seconds in —
// mid trip for most of the crowd, and past a wrap for some — rather than at
// 0, where every flight reproduces its static layout anyway.
describe("carried ambient: the arriving flight picks up the departing one's frame", () => {
	const CARRY_MS = [2500, 17000];
	for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
		for (const origin of ambient.carryFrom ?? []) {
			for (const box of BOXES) {
				for (const skyT of CARRY_MS) {
					test(`${origin} → ${state} @${box.name}, ${skyT}ms`, () => {
						const flight = (name, skyT0, t) => {
							const params = layoutParamsFor(name);
							const layout = buildLayout(name, box, params);
							const write = STATE_AMBIENT[name].frames(
								nodes,
								box.w,
								box.h,
								edges,
								params,
								box.bleed,
								skyT0
							);
							const { attrs, trails } = copy(layout);
							write(attrs, trails, t);
							return attrs;
						};
						expectSameFrame(
							positions(flight(state, skyT, 0)),
							positions(flight(origin, 0, skyT)),
							"positions"
						);
					});
				}
			}
		}
	}
});

describe("race steps: the resting frame is a fixed point of the frame writer", () => {
	for (const [state, step] of Object.entries(STATE_RACE)) {
		for (const box of BOXES) {
			test(`${state} @${box.name}`, () => {
				const layout = buildLayout(state, box);
				const { attrs, trails } = copy(layout);
				// the frame the static layout rests on (mirrors raceLayout)
				const frame = {
					...step,
					playhead: raceRestPlayhead(box.w, box.h, step),
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

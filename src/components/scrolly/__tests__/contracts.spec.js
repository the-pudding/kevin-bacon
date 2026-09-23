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
import {
	writeRaceSweepFrame,
	raceRestPlayhead,
	RACE_DATA_END,
	RACE_FUTURE_END
} from "../layouts/race.js";
import { writeSimFrame, SIM_N_SIMS } from "../layouts/sim-race.js";
import { titleRevealGate } from "../sky.js";
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
		// `liveReveal` is the one declared exception: its whole point is that the
		// loop's t = 0 frame is the START of a cold-load reveal (see
		// `withTitleReveal` in layouts/intro.js), not the resting static layout
		// — see the `titleRevealGate` contract below instead.
		if (ambient.liveReveal) continue;
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

// titleGalaxy's own exception to the contract above: at t = 0 its reveal gate
// must be shut (or the cold load pops the crowd in whole, the exact thing this
// feature exists to avoid), and once every dot's own delay + fade window has
// passed it must be fully open (or the crowd never actually reaches the
// alpha the rest of the flight has been drawing it at all along).
describe("titleGalaxy reveal: shut at t = 0, open once every dot's window has passed", () => {
	const SAMPLE_IDS = Array.from({ length: 200 }, (_, i) => i * 37);
	// generous past HOLD (200) + STAGGER (1400) + FADE (500) in sky.js
	const FULLY_OPEN_MS = 3000;

	test("shut at t = 0", () => {
		for (const id of SAMPLE_IDS) {
			expect(titleRevealGate(id, 0)).toBe(0);
		}
	});

	test("open once the window has passed", () => {
		for (const id of SAMPLE_IDS) {
			expect(titleRevealGate(id, FULLY_OPEN_MS)).toBe(1);
		}
	});
});

// The fault this is here for: a clocked loop that derives its rays from a base
// authored at the handoff clock instead of at zero drifts a little further out
// on every visit, and nothing else in the suite can see it — `skyFlight.t` is 0
// under Node, so every other assertion passes while the contract is void.
describe("clocked ambient: the arrival lands on the loop's first frame", () => {
	for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
		if (!ambient.clocked) continue;
		for (const box of BOXES) {
			for (const t0 of [0, 9_000, 37_000]) {
				test(`${state} @${box.name} t0=${t0}`, () => {
					const params = layoutParamsFor(state);
					const layout = buildLayout(state, box, params);
					const write = ambient.frames(
						nodes,
						box.w,
						box.h,
						edges,
						params,
						box.bleed,
						t0
					);
					// what the arrival lands on
					const { attrs, trails } = copy(layout);
					write(attrs, trails, 0);
					// ...and the loop's own first tick, which must move nothing
					const again = { attrs: Float64Array.from(attrs), trails: Float64Array.from(trails) }; // prettier-ignore
					write(again.attrs, again.trails, 0);
					expectSameFrame(again.attrs, attrs, "attrs");
					expectSameFrame(again.trails, trails, "trails");
				});
			}
		}
	}

	test("at clock 0 a clocked loop is the unclocked one exactly", () => {
		for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
			if (!ambient.clocked) continue;
			for (const box of BOXES) {
				const params = layoutParamsFor(state);
				const layout = buildLayout(state, box, params);
				const args = [nodes, box.w, box.h, edges, params, box.bleed];
				const zero = copy(layout);
				ambient.frames(...args, 0)(zero.attrs, zero.trails, 0);
				const none = copy(layout);
				ambient.frames(...args)(none.attrs, none.trails, 0);
				expectSameFrame(zero.attrs, none.attrs, `${state} attrs`);
			}
		}
	});
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

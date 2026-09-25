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
	STATE_YCAP,
	entryFor
} from "../states.js";
import { prepareArrival } from "../arrivals.js";
import { parkLeavers, restateHidden } from "../arrival-marks.js";
import { ALPHA_SEEN } from "../render.js";
import { story } from "../story.svelte.js";
import { TRAIL_SIZE, TRAIL_STRIDE, TRAIL_POINTS } from "../trails.js";
import { EDGE_BASE, STRIDE } from "../attr-buffer.js";
import {
	writeRaceSweepFrame,
	raceRestPlayhead,
	RACE_DATA_END,
	RACE_FUTURE_END
} from "../layouts/race.js";
import { writeSimFrame, SIM_N_SIMS } from "../layouts/sim-race.js";
import { scatterY } from "../scatter-scales.js";
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
	storySteps,
	backFrom,
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

// The race's frontier column stands a hidden dot at scatterY, so the crowd
// raceFuture hands to scatterCenters only spreads sideways. A y on any other
// scale is a crowd that slides up or down the plot as it fades in — it once
// arrived from above, off a y scale fitted to the whole corpus.
describe("scatterY: every dot scatterCenters draws stands at its scatterY", () => {
	for (const box of BOXES) {
		test(`@${box.name}`, () => {
			const { attrs } = buildLayout(
				"scatterCenters",
				box,
				layoutParamsFor("scatterCenters", { showFilms: true })
			);
			let max = 0;
			for (const n of nodes) {
				const i = n.id * STRIDE;
				if (attrs[i + 6] <= TOLERANCE) continue;
				max = Math.max(max, Math.abs(attrs[i + 1] - scatterY(n.id, box.h)));
			}
			expect(max).toBeLessThanOrEqual(TOLERANCE);
		});
	}
});

// motion.md rule 14. An arrival restates every dot the departing state hides
// onto that state's mark for it (restateHidden), so a dot the arrival shows
// sets off from the departing state's designed spot — and that spot has to be
// on the canvas, or the dot streaks in from off screen as it fades in.
describe("restateHidden: only a dot the departing state hides and the reader cannot see", () => {
	const at = (id) => id * STRIDE;
	test("moves a hidden dot onto the departing mark, alpha untouched", () => {
		const live = new Float32Array(EDGE_BASE);
		const departing = new Float64Array(EDGE_BASE);
		live.set([10, 20, 3, 1, 1, 1, 0], at(0));
		departing.set([100, 200, 2, 0.5, 0.5, 0.5, 0], at(0));
		restateHidden(live, departing);
		expect(Array.from(live.subarray(at(0), at(1)))).toEqual([
			100, 200, 2, 0.5, 0.5, 0.5, 0
		]);
	});
	test("leaves a dot the reader can see, and one the departing state draws", () => {
		const live = new Float32Array(EDGE_BASE);
		const departing = new Float64Array(EDGE_BASE);
		live.set([10, 20, 3, 1, 1, 1, 0.5], at(0));
		departing.set([100, 200, 2, 0.5, 0.5, 0.5, 0], at(0));
		live.set([30, 40, 3, 1, 1, 1, 0], at(1));
		departing.set([300, 400, 2, 0.5, 0.5, 0.5, 0.3], at(1));
		const before = Float32Array.from(live);
		restateHidden(live, departing);
		expect(live).toEqual(before);
	});
});

/** the frame an arrival tweens onto: an entry's frame 0, else the static layout */
function arrivalTarget(to, from, layout, params, box, live) {
	const anim = entryFor(to, from);
	const attrs = layout.attrs.slice();
	parkLeavers(attrs, live);
	if (!anim) return { attrs, anim };
	const ctx = arrivalContext(box, { from });
	ctx.live.attrs.set(live);
	const phases = phasesOf(anim, ctx);
	if (phases.length === 0) return { attrs, anim };
	const start = attrs.slice();
	const trails = trailsOf(layout).slice();
	const args = [nodes, box.w, box.h, edges, params, box.bleed, ctx];
	if (anim.seed) anim.seed(...args)(start, trails);
	else anim.frames(...args)(start, trails, 0, 0, 0);
	return { attrs: start, anim, settle: attrs };
}

/** where an arrival starts every dot: the live frame, or the hold it parks on */
function arrivalStart(anim, params, box, live, from) {
	if (!anim?.hold) return live;
	const hold = Float64Array.from(live);
	const ctx = arrivalContext(box, { from });
	anim.hold.frame(
		nodes,
		box.w,
		box.h,
		edges,
		params,
		box.bleed,
		ctx
	)(hold, new Float64Array(TRAIL_SIZE));
	return hold;
}

const onCanvas = (box, x, y) =>
	x >= -box.bleed.l && x <= box.w + box.bleed.r && y >= 0 && y <= box.h;

/** does the arrival bring slot `i` onto the canvas: invisible at the start, drawn on the canvas at the end */
const arrives = (box, start, end, i) =>
	start[i + 6] <= ALPHA_SEEN &&
	end[i + 6] > ALPHA_SEEN &&
	onCanvas(box, end[i], end[i + 1]);

/** is slot `i` at the start on the departing spot (or parked by a hold), and on the canvas */
const startsWell = (box, start, departing, i, held) =>
	(held ||
		(Math.abs(start[i] - departing[i]) <= 0.01 &&
			Math.abs(start[i + 1] - departing[i + 1]) <= 0.01)) &&
	onCanvas(box, start[i], start[i + 1]);

/**
 * One arrival as ScrollyVisual plays it, checked: restate the hidden dots, then
 * every dot that is invisible at the start and on the canvas, visible, in the
 * frame the arrival tweens onto must start at the departing state's spot
 * (unless a hold has parked it) and on the canvas.
 */
function expectArrivalsOnCanvas(move, departing, live, box) {
	restateHidden(live, departing);
	const { to, from, layout, params } = move;
	const target = arrivalTarget(to, from, layout, params, box, live);
	const start = arrivalStart(target.anim, params, box, live, from);
	const held = Boolean(target.anim?.hold);
	const bad = [];
	for (let id = 0, i = 0; i < EDGE_BASE; id++, i += STRIDE) {
		if (!arrives(box, start, target.attrs, i)) continue;
		move.checked.n += 1;
		if (!startsWell(box, start, departing, i, held))
			bad.push(`${id}@(${start[i] | 0},${start[i + 1] | 0})`);
	}
	expect(bad, `${move.label}: ${bad.length} dots`).toEqual([]);
	return target.settle ?? target.attrs;
}

// Every state change the reader can make, both ways, with the story's arrival
// rules applied as the registry applies them: forward through the story with
// a step back and forth at every step, then all the way back. The live frame
// is carried from arrival to arrival as it rests on screen — the leavers
// parked where they faded — so the restatement is exercised, not assumed.
describe("hidden spots: every dot an arrival shows starts on the canvas", () => {
	const steps = storySteps();
	for (const box of BOXES) {
		test(`@${box.name}`, () => {
			const saved = storyWith();
			try {
				let cur = 0;
				let shown = buildLayout(
					steps[0].state,
					box,
					layoutParamsFor(steps[0].state, steps[0].params, story)
				);
				let live = Float32Array.from(shown.attrs);
				// the arriving dots checked, so a walk that checks nobody fails
				const checked = { n: 0 };
				const go = (dest) => {
					const from = steps[cur].state;
					const to = steps[dest].state;
					prepareArrival({
						to,
						from,
						forward: dest > cur,
						back: dest < cur
					});
					const params = layoutParamsFor(to, steps[dest].params, story);
					const layout = buildLayout(to, box, params);
					const carry = STATE_AMBIENT[to]?.carryFrom?.includes(from);
					const move = {
						to,
						from,
						layout,
						params,
						checked,
						label: `${cur} → ${dest}`
					};
					const owns = to !== from && entryFor(to, from)?.ownsArrival;
					let rest;
					if (to === from || carry || owns) {
						rest = layout.attrs.slice();
						parkLeavers(rest, live);
					} else {
						rest = expectArrivalsOnCanvas(move, shown.attrs, live, box);
					}
					live = Float32Array.from(rest);
					shown = layout;
					cur = dest;
				};
				for (let i = 1; i < steps.length; i++) {
					go(i);
					go(backFrom(steps, i));
					go(i);
				}
				while (cur > 0) go(backFrom(steps, cur));
				expect(checked.n).toBeGreaterThan(0);
			} finally {
				for (const [key, value] of Object.entries(saved)) {
					if (
						value !== null &&
						typeof value === "object" &&
						!Array.isArray(value)
					)
						Object.assign(story[key], value);
					else story[key] = value;
				}
			}
		});
	}
});

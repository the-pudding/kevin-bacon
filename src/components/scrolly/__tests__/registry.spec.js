// The state registry's own invariants — what ScrollyVisual assumes about every
// entry in states.js without checking.
import { describe, expect, test } from "vitest";
import {
	STATES,
	STATE_LABELS,
	STATE_PULSE,
	STATE_TRACKED,
	STATE_REVEAL_FROM,
	STATE_ENTRIES,
	STATE_REQUESTS,
	STATE_AMBIENT,
	STATE_RACE,
	STATE_TITLE,
	STATE_SCENE,
	OVERLAYS,
	entryFor
} from "../states.js";
import { NODE_COUNT } from "../nodes.js";
import { BOXES, arrivalContext, layoutParamsFor, phasesOf } from "./helpers.js";

const names = Object.keys(STATES);
// what ScrollyVisual tracks out of the attr array each frame — the only ids
// that have a label element to show
const tracked = new Set([
	...Object.values(STATE_LABELS).filter(Array.isArray).flat(),
	...Object.values(STATE_PULSE).filter((p) => typeof p === "number"),
	...STATE_TRACKED
]);
const isNodeId = (id) => Number.isInteger(id) && id >= 0 && id < NODE_COUNT;
const resolve = (spec, state) =>
	typeof spec === "function" ? spec(layoutParamsFor(state)) : spec;
const ctx = arrivalContext(BOXES[1]);

function expectWellFormedLegs(anim, where) {
	expect(anim.frames, where).toBeTypeOf("function");
	const phases = phasesOf(anim, ctx);
	expect(Array.isArray(phases), `${where} phases`).toBe(true);
	for (const ms of phases) {
		expect(Number.isFinite(ms) && ms > 0, `${where} phase ${ms}`).toBe(true);
	}
	if (anim.finish) expect(anim.finish, where).toBeTypeOf("function");
	return phases;
}

describe("state registry", () => {
	test("every state has a layout function", () => {
		for (const name of names) expect(STATES[name]).toBeTypeOf("function");
	});

	test("revealFrom names real states", () => {
		for (const [state, from] of Object.entries(STATE_REVEAL_FROM)) {
			expect(names, state).toContain(state);
			for (const origin of from) expect(names, state).toContain(origin);
		}
	});

	test("entry choreographies are well formed", () => {
		for (const [state, entries] of Object.entries(STATE_ENTRIES)) {
			for (const entry of entries) {
				const phases = expectWellFormedLegs(entry, state);
				for (const origin of entry.from ?? []) {
					expect(names, `${state} from`).toContain(origin);
				}
				if (entry.labelsAfter) {
					// one beat for the arrival, then one per leg
					expect(entry.labelsAfter.length, state).toBeLessThanOrEqual(
						phases.length + 1
					);
					for (const id of entry.labelsAfter.flat()) {
						expect(tracked.has(id), `${state} labelsAfter ${id}`).toBe(true);
					}
				}
				if (entry.hold) {
					expect(entry.hold.until, state).toBeTypeOf("function");
					expect(entry.hold.frame, state).toBeTypeOf("function");
				}
				if (entry.seed) expect(entry.seed, state).toBeTypeOf("function");
			}
		}
	});

	test("each declared origin resolves to the entry authored for it", () => {
		for (const [state, entries] of Object.entries(STATE_ENTRIES)) {
			for (const entry of entries) {
				const scope = entry.from ?? STATE_REVEAL_FROM[state];
				if (!scope) continue;
				for (const origin of scope) {
					expect(entryFor(state, origin), `${state} <- ${origin}`).toBe(entry);
				}
			}
		}
		// the race chart's two-way pans, as the story is authored
		expect(entryFor("raceRecent", "rankReveal")?.hold).toBeDefined();
		expect(entryFor("raceRecent", "raceFull")?.ownsArrival).toBe(true);
		expect(entryFor("raceFull", "raceRecent")).toBeUndefined();
		expect(entryFor("raceFull", "raceFuture")?.ownsArrival).toBe(true);
		expect(entryFor("raceFuture", "raceFull")?.ownsArrival).toBe(true);
		expect(entryFor("raceGenz", "scatterQuiz")).toBeDefined();
		expect(entryFor("raceGenz", "careerTrio")).toBeUndefined();
	});

	test("requests are well formed", () => {
		for (const [state, requests] of Object.entries(STATE_REQUESTS)) {
			for (const [kind, anim] of Object.entries(requests)) {
				expectWellFormedLegs(anim, `${state}.${kind}`);
				if (anim.start) expect(anim.start, kind).toBeTypeOf("function");
			}
		}
		// the three Start buttons the story mounts
		expect(STATE_REQUESTS.raceRecent?.rewind).toBeDefined();
		expect(STATE_REQUESTS.raceGenz?.genzLines).toBeDefined();
		expect(STATE_REQUESTS.simRace?.run).toBeDefined();
	});

	test("ambient loops declare a frame writer", () => {
		for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
			expect(ambient.frames, state).toBeTypeOf("function");
		}
	});

	test("an ambient carries on only another state's ambient", () => {
		for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
			for (const origin of ambient.carryFrom ?? []) {
				expect(names, `${state} carryFrom`).toContain(origin);
				expect(
					STATE_AMBIENT[origin],
					`${state} carryFrom ${origin}`
				).toBeDefined();
			}
		}
	});

	test("race descriptors have ordered extents and tracked highlights", () => {
		for (const [state, step] of Object.entries(STATE_RACE)) {
			const [from, to] = step.extent;
			expect(from, state).toBeLessThan(to);
			for (const id of step.highlight ?? []) {
				expect(isNodeId(id), `${state} highlight ${id}`).toBe(true);
				expect(tracked.has(id), `${state} highlight ${id} untracked`).toBe(
					true
				);
			}
		}
	});

	test("every name a state can show at rest has a tracked dot", () => {
		for (const state of names) {
			for (const id of resolve(STATE_LABELS[state], state) ?? []) {
				expect(isNodeId(id), `${state} label ${id}`).toBe(true);
				expect(tracked.has(id), `${state} label ${id} untracked`).toBe(true);
			}
			const pulse = resolve(STATE_PULSE[state], state);
			if (pulse != null) {
				expect(isNodeId(pulse), `${state} pulse ${pulse}`).toBe(true);
				expect(tracked.has(pulse), `${state} pulse ${pulse} untracked`).toBe(
					true
				);
			}
		}
	});

	test("titles are non-empty strings", () => {
		for (const [state, title] of Object.entries(STATE_TITLE)) {
			expect(title, state).toBeTypeOf("string");
			expect(title.trim().length, state).toBeGreaterThan(0);
		}
	});

	// A scene is an assertion, not a hint: ScrollyVisual does not swap the
	// furniture between two states that share one, so if their title or their
	// overlay actually differed the reader would be left looking at the wrong
	// chart's text with no transition to explain it.
	test("states sharing a scene declare the same title and overlay", () => {
		/** @type {Record<string, string[]>} */
		const byScene = {};
		for (const [state, scene] of Object.entries(STATE_SCENE)) {
			(byScene[scene] ??= []).push(state);
		}
		expect(Object.keys(byScene).length).toBeGreaterThan(0);
		for (const [scene, members] of Object.entries(byScene)) {
			const [first] = members;
			for (const state of members) {
				expect(STATE_TITLE[state], `${scene}: ${state} title`).toBe(
					STATE_TITLE[first]
				);
				expect(OVERLAYS[state], `${scene}: ${state} overlay`).toBe(
					OVERLAYS[first]
				);
			}
		}
	});
});

// The state registry's own invariants — what ScrollyVisual assumes about every
// entry in states.js without checking.
import { describe, expect, test } from "vitest";
import {
	STATES,
	STATE_LABELS,
	STATE_PULSE,
	STATE_TRACKED,
	STATE_REVEAL_FROM,
	STATE_ENTRY,
	STATE_AMBIENT,
	STATE_RACE,
	STATE_TITLE
} from "../states.js";
import { NODE_COUNT } from "../nodes.js";
import { layoutParamsFor } from "./helpers.js";

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
		for (const [state, entry] of Object.entries(STATE_ENTRY)) {
			expect(entry.frames, state).toBeTypeOf("function");
			expect(entry.phases.length, state).toBeGreaterThan(0);
			for (const ms of entry.phases) {
				expect(Number.isFinite(ms) && ms > 0, `${state} phase ${ms}`).toBe(
					true
				);
			}
			if (entry.labelsAfter) {
				expect(entry.labelsAfter.length, state).toBeLessThanOrEqual(
					entry.phases.length
				);
				for (const id of entry.labelsAfter.flat()) {
					expect(tracked.has(id), `${state} labelsAfter ${id}`).toBe(true);
				}
			}
			if (entry.cardAfter != null) {
				expect(entry.cardAfter, state).toBeGreaterThanOrEqual(0);
				expect(entry.cardAfter, state).toBeLessThan(entry.phases.length);
			}
		}
	});

	test("ambient loops declare a frame writer", () => {
		for (const [state, ambient] of Object.entries(STATE_AMBIENT)) {
			expect(ambient.frames, state).toBeTypeOf("function");
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
});

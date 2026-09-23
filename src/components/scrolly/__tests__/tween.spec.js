import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTweener, easeCubicInOut } from "../tween.js";

// A hand-driven animation frame: `tick(t)` runs every queued callback at time t.
let now = 0;
let nextId = 1;
const queue = new Map();
const tick = (t) => {
	now = t;
	const cbs = [...queue.values()];
	queue.clear();
	for (const cb of cbs) cb(t);
};

beforeEach(() => {
	now = 0;
	queue.clear();
	vi.stubGlobal("requestAnimationFrame", (cb) => {
		const id = nextId++;
		queue.set(id, cb);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (id) => queue.delete(id));
	vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

const make = () => {
	const frames = [];
	const tw = createTweener(2, (buf) => frames.push(Array.from(buf)), 1);
	return { tw, frames };
};

describe("createTweener", () => {
	test("ms <= 0 lands instantly, paints once and settles synchronously", () => {
		const { tw, frames } = make();
		const done = vi.fn();
		tw.to(Float64Array.of(10, 20), 0, 0, null, done);
		expect(Array.from(tw.current)).toEqual([10, 20]);
		expect(frames).toEqual([[10, 20]]);
		expect(done).toHaveBeenCalledTimes(1);
		expect(queue.size).toBe(0);
	});

	test("a timed tween eases from the live frame and settles once", () => {
		const { tw } = make();
		const done = vi.fn();
		tw.to(Float64Array.of(10, 10), 100, 0, null, done);
		tick(50);
		expect(tw.current[0]).toBeCloseTo(10 * easeCubicInOut(0.5), 6);
		expect(done).not.toHaveBeenCalled();
		tick(100);
		expect(Array.from(tw.current)).toEqual([10, 10]);
		expect(done).toHaveBeenCalledTimes(1);
		expect(queue.size).toBe(0);
	});

	test("windows chain groups linearly, with no stall at the join", () => {
		const { tw } = make();
		const done = vi.fn();
		tw.to(
			Float64Array.of(1, 1),
			100,
			0,
			null,
			done,
			Float64Array.of(0, 0.5, 0.5, 1)
		);
		// each group runs linearly through its half: the first is half done a
		// quarter of the way in, and hands over to the second at the half
		tick(25);
		expect(tw.current[0]).toBeCloseTo(0.5, 6);
		expect(tw.current[1]).toBe(0);
		tick(50);
		expect(tw.current[0]).toBeCloseTo(1, 6);
		expect(tw.current[1]).toBeCloseTo(0, 6);
		tick(75);
		expect(tw.current[1]).toBeCloseTo(0.5, 6);
		tick(100);
		expect(Array.from(tw.current)).toEqual([1, 1]);
		expect(done).toHaveBeenCalledTimes(1);
	});

	test("authored delays hold a group at its start until its clock begins", () => {
		const { tw } = make();
		tw.to(Float64Array.of(10, 10), 100, 0, Float64Array.of(0, 50));
		tick(50);
		expect(tw.current[0]).toBeCloseTo(5, 6);
		expect(tw.current[1]).toBe(0);
		tick(100);
		expect(tw.current[0]).toBe(10);
		expect(tw.current[1]).toBeCloseTo(5, 6);
		tick(150);
		expect(Array.from(tw.current)).toEqual([10, 10]);
	});

	test("jitter staggers groups deterministically", () => {
		const a = make();
		const b = make();
		a.tw.to(Float64Array.of(10, 10), 100, 0.5);
		b.tw.to(Float64Array.of(10, 10), 100, 0.5);
		tick(40);
		expect(a.tw.current[0]).not.toBe(a.tw.current[1]);
		expect(Array.from(a.tw.current)).toEqual(Array.from(b.tw.current));
	});

	test("a superseding `to` retargets from mid-flight and drops the old onDone", () => {
		const { tw } = make();
		const doneA = vi.fn();
		const doneB = vi.fn();
		tw.to(Float64Array.of(10, 10), 100, 0, null, doneA);
		tick(50);
		const midway = tw.current[0];
		tw.to(Float64Array.of(0, 0), 100, 0, null, doneB);
		expect(tw.target).toEqual(Float64Array.of(0, 0));
		tick(100);
		expect(tw.current[0]).toBeCloseTo(midway * (1 - easeCubicInOut(0.5)), 5);
		tick(150);
		expect(doneA).not.toHaveBeenCalled();
		expect(doneB).toHaveBeenCalledTimes(1);
	});

	test("stop() abandons the frame and its onDone", () => {
		const { tw, frames } = make();
		const done = vi.fn();
		tw.to(Float64Array.of(10, 10), 100, 0, null, done);
		tw.stop();
		tick(100);
		expect(frames).toEqual([]);
		expect(done).not.toHaveBeenCalled();
	});

	test("reframe() shifts both the live frame and the tween's start", () => {
		const { tw } = make();
		tw.to(Float64Array.of(10, 10), 100);
		tick(50);
		tw.reframe((buf) => {
			buf[0] -= 1;
		});
		const shiftedStart = -1;
		tick(75);
		expect(tw.current[0]).toBeCloseTo(
			shiftedStart + (10 - shiftedStart) * easeCubicInOut(0.75),
			5
		);
	});
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createChoreographer } from "../choreographer.js";
import { createFrameLoop } from "../tween.js";

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
	const draws = [];
	const onStop = vi.fn();
	const choreo = createChoreographer({
		ease: (p) => p,
		loop: createFrameLoop(() => draws.push(now)),
		onStop
	});
	return { choreo, draws, onStop };
};

describe("createChoreographer", () => {
	test("a phase eases from 0 to 1 over its duration, paints every tick, then chains", () => {
		const { choreo, draws } = make();
		const frames = [];
		const done = vi.fn();
		choreo.phase(100, (e, ms) => frames.push([e, ms]), done);
		expect(choreo.active).toBe(true);
		tick(50);
		tick(100);
		expect(frames).toEqual([
			[0.5, 50],
			[1, 100]
		]);
		expect(draws).toEqual([50, 100]);
		expect(done).toHaveBeenCalledTimes(1);
		expect(queue.size).toBe(0);
	});

	test("a phase's linear clock is capped at the duration", () => {
		const { choreo } = make();
		const frames = [];
		choreo.phase(100, (e, ms) => frames.push([e, ms]));
		tick(130);
		expect(frames).toEqual([[1, 100]]);
	});

	test("stop abandons the frame in flight and tells the owner", () => {
		const { choreo, draws, onStop } = make();
		const done = vi.fn();
		choreo.phase(100, () => {}, done);
		choreo.stop();
		tick(100);
		expect(draws).toEqual([]);
		expect(done).not.toHaveBeenCalled();
		expect(onStop).toHaveBeenCalledTimes(1);
		expect(choreo.active).toBe(false);
	});

	test("a loop runs until its frame returns false, then ends", () => {
		const { choreo } = make();
		const seen = [];
		const onEnd = vi.fn();
		choreo.loop((t) => {
			seen.push(t);
			return t < 40;
		}, onEnd);
		tick(16);
		tick(32);
		tick(48);
		expect(seen).toEqual([16, 32, 48]);
		expect(onEnd).toHaveBeenCalledTimes(1);
		expect(choreo.active).toBe(false);
		expect(queue.size).toBe(0);
	});

	test("a loop whose frame returns nothing runs until stopped", () => {
		const { choreo } = make();
		let ticks = 0;
		choreo.loop(() => {
			ticks += 1;
		});
		tick(16);
		tick(32);
		expect(ticks).toBe(2);
		expect(queue.size).toBe(1);
		choreo.stop();
		expect(queue.size).toBe(0);
	});

	test("legs run back to back, beat by beat, and finish once", () => {
		const { choreo } = make();
		const writes = [];
		const beats = [];
		const done = vi.fn();
		choreo.legs(
			[100, 50],
			(i, e) => writes.push([i, e]),
			(i) => beats.push(i),
			done
		);
		tick(100);
		expect(beats).toEqual([0]);
		expect(choreo.active).toBe(true);
		tick(150);
		expect(writes).toEqual([
			[0, 1],
			[1, 1]
		]);
		expect(beats).toEqual([0, 1]);
		expect(done).toHaveBeenCalledTimes(1);
		expect(choreo.active).toBe(false);
	});

	test("no legs is a choreography that finishes at once", () => {
		const { choreo } = make();
		const done = vi.fn();
		choreo.legs([], vi.fn(), vi.fn(), done);
		expect(done).toHaveBeenCalledTimes(1);
		expect(choreo.active).toBe(false);
		expect(queue.size).toBe(0);
	});
});

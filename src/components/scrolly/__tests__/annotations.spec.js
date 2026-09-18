import { describe, expect, test } from "vitest";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import {
	createLabelStacker,
	raceLabelCut,
	trackLabels
} from "../annotations.js";

const dot = (attrs, id, y, alpha = 1) =>
	set(attrs, id, 100, y, 3, [0, 0, 0], alpha);

describe("raceLabelCut", () => {
	test("keeps the subject, then the names nearest the top, up to the cap", () => {
		const attrs = new Float64Array(ATTR_SIZE);
		for (let id = 1; id <= 6; id++) dot(attrs, id, id * 10);
		dot(attrs, 9, 500); // the subject, far down the plot
		const shown = raceLabelCut(attrs, {
			highlight: [9],
			labelIds: [1, 2, 3, 4, 5, 6],
			onPlot: () => true,
			top: 3
		});
		expect([...shown].sort()).toEqual([1, 2, 9]);
	});

	test("a faded or culled dot never eats a slot", () => {
		const attrs = new Float64Array(ATTR_SIZE);
		dot(attrs, 1, 10, 0); // faded
		dot(attrs, 2, 20);
		dot(attrs, 3, 30);
		const shown = raceLabelCut(attrs, {
			labelIds: [1, 2, 3],
			onPlot: (id) => id !== 2, // culled
			top: 1
		});
		expect([...shown]).toEqual([3]);
	});
});

describe("trackLabels", () => {
	test("a name rides its dot's alpha unless left out, gated or held", () => {
		const attrs = new Float64Array(ATTR_SIZE);
		for (const id of [1, 2, 3, 4]) dot(attrs, id, id * 10, 0.6);
		const tracked = trackLabels(attrs, [1, 2, 3, 4], {
			names: (id) => `actor ${id}`,
			shown: new Set([1, 2, 3]),
			gate: new Set([1, 3]),
			held: new Set([3])
		});
		expect(tracked.map((t) => t.labelAlpha)).toEqual([0.6, 0, 0, 0]);
		expect(tracked[0]).toMatchObject({ id: 1, name: "actor 1", y: 10 });
		expect(tracked.map((t) => t.alpha)).toEqual([0.6, 0.6, 0.6, 0.6]);
	});
});

describe("createLabelStacker", () => {
	const label = (id, y) => ({
		id,
		name: "",
		x: 0,
		y,
		r: 2,
		alpha: 1,
		labelAlpha: 1,
		labelOffset: 0
	});

	test("only beside-dot names stack, and each side stacks on its own", () => {
		const stacker = createLabelStacker(16);
		const labels = [label(1, 100), label(2, 104), label(3, 100), label(4, 100)];
		const dirs = { 1: "right", 2: "right", 3: "left" };
		let result = stacker.stack(labels, dirs, null);
		for (let i = 0; i < 60 && !result.settled; i++) {
			result = stacker.stack(labels, dirs, null);
		}
		expect(result.settled).toBe(true);
		expect(result.moved.map((t) => t.id)).toEqual([1, 2, 3]);
		// the right pair is pushed apart to the gap; the lone left label is not
		expect(labels[1].labelOffset - labels[0].labelOffset).toBeCloseTo(12, 5);
		expect(labels[2].labelOffset).toBe(0);
		expect(labels[3].labelOffset).toBe(0);
	});

	test("a floor lifts the whole stack as a body", () => {
		const stacker = createLabelStacker(16);
		const labels = [label(1, 100), label(2, 100)];
		const dirs = { 1: "right", 2: "right" };
		let result = stacker.stack(labels, dirs, 105);
		for (let i = 0; i < 60 && !result.settled; i++) {
			result = stacker.stack(labels, dirs, 105);
		}
		const bottom = Math.max(...labels.map((t) => t.y + t.labelOffset));
		expect(bottom).toBeLessThanOrEqual(105 + 1e-6);
		expect(labels[1].labelOffset - labels[0].labelOffset).toBeCloseTo(16, 5);
	});

	test("nothing beside a dot means nothing moved and nothing owed", () => {
		const stacker = createLabelStacker(16);
		expect(stacker.stack([label(1, 0)], {}, null)).toEqual({
			moved: [],
			settled: true
		});
	});
});

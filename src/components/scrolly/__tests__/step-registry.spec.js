import { describe, expect, test } from "vitest";
import { createStepRegistry } from "../step-registry.svelte.js";
import { story } from "../story.svelte.js";

const NEVER = () => false;

/** the shape of the story's opening: a title card, a step, a chapter card,
 * a gated interaction that a backward move skips, its reveal, and a step that
 * hides the bar */
const OPENING = [
	{ state: "titleGalaxy", splash: {} },
	{ state: "lone" },
	{ state: "chapterCenters", chapter: { title: "The centers" } },
	{ state: "rankFocus", gate: NEVER, skipback: true },
	{ state: "rankReveal" },
	{ state: "raceRecent", hideBar: true }
];

function registry(configs = OPENING) {
	/** @type {import("../step-registry.svelte.js").Move[]} */
	const moves = [];
	const steps = createStepRegistry({ navigate: (move) => moves.push(move) });
	for (const config of configs) steps.register(config);
	return { steps, moves };
}

describe("createStepRegistry", () => {
	test("registers in document order and derives the bar's segments", () => {
		const { steps } = registry();
		expect(steps.count).toBe(6);
		expect(steps.current).toBe(0);
		expect(steps.chapterStarts).toEqual([2]);
		// no dot for the title card, the chapter card or the skipped interaction
		expect(steps.dotSteps).toEqual([1, 4, 5]);
	});

	test("go moves forward through an open gate and reports the move first", () => {
		const { steps, moves } = registry();
		steps.go(1);
		expect(steps.current).toBe(1);
		expect(moves).toEqual([
			{ to: "lone", from: "titleGalaxy", forward: true, back: false }
		]);
		expect(steps.state).toBe("lone");
		expect(steps.config).toBe(steps.configs[1]);
	});

	test("a shut gate refuses the reader's Next but not the step's own advance", () => {
		const { steps, moves } = registry();
		steps.go(1);
		steps.go(2);
		steps.go(3);
		expect(steps.current).toBe(3);
		expect(steps.nextBlocked).toBe(true);
		steps.next();
		expect(steps.current).toBe(3);
		expect(moves).toHaveLength(3);
		steps.advance();
		expect(steps.current).toBe(4);
		expect(moves).toHaveLength(3);
	});

	test("a backward move passes through a skipback step", () => {
		const { steps, moves } = registry();
		for (const to of [1, 2, 3]) steps.go(to);
		steps.advance();
		steps.prev();
		expect(steps.current).toBe(2);
		expect(moves.at(-1)).toEqual({
			to: "chapterCenters",
			from: "rankReveal",
			forward: false,
			back: true
		});
	});

	test("the gated step shares its successor's dot", () => {
		const { steps } = registry();
		for (const to of [1, 2, 3]) steps.go(to);
		expect(steps.dotStep).toBe(4);
		steps.advance();
		expect(steps.dotStep).toBe(4);
	});

	test("destinations off either end are ignored", () => {
		const { steps, moves } = registry();
		steps.go(-1);
		steps.go(99);
		steps.prev();
		expect(steps.current).toBe(0);
		expect(moves).toEqual([]);
	});

	test("the bar hides on a chapter card, a hideBar step, and held prose", () => {
		const { steps } = registry();
		steps.go(1);
		expect(steps.hideBar).toBe(false);
		expect(steps.chapter).toBeNull();
		steps.go(2);
		expect(steps.chapter).toBe("The centers");
		for (const to of [3]) steps.go(to);
		steps.advance();
		steps.advance();
		expect(steps.hideBar).toBe(true);
		steps.prev();
		expect(steps.hideBar).toBe(false);
		story.entryHeld = true;
		expect(steps.hideBar).toBe(true);
		story.entryHeld = false;
	});

	test("exit is one-way", () => {
		const { steps } = registry();
		expect(steps.exited).toBe(false);
		steps.exit();
		expect(steps.exited).toBe(true);
	});
});

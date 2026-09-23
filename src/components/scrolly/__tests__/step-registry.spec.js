import { describe, expect, test } from "vitest";
import { prepareArrival } from "../arrivals.js";
import { createStepRegistry } from "../step-registry.svelte.js";
import { story } from "../story.svelte.js";

const NEVER = () => false;

/** the shape of the story's opening: a title card outside every chapter, a
 * first chapter of two steps, then a second opening on a gated interaction that
 * a backward move skips, its reveal, and a step that hides the bar */
const OPENING = [
	{ state: "titleGalaxy", splash: {}, hideBar: true },
	{ state: "lone", chapter: "Intro" },
	{ state: "hopSeed", chapter: "Intro" },
	{ state: "rankFocus", gate: NEVER, skipback: true, chapter: "The centers" },
	{ state: "rankReveal", chapter: "The centers" },
	{ state: "raceRecent", hideBar: true, chapter: "The centers" }
];

function registry(configs = OPENING) {
	/** @type {import("../step-registry.svelte.js").Move[]} */
	const moves = [];
	const steps = createStepRegistry({ navigate: (move) => moves.push(move) });
	for (const config of configs) steps.register(config);
	return { steps, moves };
}

describe("createStepRegistry", () => {
	test("registers in document order and derives the bar's chapters", () => {
		const { steps } = registry();
		expect(steps.count).toBe(6);
		expect(steps.current).toBe(0);
		// no line for the title card or the skipped interaction
		expect(steps.dotSteps).toEqual([1, 2, 4, 5]);
		expect(steps.chapters).toEqual([
			{ title: "Intro", steps: [1, 2] },
			{ title: "The centers", steps: [4, 5] }
		]);
	});

	test("the current chapter is the one holding the lit line", () => {
		const { steps } = registry();
		expect(steps.currentChapter).toBe(-1);
		steps.go(2);
		expect(steps.currentChapter).toBe(0);
		steps.go(3);
		// the gated step lights its successor's line, in the next chapter
		expect(steps.currentChapter).toBe(1);
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
			to: "hopSeed",
			from: "rankReveal",
			forward: false,
			back: true
		});
	});

	test("the gated step shares its successor's line", () => {
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

	test("the bar hides on the title card, a hideBar step, and held prose", () => {
		const { steps } = registry();
		expect(steps.hideBar).toBe(true);
		steps.go(1);
		expect(steps.hideBar).toBe(false);
		for (const to of [2, 3]) steps.go(to);
		steps.advance();
		steps.advance();
		expect(steps.hideBar).toBe(true);
		steps.prev();
		expect(steps.hideBar).toBe(false);
		story.entryHeld = true;
		expect(steps.hideBar).toBe(true);
		story.entryHeld = false;
	});

	test("a step left before its neighbour landed is held again on return", () => {
		const steps = createStepRegistry({ navigate: prepareArrival });
		for (const config of OPENING) steps.register(config);
		for (const to of [1, 2, 3]) steps.go(to);
		steps.advance();
		story.settledStep = 4;
		expect(steps.held).toBe(false);
		// back, and forward again before step 2 has landed
		steps.prev();
		steps.advance();
		expect(steps.current).toBe(3);
		steps.advance();
		expect(steps.current).toBe(4);
		expect(steps.held).toBe(true);
		story.settledStep = -1;
	});

	test("a change of state disarms `settled`; two steps on one state keep it", () => {
		const steps = createStepRegistry({ navigate: prepareArrival });
		for (const state of ["titleGalaxy", "networkIntro", "networkIntro"])
			steps.register({ state });
		steps.go(1);
		story.settled = "networkIntro";
		steps.go(2);
		expect(story.settled).toBe("networkIntro");
		steps.prev();
		steps.prev();
		expect(story.settled).toBe(null);
	});

	test("exit is one-way", () => {
		const { steps } = registry();
		expect(steps.exited).toBe(false);
		steps.exit();
		expect(steps.exited).toBe(true);
	});
});

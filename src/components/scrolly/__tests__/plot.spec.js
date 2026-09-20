// The plot's canvas geometry. Only the x-axis title's placement is here: it is
// the one piece with a rule a refactor can quietly break, because the obvious
// shape for it (clamp the title up until it clears the card) is the wrong one.
import { describe, expect, test } from "vitest";
import { plotBottom, xLabelTop } from "../plot.js";

// the 375x667 canvas, which motion.md rule 4 calls authoritative, and the two
// rows the title has to choose between on it
const H = 641;
const TICKS = plotBottom(H) + 10;
const HOME = plotBottom(H) + 32;

describe("x-axis title placement", () => {
	test("takes its home under the ticks when the card leaves room", () => {
		// careerTrio's own card is 211px, simRace's 134px; neither reaches it
		expect(xLabelTop(H, 134, TICKS)).toBeCloseTo(HOME);
		// beside the prose the card covers none of the canvas
		expect(xLabelTop(H, 0, TICKS)).toBeCloseTo(HOME);
	});

	test("crosses the tick row rather than settling in it", () => {
		// The rule this file exists for. Every card tall enough to take the home
		// away puts the title ABOVE the ticks — never part-way, which is where a
		// clamp would leave it and where it prints through its own numbers.
		// careerTrio at 211 and careerMany at 227 are the two that used to land
		// either side of the line: 0.2px of clear air, then -6.6px.
		for (const card of [211, 227, 239, 269, 400]) {
			const top = xLabelTop(H, card, TICKS);
			expect(top).toBeLessThan(TICKS);
			expect(top).toBeCloseTo(TICKS - 14);
		}
	});

	test("has no third answer between the two rows", () => {
		// The point of the whole rule, and why it is swept over CARD HEIGHT rather
		// than over the story's steps: sweeping the steps only samples the cards
		// that happen to exist today, and one paragraph of new copy on any step
		// moves it. careerTrio currently clears the ticks by 0.2px, which is luck.
		// Swept a quarter-pixel at a time across every card the canvas can hold,
		// the title reports exactly two coordinates and nothing between them, so
		// no card height anyone can write lands it on the numbers.
		const seen = new Set();
		for (let card = 0; card <= H; card += 0.25)
			seen.add(+xLabelTop(H, card, TICKS).toFixed(4));
		expect([...seen].sort((a, b) => a - b)).toEqual(
			[TICKS - 14, HOME].map((v) => +v.toFixed(4))
		);
	});

	test("switches homes once, and never switches back", () => {
		// a taller card can only ever lift the title, so the reader never sees it
		// drop back under the ticks as the prose grows
		let lifted = false;
		for (let card = 0; card <= H; card += 0.25) {
			const isLifted = xLabelTop(H, card, TICKS) < TICKS;
			expect(lifted && !isLifted).toBe(false);
			lifted = isLifted;
		}
		expect(lifted).toBe(true);
	});

	test("holds still across a scene whose cards differ in height", () => {
		// careerTrio (one paragraph) and careerMany (two) share `scene: "career"`,
		// so the furniture may not move between them (motion.md rule 7)
		expect(xLabelTop(H, 211.1, TICKS)).toBe(xLabelTop(H, 227.1, TICKS));
	});
});

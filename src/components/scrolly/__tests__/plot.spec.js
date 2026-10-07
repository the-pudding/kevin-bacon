// The plot's canvas geometry: the floor and top each chart group draws to off
// the DOM's measurements, and the x-axis title's placement under the floor —
// the one piece with a rule a refactor can quietly break, because the obvious
// shape for it (clamp the title up until it clears the card) is the wrong one.
import { describe, expect, test } from "vitest";
import {
	AXIS_ROOM,
	MARGIN,
	PLOT_BOTTOM_BESIDE,
	chartFloor,
	plotBottomAt,
	MIN_PLOT_H,
	plotTopAt,
	xLabelTop
} from "../plot.js";
import { STATE_GROUP, STATE_PLOT } from "../states.js";
import { geometryFor } from "./helpers.js";

// the 375x667 canvas, which motion.md rule 4 calls authoritative, and the two
// rows the title has to choose between on it
const H = 641;
const GEOMETRY = geometryFor({ h: H });
const FLOOR = plotBottomAt(H, "career", false, GEOMETRY);
const TICKS = FLOOR + 10;
const HOME = FLOOR + 32;

// a geometry as the page measures one: a reserve per group, and one group
// whose title wraps
const MEASURED = {
	reserves: { race: 296, scatter: 251, quiz: 297, career: 263, sim: 198 },
	titles: { race: 27, scatter: 0, quiz: 0, career: 0, sim: 0 }
};
const AXIS_GROUPS = /** @type {const} */ ([
	"race",
	"scatter",
	"quiz",
	"career",
	"sim"
]);

describe("plot floor", () => {
	test("keeps its group's whole reserve, and AXIS_ROOM over it, clear, stacked", () => {
		for (const group of AXIS_GROUPS)
			for (const h of [349, 641, 818, 906]) {
				const floor = plotBottomAt(h, group, false, MEASURED);
				expect(floor + AXIS_ROOM).toBe(h - MEASURED.reserves[group]);
				expect(chartFloor(h, group, MEASURED)).toBe(floor + AXIS_ROOM);
			}
	});

	test("takes the column's own share beside the prose, whatever the group", () => {
		for (const group of AXIS_GROUPS)
			expect(plotBottomAt(820, group, true, MEASURED)).toBe(
				820 * PLOT_BOTTOM_BESIDE
			);
	});

	test("is not drawn to a guess before the geometry is measured", () => {
		expect(() => plotBottomAt(641, "race", false, null)).toThrow();
		expect(() =>
			plotBottomAt(641, "race", false, { reserves: {}, titles: {} })
		).toThrow();
	});
});

describe("plot top", () => {
	test("sits a MARGIN down under a one-line title", () => {
		expect(plotTopAt(641, "scatter", false, MEASURED)).toBe(MARGIN);
	});

	test("moves down by as much as the group's title runs past one line", () => {
		expect(plotTopAt(641, "race", false, MEASURED)).toBe(MARGIN + 27);
	});

	test("never comes closer to the floor than MIN_PLOT_H", () => {
		// a four-line title at 200% text on a phone runs ~190px past one line
		const tall = { ...MEASURED, titles: { ...MEASURED.titles, race: 190 } };
		for (const h of [349, 641])
			expect(
				plotBottomAt(h, "race", false, tall) - plotTopAt(h, "race", false, tall)
			).toBeGreaterThanOrEqual(MIN_PLOT_H);
	});
});

describe("plot groups", () => {
	// The contract the measured geometry rests on: a step change inside a group
	// moves neither the floor nor the top (motion.md rule 7), which holds only
	// because every state in the group reads the same group's numbers.
	test("every state in a group reads the same reserve and plot top", () => {
		for (const group of AXIS_GROUPS) {
			const states = Object.keys(STATE_PLOT).filter(
				(s) => STATE_PLOT[s] === group
			);
			const floors = states.map((s) =>
				plotBottomAt(641, STATE_PLOT[s], false, MEASURED)
			);
			const tops = states.map((s) =>
				plotTopAt(641, STATE_GROUP[s], false, MEASURED)
			);
			expect(new Set(floors).size, group).toBe(1);
			expect(new Set(tops).size, group).toBe(1);
		}
	});

	test("a plot state's measured group is its plot group", () => {
		for (const [state, group] of Object.entries(STATE_PLOT))
			expect(STATE_GROUP[state], state).toBe(group);
	});
});

describe("x-axis title placement", () => {
	test("takes its home under the ticks when the card leaves room", () => {
		// careerTrio's own card is 211px, simRace's 134px; neither reaches it
		expect(xLabelTop(H, 134, TICKS, FLOOR)).toBeCloseTo(HOME);
		// beside the prose the card covers none of the canvas
		expect(xLabelTop(H, 0, TICKS, FLOOR)).toBeCloseTo(HOME);
	});

	test("crosses the tick row rather than settling in it", () => {
		// The rule this file exists for. Every card tall enough to take the home
		// away puts the title ABOVE the ticks — never part-way, which is where a
		// clamp would leave it and where it prints through its own numbers.
		// careerTrio at 211 and careerMany at 227 are the two that used to land
		// either side of the line: 0.2px of clear air, then -6.6px.
		for (const card of [211, 227, 239, 269, 400]) {
			const top = xLabelTop(H, card, TICKS, FLOOR);
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
			seen.add(+xLabelTop(H, card, TICKS, FLOOR).toFixed(4));
		expect([...seen].sort((a, b) => a - b)).toEqual(
			[TICKS - 14, HOME].map((v) => +v.toFixed(4))
		);
	});

	test("switches homes once, and never switches back", () => {
		// a taller card can only ever lift the title, so the reader never sees it
		// drop back under the ticks as the prose grows
		let lifted = false;
		for (let card = 0; card <= H; card += 0.25) {
			const isLifted = xLabelTop(H, card, TICKS, FLOOR) < TICKS;
			expect(lifted && !isLifted).toBe(false);
			lifted = isLifted;
		}
		expect(lifted).toBe(true);
	});

	test("holds still across a scene whose cards differ in height", () => {
		// careerTrio (one paragraph) and careerMany (two) share `scene: "career"`,
		// so the furniture may not move between them (motion.md rule 7)
		expect(xLabelTop(H, 211.1, TICKS, FLOOR)).toBe(
			xLabelTop(H, 227.1, TICKS, FLOOR)
		);
	});
});

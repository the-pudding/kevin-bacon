// The hop chart spans the screen rather than the reading column: it draws into
// the bleed (plot.js's Bleed and screenSpan) so `.scrolly-visual`'s box never
// has to move for it, and the prose lies over it (`proseOver`, Stage.svelte).
import { describe, expect, test } from "vitest";
import { STRIDE, ALPHA_OFFSET } from "../attr-buffer.js";
import { ANCHOR_ID } from "../nodes.js";
import {
	MARGIN,
	SCREEN_CHART_EDGE,
	SCREEN_CHART_MAX_W,
	screenSpan
} from "../plot.js";
import { BOXES, buildLayout, nodes } from "./helpers.js";

const COLUMNS = 12;

/** the visible crowd, the anchor left out */
function crowd(attrs) {
	const xs = [];
	const ys = [];
	for (let id = 0; id < nodes.length; id++) {
		if (id === ANCHOR_ID) continue;
		if (attrs[id * STRIDE + ALPHA_OFFSET] > 0) {
			xs.push(attrs[id * STRIDE]);
			ys.push(attrs[id * STRIDE + 1]);
		}
	}
	return { xs, ys };
}

describe("screenSpan", () => {
	test("edge to edge less the inset, on a screen under the cap", () => {
		expect(screenSpan(375, { l: 0, r: 0 })).toEqual([
			SCREEN_CHART_EDGE,
			375 - SCREEN_CHART_EDGE
		]);
	});

	test("capped and centred on the screen past it", () => {
		const bleed = { l: 20, r: 740 };
		const [x0, x1] = screenSpan(700, bleed);
		expect(x1 - x0).toBe(SCREEN_CHART_MAX_W - SCREEN_CHART_EDGE * 2);
		expect((x0 + x1) / 2).toBe((700 + bleed.r - bleed.l) / 2);
	});
});

describe("hop bands span the screen", () => {
	for (const box of BOXES) {
		const [x0, x1] = screenSpan(box.w, box.bleed);
		const { attrs } = buildLayout("hopBands", box);
		const { xs, ys } = crowd(attrs);

		test(`${box.name}: every dot is inside the span`, () => {
			expect(Math.min(...xs)).toBeGreaterThanOrEqual(x0);
			expect(Math.max(...xs)).toBeLessThanOrEqual(x1);
		});

		test(`${box.name}: the crowd reaches both ends of the span`, () => {
			expect(Math.min(...xs)).toBeLessThan(x0 + (x1 - x0) * 0.01);
			expect(Math.max(...xs)).toBeGreaterThan(x1 - (x1 - x0) * 0.01);
		});

		// the prose lies over the chart at every width, so nothing below it
		// needs keeping clear and the rows run down to a margin off the box's
		// foot — give or take the few px hop 4's minimum height adds to a row
		// whose share is thinner than that
		test(`${box.name}: the rows run down to a margin off the foot`, () => {
			expect(Math.abs(Math.max(...ys) - (box.h - MARGIN))).toBeLessThan(6);
		});

		test(`${box.name}: the anchor stands on the screen's centre`, () => {
			expect(attrs[ANCHOR_ID * STRIDE]).toBeCloseTo((x0 + x1) / 2, 6);
		});

		// the sky rains straight down, so the bands are only as even as the
		// sky's own on-screen scatter plus the hashed rest: within ±5% per
		// column when this was written, at every box
		test(`${box.name}: the crowd fills the span evenly`, () => {
			const counts = new Array(COLUMNS).fill(0);
			for (const x of xs) {
				const col = Math.floor(((x - x0) / (x1 - x0)) * COLUMNS);
				counts[Math.min(COLUMNS - 1, col)]++;
			}
			const mean = xs.length / COLUMNS;
			for (const c of counts) expect(Math.abs(c / mean - 1)).toBeLessThan(0.06);
		});
	}
});

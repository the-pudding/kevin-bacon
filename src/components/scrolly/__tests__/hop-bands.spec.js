// The hop chart spans the screen rather than the reading column: it draws into
// the bleed (plot.js's Bleed and screenSpan) so `.scrolly-visual`'s box never
// has to move for it, and the prose lies over it (`proseOver`, Stage.svelte).
import { describe, expect, test } from "vitest";
import { STRIDE, ALPHA_OFFSET } from "../attr-buffer.js";
import { ANCHOR_ID } from "../nodes.js";
import { HOP_CYCLE_IDS, SLJ } from "../cast.js";
import { HOP_RGB } from "../palette.js";
import {
	MARGIN,
	SCREEN_CHART_EDGE,
	SCREEN_CHART_MAX_W,
	screenSpan
} from "../plot.js";
import { CROWD_DOT_R, DOT_GAP } from "../layouts/hop-bands.js";
import { BOXES, buildLayout, nodes } from "./helpers.js";

// the least distance between two seats, centre to centre. The sampler looks for
// each new seat at between one and two of these from an old one, so it leaves
// no gap wider than two anywhere in the area it fills
const SPACING = CROWD_DOT_R * 2 + DOT_GAP;

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

		// the seats fill the span, so the crowd's outermost dots stand within
		// the sampler's widest gap of either end
		test(`${box.name}: the crowd reaches both ends of the span`, () => {
			expect(Math.min(...xs)).toBeLessThan(x0 + CROWD_DOT_R + SPACING * 2);
			expect(Math.max(...xs)).toBeGreaterThan(x1 - CROWD_DOT_R - SPACING * 2);
		});

		// the prose lies over the chart at every width, so nothing below it
		// needs keeping clear and the rows run down to a margin off the box's
		// foot, short of it by no more than the sampler's widest gap
		test(`${box.name}: the rows run down to a margin off the foot`, () => {
			const slack = box.h - MARGIN - Math.max(...ys);
			expect(slack).toBeGreaterThanOrEqual(CROWD_DOT_R);
			expect(slack).toBeLessThan(CROWD_DOT_R + SPACING * 2);
		});

		test(`${box.name}: the anchor stands on the screen's centre`, () => {
			expect(attrs[ANCHOR_ID * STRIDE]).toBeCloseTo((x0 + x1) / 2, 6);
		});
	}
});

// Steps 4 and 5 draw this layout on Bacon, then on each anchor the cycle turns
// through; SLJ stands in for a searched anchor who is not among the dots on show.
const ANCHORS = [ANCHOR_ID, ...HOP_CYCLE_IDS, SLJ];

/** the layout anchored on `anchorId`, resting (not mid-search) */
const anchored = (box, anchorId) =>
	buildLayout("hopAnchor", box, { anchorId, arriving: false }).attrs;

/** every visible dot, the anchor included */
function visible(attrs) {
	const dots = [];
	for (let id = 0; id < nodes.length; id++) {
		const i = id * STRIDE;
		if (attrs[i + ALPHA_OFFSET] > 0)
			dots.push({ id, x: attrs[i], y: attrs[i + 1], r: attrs[i + 2] });
	}
	return dots;
}

/** the visible crowd split by the row colour it is drawn in, hop 1 first */
function bands(attrs) {
	const rows = [1, 2, 3, 4].map(() => []);
	for (const dot of visible(attrs)) {
		const i = dot.id * STRIDE;
		const hop = HOP_RGB.findIndex(
			(rgb, k) =>
				k > 0 &&
				rgb[0] === attrs[i + 3] &&
				rgb[1] === attrs[i + 4] &&
				rgb[2] === attrs[i + 5]
		);
		if (hop > 0) rows[hop - 1].push(dot);
	}
	return rows;
}

/** every visible crowd dot by id, with the row it is drawn in */
const rowsById = (attrs) =>
	new Map(
		bands(attrs).flatMap((band, row) =>
			band.map((dot) => [dot.id, { ...dot, row }])
		)
	);

/** the closest two dots come, edge to edge, bucketed so it is not 10⁸ pairs */
function closestGap(dots) {
	const cell = SPACING * 2;
	const grid = new Map();
	const keyOf = (cx, cy) => `${cx},${cy}`;
	const cellOf = (d) => [Math.floor(d.x / cell), Math.floor(d.y / cell)];
	for (const d of dots) {
		const key = keyOf(...cellOf(d));
		if (!grid.has(key)) grid.set(key, []);
		grid.get(key).push(d);
	}
	/** the dots in `d`'s cell and the eight around it, `d` left out */
	const neighbours = (d) => {
		const [cx, cy] = cellOf(d);
		return [-1, 0, 1]
			.flatMap((dx) =>
				[-1, 0, 1].map((dy) => grid.get(keyOf(cx + dx, cy + dy)) ?? [])
			)
			.flat()
			.filter((e) => e.id !== d.id);
	};
	let closest = Infinity;
	for (const d of dots)
		for (const e of neighbours(d))
			closest = Math.min(closest, Math.hypot(d.x - e.x, d.y - e.y) - d.r - e.r);
	return closest;
}

describe("hop bands pack as a scatter", () => {
	for (const box of BOXES) {
		const shownOnBacon = new Set(
			visible(anchored(box, ANCHOR_ID)).map((d) => d.id)
		);
		const rowsOnBacon = rowsById(anchored(box, ANCHOR_ID));

		for (const anchorId of ANCHORS) {
			const attrs = anchored(box, anchorId);
			const label = `${box.name}, anchored on ${anchorId}`;

			test(`${label}: no two dots overlap`, () => {
				expect(closestGap(visible(attrs))).toBeGreaterThanOrEqual(
					DOT_GAP - 1e-9
				);
			});

			test(`${label}: every crowd dot is the same size`, () => {
				for (const band of bands(attrs))
					for (const dot of band) expect(dot.r).toBe(CROWD_DOT_R);
			});

			test(`${label}: each row stands clear of the next`, () => {
				const rows = bands(attrs).filter((band) => band.length > 0);
				for (let k = 1; k < rows.length; k++) {
					const above = Math.max(...rows[k - 1].map((d) => d.y));
					const below = Math.min(...rows[k].map((d) => d.y));
					expect(below - above).toBeGreaterThan(CROWD_DOT_R * 2);
				}
			});

			// an anchor turn moves the dots on show between rows and never swaps
			// one for another: the only dot that can differ is the anchor itself
			test(`${label}: the same dots are on show as on Bacon`, () => {
				const shown = new Set(visible(attrs).map((d) => d.id));
				for (const id of shown)
					if (id !== anchorId) expect(shownOnBacon.has(id)).toBe(true);
				for (const id of shownOnBacon) expect(shown.has(id)).toBe(true);
			});

			// the rows are cuts through one fixed set of seats, so a turn off
			// Bacon moves a dot only if a cut passed it, and then straight up or
			// down into the next row, never across it
			test(`${label}: a turn from Bacon moves only the dots changing rows`, () => {
				for (const [id, dot] of rowsById(attrs)) {
					if (id === anchorId || id === ANCHOR_ID) continue;
					const before = rowsOnBacon.get(id);
					expect(dot.x).toBe(before.x);
					if (dot.row === before.row) expect(dot.y).toBe(before.y);
					else
						expect(Math.sign(dot.y - before.y)).toBe(
							Math.sign(dot.row - before.row)
						);
				}
			});
		}

		// on Bacon each row holds its sample share of the dots on show, to
		// within the rounding bandCuts does
		test(`${box.name}: on Bacon each row holds its share of the sample`, () => {
			const rows = bands(anchored(box, ANCHOR_ID));
			const total = rows.reduce((sum, band) => sum + band.length, 0);
			const sample = [1, 2, 3, 4].map(
				(hop) => nodes.filter((n) => n.hop === hop).length
			);
			const sampleTotal = sample.reduce((sum, n) => sum + n, 0);
			rows.forEach((band, k) => {
				expect(
					Math.abs(band.length - (sample[k] / sampleTotal) * total)
				).toBeLessThanOrEqual(1);
				for (const { id } of band) expect(nodes[id].hop).toBe(k + 1);
			});
		});
	}
});

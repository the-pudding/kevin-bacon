// Shared fixtures for the scrolly framework's tests: the real corpus, the
// canvas boxes every layout is exercised at, and the params a layout is handed
// — built the way ScrollyVisual builds them, from the state's selector over the
// story's resting defaults.
import { createHash } from "node:crypto";
import { makeNodes } from "../nodes.js";
import { STATES, STATE_PARAMS } from "../states.js";
import { story } from "../story.svelte.js";
import {
	NO_BLEED,
	PLOT_BOTTOM_BESIDE,
	PLOT_BOTTOM_STACKED,
	setPlotBottomFrac
} from "../layout-shared.js";

export const { nodes, edges } = makeNodes();

/**
 * The canvas boxes: a phone, the reading column with the prose stacked over it
 * on a wide screen, and the same column beside the prose. `bleed` is how far the
 * canvas element reaches past the column on each side (see layout-shared's
 * Bleed), which is what puts the chapter cards' sky off the column.
 */
export const BOXES = [
	{
		name: "phone",
		w: 375,
		h: 560,
		bleed: NO_BLEED,
		plotFrac: PLOT_BOTTOM_STACKED
	},
	{
		name: "stacked",
		w: 700,
		h: 820,
		bleed: { l: 370, r: 370 },
		plotFrac: PLOT_BOTTOM_STACKED
	},
	{
		name: "beside",
		w: 700,
		h: 820,
		bleed: { l: 20, r: 740 },
		plotFrac: PLOT_BOTTOM_BESIDE
	}
];

/**
 * What ScrollyVisual hands a layout: the state's selector plucks the interaction
 * fields it reads from the story state (here, the resting defaults, or those
 * defaults with `overrides` applied) merged with the step's static params.
 */
export function layoutParamsFor(state, stepParams, overrides) {
	const s = overrides ? { ...story, ...overrides } : story;
	return STATE_PARAMS[state]?.(s, stepParams) ?? stepParams ?? null;
}

/** one layout call, at one box, with the params ScrollyVisual would pass */
export function buildLayout(state, box, params = layoutParamsFor(state)) {
	setPlotBottomFrac(box.plotFrac);
	return STATES[state](nodes, box.w, box.h, edges, params, box.bleed);
}

/** a short content hash of a typed array's bytes */
export const hashOf = (arr) =>
	createHash("sha1")
		.update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
		.digest("hex")
		.slice(0, 16);

/** the largest absolute difference between two buffers, and the slot it is in */
export function maxAbsDiff(a, b) {
	let max = 0;
	let at = -1;
	for (let i = 0; i < a.length; i++) {
		const d = Math.abs(a[i] - b[i]);
		if (Number.isNaN(d)) return { max: Infinity, at: i };
		if (d > max) {
			max = d;
			at = i;
		}
	}
	return { max, at };
}

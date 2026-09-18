// Shared fixtures for the scrolly framework's tests: the real corpus, the
// canvas boxes every layout is exercised at, and the params a layout is handed
// — built the way ScrollyVisual builds them, from the state's selector over the
// story's resting defaults.
import { createHash } from "node:crypto";
import { makeNodes } from "../nodes.js";
import { STATES, STATE_PARAMS } from "../states.js";
import { story } from "../story.svelte.js";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	NO_BLEED,
	PLOT_BOTTOM_BESIDE,
	PLOT_BOTTOM_STACKED,
	setPlotBottomFrac
} from "../layout-shared.js";
import { RACE_DATA_END } from "../layouts/race.js";

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

/** the story's resting defaults with `overrides` applied — a plain copy, so a
 * test can hand it to a `start`/`finish` hook and read back what it wrote */
export const storyWith = (overrides) => ({ ...story, ...overrides });

/**
 * What ScrollyVisual hands a layout: the state's selector plucks the interaction
 * fields it reads from the story (the resting defaults, or `s` when given)
 * merged with the step's static params.
 */
export function layoutParamsFor(state, stepParams, s = story) {
	return STATE_PARAMS[state]?.(s, stepParams) ?? stepParams ?? null;
}

/** one layout call, at one box, with the params ScrollyVisual would pass */
export function buildLayout(state, box, params = layoutParamsFor(state)) {
	setPlotBottomFrac(box.plotFrac);
	return STATES[state](nodes, box.w, box.h, edges, params, box.bleed);
}

/**
 * The context a choreography is planned against (ArrivalContext in states.js),
 * as ScrollyVisual would build it: by default the reader arrives from nowhere
 * in particular with no race camera to pick up, and the live camera rests on
 * the present.
 */
export function arrivalContext(box, options = {}) {
	const exit = options.exit ?? { playhead: null, frontier: RACE_DATA_END };
	return {
		w: box.w,
		h: box.h,
		from: options.from ?? null,
		exit,
		camera: options.camera ?? {
			playhead: exit.playhead ?? RACE_DATA_END,
			frontier: exit.frontier
		},
		live: {
			attrs: new Float32Array(ATTR_SIZE),
			trails: new Float32Array(TRAIL_SIZE)
		},
		story: options.story ?? story
	};
}

/** a choreography's leg durations for one arrival (see EntryAnim.phases) */
export const phasesOf = (anim, ctx) =>
	typeof anim.phases === "function" ? anim.phases(ctx) : anim.phases;

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

// Shared fixtures for the scrolly framework's tests: the real corpus, the
// canvas boxes every layout is exercised at, and the params a layout is handed
// — built the way ScrollyVisual builds them, from the state's selector over the
// story's resting defaults.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseSteps } from "../../../../scripts/story-steps.js";
import { makeNodes } from "../nodes.js";
import { STATES, STATE_PARAMS } from "../states.js";
import { story } from "../story.svelte.js";
import { ATTR_SIZE } from "../attr-buffer.js";
import {
	AXIS_ROOM,
	NO_BLEED,
	setPlotBeside,
	setPlotGeometry
} from "../plot.js";
import { TRAIL_SIZE } from "../trails.js";
import { RACE_DATA_END } from "../layouts/race.js";

export const { nodes, edges } = makeNodes();

/**
 * The canvas boxes: a phone, the reading column with the prose stacked over it
 * on a wide screen, and the same column beside the prose. `bleed` is how far the
 * canvas element reaches past the column on each side (see plot.js's
 * Bleed), which is what puts a full-bleed sky off the column.
 */
export const BOXES = [
	{
		name: "phone",
		w: 375,
		h: 560,
		bleed: NO_BLEED,
		beside: false
	},
	{
		name: "stacked",
		w: 700,
		h: 820,
		bleed: { l: 370, r: 370 },
		beside: false
	},
	{
		name: "beside",
		w: 700,
		h: 820,
		bleed: { l: 20, r: 740 },
		beside: true
	}
];

/**
 * The measured geometry (plot.js's PlotGeometry) every layout is built against
 * in these specs: the reserves each group carried as hand-measured constants
 * before they were measured live (a card's px plus AXIS_ROOM, floored at 60% of
 * the canvas), and the opening's at the 72% of the canvas its fit used to
 * take; every title on one line. A fixture, not a measurement — the goldens
 * hash how the layouts answer a geometry, and the browser is what measures one.
 * @param {{ h: number }} box
 * @returns {import("../plot.js").PlotGeometry}
 */
export function geometryFor({ h }) {
	const card = (px) => Math.min(px + AXIS_ROOM, 0.4 * h) - AXIS_ROOM;
	return {
		reserves: {
			race: card(250),
			scatter: card(234),
			quiz: card(293),
			career: card(250),
			sim: card(189),
			intro: 0.28 * h,
			rank: 250
		},
		titles: {
			race: 0,
			scatter: 0,
			quiz: 0,
			career: 0,
			sim: 0,
			intro: 0,
			rank: 0,
			hops: 0
		}
	};
}

/**
 * Put plot.js in `box`'s page layout — side by side or stacked, and its
 * measured geometry — as ScrollyVisual's fitBox does before it builds anything.
 * @param {{ h: number, beside: boolean }} box
 */
export function useBox(box) {
	setPlotBeside(box.beside);
	setPlotGeometry(geometryFor(box));
}

// every spec starts on the phone, as the page does
useBox(BOXES[0]);

// …with the rank panel's focus row measured (RankBars' `story.rank.focusBar`),
// as the page has it before it lays a rank state out (`ready` in
// layouts/rank.js). A fixture, like geometryFor: the panel is what measures it.
story.rank.focusBar = { x: 36, y: 240, w: 300 };

/**
 * The story's resting defaults with `overrides` applied one group deep —
 * `storyWith({ sim: { runs: 10 } })` keeps `sim.names` — as a plain copy of every
 * group, so a test can hand it to a `start`/`finish` hook and read back what it
 * wrote without touching the defaults.
 */
export function storyWith(overrides = {}) {
	const s = {};
	for (const [key, value] of Object.entries(story)) {
		const group =
			value !== null && typeof value === "object" && !Array.isArray(value);
		s[key] = group
			? { ...value, ...overrides[key] }
			: (overrides[key] ?? value);
	}
	return s;
}

/** `s` with a frame's published fields (FrameOutput's `story`, by group) applied, as a copy */
export function published(s, groups = {}) {
	const after = { ...s };
	for (const [group, fields] of Object.entries(groups)) {
		after[group] = { ...s[group], ...fields };
	}
	return after;
}

/**
 * What ScrollyVisual hands a layout: the state's selector plucks the interaction
 * fields it reads from the story (the resting defaults, or `s` when given)
 * merged with the step's static params.
 */
export function layoutParamsFor(state, stepParams, s = story) {
	return STATE_PARAMS[state]?.(s, stepParams) ?? stepParams ?? null;
}

/**
 * The story's steps as the registry receives them — the state, the step's
 * static params and `skipback` — read off Index.svelte's <Step> list. A step's
 * params are an object literal of plain values, read as JSON once its keys are
 * quoted; anything richer fails the parse rather than being guessed at.
 * @returns {{ state: string, params?: Object, skipback: boolean }[]}
 */
export function storySteps() {
	const source = readFileSync(
		new URL("../../Index.svelte", import.meta.url),
		"utf8"
	);
	return parseSteps(source).map(({ state, attrs }) => {
		const literal = attrs.match(/\bparams=\{(\{[^}]*\})\}/)?.[1];
		return {
			state,
			params: literal
				? JSON.parse(literal.replace(/(\w+):/g, '"$1":'))
				: undefined,
			skipback: /\bskipback\b/.test(attrs)
		};
	});
}

/**
 * The static params of every <Step> on `state`, in story order — `[undefined]`
 * for a state no step hands params to. A state whose selector reads its step's
 * params (`hopAnchor`'s anchor) is only ever laid out with one of these.
 * @param {string} state
 * @returns {(Object | undefined)[]}
 */
export function stepParamsOf(state) {
	const params = storySteps()
		.filter((step) => step.state === state)
		.map((step) => step.params);
	return params.length > 0 ? params : [undefined];
}

/** where a backward move from step `i` lands: `skipback` steps are passed through */
export function backFrom(steps, i) {
	let dest = i - 1;
	while (dest > 0 && steps[dest].skipback) dest -= 1;
	return dest;
}

/** one layout call, at one box, with the params ScrollyVisual would pass */
export function buildLayout(state, box, params = layoutParamsFor(state)) {
	useBox(box);
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

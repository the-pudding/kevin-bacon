// Layout goldens: every state, at every box, hashed. A refactor that changes
// nothing keeps every hash; an intentional layout change regenerates its
// golden in the same commit (`vitest run -u`). Layouts are also checked to be
// pure — the render layer caches them on (state, box, params) and assumes so.
//
// Colour is hashed apart from everything else (`colour`), so a palette change
// — a token edit in properties/role/mark.json — regenerates only colour
// hashes, and every other hash staying put is the proof that nothing moved.
import { describe, expect, test } from "vitest";
import { STATES } from "../states.js";
import { SIM_N_SIMS } from "../layouts/sim-race.js";
import { INTRO_IDS } from "../nodes.js";
import { SLJ } from "../cast.js";
import { SEARCH_POOL } from "../search.js";
import { STRIDE } from "../attr-buffer.js";
import {
	BOXES,
	buildLayout,
	hashOf,
	layoutParamsFor,
	storyWith
} from "./helpers.js";

// the static params the <Step> tags in Index.svelte declare
const STEP_PARAMS = {
	scatterCenters: [
		{ showFilms: true },
		{ showPair: true },
		{ showPair: true, showCostars: true }
	]
};

// interactions, as overrides of the story's resting defaults. Each is tried
// against every state and kept only where it changes what the layout is handed.
const INTERACTIONS = [
	{ rank: { guesses: [SLJ], focusBar: { x: 120, y: 300, w: 400 } } },
	{ rank: { skipped: true } },
	// the step back into rankReveal out of the race: nothing under the ladder
	{ rank: { bareCanvas: true } },
	{ quiz: { picks: { 0: 1 }, revealed: true } },
	{ sim: { runs: SIM_N_SIMS, names: 5 } },
	{ race: { genzLinesShown: true } },
	{ intro: { focus: INTRO_IDS[3] } },
	{ race: { view: { playhead: 2006 } } },
	// the reader's own actor. One id is enough to pin every searchable state's
	// highlight: the mark is struck from one rule (search.js), so a second id
	// would hash a different dot in the same code path. Taken off the pool by
	// position rather than named, so it survives a data rebuild that reorders it.
	{ search: { actorId: SEARCH_POOL[0] } },
	// the hop chart anchored on somebody other than Bacon. Named rather than
	// taken by position, and NOT one of the cycle's own: this has to be the actor
	// whose split is furthest from the resting frame's whatever the cycle is
	// later changed to, and Jackson is the extreme of the whole pool — 11.1% at
	// three movies against Bacon's 29.0% — so a change that quietly stopped the
	// rows following the anchor could not leave the hash alone.
	{ hops: { anchorId: SLJ } },
	// …and the same anchor mid-delivery: the search's chip is still carrying it,
	// so the seat at the top is held invisible and nothing climbs out of the
	// crowd to fill it (see ActorSearch's `moves`). The rows are already the new
	// anchor's, which is the whole point of hashing this separately — the frame
	// the reader looks at while the chip flies is a real resting frame of the
	// chart and not a tween artefact.
	{ hops: { anchorId: SLJ, arriving: true } }
];

const keyOf = (params) => JSON.stringify(params) ?? "null";

/** every distinct (state, params) the story can put on the canvas */
function variants(state) {
	const seen = new Map();
	const add = (params) => {
		const key = keyOf(params);
		if (!seen.has(key)) seen.set(key, params);
	};
	for (const step of STEP_PARAMS[state] ?? [undefined]) {
		add(layoutParamsFor(state, step));
		for (const overrides of INTERACTIONS) {
			add(layoutParamsFor(state, step, storyWith(overrides)));
		}
	}
	return [...seen.entries()];
}

/** a slot's red, green and blue channels, after x, y and r */
const RGB = [3, 4, 5];
/** decor keys that name a colour; `ink` is also a numeric highlight weight */
const COLOUR_KEYS = new Set(["color", "rgb", "ink"]);

/** the attrs buffer split into its rgb channels and everything else */
function splitAttrs(attrs) {
	const rgb = [];
	const rest = [];
	attrs.forEach((v, i) => (RGB.includes(i % STRIDE) ? rgb : rest).push(v));
	return { rgb: Float64Array.from(rgb), rest: Float64Array.from(rest) };
}

/** decor as JSON with its colour values lifted out, and those values */
function splitDecor(decor) {
	const colours = [];
	const shape = JSON.stringify(decor, (key, value) => {
		if (!COLOUR_KEYS.has(key) || typeof value === "number") return value;
		colours.push(value);
		return undefined;
	});
	return { shape, colours: JSON.stringify(colours) };
}

/** the layout's whole output, as hashes — buffers by bytes, decor by JSON */
function summarise(layout) {
	const { attrs, trails, delays, paramWalk, trailDelays, ...decor } = layout;
	const { rgb, rest } = splitAttrs(attrs);
	const clear = paramWalk && splitAttrs(paramWalk.clear);
	const { shape, colours } = splitDecor(decor);
	return {
		attrs: hashOf(rest),
		colour: hashOf(
			Buffer.concat([
				Buffer.from(rgb.buffer),
				...(clear ? [Buffer.from(clear.rgb.buffer)] : []),
				Buffer.from(colours)
			])
		),
		trails: trails ? hashOf(trails) : null,
		delays: delays ? hashOf(delays) : null,
		trailDelays: trailDelays ? hashOf(trailDelays) : null,
		decor: hashOf(Buffer.from(shape)),
		// only the layouts that author a retarget schedule carry the key
		...(paramWalk && {
			paramWalk: {
				clear: hashOf(clear.rest),
				fadeMs: paramWalk.fadeMs,
				ms: paramWalk.ms,
				windows: hashOf(paramWalk.windows),
				labelAt: paramWalk.labelAt
			}
		})
	};
}

describe("layout goldens", () => {
	for (const state of Object.keys(STATES)) {
		for (const [key, params] of variants(state)) {
			for (const box of BOXES) {
				test(`${state} ${key} @${box.name}`, () => {
					const summary = summarise(buildLayout(state, box, params));
					expect(summarise(buildLayout(state, box, params)), "pure").toEqual(
						summary
					);
					expect(summary).toMatchSnapshot();
				});
			}
		}
	}
});

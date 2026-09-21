// Layout goldens: every state, at every box, hashed. A refactor that changes
// nothing keeps every hash; an intentional layout change regenerates its
// golden in the same commit (`vitest run -u`). Layouts are also checked to be
// pure — the render layer caches them on (state, box, params) and assumes so.
import { describe, expect, test } from "vitest";
import { STATES } from "../states.js";
import { SIM_N_SIMS } from "../layouts/sim-race.js";
import { INTRO_IDS } from "../nodes.js";
import { SLJ } from "../cast.js";
import { SEARCH_POOL } from "../search.js";
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
	{ rank: { gaveUp: true } },
	{ quiz: { picks: { 0: 1 }, revealed: true } },
	{ sim: { runs: SIM_N_SIMS, names: 5 } },
	{ race: { genzLinesShown: true } },
	{ intro: { focus: INTRO_IDS[3] } },
	{ race: { view: { playhead: 2006 } } },
	// the reader's own actor. One id is enough to pin every searchable state's
	// highlight: the mark is struck from one rule (search.js), so a second id
	// would hash a different dot in the same code path. Taken off the pool by
	// position rather than named, so it survives a data rebuild that reorders it.
	{ search: { actorId: SEARCH_POOL[0] } }
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

/** the layout's whole output, as hashes — buffers by bytes, decor by JSON */
function summarise(layout) {
	const { attrs, trails, delays, trailDelays, ...decor } = layout;
	return {
		attrs: hashOf(attrs),
		trails: trails ? hashOf(trails) : null,
		delays: delays ? hashOf(delays) : null,
		trailDelays: trailDelays ? hashOf(trailDelays) : null,
		decor: hashOf(Buffer.from(JSON.stringify(decor)))
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

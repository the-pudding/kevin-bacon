import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import {
	STRIDE,
	EDGE_BASE,
	ATTR_SIZE,
	DELAY_SIZE,
	edgeIndex,
	TRAIL_POINTS,
	TRAIL_STRIDE,
	TRAIL_META,
	TRAIL_SIZE,
	SLJ,
	HANKS,
	STREEP,
	DENIRO
} from "./layout-shared.js";
import { states as introStates } from "./layouts/intro.js";
import { states as hopBandsStates } from "./layouts/hop-bands.js";
import { states as rankStates } from "./layouts/rank.js";
import { states as raceStates } from "./layouts/race.js";
import { states as scattersStates, QUIZ_IDS } from "./layouts/scatters.js";
import { states as predictionStates } from "./layouts/prediction.js";
import { states as careerStates } from "./layouts/career.js";
import { states as winBarsStates, BAR_CANDIDATES } from "./layouts/win-bars.js";
import { states as sljFanStates } from "./layouts/slj-fan.js";

// re-exported so ScrollyVisual.svelte can keep importing everything from
// this one module; the actual definitions live in layout-shared.js
export {
	STRIDE,
	EDGE_BASE,
	ATTR_SIZE,
	DELAY_SIZE,
	edgeIndex,
	TRAIL_POINTS,
	TRAIL_STRIDE,
	TRAIL_META,
	TRAIL_SIZE
};

/**
 * @typedef {import("./layout-shared.js").Note} Note
 * @typedef {import("./layout-shared.js").LayoutFn} LayoutFn
 */

// Each chapter module under ./layouts/ exports a `states` object mapping
// state key -> { layout, labels?, params?, pulse?, overlay? }, colocating
// everything about one state instead of spreading it across parallel maps.
// This registry merges them; the public STATES/STATE_LABELS/STATE_PARAMS/
// STATE_PULSE/OVERLAYS exports below are all derived views over it.
const REGISTRY = {
	...introStates,
	...hopBandsStates,
	...rankStates,
	...raceStates,
	...scattersStates,
	...predictionStates,
	...careerStates,
	...winBarsStates,
	...sljFanStates
};

const pick = (field) => {
	const out = {};
	for (const [key, def] of Object.entries(REGISTRY)) {
		if (def[field] !== undefined) out[key] = def[field];
	}
	return out;
};

export const STATES = Object.fromEntries(
	Object.entries(REGISTRY).map(([key, def]) => [key, def.layout])
);

/** @typedef {keyof typeof STATES} LayoutState */

/**
 * per-state node ids whose names render as HTML labels over the canvas;
 * a function value derives the ids from the current layout params
 * @type {Partial<Record<LayoutState, number[] | ((params?: Object) => number[])>>}
 */
export const STATE_LABELS = pick("labels");

/**
 * Per-state selector plucking the interaction fields a layout consumes from
 * the shared `story` state (see story.svelte.js) merged with the step's
 * static params. Only states that react to interactions appear here.
 * @type {Partial<Record<LayoutState, (story: Object, stepParams?: Object) => Object>>}
 */
export const STATE_PARAMS = pick("params");

/** per-state "center actor" node id — gets the ripple pulse */
export const STATE_PULSE = pick("pulse");

/**
 * Per-state list of prior states the layout's `delays` choreography is
 * authored for. Arriving from any other state (e.g. scrolling backwards)
 * skips the delays — one plain tween instead of replaying the reveal.
 * States without an entry use their delays from every direction.
 * @type {Partial<Record<LayoutState, LayoutState[]>>}
 */
export const STATE_REVEAL_FROM = pick("revealFrom");

export const OVERLAYS = pick("overlay");

/** every id a dynamic STATE_LABELS function could return (for frame tracking) */
export const STATE_TRACKED = [
	SLJ,
	HANKS,
	STREEP,
	DENIRO,
	...QUIZ_IDS,
	...story.genz.candidates.map((c) => c.id)
];

/** ids the interactive step-card components need (see story.svelte.js) */
export const INTERACTIVE_IDS = {
	guessOptions: [SLJ, HANKS, STREEP, DENIRO],
	quiz: story.quiz,
	barCandidates: BAR_CANDIDATES.map((c) => c.id)
};

/** name/rank lookups for the interactive step-card components */
export const nodeName = (id) => rawNodes.nodes[id][1];
export const nodeRank = (id) => rawNodes.nodes[id][5];
export const nodeAvgDistance = (id) => rawNodes.nodes[id][4];

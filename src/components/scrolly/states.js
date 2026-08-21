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
	DENIRO,
	BY_RANK,
	RANK_TOP_N
} from "./layout-shared.js";
import { states as introStates } from "./layouts/intro.js";
import { states as hopBandsStates } from "./layouts/hop-bands.js";
import { states as rankStates } from "./layouts/rank.js";
import { states as raceStates } from "./layouts/race.js";
import { states as scattersStates, QUIZ_IDS } from "./layouts/scatters.js";
import { states as predictionStates } from "./layouts/prediction.js";
import { states as careerStates } from "./layouts/career.js";
import { states as winBarsStates } from "./layouts/win-bars.js";
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

/** the visual a step declares; every step maps to a real layout */
/** @typedef {LayoutState} VisualState */

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

/**
 * Per-state handler for a tap on one of the layout's `hits` regions: writes the
 * picked value into the shared `story` state, which the state's own STATE_PARAMS
 * selector then feeds back into the layout. Only states whose layout returns
 * `hits` appear here.
 * @type {Partial<Record<LayoutState, (story: Object, value: unknown) => void>>}
 */
export const STATE_PICK = pick("pick");

/** per-state "center actor" node id — gets the ripple pulse */
export const STATE_PULSE = pick("pulse");

/** per-state yCap for the race chart's y-fit — see writeRaceSweepFrame */
export const STATE_YCAP = pick("yCap");

/**
 * Per-state race camera descriptor `{ extent: [y0, y1] }` — the content extent
 * the fixed-scale x axis pans over (see layouts/race.js). Its presence is what
 * marks a state as a pannable race step.
 * @type {Partial<Record<LayoutState, { extent: [number, number] }>>}
 */
export const STATE_RACE = pick("race");

/**
 * Per-state shared y-fit `[vMin, vMax, vLo, vHi]` for the race chart. The pan
 * and sweep animators must pass the same fit their static layout uses, or the y
 * axis snaps between an animated frame and its settle.
 * @type {Partial<Record<LayoutState, [number, number, number, number] | null>>}
 */
export const STATE_YFIT = pick("yFit");

/**
 * Per-state list of prior states the layout's `delays` choreography is
 * authored for. Arriving from any other state (e.g. stepping backwards)
 * skips the delays — one plain tween instead of replaying the reveal.
 * States without an entry use their delays from every direction.
 * @type {Partial<Record<LayoutState, LayoutState[]>>}
 */
export const STATE_REVEAL_FROM = pick("revealFrom");

/**
 * Per-state entry choreography: an animation the state plays on arrival instead
 * of a plain tween. `phases` lists each leg's duration in ms; `frames` builds a
 * writer for the current canvas (mirroring LayoutFn's signature) that stamps the
 * slots it animates straight into the live buffers for one eased leg.
 *
 * Two contracts keep the joins invisible. The last leg at e=1 must be
 * byte-identical to the static layout, so the settle has nothing to move. And
 * leg 0 at e=0 doubles as the seed frame the arrival tween lands on, so
 * everything the choreography is about to draw must be fully transparent there
 * — the tween morphs whatever the buffers already hold into the seed, and a
 * slot left visible makes the reader watch stale geometry (this state's own
 * lines, left behind by an earlier visit) animate away before it has ever been
 * drawn.
 *
 * Scoped by STATE_REVEAL_FROM like any other reveal. See ScrollyVisual's
 * playEntry.
 * `labelsAfter` optionally holds the names back: entry i lists the ids whose
 * labels appear once leg i finishes, so a name lands with the mark that earns
 * it instead of captioning a dot mid-flight. Declaring it hides every one of
 * the state's labels until its leg lands, including through the arrival tween.
 *
 * @typedef {Object} EntryAnim
 * @property {number[]} phases
 * @property {number[][]} [labelsAfter]
 * @property {(nodes: import("./nodes.js").ActorNode[], w: number, h: number, params?: Object) =>
 *   (attrs: Float64Array, trails: Float64Array, phase: number, e: number) => void} frames
 * @type {Partial<Record<LayoutState, EntryAnim>>}
 */
export const STATE_ENTRY = pick("entry");

/**
 * Empty seed frames: states that pre-position every node (invisible) where the
 * next visual wants it. ScrollyVisual fades the prior visual out *in place*
 * first, then snaps into this frame while invisible — so no dot is seen changing
 * position, only fading.
 * @type {Partial<Record<LayoutState, boolean>>}
 */
export const STATE_SEED = pick("seed");

export const OVERLAYS = pick("overlay");

/**
 * Per-state override of where a node's label sits relative to its dot:
 * `"left"` / `"right"` place it beside the dot (vertically centred) instead of
 * the default below-and-centred. Keyed by node id. Used to de-clutter tight
 * clusters (e.g. the quiz pairs).
 * @type {Partial<Record<LayoutState, Record<number, "left" | "right">>>}
 */
export const STATE_LABEL_DIRS = pick("labelDirs");

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
	quiz: story.quiz
};

/** name/rank lookups for the interactive step-card components */
export const nodeName = (id) => rawNodes.nodes[id][1];
export const nodeRank = (id) => rawNodes.nodes[id][5];

// same top-N slice RankBars renders, so every search result a reader can
// pick is guaranteed a visible row to scroll to and highlight
const RANK_OPTIONS = BY_RANK.slice(0, RANK_TOP_N);

/** case-insensitive substring search over the top-ranked actors RankBars renders */
export function searchRankOptions(query, limit = 8) {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	const results = [];
	for (const { id, rank } of RANK_OPTIONS) {
		if (!nodeName(id).toLowerCase().includes(q)) continue;
		results.push({ id, rank, name: nodeName(id) });
		if (results.length >= limit) break;
	}
	return results;
}

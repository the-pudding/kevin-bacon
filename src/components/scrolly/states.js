import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import {
	SLJ,
	HANKS,
	STREEP,
	DENIRO,
	CAGE,
	BY_RANK,
	RANK_TOP_N
} from "./cast.js";
import { states as introStates } from "./layouts/intro.js";
import { states as hopBandsStates } from "./layouts/hop-bands.js";
import { states as rankStates } from "./layouts/rank.js";
import { states as raceStates } from "./layouts/race.js";
import {
	states as scattersStates,
	QUIZ_IDS,
	QUIZ_PAIRS
} from "./layouts/scatters.js";
import { states as careerStates } from "./layouts/career.js";
import { states as simRaceStates } from "./layouts/sim-race.js";
import { states as chapterStates } from "./layouts/chapters.js";
import { GALAXY_CAST } from "./galaxy-highlight.js";

/**
 * @typedef {import("./layout-types.js").Note} Note
 * @typedef {import("./layout-types.js").LayoutFn} LayoutFn
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
	...careerStates,
	...simRaceStates,
	...chapterStates
};

const pick = (field) => {
	const out = {};
	for (const [key, def] of Object.entries(REGISTRY)) {
		if (def[field] !== undefined) out[key] = def[field];
	}
	return out;
};

// Annotated rather than inferred: a layout only declares the parameters it
// actually uses, so inference makes STATES a union of arities and the widest
// call site (ScrollyVisual's, which passes `bleed`) fails against whichever
// member declares the fewest. Every entry IS a LayoutFn — that is the contract
// the whole registry exists to hold — so say so. Keyed off REGISTRY so
// LayoutState below stays the union of real state names rather than `string`.
export const STATES = /** @type {Record<keyof typeof REGISTRY, LayoutFn>} */ (
	Object.fromEntries(
		Object.entries(REGISTRY).map(([key, def]) => [key, def.layout])
	)
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
 * Per-state chart title, shown above the visual. Grouped by chart, not by
 * step: every state belonging to the same chart (e.g. raceRecent/raceFull/
 * raceFuture) repeats the same string.
 * @type {Partial<Record<LayoutState, string>>}
 */
export const STATE_TITLE = pick("title");

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

/**
 * per-state "center actor" node id — gets the ripple pulse. A function form
 * reads the step's params, for states whose subject changes between steps.
 */
export const STATE_PULSE = pick("pulse");

/** per-state yCap for the race chart's y-fit — see writeRaceSweepFrame */
export const STATE_YCAP = pick("yCap");

/**
 * Per-state race camera descriptor — the content extent the fixed-scale x axis
 * pans over, plus the bounds on where its camera may rest (see layouts/race.js).
 * Its presence is what marks a state as a race step; whether that step is
 * *pannable* is a separate question, answered by racePanBounds (raceFuture pins
 * its camera by declaring `tailPx`, which leaves its floor and ceiling equal).
 *
 * `tailPx` pins the camera by its LEFT edge instead of its right — how many px
 * of history to keep behind the end of the data — and `frontier` is how far that
 * step's future strip rests open. Both are raceFuture's alone; see
 * raceMaxPlayhead and raceFutureScale.
 *
 * `proj` is the closing step's alone — its resting draw-on progress out across
 * the future strip. Read here as a PRESENCE (`!== undefined`) rather than as a
 * number, to ask whether a step's marks reach past the data plot's right edge.
 * @type {Partial<Record<LayoutState, { extent: [number, number], minPlayhead?: number, maxPlayhead?: number, tailPx?: number, frontier?: number, proj?: number, highlight?: number[] }>>}
 */
export const STATE_RACE = pick("race");

/**
 * Which states share one set of chart furniture. States naming the same scene
 * assert that their `title` and `overlay` are the same and that their axes are
 * the same axes, so a step change between them neither fades the furniture out
 * nor mounts it again — see ScrollyVisual's swapFurniture, and the invariant
 * that checks the assertion in registry.spec.js.
 *
 * A state that declares nothing is its own scene, which is the common case: two
 * different charts always swap.
 * @type {Partial<Record<LayoutState, string>>}
 */
export const STATE_SCENE = pick("scene");

/**
 * Per-state list of prior states the layout's `delays` choreography is
 * authored for. Arriving from any other state (e.g. stepping backwards)
 * skips the delays — one plain tween instead of replaying the reveal.
 * States without an entry use their delays from every direction.
 * @type {Partial<Record<LayoutState, LayoutState[]>>}
 */
export const STATE_REVEAL_FROM = pick("revealFrom");

/**
 * What a choreography's frame writer may hand back, applied by ScrollyVisual on
 * every tick: `decor` is per-frame chart furniture merged over the static
 * layout's (a panning camera's axes, the takeover callout, the future block);
 * `camera` is the frame's camera, kept as the live camera the pan control and
 * the next leg read; `story` is fields to publish, written only when they
 * change (a write that changes nothing still retargets the tweener through the
 * layout params). A writer that returns nothing publishes nothing.
 * @typedef {Object} FrameOutput
 * @property {Object} [decor]
 * @property {{ playhead?: number, frontier?: number }} [camera]
 * @property {Record<string, Record<string, unknown>>} [story] interaction
 *   fields to publish, by group (`{ sim: { names } }` — see story.svelte.js)
 */

/**
 * What a choreography is planned against. `exit` is the camera of the race step
 * the reader is leaving, snapshotted before the arriving step reset it, so a
 * retrace starts from wherever the camera actually was; `camera` is the live
 * one, for an ask that starts from what the reader can see. `live` is the frame
 * on the canvas at the moment of planning and `story` the interaction state as
 * it stands — both read untracked, so nothing a plan reads can re-run the effect
 * that built it.
 * @typedef {Object} ArrivalContext
 * @property {number} w
 * @property {number} h
 * @property {LayoutState | null} from the state the reader is coming from
 * @property {{ playhead: number | null, frontier: number }} exit
 * @property {{ playhead: number, frontier: number }} camera
 * @property {{ attrs: Float32Array, trails: Float32Array }} live
 * @property {Object} story
 */

/**
 * Builds a choreography's frame writer for one canvas and one arrival. The
 * arguments up to `bleed` are a layout call's own (see LayoutFn): a leg that
 * rebuilds its state's layout to animate toward it needs the same edge table
 * and the same bleed that layout was built with, or its last frame and the
 * settle are different frames. The writer stamps the slots it animates straight
 * into the live buffers for one eased leg and may hand back a FrameOutput.
 *
 * It is handed both the leg's eased progress `e` and its LINEAR elapsed `ms`.
 * Use `e` for motion authored as a share of the leg, which is nearly
 * everything; `ms` is for a leg whose motion is a schedule in real time — the
 * one case today is `lone`, whose walk leg replays the delay array its own
 * layout returns, and which would be warped by the trapezoidal ease.
 * @typedef {(nodes: import("./nodes.js").ActorNode[], w: number, h: number,
 *   edges: import("./nodes.js").Edge[], params: Object | null,
 *   bleed: import("./plot.js").Bleed, ctx: ArrivalContext) =>
 *   (attrs: Float64Array | Float32Array, trails: Float64Array | Float32Array,
 *     phase: number, e: number, ms: number) => FrameOutput | void} FrameWriterFactory
 */

/**
 * @typedef {(nodes: import("./nodes.js").ActorNode[], w: number, h: number,
 *   edges: import("./nodes.js").Edge[], params: Object | null,
 *   bleed: import("./plot.js").Bleed, ctx: ArrivalContext) =>
 *   (attrs: Float64Array, trails: Float64Array) => void} SeedWriterFactory
 */

/**
 * An entry choreography: an animation a state plays on arrival instead of a
 * plain tween. `phases` lists each leg's duration in ms — a constant, or a
 * function of the arrival for legs whose length depends on how far the camera
 * has to travel; a plan may return no legs at all, and the arrival then
 * finishes at once. `frames` builds the writer (see FrameWriterFactory).
 *
 * Two contracts keep the joins invisible. Leg 0 at e = 0 is the frame the
 * arrival lands on, so everything the choreography is about to draw must be
 * fully transparent there — the tween morphs whatever the buffers already hold
 * into it, and a slot left visible makes the reader watch stale geometry (this
 * state's own lines, left behind by an earlier visit) animate away before it
 * has ever been drawn. And the last leg at e = 1 must reproduce the layout it
 * hands off to call for call, so the settle has nothing to move: the static
 * layout for an entry without a `finish`, or the layout at the params `finish`
 * publishes for one with. Both are asserted in `__tests__/contracts.spec.js`.
 *
 * `from` scopes the entry to the states it is authored for. It defaults to the
 * state's `revealFrom`, and a state may declare several entries for different
 * origins (the race chart plays one pan forwards and another backwards).
 * Arriving from anywhere else is one plain tween.
 *
 * `labelsAfter` holds the names back: index 0 lists the ids whose labels appear
 * once the arrival itself has landed, index i + 1 those that land with leg i,
 * and the gate lifts entirely once the last listed beat has landed — so a name
 * lands with the mark that earns it instead of captioning a dot mid-flight. An
 * empty list at the last index introduces nobody and says only "hold every
 * name until here". `cardAfter` holds the step's PROSE back the same way
 * (`story.entryHeld`), until leg `cardAfter` lands: for an arrival that spends
 * its first seconds finding the thing the prose is about, the words would
 * otherwise be describing an empty frame.
 *
 * `ownsArrival` says leg 0 at e = 0 reproduces the frame the reader is LEAVING,
 * so there is nothing for an arrival tween to carry and the legs take the rAF
 * straight from the step change. It is what a leg whose motion has a real-world
 * RATE needs — an arrival tween eases its own duration, so a sky that flows at
 * one speed either side of it visibly surges through the middle — and what a
 * camera pan picking up from the previous step's camera needs. Two things come
 * with it: a state's authored `delays` can only belong to a LEG, and the seed is
 * SNAPPED rather than tweened, so the departing state must hold no trails a snap
 * would pop off rather than fade.
 *
 * `hold` parks the arrival on a frame of its own until the story lets it go:
 * `frame` writes that frame over copies of the live buffers and `until` is the
 * gate, read reactively. The rank list's collapse into the race chart is the
 * one user — the canvas holds a copy of what the HTML overlay is showing and
 * moves only once the overlay has stood down. `arrivalJitter` overrides the
 * arrival tween's hashed per-node stagger — 0 for a flight whose top-to-bottom
 * order the reader is meant to read.
 *
 * There is no `veil` any more: holding the chart's furniture back until the
 * arrival lands is what EVERY arrival does now (see ScrollyVisual's
 * furnitureHeld), so it needs no per-entry declaration.
 *
 * `seed` replaces leg 0's frame 0 as the arrival target, for the one case the
 * two must differ: the race draw-on's dots arrive already lit out of the rank
 * list, but its trails must arrive at alpha 0 or a previous visit's curves fade
 * in as they squeeze onto the present edge.
 *
 * `finish` ends the choreography through the story instead of a snap onto the
 * static layout: handed the story and the last frame's camera (undefined if no
 * leg ran), it publishes the params the last frame is the layout for — the race
 * chapter's camera hold — and the param retarget that follows moves nothing and
 * settles the state.
 *
 * @typedef {Object} EntryAnim
 * @property {number[] | ((ctx: ArrivalContext) => number[])} phases
 * @property {FrameWriterFactory} frames
 * @property {LayoutState[]} [from]
 * @property {number[][]} [labelsAfter]
 * @property {number} [cardAfter]
 * @property {boolean} [ownsArrival]
 * @property {number} [arrivalJitter]
 * @property {{ until: (story: Object) => boolean, frame: SeedWriterFactory }} [hold]
 * @property {SeedWriterFactory} [seed]
 * @property {(story: Object, camera?: { playhead: number, frontier: number }) => void} [finish]
 */

/**
 * Per-state entry choreographies, one or more per state (see EntryAnim.from);
 * `entryFor` picks the one an arrival plays.
 * @type {Partial<Record<LayoutState, EntryAnim[]>>}
 */
export const STATE_ENTRIES = Object.fromEntries(
	Object.entries(REGISTRY)
		.filter(([, def]) => def.entry !== undefined)
		.map(([key, def]) => [
			key,
			Array.isArray(def.entry) ? def.entry : [def.entry]
		])
);

/**
 * The entry choreography `state` plays when arriving from `from`, or undefined
 * for a plain tween: the first of its entries whose scope — its own `from`,
 * else the state's `revealFrom`, else any origin — includes `from`.
 * @param {LayoutState} state
 * @param {LayoutState | null | undefined} from
 * @returns {EntryAnim | undefined}
 */
export function entryFor(state, from) {
	const entries = STATE_ENTRIES[state];
	if (!entries) return undefined;
	const revealFrom = REGISTRY[state].revealFrom;
	return entries.find((entry) => {
		const scope = entry.from ?? revealFrom;
		return !scope || scope.includes(from);
	});
}

/**
 * A reader's ask: an animation the active state plays when a StartButton
 * requests it by name (see request() in story.svelte.js). The same legs as an
 * EntryAnim — `phases`, `frames` and `finish` mean the same — planned against
 * the live camera rather than an arrival. `start` puts the story in the state
 * the run begins from (the simulation's playhead back to zero); a plan with no
 * legs is a dropped ask (the rewind pressed on a chart already at its
 * waypoint). While it runs `story.running` names it, and a state change
 * abandons it like any choreography.
 * @typedef {Object} RequestAnim
 * @property {number[] | ((ctx: ArrivalContext) => number[])} phases
 * @property {FrameWriterFactory} frames
 * @property {(story: Object) => void} [start]
 * @property {(story: Object, camera?: { playhead: number, frontier: number }) => void} [finish]
 */

/**
 * Per-state requests, keyed by the name a StartButton asks for.
 * @type {Partial<Record<LayoutState, Record<string, RequestAnim>>>}
 */
export const STATE_REQUESTS = pick("requests");

/**
 * Per-state ambient loop: an unbounded per-frame writer that runs for as long as
 * the state rests, started once its arrival has settled (see ScrollyVisual's
 * playAmbient). What an entry choreography is to an arrival, this is to the
 * pause after it.
 *
 * Unlike EntryAnim there is no last leg, so there is no settle to land on — and
 * one contract in place of that pair: **at t = 0 the writer must reproduce the
 * static layout call for call**, so the loop's first tick redraws exactly the
 * frame the arrival tween landed on and the join moves nothing.
 *
 * Hold that by construction rather than by review. There are two ways: write the
 * motion as an offset from a stored base that is identically zero at t = 0, or
 * make the static layout literally be the animation evaluated at t = 0. The
 * galaxy's flight (`makeFlight`) takes the second — `fieldSpot` is `flowSpot`
 * with the clock at zero — because its dots do not oscillate about a resting
 * place, they stream continuously and never come back to one.
 *
 * Like every choreography it writes its animated slots straight into the live
 * tween buffers and must touch nothing else, and it is abandoned by a state
 * change's stopSweep — the next arrival tween then snapshots `current`, so the
 * marks travel on from wherever the loop had them.
 *
 * Never runs under prefers-reduced-motion: the static layout is the still frame.
 * A loop whose motion is the only thing carrying a reading therefore owes that
 * reading to the static frame too (the flight bakes the sky's depth into it).
 *
 * `edges` and `bleed` are the layout's own (see LayoutFn). Unlike EntryAnim,
 * which authors its legs from scratch, an ambient loop's whole job is to carry
 * on the frame it landed on, so it is handed exactly what a layout call takes
 * and rebuilds its base with it — the same arguments, or the base is a different
 * frame from the one the arrival landed on and the t = 0 contract above breaks.
 *
 * `clocked` says the loop takes a seventh argument — the sky clock its arrival
 * landed on — and continues the story's flow from there instead of starting at
 * the flow's own zero. Only a loop whose t = 0 frame is therefore a FUNCTION of
 * that clock may declare it, and a clock is only ever handed over between two
 * states that both declare it (see ScrollyVisual's skyHandoff). At clock 0 it
 * must reduce exactly to the unclocked loop, which is what keeps the t = 0
 * contract above true and what contracts.spec.js checks.
 *
 * @typedef {Object} AmbientAnim
 * @property {(nodes: import("./nodes.js").ActorNode[], w: number, h: number,
 *   edges: import("./nodes.js").Edge[], params?: Object, bleed?: number,
 *   t0?: number) =>
 *   (attrs: Float32Array, trails: Float32Array, t: number) => void} frames
 * @property {boolean} [clocked]
 * @type {Partial<Record<LayoutState, AmbientAnim>>}
 */
export const STATE_AMBIENT = pick("ambient");

export const OVERLAYS = pick("overlay");

/**
 * Per-state override of where a node's label sits relative to its dot:
 * `"left"` / `"right"` place it beside the dot (vertically centred) instead of
 * the default below-and-centred. Keyed by node id. Used to de-clutter tight
 * clusters (e.g. the quiz pairs). A function form reads the step's params, for
 * states whose labels move between steps.
 * @type {Partial<Record<LayoutState, Record<number, "left" | "right"> | ((params?: Object) => Record<number, "left" | "right">)>>}
 */
export const STATE_LABEL_DIRS = pick("labelDirs");

/**
 * Per-state override of a labelled node's text, so a name can carry the number
 * the step is about instead of just the name. Keyed by node id; ids absent from
 * the returned map keep their plain name.
 * @type {Partial<Record<LayoutState, (nodes: import("./nodes.js").ActorNode[], params?: Object) => Record<number, string>>>}
 */
export const STATE_LABEL_TEXT = pick("labelText");

/**
 * every id a dynamic STATE_LABELS function could return (for frame tracking).
 * The galaxy cast is here rather than in `chapterCenters`'s own `labels`, which
 * returns nothing: the beat's name is chosen per FRAME, inside drawScene, and an
 * id with no tracked entry has no label element to show.
 */
export const STATE_TRACKED = [
	SLJ,
	HANKS,
	STREEP,
	DENIRO,
	CAGE,
	...QUIZ_IDS,
	...story.genz.candidates.map((c) => c.id),
	...GALAXY_CAST
];

/** the rank chapter's two states: the ladder panel the race arrival collapses */
export const isRankState = (s) => s === "rankFocus" || s === "rankReveal";

/** ids the interactive step-card components need (see story.svelte.js) */
export const INTERACTIVE_IDS = {
	quiz: QUIZ_PAIRS
};

/**
 * Is there anything left for the pair quiz to ask? Both step 19's forward gate
 * (Index.svelte) and PairQuiz's own starting cursor read this, so the gate can
 * never hold the reader on a panel that has nothing left to answer — which is
 * what a reload straight past the quiz produces: `quizRevealed` with no picks.
 */
export const quizDone = (s) =>
	s.quiz.revealed ||
	INTERACTIVE_IDS.quiz.every((_, i) => s.quiz.picks[i] !== undefined);

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

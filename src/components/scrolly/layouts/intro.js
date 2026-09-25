import {
	NODE_COUNT,
	EDGE_COUNT,
	EDGE_PAIRS,
	ANCHOR_ID,
	INTRO_IDS
} from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	edgeIndex,
	STRIDE,
	set,
	setEdge
} from "../attr-buffer.js";
import { introPosition, NETWORK_INTRO_RADIUS } from "../intro-geometry.js";
import { HOP_RGB, CROWD, INK } from "../palette.js";
import { routesTo, routeActors, introDistance } from "../intro-routes.js";

const INTRO_EDGE_ALPHA = 0.5;

// The reveal is by DISTANCE. Bacon is already on screen; then everybody one
// movie away arrives as the six lines grow out to them, and then everybody two
// movies away as their twelve grow out of those. Two beats, and they are the two
// the chapter is about — the reader watches "one movie away" and "two movies
// away" happen before a word of prose says either.
//
// Every line in a layer grows at once, and a node pops in step with the line(s)
// reaching it, so both finish together as it arrives. An actor with more than one
// parent (Austin Butler, through Hanks and through Stone; Margot Robbie, through
// three) gets all of theirs at once: they really are two movies away by several
// routes, and drawing one while holding the rest back would say otherwise.
//
// The walk plays as `networkIntro`'s own pop-in: the story opens on it, and
// ScrollyVisual seeds every node at zero radius/alpha on first paint, then
// tweens to the authored positions on the authored delays below.

// The order the constellation's tour walks the network in (see Index.svelte). Authored, not
// derived: it opens on a name the reader is likeliest to know, then alternates
// two-hop and one-hop actors so the distance in the sentence keeps changing
// rather than reading "two movies" ten times in a row. Eight of the fourteen are
// two hops out, so the tail cannot keep alternating.
export const CYCLE_ORDER = [
	11, // Austin Butler
	4, // Tom Hanks
	14, // Zendaya
	6, // Meryl Streep
	12, // Margot Robbie — three routes
	13, // Emma Stone
	7, // Timothée Chalamet
	1, // Robert De Niro
	9, // Anya Taylor-Joy
	3, // Ryan Gosling
	8, // Saoirse Ronan — two routes
	5, // Benedict Cumberbatch
	2, // Cillian Murphy
	10 // Jessie Buckley
];

// How long one layer's lines and dots take to arrive: ScrollyVisual's
// ENTER_MS, the pop-in tween that plays the walk, so INTRO_LAYER_GAP_MS below
// is the breath the reader actually gets between one layer landing and the
// next setting off.
const INTRO_LINE_MS = 900;
// When the first layer sets off. Bacon grows in over the same ENTER_MS from
// the first frame, so this is his landing plus ~600ms on his own node: the
// reader meets the one dot the game is about before anything connects to it.
const INTRO_START_DWELL_MS = 1500;
const INTRO_LAYER_GAP_MS = 300; // pause between one layer landing and the next setting off

// --- route focus (once the reveal has landed; see the `params` selector below) ---
const FOCUS_RADIUS = 10; // the picked actor
const ROUTE_RADIUS = 7; // the hub(s) their route passes through
// Everyone off the route: recessed, not erased — the constellation is still the
// point of the step, so the crowd keeps its dots. Weight carries the emphasis
// (the route goes ink and thick against the crowd's grey), so this only has to
// push them back, not hide them.
const DIM_ALPHA = 0.6;
// Every link with a route lit, the route's own included: the route is the ink
// drawn OVER its links (render.js's drawEdges), so the line under it stays as
// quiet as the rest and the ink is the only thing that travels.
const DIM_EDGE_ALPHA = 0.2; // enough that the network still reads as connected
// one movie's leg of a route walk, so a two-movie route takes twice as long as
// a one-movie one and the line travels at the same pace on both
const ROUTE_LEG_MS = 700;
// the route being left fades out over this, all of it — the parts it shares
// with the new route included — and the new one waits out the gap after
const ROUTE_FADE_MS = 400;
// the bare-network hold before the new route's first leg starts. Effectively
// none: the actor is already fully lit by the end of ROUTE_FADE_MS (see
// routeWalk), so the line should leave the instant they have arrived rather
// than sit still for a further beat. Not a literal 0 — the tweener's window
// math divides by a window's own width (see windowProgress in tween.js), so a
// zero-width window is a division by zero — this is the smallest value that
// keeps every off-route slot's [0, ROUTE_GAP_MS] window real.
const ROUTE_GAP_MS = 1;
// hit regions: square, centred on the dot, sized off the tightest gap in the
// fitted layout so boxes never overlap (a 360px viewport squeezes the graph hard)
const HIT_MIN = 26;
const HIT_MAX = 44;
const HIT_SHARE = 0.85;

// A name hanging under a dot: the 4px gap ScrollyVisual leaves plus .node-label's
// own line box (12px at 1.2).
const NODE_LABEL_PX = 4 + Math.round(12 * 1.2);

/**
 * The y the constellation's drawing ends at in a `w × h` canvas — the lowest
 * dot, plus the largest radius it can take and the name under it. The tour's
 * caption hangs off this, so it tracks the graph at every viewport instead of a
 * guessed fraction of the canvas (which left a hole on a tall phone, where the
 * fit is width-limited and the constellation stops well short of its band).
 */
export function introBottom(w, h) {
	let y = 0;
	for (const id of INTRO_IDS) y = Math.max(y, introPosition(id, w, h)[1]);
	return y + FOCUS_RADIUS + NODE_LABEL_PX;
}

/**
 * Writes the constellation — the 15 intro actors and their 18 links — into
 * `attrs` at `scale`, touching nothing else, and returns their screen
 * positions. `focus` picks out a route (used by `networkIntro`); the states
 * that only show the network as a whole pass `null`.
 *
 * `scale` is a camera pull-back about Bacon (see introPosition): the dots
 * shrink with the geometry, so a zoomed-out network reads as further away
 * rather than as the same diagram with the same fat marks.
 *
 * `edgeFade` scales every link's alpha, so a state can keep the constellation's
 * geometry while dropping the links themselves (hopSeed passes 0 — the lines go
 * out with the names as the camera starts pulling back). The links keep full
 * draw progress either way, so they fade in place instead of retracting.
 *
 * Exported so `hopSeed` can hang its zoomed-out network over the hop bands'
 * invisible parks without rebuilding either.
 */
export function writeNetwork(
	attrs,
	nodes,
	w,
	h,
	focus,
	scale = 1,
	edgeFade = 1
) {
	const routes = focus == null ? [] : routesTo(focus);
	const routeEdges = new Set(routes.flat().map((seg) => seg.edge));
	const routeNodes = focus == null ? new Set() : routeActors(focus);
	/** @type {Map<number, [number, number]>} */
	const pos = new Map();
	for (const id of INTRO_IDS) {
		const [x, y] = introPosition(id, w, h, scale);
		pos.set(id, [x, y]);
		const { r, rgb, alpha } = introDot(id, nodes[id], focus, routeNodes);
		set(attrs, id, x, y, r * scale, rgb, alpha);
	}
	for (let e = 0; e < EDGE_COUNT; e++) {
		const onRoute = routeEdges.has(e);
		setEdge(attrs, e, 1, edgeAlpha(focus) * edgeFade, onRoute ? 1 : 0);
	}
	return pos;
}

/**
 * How one of the fifteen is drawn. With nothing picked out, the anchor in his
 * own colour and the rest as crowd; with a route lit, its actors in ink — the
 * subject the biggest dot on it (routeActors includes the focused actor, so one
 * branch covers both) — and everyone else dimmed, their name labels with them,
 * since a label rides its dot's alpha.
 */
function introDot(id, n, focus, routeNodes) {
	const r = NETWORK_INTRO_RADIUS[n.hop];
	if (focus == null || id === ANCHOR_ID) {
		return { r, rgb: id === ANCHOR_ID ? HOP_RGB[0] : CROWD, alpha: 1 };
	}
	if (routeNodes.has(id)) {
		return {
			r: id === focus ? FOCUS_RADIUS : ROUTE_RADIUS,
			rgb: INK,
			alpha: 1
		};
	}
	return { r, rgb: CROWD, alpha: DIM_ALPHA };
}

/** a link's alpha: the constellation's own at rest, dimmed with a route lit */
const edgeAlpha = (focus) =>
	focus == null ? INTRO_EDGE_ALPHA : DIM_EDGE_ALPHA;

// The full intro frame: the constellation, with every other node hidden on
// Bacon's dot — the one the sky grows out of. The only arrival out of here is
// hopSeed's pull-back, whose own frames place the crowd from its frame 0, so
// this spot is where an unseen dot sets off from, never where one appears.
function buildNetworkAttrs(nodes, w, h, focus) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	for (const n of nodes) {
		if (!introSet.has(n.id)) set(attrs, n.id, bx, by, 2, CROWD, 0);
	}
	const pos = writeNetwork(attrs, nodes, w, h, focus);
	return { attrs, pos };
}

// Tap regions: one square per actor, all the same size so none can overlap. The
// label is the region's accessible name and ScrollyVisual keys the buttons on
// it, so it must NOT change with the selection — aria-pressed carries that.
function buildHits(nodes, pos, focus) {
	let tightest = Infinity;
	for (const [a, [ax, ay]] of pos) {
		for (const [b, [bx, by]] of pos) {
			if (a >= b) continue;
			tightest = Math.min(tightest, Math.hypot(ax - bx, ay - by));
		}
	}
	const side = Math.max(HIT_MIN, Math.min(HIT_MAX, tightest * HIT_SHARE));
	return INTRO_IDS.map((id) => {
		const [x, y] = pos.get(id);
		return {
			x: x - side / 2,
			y: y - side / 2,
			w: side,
			h: side,
			label:
				id === ANCHOR_ID
					? "Kevin Bacon, the center, resumes the tour of routes"
					: `${nodes[id].name}, trace their route to Kevin Bacon`,
			value: id,
			selected: id === focus,
			round: true
		};
	});
}

/**
 * When the layer of actors `d` movies from Bacon sets off — Bacon himself is
 * already on screen, and each layer after him waits out the one in front.
 */
const layerStart = (d) =>
	d === 0
		? 0
		: INTRO_START_DWELL_MS + (d - 1) * (INTRO_LINE_MS + INTRO_LAYER_GAP_MS);

/**
 * The reveal's delay schedule: when each actor pops, and when the line(s)
 * reaching them leave the layer in front.
 *
 * Struck once at load rather than per canvas, because nothing in it depends on
 * the viewport — it is a pure function of the baked edge table.
 */
function buildIntroDelays() {
	const delays = new Float64Array(DELAY_SIZE);
	for (const id of INTRO_IDS) delays[id] = layerStart(introDistance(id));
	EDGE_PAIRS.forEach(([source, target], e) => {
		const from = introDistance(source);
		const to = introDistance(target);
		// A line belongs to the layer it arrives AT. Every link in this network
		// crosses exactly one layer — there is no shortcut within one, and a
		// same-layer link would have no layer of its own to draw on, so it is
		// checked rather than given a fallback the reveal would then hide.
		if (Math.abs(from - to) !== 1) {
			throw new Error(`intro: edge ${e} does not cross exactly one layer`);
		}
		delays[NODE_COUNT + e] = layerStart(Math.max(from, to));
	});
	return delays;
}

const INTRO_DELAYS = buildIntroDelays();

/**
 * A picked-out route's walk, in two stages. First every route clears (`clear`,
 * over `fadeMs`): the one being left fades out where it lies, ALL of it, since
 * a co-star or a line it shares with the new route would otherwise sit there
 * lit while the new route draws into it. Then, after ROUTE_GAP_MS on the bare
 * network, the line travels from the actor in to Bacon, one movie per leg, at
 * a constant rate and straight on through every co-star between (see the
 * tweener's `windows`). The lines leaving the actor all draw at once — every
 * co-star they reach Bacon through, Margot Robbie's three included — and the
 * lines from those co-stars on to Bacon pick up where they land. A co-star
 * inks up and grows with the line arriving at it, the reveal's own rule, and
 * their name waits for it (`labelAt`). The actor themselves needs no line to
 * arrive: they ink up and grow while the old route fades, as their name
 * appears.
 * @param {Float64Array} attrs the frame the walk lands on
 * @param {import("../nodes.js").ActorNode[]} nodes
 * @param {number} focus
 * @returns {{ clear: Float64Array, fadeMs: number, ms: number, windows: Float64Array, labelAt: [number, number][] }}
 *   the cleared frame and how long it takes to reach, then the walk's length
 *   and each group's `[from, to]` share of it (two per DELAY_SIZE slot), and
 *   when each co-star's name is released, in ms from the retarget
 */
export function routeWalk(attrs, nodes, focus) {
	const legs = introDistance(focus);
	const ms = ROUTE_GAP_MS + legs * ROUTE_LEG_MS;
	const windows = new Float64Array(DELAY_SIZE * 2);
	const span = (slot, fromMs, toMs) =>
		windows.set([fromMs / ms, toMs / ms], slot * 2);
	const leg = (slot, k) =>
		span(
			slot,
			ROUTE_GAP_MS + k * ROUTE_LEG_MS,
			ROUTE_GAP_MS + (k + 1) * ROUTE_LEG_MS
		);
	// off the route nothing changes between the cleared frame and this one
	for (let slot = 0; slot < DELAY_SIZE; slot++) span(slot, 0, ROUTE_GAP_MS);
	// a segment runs outward-in, so `from` is the end its leg sets off from
	for (const { edge, from } of routesTo(focus).flat()) {
		leg(NODE_COUNT + edge, legs - introDistance(from));
	}
	/** @type {[number, number][]} */
	const labelAt = [];
	for (const id of routeActors(focus)) {
		if (id === ANCHOR_ID || id === focus) continue;
		const k = legs - introDistance(id) - 1;
		leg(id, k);
		labelAt.push([id, ROUTE_FADE_MS + ROUTE_GAP_MS + (k + 1) * ROUTE_LEG_MS]);
	}
	return {
		clear: clearedRoute(attrs, nodes, focus),
		fadeMs: ROUTE_FADE_MS,
		ms,
		windows,
		labelAt
	};
}

/**
 * `attrs` with `focus`'s route taken back out: its co-stars dimmed with the
 * rest and its lines uncovered — the network the new route draws onto. The
 * actor keeps their landed look, so they take it on as their name appears.
 */
function clearedRoute(attrs, nodes, focus) {
	const clear = attrs.slice();
	const none = new Set();
	for (const id of routeActors(focus)) {
		if (id === focus) continue;
		const i = id * STRIDE;
		const { r, rgb, alpha } = introDot(id, nodes[id], focus, none);
		set(clear, id, clear[i], clear[i + 1], r, rgb, alpha);
	}
	for (const { edge } of routesTo(focus).flat()) clear[edgeIndex(edge) + 2] = 0;
	return clear;
}

/**
 * The constellation, at rest: the frame the layered walk above grows INTO, and
 * the one the tour then picks routes out of. `delays` is that walk — the
 * first load's pop-in (see the state's `revealFrom`); every other arrival
 * lands on this frame in one tween.
 * `paramWalk` is the route walk a focus change retargets on (routeWalk);
 * with nothing picked out there is no walk, and the tour's neutral frame comes
 * back in one tween.
 * @type {import("../layout-types.js").LayoutFn}
 */
function layoutNetworkIntro(nodes, w, h, _edges, params) {
	const focus = params?.focus ?? null;
	const { attrs, pos } = buildNetworkAttrs(nodes, w, h, focus);
	const hits = buildHits(nodes, pos, focus);
	const paramWalk = focus == null ? undefined : routeWalk(attrs, nodes, focus);
	return { attrs, hits, delays: INTRO_DELAYS, paramWalk };
}

export const states = {
	// Two steps rest here: the one that grows the constellation and demonstrates
	// the game on it, and the one after it, whose prose is the only thing that
	// changes. One state rather than two, so the step between them moves nothing
	// at all and the tour never restarts (see notes/scrolly-framework.md).
	networkIntro: {
		layout: layoutNetworkIntro,
		// Only the actor being talked about and the actors their route runs through
		// keep their names: the sentence in the card names them, so the chart has to
		// agree, and fourteen labels around one highlighted route is just noise. The
		// rest keep their (dimmed) dots — the constellation is still the point.
		// A function, so the fifteen are not discoverable from the declaration —
		// they are declared in states.js's STATE_TRACKED instead.
		labels: (p) => (p?.focus == null ? INTRO_IDS : [...routeActors(p.focus)]),
		params: (s) => ({ focus: s.intro.focus }),
		// The walk is this state's pop-in: the story opens here, and a first
		// load seeds every node at zero radius/alpha and tweens it in on the
		// delays above. Every other arrival is the reader stepping BACK here from
		// hopSeed, with the network already grown, so none plays the delays —
		// replaying them would hold each actor (and the name riding its dot's
		// alpha) wherever the interrupted tween left it. Empty rather than left
		// out, because a state with no `revealFrom` plays its delays from every
		// direction.
		revealFrom: [],
		// A tap takes the step off its automatic tour and leaves the highlight where
		// the reader put it. Tapping the highlighted actor again, or Bacon (a route
		// from the anchor to itself says nothing), clears the pick and hands the step
		// back to the tour rather than leaving an empty caption behind.
		// A plain toggle, so every tap does exactly one visible thing: tapping an
		// actor picks them out and stops the tour; tapping the highlighted actor
		// again — or Bacon, who has no route to himself — clears the highlight and
		// leaves the constellation neutral.
		pick: (s, value) => {
			const release = value === ANCHOR_ID || value === s.intro.focus;
			s.intro.focus = release ? null : value;
			s.intro.pinned = !release;
			if (release) s.intro.releases += 1;
		}
	}
};

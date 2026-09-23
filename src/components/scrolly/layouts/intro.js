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
import { FIELD_IDS } from "../cast.js";
import {
	introPosition,
	PULLBACK_ZOOM,
	PULLBACK_DOT_R,
	NETWORK_INTRO_RADIUS
} from "../intro-geometry.js";
import { HOP_RGB, CROWD, INK } from "../palette.js";
import { TITLE_BAND, NO_BLEED } from "../plot.js";
import { parkHidden } from "../scatter-scales.js";
import {
	writeFieldCrowd,
	galaxyBox,
	galaxyCentre,
	makeFlight,
	FIELD_ALPHA,
	skyFlight,
	skyFrac,
	skyMag,
	FLIGHT_CYCLE_MS,
	depthSize,
	SKY_MID,
	SKY_DEPTH_GAMMA,
	depthFade,
	flightWindow,
	SKY_FAR,
	SKY_NEAR,
	titleRevealGate
} from "../sky.js";
import { routesTo, routeActors, introDistance } from "../intro-routes.js";
import {
	withGalaxyHighlight,
	GALAXY_FOCUS_MARGIN,
	GALAXY_FOCUS_R_MULT
} from "../galaxy-highlight.js";
import { easeCubicInOut } from "../tween.js";
import { CHAPTER_OUT_MS } from "../chapterFade.js";

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
// The walk plays as `networkIntro`'s own pop-in (ScrollyVisual seeds every node
// at zero radius/alpha on first paint, then tweens to the authored positions on
// the authored delays below) and is replayed by the last leg of the opening
// flight off the title card — one schedule, so the two cannot tell different
// stories.

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

// mirrors ScrollyVisual's TWEEN_MS so a node lands just as its line arrives
const INTRO_LINE_MS = 700;
const INTRO_START_DWELL_MS = 350; // beat on Bacon alone before the first lines leave him
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
const ROUTE_GAP_MS = 350;
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
 * dot, plus the largest radius it can take and the name under it. Step 1's
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

// The full intro frame: the constellation, with every other node parked at the
// scatter spot a later chapter wants it at (alpha 0).
function buildNetworkAttrs(nodes, w, h, focus, bleed = NO_BLEED) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	for (const n of nodes) {
		if (!introSet.has(n.id)) parkHidden(attrs, n, w, h);
	}
	// hopSeed's field, parked (invisible) at full zoom — where the camera would
	// have pushed it back out to. Without this the crowd is parked on the films
	// scatter instead, and stepping back out of hopSeed drags 600 visible dots
	// left across the canvas toward their film counts rather than letting the
	// camera zoom back in over them. Same box hopSeed lands the field on
	// (`galaxyBox`), so the park is that step's own geometry rather than one that
	// merely looks like it from behind alpha 0.
	writeFieldCrowd(attrs, w, h, 1, galaxyBox(w, h, bleed));
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
 * the viewport — it is a pure function of the baked edge table. Two things
 * follow. The walk's total length is a constant the entry choreography can
 * declare as a leg duration, before any layout has been built. And the
 * cold-start arrival and the step off the title card are driven by the very
 * same array, so they cannot tell different stories.
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
 * How long the walk runs, end to end: the last start the schedule issues, plus
 * the tween that start begins. This is the duration of the choreography's walk
 * leg, so it has to be exact rather than generous — slack on the end is a still
 * frame the reader waits through before the step settles.
 */
const INTRO_WALK_MS =
	INTRO_DELAYS.reduce((m, d) => Math.max(m, d), 0) + INTRO_LINE_MS;

/** the hop layers out from Bacon, nearest first: 1, 2, ... */
const INTRO_LAYERS = [
	...new Set(INTRO_IDS.map(introDistance).filter((d) => d > 0))
].sort((a, b) => a - b);

/**
 * When each layer's lines finish arriving, on the walk's own clock: its start
 * plus the one tween every line in it runs. The walk is played as one leg per
 * layer, ending here, so a layer's names can be introduced as its lines land
 * rather than all at once as the walk begins.
 */
const LAYER_LANDED_MS = INTRO_LAYERS.map((d) => layerStart(d) + INTRO_LINE_MS);
if (LAYER_LANDED_MS[LAYER_LANDED_MS.length - 1] !== INTRO_WALK_MS) {
	throw new Error("intro: the last layer does not land when the walk ends");
}
/** where each layer's leg opens on the walk's clock */
const LAYER_LEG_START_MS = [0, ...LAYER_LANDED_MS.slice(0, -1)];
/** each layer's leg length */
const LAYER_LEG_MS = LAYER_LANDED_MS.map(
	(end, k) => end - LAYER_LEG_START_MS[k]
);
/** the actors each layer's leg names as it lands */
const LAYER_IDS = INTRO_LAYERS.map((d) =>
	INTRO_IDS.filter((id) => introDistance(id) === d)
);

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
 * arrival's own schedule on the two ways in that play it (see the state's
 * `revealFrom`); every other arrival lands on this frame in one tween.
 * `paramWalk` is the route walk a focus change retargets on (routeWalk);
 * with nothing picked out there is no walk, and the tour's neutral frame comes
 * back in one tween.
 * @type {import("../layout-types.js").LayoutFn}
 */
function layoutNetworkIntro(nodes, w, h, _edges, params, bleed = NO_BLEED) {
	const focus = params?.focus ?? null;
	const { attrs, pos } = buildNetworkAttrs(nodes, w, h, focus, bleed);
	const hits = buildHits(nodes, pos, focus);
	const paramWalk = focus == null ? undefined : routeWalk(attrs, nodes, focus);
	return { attrs, hits, delays: INTRO_DELAYS, paramWalk };
}

// ---------------------------------------------------------------------------
// The opening flight: from one clump in the sky to the middle of the network.
//
// The card rests on a crowd streaming toward the reader, and Bacon is one of
// the dots in it — with his fourteen co-stars travelling as a small cluster
// about him (`writeCluster`), the constellation seen from a long way off. On
// the tap the title clears, his dot is lit and named while it is still
// travelling, and the camera then breaks off and closes on the whole cluster,
// running the sky past as it goes, until it lands on the constellation's marks
// and the lines grow out between them.
//
// Bacon flies with the crowd, on the same law, at the same speed, fading in and
// out of his trip like every other dot — he has to, or he is a fixed mark in a
// moving field and reads as one long before the reader taps. **He goes on
// flying through the light-up and the hold**, which is the whole of that
// premise holding: a dot that stops the instant it is named was never really
// one of them. The only thing the lock is allowed to take away is his HEADING,
// and only once the approach has started.
//
// The one thing his trip must not do under the choreography is WRAP — a jump
// from the near plane back to the far one, which the flow hides behind a fade
// but a lit, named dot has no fade left to hide behind. His clock is therefore
// clamped short of it (see `flightSpan`): in the common case it never binds
// and he simply flies on; a tap that catches him at the very end of a trip
// coasts him to a stop just short of the wrap instead.
//
// What is NOT hashed is where his trip runs. Every other dot draws its entry
// offset from `entrySpot`, which is uniform over the sky's box and so carries
// it off canvas for most of its trip: the flow magnifies an offset by up to
// SKY_FAR / SKY_NEAR, across a box already half again wider than the frame. He
// is the one dot the opening has to be able to FIND, name and fly to, so his
// offset is authored and bounded instead — small enough that even at the near
// plane it is still inside the reading column, which is the box the name under
// him is clipped to.
//
// That bound is taken over the whole cluster, not just his dot: the room his
// trip gets is what is left once the cluster's own reach either side of him at
// the near plane is set aside (see `anchorSkyEntry`).
//
// That is the whole of his special treatment. He enters, streams outward,
// brightens and swells as he comes on, and wraps, exactly as the crowd does;
// he just does it down one part of the frame rather than anywhere at all, and
// the cluster does it with him.
// ---------------------------------------------------------------------------

const SKY_SPAN = SKY_FAR - SKY_NEAR;

/**
 * How much of the room between the sky's vanishing point and the reading
 * column's far edge his trip uses by the time it reaches the near plane. Under
 * 1 so the last of the trip is still comfortably inside the frame rather than
 * grazing the margin.
 */
const ANCHOR_SKY_REACH = 0.8;

/**
 * The signed room from `c` to the roomier of the two bounds.
 *
 * Signed, because the sky's vanishing point is the middle of the SCREEN while
 * the column that has to hold the name is not: side by side with the prose the
 * centre sits well off to one side of it, and the generous direction flips with
 * the column. Taking the roomier side means his trip has somewhere to run at
 * every layout instead of being squeezed to nothing on the narrow one.
 */
const roomTo = (c, lo, hi) => (hi - c >= c - lo ? hi - c : lo - c);

/**
 * Bacon's lateral offset at the far plane — the offset the flow then magnifies
 * by `skyMag` over his trip. Bounded by SKY_FAR so the magnification cannot
 * carry him out of the column at any point in it (see the note above).
 * @returns {[number, number]}
 */
function anchorSkyEntry(w, h, bleed) {
	const [cx, cy] = galaxyCentre(w, h, bleed);
	const k = ANCHOR_SKY_REACH / SKY_FAR;
	// the cluster's own reach either side of him at the near plane, which is
	// where the flow carries it furthest out
	const s = skyMag(SKY_NEAR) / MAG_END;
	const d = clusterOffsets(w, h);
	const [x0, x1, y0, y1] = [0, 1].flatMap((axis) => [
		Math.min(...d.map((o) => o[axis])) * s,
		Math.max(...d.map((o) => o[axis])) * s
	]);
	return [
		roomTo(cx, GALAXY_FOCUS_MARGIN - x0, w - GALAXY_FOCUS_MARGIN - x1) * k,
		roomTo(
			cy,
			-TITLE_BAND + GALAXY_FOCUS_MARGIN - y0,
			h - GALAXY_FOCUS_MARGIN - y1
		) * k
	];
}

/**
 * Where Bacon is in the sky at time `t`, and how he is drawn there: the crowd's
 * own treatment at the landed camera (`writeFieldCrowd`), read off his depth so
 * he cannot be told from the dots around him.
 * @returns {[number, number, number, number, number]} x, y, radius, alpha,
 *   and the depth he is at, which the cluster around him is drawn at too
 */
function anchorSkyAt(w, h, bleed, t) {
	const [cx, cy] = galaxyCentre(w, h, bleed);
	const [ex, ey] = anchorSkyEntry(w, h, bleed);
	const frac = skyFrac(ANCHOR_ID, t);
	const z = SKY_FAR - frac * SKY_SPAN;
	const m = skyMag(z);
	return [
		cx + ex * m,
		cy + ey * m,
		PULLBACK_DOT_R * depthSize(z),
		FIELD_ALPHA * depthFade(z) * flightWindow(frac),
		z
	];
}

/** the fourteen: everyone in the constellation but Bacon */
const OTHERS = INTRO_IDS.filter((id) => id !== ANCHOR_ID);

/** each of the fourteen's offset from Bacon in the landed constellation, px */
const clusterOffsets = (w, h) => {
	const [ax, ay] = introPosition(ANCHOR_ID, w, h);
	return OTHERS.map((id) => {
		const [x, y] = introPosition(id, w, h);
		return [x - ax, y - ay];
	});
};

/**
 * The fourteen, drawn as a rigid cluster about Bacon at `(x, y)` and depth `z`:
 * each one's landed offset from him, shrunk by how much further off the camera
 * he is than where the approach lands him. They sit at HIS depth, so the flow's
 * magnification is the whole of the law — no separate scale to tune — and at
 * `APPROACH_Z_END` the factor is exactly 1, which is what lands the cluster on
 * the constellation's own marks. Drawn as the crowd draws a dot at that depth,
 * so on the title card it is a clump of the sky rather than a diagram in it.
 */
function writeCluster(attrs, offsets, x, y, z, alpha) {
	const s = skyMag(z) / MAG_END;
	const r = PULLBACK_DOT_R * depthSize(z);
	for (let k = 0; k < OTHERS.length; k++) {
		const [dx, dy] = offsets[k];
		set(attrs, OTHERS[k], x + dx * s, y + dy * s, r, CROWD, alpha);
	}
}

const writeAnchorSky = (attrs, w, h, bleed, t) => {
	const [x, y, r, a, z] = anchorSkyAt(w, h, bleed, t);
	set(attrs, ANCHOR_ID, x, y, r, CROWD, a);
	writeCluster(attrs, clusterOffsets(w, h), x, y, z, a);
};

/**
 * Adds Bacon's own trip to a galaxy state's flight. A wrapper rather than an
 * extra id handed to `makeFlight`, because that writer takes each dot's entry
 * offset from a HASH the moment it wraps, which is exactly the thing his trip
 * must not do.
 *
 * Holds the ambient contract the same way `makeFlight` does: the static layout
 * is this function at t = 0 (see `layoutTitleGalaxy`), so the loop's first tick
 * redraws the frame the arrival landed on.
 * @param {import("../states.js").AmbientAnim["frames"]} framesFn
 * @returns {import("../states.js").AmbientAnim["frames"]}
 */
function withAnchorInSky(framesFn) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED) => {
		const write = framesFn(nodes, w, h, edges, params, bleed);
		return (attrs, trails, t) => {
			write(attrs, trails, t);
			writeAnchorSky(attrs, w, h, bleed, t);
		};
	};
}

// Every id `withTitleReveal` gates: the crowd, Bacon and his cluster — every
// slot the title card actually draws. Fixed once rather than rebuilt per
// frame, since the ids never change and this multiplies over them every tick.
const TITLE_REVEAL_IDS = [...FIELD_IDS, ANCHOR_ID, ...OTHERS];

/**
 * The title card's cold-load reveal: multiplies every drawn dot's alpha —
 * the crowd, Bacon and his cluster alike — by its own delay+fade window
 * (`titleRevealGate`), so a star fading up is already mid-flight rather than
 * popping in whole and starting to move afterwards. Wraps the OUTERMOST
 * writer, after the highlight beat, so it touches exactly the slots every
 * other writer in the stack already wrote rather than re-deriving them.
 *
 * At t = 0 every dot's gate is (at most) the hold's own share of the fade,
 * which is what a cold mount should show — so this keeps the ambient's t = 0
 * contract exactly the same way `withAnchorInSky` does.
 * @param {import("../states.js").AmbientAnim["frames"]} framesFn
 * @returns {import("../states.js").AmbientAnim["frames"]}
 */
function withTitleReveal(framesFn) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED) => {
		const write = framesFn(nodes, w, h, edges, params, bleed);
		return (attrs, trails, t) => {
			write(attrs, trails, t);
			for (const id of TITLE_REVEAL_IDS) {
				attrs[id * STRIDE + 6] *= titleRevealGate(id, t);
			}
		};
	};
}

/**
 * The splash: the corpus as a sky, with nobody on it. Same galaxy the chapter
 * cards and the outro rest on — `writeFieldCrowd` at the landed camera, spread
 * across `galaxyBox` — so the story opens on the picture it closes on.
 *
 * Bacon is here as a plain member of the crowd: same grey, same 2px, no name.
 * His fourteen co-stars travel with him as a small unlabelled cluster, drawn
 * as the crowd draws a dot at his depth, with no lines between them. The
 * cluster is the destination the opening flies to (see `networkEntryFrames`),
 * and the approach zooms in on the whole of it rather than on him alone, so
 * the constellation arrives as something the reader has been looking at all
 * along rather than something grown out of an empty frame.
 *
 * The crowd around him is named, though, once it is moving: the card takes the
 * chapter cards' highlight beat (see the state below), which picks its actors
 * out of FIELD_IDS — a set that excludes all fifteen by construction, so the
 * beat can neither name him early nor hang a spoke off him.
 * @type {import("../layout-types.js").LayoutFn}
 */
function layoutTitleGalaxy(_nodes, w, h, _edges, _params, bleed = NO_BLEED) {
	const attrs = new Float64Array(ATTR_SIZE);
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM, galaxyBox(w, h, bleed));
	// his own trip's t = 0, with the fourteen about him, which is what the
	// flight below carries on from
	writeAnchorSky(attrs, w, h, bleed, 0);
	// edges are left at the array's zeros — no draw progress, no alpha — which
	// is the same nothing the walk's seed frame starts its lines from
	return { attrs };
}

// The legs, in order.
//
// `CLEAR` is the card's own words going, and it is a leg rather than an
// accident: this choreography declares `ownsArrival`, so there is no arrival
// tween in front of it for the title's fade to happen underneath. A leg buys
// that beat back explicitly, and the sky is flowing through it, so it is a
// pause in the STORY rather than a still frame.
const CLEAR = 0; // the card's words go; the sky carries on underneath
const LIGHT = 1; // the crowd dot inks, grows and takes its name, still flying
const LOCK = 2; // and holds that ink, so the name can be read
const APPROACH = 3; // the flight
const WALK = 4; // the lines grow out of where it landed, one leg per hop layer
// comfortably past the title's own out-transition, so the words are gone before
// the dot under them starts to light
const TITLE_CLEAR_MS = CHAPTER_OUT_MS + 100;
// The approach is the longest of them because it has three things to do in
// order — swing onto Bacon, hold still long enough for the reader to see the sky
// pouring out from behind him, then empty the frame — and they cannot overlap
// (see approachClose). At 1200 the hold fell off the end of the leg.
const ENTRY_PHASES = [TITLE_CLEAR_MS, 700, 700, 1600, ...LAYER_LEG_MS];
/**
 * When each leg opens on the choreography's own clock, which starts at the
 * instant of the tap — there is no arrival tween in front of it (`ownsArrival`),
 * so leg 0's frame 0 is the frame the title card's flight was already showing.
 */
const PHASE_START_MS = ENTRY_PHASES.reduce(
	(acc, ms) => (acc.push(acc[acc.length - 1] + ms), acc),
	[0]
);

/**
 * How far the sky's own clock is carried while the camera closes on Bacon —
 * most of a trip through the volume, which takes a mid-depth dot from where it
 * stands to past the frame edge and brings fresh ones up out of the vanishing
 * point behind them.
 *
 * In the FLOW's units rather than px, so the crowd streams past at the same
 * rate on every viewport, exactly as `GALAXY_DRAW_WIDTHS_PER_S` is a share of
 * the sky's width rather than a pixel rate.
 */
const APPROACH_RUN_MS = FLIGHT_CYCLE_MS * 0.7;

/**
 * How much of the leg the camera spends getting up to that speed, before it
 * simply holds it.
 *
 * This is the number that decides whether the approach is one move or two. The
 * camera does two things — it banks onto Bacon and it rushes forward — and they
 * have to happen AT THE SAME TIME, or the reader gets a pan followed by a zoom.
 * A rate that climbs across the whole leg (the first build accelerated all the
 * way, 1× to 20×) is at its slowest exactly while the turn is at its fastest, so
 * the turn has nothing to be part of and the rush arrives afterwards as a
 * separate crescendo. Coming up to speed over the first third instead puts real
 * forward travel underneath the bank and leaves the rest of the leg at a steady
 * cruise, so the two read as one manoeuvre.
 *
 * The cruise multiple is DERIVED, not picked: it is whatever makes the leg spend
 * exactly `APPROACH_RUN_MS` of sky time, so changing the ramp cannot quietly
 * change how far the crowd travels.
 */
const WARP_RAMP = 0.3;

/** the approach's own length, read in several places below */
const APPROACH_MS = ENTRY_PHASES[APPROACH];

/**
 * The cruise rate, as a multiple of the sky's own. Solved from `WARP_RAMP` so the
 * leg's total sky-time advance is exactly `APPROACH_RUN_MS`: the ramp's own
 * integral over its span is half of it, hence the `1 - WARP_RAMP / 2`.
 */
const WARP_CRUISE = 1 + APPROACH_RUN_MS / (APPROACH_MS * (1 - WARP_RAMP / 2));

/**
 * How much sky time the approach has spent by `u` — the integral of a rate that
 * smoothsteps from the flow's own up to `WARP_CRUISE` over `WARP_RAMP` and then
 * holds. Closed form rather than accumulated, so it is a pure function of the
 * leg's clock like everything else here and a dropped frame cannot change it.
 *
 * Its derivative at u = 0 is exactly the flow's own rate, which is what keeps
 * the join with the lock leg free of any change of speed.
 */
const warpClock = (u) => {
	const k = WARP_CRUISE - 1;
	if (u >= WARP_RAMP) return APPROACH_MS * (u + k * (u - WARP_RAMP / 2));
	const x = u / WARP_RAMP;
	return APPROACH_MS * (u + k * WARP_RAMP * (x * x * x - (x * x * x * x) / 2));
};

/**
 * The depth Bacon is at when the approach ends — SOLVED from the radius the
 * constellation draws him at, not picked.
 *
 * His size through the approach is the sky's own depth law and nothing else
 * (`depthSize`, the same square root every dot in the field obeys), so the only
 * way to land him on `NETWORK_INTRO_RADIUS[0]` is to fly the camera to the depth
 * that law draws at that size. Inverting `PULLBACK_DOT_R * depthSize(z) *
 * GALAXY_FOCUS_R_MULT = NETWORK_INTRO_RADIUS[0]` gives it in one line.
 *
 * It lands INSIDE the near plane, and that is the honest answer rather than a
 * problem: the volume tops out at 9.5px for a lit dot, against a 16px target, so
 * the constellation's anchor is simply closer than anything the crowd is allowed
 * to get. The near plane is only where the CROWD recycles; the thing we are
 * flying at does not recycle, it arrives.
 */
const APPROACH_Z_END =
	SKY_MID *
	(NETWORK_INTRO_RADIUS[0] / (PULLBACK_DOT_R * GALAXY_FOCUS_R_MULT)) **
		(-1 / SKY_DEPTH_GAMMA);
// the inverse above is only right while the law is a power of the depth ratio,
// so check it round-trips rather than trusting the algebra to survive a retune
if (
	Math.abs(
		PULLBACK_DOT_R * depthSize(APPROACH_Z_END) * GALAXY_FOCUS_R_MULT -
			NETWORK_INTRO_RADIUS[0]
	) > 1e-9
) {
	throw new Error("intro: APPROACH_Z_END does not invert depthSize");
}
/** the flow's magnification where the approach lands, which the cluster is sized against */
const MAG_END = skyMag(APPROACH_Z_END);

/**
 * How much of the sky's depth the camera has closed on Bacon by `u`, as a share
 * of the whole distance it has to cover.
 *
 * Built exactly like `warpClock`, and for exactly the same reason: a linear term
 * at the flow's OWN rate, plus a ramped extra that makes up the rest. The linear
 * term is what keeps the join with the lock leg free of any change of speed —
 * without it he would leap from drifting to closing the moment the leg begins,
 * which is the same stall-in-reverse that used to make him read as meeting the
 * camera. The extra is smoothstepped, so the closing eases off at the end and he
 * settles onto the constellation's mark rather than slamming into it.
 *
 * `share` is what fraction of the trip the flow's own drift would have covered;
 * the rest is the camera's doing.
 */
const approachClose = (u, share) => {
	const ramp = u * u * (3 - 2 * u);
	return share * u + (1 - share) * ramp;
};

/**
 * How far the camera has slid sideways, given how far it has closed — the number
 * that keeps the swing onto Bacon VISIBLE the whole way rather than all at once
 * at the end.
 *
 * Setting the slide equal to the closing is what a straight-line flight does in
 * WORLD terms, and it is wrong on SCREEN. His screen offset is
 * `offset * (1 - slide) * SKY_FAR / z`, and while the slide shrinks it the
 * approach magnifies it: with the slide equal to `p` the two nearly cancel, and
 * measured, 85% of his offset is still there at `p = 0.6` and 68% at `p = 0.8`
 * before collapsing in the last fifth. That is a zoom followed by a pan, which
 * is exactly what it looked like.
 *
 * So the slide is solved BACKWARDS from the screen instead: say what his offset
 * should do — shrink on a plain smoothstep, `panEase` — and this one line is the
 * slide that delivers it. It makes his screen offset exactly
 * `offset * m(zStart) * (1 - panEase(u))`: the magnification cancels out of it
 * entirely, so the pan is the same even sweep at every viewport and at whatever
 * depth he happened to be tapped at.
 *
 * `panEase(u)` rather than the closing `p`, though the two are within 7% of each
 * other, for one reason at the ends. `p` has to open at the flow's own rate, so
 * it opens at a nonzero one; the slide inherits that and steps the crowd's speed
 * at the join. A smoothstep opens from rest and leaves the slide opening only
 * through the depth term, which measured halves that step (5.5 -> 2.5 px/s worst).
 *
 * It is still one camera: the crowd is drawn under this same slide, so near dots
 * still sweep further than far ones and the turn still carries the sky's depth.
 * And it is still monotone — both terms of its derivative are non-negative — so
 * the path to the mark cannot backtrack.
 */
const panEase = (u) => u * u * (3 - 2 * u);
const cameraSlide = (u, z, zStart) => 1 - (1 - panEase(u)) * (z / zStart);

/**
 * The camera flies in a STRAIGHT LINE to Bacon, and `approachClose` above is the
 * whole of it: one number, the fraction of the way it has got, driving all three
 * things the approach does. Its depth closes by that fraction of the distance;
 * its lateral position slides by that fraction of his own offset, which is what
 * swings the vanishing point onto him; and the frame is carried by that fraction
 * of the way onto the constellation's anchor mark.
 *
 * Tying them together is not tidiness, it is what removes a wobble that no
 * amount of tuning could. His screen offset is `offset * (1 - p) * SKY_FAR / z`:
 * the turn shrinks it while the approach magnifies it, and if the two run on
 * separate clocks the magnification can win early and swing him OUTWARD before
 * the turn reels him back. It did — 142px in the side-by-side layout, where he
 * starts furthest off the sky's axis. Run them on the same `p` and the
 * derivative of that expression is `-offset * SKY_FAR * zEnd / (...)²`, negative
 * for every input, so the offset shrinks monotonically at every viewport and
 * every tap instant. Proved rather than measured, then measured anyway.
 */

/**
 * How much of the approach the crowd keeps its full strength for. The turn above
 * is the thing this leg is SAYING, and it can only be read off dots that are
 * still there to stream past — fade them on the way in and the reader is left
 * watching an empty frame accelerate. The turn now runs the whole leg, so they
 * hold at full strength for four fifths of it and go over the last of it, while
 * the swing is decaying into a straight run at him. Exactly zero at the end,
 * because the walk has to grow into an empty frame.
 */
const APPROACH_HOLD = 0.8;
const crowdFade = (u) => {
	const t = Math.min(1, Math.max(0, (u - APPROACH_HOLD) / (1 - APPROACH_HOLD)));
	// smoothstep down: it leaves at rest and arrives at rest, so the sky neither
	// snaps off at the end nor starts dimming the instant the hold expires
	return 1 - t * t * (3 - 2 * t);
};

/**
 * Bacon's writer for the four legs, and the cluster's with him. He is in the
 * flow on every leg, the approach included — the camera closes on him, it does
 * not pick him up and carry him — so his frame always starts at `anchorSkyAt`.
 * The light-up is an envelope ON it, never a replacement for it: exactly the
 * idiom the chapter card's highlight beat uses on a flowing dot, with radius and
 * alpha nudged against whatever the flow just wrote and colour written
 * absolutely (a relative blend would darken the same dot again every tick).
 *
 * The fourteen are drawn about wherever he is, at his depth (`writeCluster`),
 * on every leg. They are not lit and not named: the camera closes on the whole
 * cluster, and the walk inks it once it has landed.
 * @param {{ w: number, h: number, bleed: import("../plot.js").Bleed,
 *   anchorClock: (leg: number, ms: number) => number, zStart: number,
 *   driftShare: number, gx: number, gy: number, aex: number, aey: number,
 *   mx: number, my: number, offsets: [number, number][], window0: number }} c
 *   the approach's geometry, struck once at the tap (see networkEntryFrames)
 */
function anchorWriter(c) {
	const lerp = (a, b, t) => a + (b - a) * t;
	const rgb = [0, 0, 0];
	// His depth, closing on the camera — and everything about how he is drawn
	// follows from it through the SAME two functions the whole sky uses. That
	// is the whole change: his size used to be a lerp onto a target radius,
	// which grows at a constant rate, where a thing you are flying at grows
	// slowly at first and then very fast indeed.
	const approach = (attrs, ms) => {
		const u = ms / APPROACH_MS;
		// how far the camera has flown to him — the one number (see approachClose)
		const p = approachClose(u, c.driftShare);
		const z = c.zStart - (c.zStart - APPROACH_Z_END) * p;
		const m = skyMag(z);
		// his lateral offset relative to the camera, times his magnification —
		// the same camera the crowd below is drawn under
		const k = 1 - cameraSlide(u, z, c.zStart);
		// ...and the camera's swing onto him is the only thing that moves him
		// off it. `1 - turn` is where his own offset stands relative to the
		// camera's, so this walks him onto the vanishing point as the turn
		// completes — the same single camera the crowd is drawn under, which is
		// what makes "he is the point the sky streams out of" true rather than
		// arranged. There is no curve here to pick: his path is the camera's.
		const x = c.gx + c.aex * m * k + (c.mx - c.gx) * p;
		const y = c.gy + c.aey * m * k + (c.my - c.gy) * p;
		set(
			attrs,
			ANCHOR_ID,
			x,
			y,
			PULLBACK_DOT_R * depthSize(z) * GALAXY_FOCUS_R_MULT,
			HOP_RGB[0],
			1
		);
		// The cluster rides the same camera at the same depth, so the slide
		// cancels out of its offsets from him and only the magnification is left.
		// Its alpha is the crowd's law at that depth, with whatever dimming the
		// trip's entry/exit window had at the break-off lifted over the flight:
		// the cluster is arriving now, not passing.
		writeCluster(
			attrs,
			c.offsets,
			x,
			y,
			z,
			FIELD_ALPHA * depthFade(z) * lerp(c.window0, 1, p)
		);
	};
	return (attrs, leg, e, ms) => {
		const [ax, ay, ar, aa, az] = anchorSkyAt(
			c.w,
			c.h,
			c.bleed,
			c.anchorClock(leg, ms)
		);
		if (leg === APPROACH) {
			approach(attrs, ms);
			return;
		}
		writeCluster(attrs, c.offsets, ax, ay, az, aa);
		if (leg === LOCK) {
			set(attrs, ANCHOR_ID, ax, ay, ar * GALAXY_FOCUS_R_MULT, HOP_RGB[0], 1);
		} else if (leg === LIGHT) {
			for (let ch = 0; ch < 3; ch++)
				rgb[ch] = lerp(CROWD[ch], HOP_RGB[0][ch], e);
			set(
				attrs,
				ANCHOR_ID,
				ax,
				ay,
				lerp(ar, ar * GALAXY_FOCUS_R_MULT, e),
				rgb,
				lerp(aa, 1, e)
			);
		} else if (leg === CLEAR) {
			// one of the crowd, exactly as the title card had him
			set(attrs, ANCHOR_ID, ax, ay, ar, CROWD, aa);
		}
	};
}

/** the lines, held at nothing until the walk grows them */
const holdLines = (attrs) => {
	for (let e = 0; e < EDGE_COUNT; e++) setEdge(attrs, e, 0, 0);
};

/**
 * The frame the approach lands on, and so the frame the walk grows out of.
 * Built rather than captured: the approach's last frame is the static layout
 * with Bacon landed on his mark `(mx, my)`, the fourteen on theirs still drawn
 * as the crowd draws a dot that near, and no lines yet — which is exactly this.
 */
function approachLanding(final, offsets, mx, my) {
	const frame = final.slice();
	holdLines(frame);
	writeCluster(
		frame,
		offsets,
		mx,
		my,
		APPROACH_Z_END,
		FIELD_ALPHA * depthFade(APPROACH_Z_END)
	);
	return frame;
}

/**
 * `networkIntro`'s arrival off the title card: the one arrival in the story that
 * flies somewhere before it draws anything.
 *
 * Scoped to that single arrival by the state's `revealFrom`, which gates entry
 * choreographies as well as delays — so a cold start still plays the plain
 * pop-in from nothing, and stepping BACK here from `hopSeed` still lands in one
 * tween on a network that is already grown.
 *
 * It is also the story's one `ownsArrival` choreography, and the reason the flag
 * exists: the sky has a RATE, the reader has been watching it for as long as
 * they spent on the title, and an arrival tween would ease its own 700ms —
 * stalling the flow, running it at twice speed through the middle, and stalling
 * it again. A forward surge through a starfield reads as a zoom. So leg 0
 * reproduces the frame the tap found (`skyClock` at `t0`, `hold`, and the anchor
 * at zero envelope) and the legs take the rAF straight from the press.
 *
 * @type {import("../states.js").EntryAnim["frames"]}
 */
function networkEntryFrames(nodes, w, h, edges, params, bleed = NO_BLEED) {
	const final = layoutNetworkIntro(nodes, w, h, edges, params, bleed).attrs;
	// The card's own flight, rebuilt here so the sky carries on across the
	// choreography at exactly the speed and phase the reader's tap found it at.
	// Read t0 BEFORE the first call: the writer publishes its own clock to
	// skyFlight as it runs.
	const flySky = makeFlight(layoutTitleGalaxy, FIELD_IDS)(
		nodes,
		w,
		h,
		edges,
		params,
		bleed
	);
	const t0 = skyFlight.t;

	// The sky's own clock for a leg. Every leg but the approach rides it
	// straight, at the flow's own rate — which is the point: the reader tapped
	// while the sky was moving at one speed, and nothing in the opening is
	// allowed to change that speed until the camera sets off.
	//
	// The approach adds the warp (see warpClock): the camera comes up to a cruise
	// over the first third of the leg and holds it, opening at exactly the flow's
	// own rate so the join with the lock moves nothing. `ms`, not `e`:
	// ScrollyVisual's `sweepEase` is trapezoidal and would lay its own ramp over
	// this one.
	const skyClock = (phase, ms) => {
		const start = t0 + PHASE_START_MS[phase];
		return phase === APPROACH
			? start + warpClock(ms / APPROACH_MS)
			: start + ms;
	};

	// How long he keeps flying: the legs before the approach, unless his trip ends
	// first. A wrap under a lit, named dot is the one discontinuity the flow
	// cannot hide, because the fade that hides it everywhere else
	// (`flightWindow`) is exactly what the light-up has just overwritten. Clamped
	// rather than special-cased — in the common case the bound never binds and he
	// simply flies on; a tap landing at the very end of a trip coasts him to a
	// stop short of it instead.
	//
	// SHORT of the wrap, not up to it, and the millisecond is load-bearing:
	// `skyFrac` is `u - Math.floor(u)`, so a clock landing exactly ON the trip's
	// end reads as the START of the next one and puts him back at the far plane —
	// the very teleport this exists to prevent. 1ms is 4e-5 of a trip, well
	// inside a frame.
	const wrapMs = (1 - skyFrac(ANCHOR_ID, t0)) * FLIGHT_CYCLE_MS - 1;
	const flightSpan = Math.max(0, Math.min(PHASE_START_MS[APPROACH], wrapMs));
	const anchorClock = (phase, ms) =>
		t0 + Math.min(PHASE_START_MS[phase] + ms, flightSpan);

	// Where his trip has carried him by the time the camera breaks off, and how
	// he is drawn there. The approach departs from here, so it departs from
	// exactly the dot the reader has been watching travel.
	const [mx, my] = introPosition(ANCHOR_ID, w, h);
	const [gx, gy] = galaxyCentre(w, h, bleed);
	// the heading the camera swings onto: his own lateral offset in the sky, which
	// is the one thing that means "pointed at Bacon" in the flow's own terms
	const [aex, aey] = anchorSkyEntry(w, h, bleed);

	// Where his own trip has him when the camera breaks off, and how far it then
	// has to close on him. From here on he is the DESTINATION rather than a member
	// of the crowd: his depth is driven straight, not through `skyFrac`, because
	// the flow's clock wraps at the near plane and the thing you are flying at does
	// not wrap — it arrives.
	const zStart = SKY_FAR - skyFrac(ANCHOR_ID, t0 + flightSpan) * SKY_SPAN;
	// what share of that closing the flow's own drift would have done by itself,
	// which is the part that has to be there at u = 0 for the join to be smooth
	const driftShare = Math.min(
		1,
		((SKY_SPAN / FLIGHT_CYCLE_MS) * APPROACH_MS) / (zStart - APPROACH_Z_END)
	);

	// Each flown dot's phase, cached once. The approach has to know a dot's own
	// magnification to shift the camera sideways by it (see `approachClose`), and
	// `makeFlight` keeps that arithmetic private — but it is only a phase and a
	// clock, and re-deriving it here costs no hashing per frame.
	const skyPhases = Float64Array.from(FIELD_IDS, (id) => skyFrac(id, 0));

	const offsets = clusterOffsets(w, h);
	const legStart = approachLanding(final, offsets, mx, my);

	const writeAnchor = anchorWriter({
		w,
		h,
		bleed,
		anchorClock,
		zStart,
		driftShare,
		gx,
		gy,
		aex,
		aey,
		mx,
		my,
		offsets,
		// the cluster's entry/exit window where the camera breaks off, which the
		// approach lifts to full over its flight (see anchorWriter)
		window0: flightWindow(skyFrac(ANCHOR_ID, t0 + flightSpan))
	});

	// The tweener's own per-group arithmetic (see tween.js), run against the very
	// delays a cold start is handed. The walk is REPLAYED here, not re-authored:
	// one schedule, so the two arrivals cannot tell different stories. This is
	// what wants the leg's linear elapsed ms rather than its eased progress — the
	// legs are eased trapezoidally, which would stretch the walk's ends and
	// compress its middle.
	const replay = (attrs, base, delay, ms) => {
		const eased = easeCubicInOut(
			Math.min(1, Math.max(0, (ms - delay) / INTRO_LINE_MS))
		);
		for (let i = base; i < base + STRIDE; i++) {
			attrs[i] = legStart[i] + (final[i] - legStart[i]) * eased;
		}
	};

	return (attrs, _trails, phase, e, ms) => {
		if (phase >= WALK) {
			// the walk's own clock, carried across its per-layer legs
			const walkMs = LAYER_LEG_START_MS[phase - WALK] + ms;
			for (const id of OTHERS) {
				replay(attrs, id * STRIDE, INTRO_DELAYS[id], walkMs);
			}
			for (let k = 0; k < EDGE_COUNT; k++) {
				replay(attrs, edgeIndex(k), INTRO_DELAYS[NODE_COUNT + k], walkMs);
			}
			return;
		}
		// the sky, carried on from where the tap found it. At the seed (phase 0,
		// e = 0, ms = 0) that is the flow at `t0` exactly — the frame the title
		// card's own flight was showing when the reader pressed — which is what
		// lets this choreography take the rAF with no arrival tween in front of it
		// (see `ownsArrival`).
		flySky(attrs, _trails, skyClock(phase, ms));
		holdLines(attrs);
		if (phase === APPROACH) {
			// The camera is running forward now — the clock above is what carries the
			// crowd past — and it is also SWINGING onto Bacon. `flySky` has just
			// written every dot as `centre + offset * magnification` about a camera
			// sitting on the sky's axis; moving that camera sideways by `c` takes
			// `c * magnification` off each dot, which is this loop.
			//
			// Per dot, because the magnification is per dot: that factor is the
			// whole point. A near dot is swept much further by the same swing than a
			// far one, so the turn carries the sky's depth with it instead of
			// sliding the picture — and a dot whose offset matches the camera's
			// lands on the vanishing point whatever its depth, which is what puts
			// Bacon there at the end with everything else streaming out from behind
			// him. The magnification is re-derived from the cached phase and the
			// leg's own clock, so it is the same number `flySky` used.
			const u = ms / APPROACH_MS;
			const p = approachClose(u, driftShare);
			const slide = cameraSlide(
				u,
				zStart - (zStart - APPROACH_Z_END) * p,
				zStart
			);
			const cx = aex * slide;
			const cy = aey * slide;
			// ...and the frame carried onto the anchor mark on the same ramp, crowd
			// and anchor alike, so the flow's vanishing point and Bacon arrive there
			// together (see cameraSlide)
			const sx = (mx - gx) * p;
			const sy = (my - gy) * p;
			// ...and the fade that empties the frame the walk grows into. Exactly
			// zero at u = 1, which is what makes the runner's closing snap onto the
			// static layout invisible: the crowd's park there is a different place,
			// but nothing is drawn at alpha 0.
			const fade = crowdFade(u);
			const march = skyClock(APPROACH, ms) / FLIGHT_CYCLE_MS;
			for (let k = 0; k < FIELD_IDS.length; k++) {
				const i = FIELD_IDS[k] * STRIDE;
				const p = skyPhases[k] + march;
				const m = skyMag(SKY_FAR - (p - Math.floor(p)) * SKY_SPAN);
				attrs[i] += sx - cx * m;
				attrs[i + 1] += sy - cy * m;
				attrs[i + 6] *= fade;
			}
		}
		writeAnchor(attrs, phase, e, ms);
	};
}

export const states = {
	titleGalaxy: {
		layout: layoutTitleGalaxy,
		// No labels STANDING STILL, exactly as on a chapter card: the resting
		// frame under the title is an anonymous crowd, and the names arrive with
		// the motion instead — once the sky is flowing, the highlight beat picks
		// one well-known actor out of it at a time (see galaxy-highlight.js). An
		// empty set rather than no declaration at all, because the beat's own
		// per-frame cut in ScrollyVisual is what names anybody; this says the
		// resting card names nobody, which is also what holds the t = 0 contract.
		labels: () => [],
		// FIELD_IDS, not the cards' UNIVERSE_IDS: the fifteen fly here as Bacon's
		// cluster on his own authored trip (`withAnchorInSky`), not on hashed
		// ones, and the flow must not write over it. The beat can never want one of
		// them anyway — GALAXY_CAST is derived from FIELD_IDS, which excludes the
		// fifteen by construction, so every actor it can light is one this state
		// actually draws.
		ambient: {
			frames: withTitleReveal(
				withGalaxyHighlight(
					withAnchorInSky(makeFlight(layoutTitleGalaxy, FIELD_IDS))
				)
			),
			// The card's own cold-load reveal (see withTitleReveal): the flight
			// starts at mount rather than after the generic pop-in tween, so a
			// dot fading up is already mid-flight rather than static and then
			// started. See ScrollyVisual's "liveIn" arrival kind.
			liveReveal: true
		}
	},
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
		pulse: ANCHOR_ID,
		params: (s) => ({ focus: s.intro.focus }),
		// The walk plays on exactly two arrivals, and `revealFrom` is what scopes
		// it to them — it gates entry choreographies as well as delays.
		//
		// A cold start (ScrollyVisual seeds every node at zero radius/alpha) takes
		// the plain route: one tween on the delays above. The step forward off the
		// title card takes the choreography below, which lights Bacon where he
		// stands in the sky, flies the camera in on him and his cluster until it
		// lands on the constellation's marks, and then replays those same
		// delays out of the frame it landed on.
		//
		// Every OTHER arrival is the reader stepping BACK here, with the network
		// already grown — replaying either would hold each actor (and the name
		// riding its dot's alpha) wherever the interrupted tween left it.
		revealFrom: ["titleGalaxy"],
		entry: {
			phases: ENTRY_PHASES,
			// Leg 0 reproduces the frame the title card was showing, so there is
			// nothing for an arrival tween to carry — and the sky, which has a real
			// rate, must not have an eased 700ms hop laid over it. It also settles
			// what the state's own `delays` are for: they are this choreography's
			// LAST leg, replayed out of the frame the approach lands on, and with no
			// arrival tween there is no hop for them to be mistaken for.
			ownsArrival: true,
			// Nobody is named until the light-up has finished inking the dot it
			// names. The fourteen are already on their marks when the walk begins,
			// so riding their dots' alphas would name them all at once, before a
			// line has reached any of them; instead each layer's names land with
			// its lines, one walk leg per layer. Without the gate, Bacon's name
			// would be up at the crowd's own alpha from the first frame, competing
			// with the title as it fades. Index 0 is the arrival, which this
			// choreography owns, so it introduces nobody; then one beat per leg,
			// each firing as its leg ENDS — so a layer's names sit one past the
			// approach's empty beat, at the end of that layer's own leg.
			labelsAfter: [[], [], [ANCHOR_ID], [], [], ...LAYER_IDS],
			// The step's prose names Bacon, so it waits until he is on his mark:
			// through the light-up, the hold and the flight the card is empty and
			// the reader has only the sky and the one dot in it to look at, which is
			// the whole point of those seconds. The two layers then grow under the
			// words, which is what they describe.
			cardAfter: APPROACH,
			frames: networkEntryFrames
		},
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

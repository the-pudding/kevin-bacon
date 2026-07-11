import { NODE_COUNT, ANCHOR_ID, INTRO_IDS, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	HOP_RGB,
	INK,
	CROWD,
	set,
	setEdge,
	pairKey,
	parkHidden,
	graphCenter,
	introPosition,
	networkMap,
	NETWORK_CYCLES,
	NETWORK_DOT_R,
	NETWORK_INTRO_RADIUS,
	NETWORK_CROWD_ALPHA
} from "../layout-shared.js";

const INTRO_ANCHOR_RADIUS = 14;
const INTRO_RADIUS = 7;
const INTRO_EDGE_ALPHA = 0.5;

// Reveal is authored as paths (still keyed source→…→Bacon), but each is walked
// outward from Bacon (id 0, already on screen) to its source actor, so the graph
// grows out of Bacon. Per segment: the line grows from the inner node toward the
// next one, and that next node pops as the line reaches it — so the step reads as
// routes sprouting from Bacon rather than a graph dump. The first two paths
// (Bacon→Ryan→Margot, Bacon→Cumberbatch→Zendaya) play strictly one at a time as a
// deliberate walk; the rest fill in freely afterwards. Shared nodes/lines animate
// once, at first mention. Bacon is the shared origin.
const INTRO_PATHS = [
	[12, 3], // Margot Robbie → Ryan Gosling → Bacon
	[14, 5], // Zendaya → Benedict Cumberbatch → Bacon
	[7, 6], // Timothée Chalamet → Meryl Streep → Bacon
	[11, 4], // Austin Butler → Tom Hanks → Bacon
	[2, 1], // Cillian Murphy → Robert De Niro → Bacon
	[9, 1], // Anya Taylor-Joy → Robert De Niro → Bacon
	[8, 6], // Saoirse Ronan → Meryl Streep → Bacon
	[10, 5], // Jessie Buckley → Benedict Cumberbatch → Bacon
	[11, 13] // Austin Butler → Emma Stone → Bacon
];
// mirrors ScrollyVisual's TWEEN_MS so a node lands just as its line arrives
const INTRO_LINE_MS = 700;
const INTRO_START_DWELL_MS = 350; // beat after a new source appears before its line draws
const INTRO_POP_MS = 0; // no beat between segments so the walk reads continuous
const INTRO_PATH_GAP_MS = 400; // pause after a sequential route reaches Bacon
const INTRO_SEQ_COUNT = 2; // first N routes play strictly one at a time; rest fill freely
const INTRO_PATH_STEP_MS = 500; // stagger between the free-for-all routes
// secondary lines (not on any authored path) draw this long after both ends appear
const INTRO_EDGE_LAG_MS = 400;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutLone(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const introSet = new Set(INTRO_IDS);
	for (const n of nodes) {
		if (n.id === ANCHOR_ID) {
			const [cx, cy] = graphCenter(w, h);
			set(attrs, n.id, cx, cy, INTRO_ANCHOR_RADIUS, HOP_RGB[0], 1);
		} else if (introSet.has(n.id)) {
			// parked at their eventual networkIntro spot (alpha 0) so they fade in place
			const [x, y] = introPosition(n.id, w, h);
			set(attrs, n.id, x, y, INTRO_RADIUS, CROWD, 0);
		} else {
			parkHidden(attrs, n, w, h);
		}
	}
	return { attrs };
}

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutNetworkIntro(nodes, w, h, edges) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const introSet = new Set(INTRO_IDS);

	// index edges by unordered endpoint pair so paths can look them up by name
	const edgeByPair = new Map();
	edges.forEach(({ source, target }, e) => {
		edgeByPair.set(pairKey(source, target), e);
	});

	// Walk each path outward from Bacon to its source actor: a line grows from the
	// (already-visible) inner node toward the next one while that node pops in step
	// with it, so both finish together as the line arrives. The first INTRO_SEQ_COUNT
	// paths run on one running clock — strictly one at a time — so the opening reads
	// as a single continuous walk out of Bacon; the rest start after those complete
	// and overlap on a stagger. Everything animates once, at first mention; Bacon is
	// already on screen.
	const nodeDelay = new Map([[ANCHOR_ID, 0]]);
	const edgeDelay = new Map();
	// Bacon is already on screen, so seed the sequential clock with an opening
	// beat before the first line leaves him (mirrors the source-dwell the old
	// inward walk got for free from its first, appearing, source node)
	let seqClock = INTRO_START_DWELL_MS; // running clock through the sequential routes
	let freeStart = seqClock; // when the free-for-all routes begin
	INTRO_PATHS.forEach((path, k) => {
		const walk = [ANCHOR_ID, ...[...path].reverse()];
		const sequential = k < INTRO_SEQ_COUNT;
		let clock = sequential
			? seqClock
			: freeStart + (k - INTRO_SEQ_COUNT) * INTRO_PATH_STEP_MS;
		const src = walk[0];
		if (!nodeDelay.has(src)) {
			nodeDelay.set(src, clock); // source appears, then dwells before its line leaves
			clock += INTRO_START_DWELL_MS;
		}
		for (let i = 1; i < walk.length; i++) {
			const e = edgeByPair.get(pairKey(walk[i - 1], walk[i]));
			if (e === undefined || edgeDelay.has(e)) continue;
			edgeDelay.set(e, clock); // line leaves the (already-visible) outer node
			// node pops in step with the line so both finish together as it arrives
			if (!nodeDelay.has(walk[i])) nodeDelay.set(walk[i], clock);
			clock += INTRO_LINE_MS + INTRO_POP_MS;
		}
		if (sequential) {
			clock += INTRO_PATH_GAP_MS;
			seqClock = clock;
			freeStart = clock; // free-for-all begins after the last sequential route
		}
	});

	for (const n of nodes) {
		if (introSet.has(n.id)) {
			const [x, y] = introPosition(n.id, w, h);
			set(
				attrs,
				n.id,
				x,
				y,
				NETWORK_INTRO_RADIUS[n.hop],
				n.id === ANCHOR_ID ? HOP_RGB[0] : CROWD,
				1
			);
			delays[n.id] = nodeDelay.get(n.id) ?? 0;
		} else {
			parkHidden(attrs, n, w, h);
		}
	}
	edges.forEach(({ source, target }, e) => {
		setEdge(attrs, e, 1, INTRO_EDGE_ALPHA);
		// secondary links (not on any path) fill in once both ends are up
		delays[NODE_COUNT + e] =
			edgeDelay.get(e) ??
			Math.max(nodeDelay.get(source) ?? 0, nodeDelay.get(target) ?? 0) +
				INTRO_EDGE_LAG_MS;
	});
	return { attrs, delays };
}

// Google-Earth ratchet timing (see networkKeyframes): fill the current
// framing's rim → out of room → pull the camera back one level → repeat
const NET_ZOOM_MS = 650; // one camera pull-back
const NET_FILL_MS = 420; // one rim dot fading in
const NET_FILL_STAGGER_MS = 320; // spread of a cycle's rim arrivals
const NET_HOLD_MS = 120; // beat after a rim fills before pulling back again

/**
 * Network-map attrs at camera level `cam` with every dot revealed in cycles
 * <= `upTo` visible. The settled layout is (NETWORK_CYCLES, NETWORK_CYCLES);
 * the ratchet keyframes are intermediate (cam, upTo) pairs. Unrevealed dots
 * wait (alpha 0) at their own reveal framing so they fade in in place and
 * ride the remaining pull-backs.
 */
function networkAttrs(nodes, w, h, edges, cam, upTo) {
	const attrs = new Float64Array(ATTR_SIZE);
	const map = networkMap(w, h);
	const t = cam / NETWORK_CYCLES;
	// one dot style per zoom level, shared by intro actors and crowd alike:
	// everyone renders at the current camera's apparent size and alpha (new
	// arrivals match the dots already on screen) and the whole field deflates
	// and fades together as the camera pulls back. Only Bacon differs — his
	// own size ramp and full-alpha ink.
	const fieldR =
		NETWORK_DOT_R + (NETWORK_INTRO_RADIUS[1] - NETWORK_DOT_R) * (1 - t);
	const fieldA = 1 + (NETWORK_CROWD_ALPHA - 1) * t;
	const baconR =
		NETWORK_DOT_R + (NETWORK_INTRO_RADIUS[0] - NETWORK_DOT_R) * (1 - t);
	for (const n of nodes) {
		const cycle = map.reveal[n.id];
		if (cycle < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const visible = cycle <= upTo;
		const [x, y] = map.at(n.id, visible ? cam : cycle);
		const anchor = n.id === ANCHOR_ID;
		set(
			attrs,
			n.id,
			x,
			y,
			anchor ? baconR : fieldR,
			anchor ? INK : CROWD,
			visible ? (anchor ? 1 : fieldA) : 0
		);
	}
	// intro edges dissolve in place (full length, alpha → 0) instead of
	// retracting — the graph fades to dots as the first pull-back begins
	edges.forEach((_, e) => setEdge(attrs, e, 1, 0));
	return attrs;
}

/** the settled full-extent frame of the zoom ratchet */
/** @type {import("../layout-shared.js").LayoutFn} */
function layoutNetwork(nodes, w, h, edges) {
	return {
		attrs: networkAttrs(nodes, w, h, edges, NETWORK_CYCLES, NETWORK_CYCLES)
	};
}

/**
 * The networkIntro → network reveal, as a keyframe sequence (played by
 * ScrollyVisual's sequencer): dots pop into the empty rim of the current
 * framing, the frame runs out of room, the camera pulls back one level —
 * rigidly, jitter 0, every dot moving with it — exposing a new empty rim, and
 * the cycle repeats until the full extent settles. Cycles that reveal nothing
 * (typically cycle 0: the constellation already fills the intro framing
 * wall-to-wall) collapse into the neighbouring zoom, so the sequence opens on
 * a pull-back, not a pause.
 */
function networkKeyframes(nodes, w, h, edges) {
	const map = networkMap(w, h);
	const frames = [];
	for (let k = 0; k <= NETWORK_CYCLES; k++) {
		if (k > 0) {
			frames.push({
				attrs: networkAttrs(nodes, w, h, edges, k, k - 1),
				ms: NET_ZOOM_MS,
				wait: NET_ZOOM_MS
			});
		}
		// count intro ids out of cycle 0 — they're already on screen
		if (k === 0 ? map.cycles[0] > INTRO_IDS.length : map.cycles[k] > 0) {
			const delays = new Float64Array(DELAY_SIZE);
			for (let id = 0; id < map.reveal.length; id++) {
				if (map.reveal[id] === k && !INTRO_IDS.includes(id)) {
					delays[id] = hash01(id, 16) * NET_FILL_STAGGER_MS;
				}
			}
			frames.push({
				attrs: networkAttrs(nodes, w, h, edges, k, k),
				ms: NET_FILL_MS,
				delays,
				wait: NET_FILL_MS + NET_FILL_STAGGER_MS + NET_HOLD_MS
			});
		}
	}
	return frames;
}

export const states = {
	lone: {
		layout: layoutLone,
		labels: [ANCHOR_ID],
		pulse: ANCHOR_ID
	},
	networkIntro: {
		layout: layoutNetworkIntro,
		labels: INTRO_IDS,
		pulse: ANCHOR_ID,
		// the path-walk reveal is authored for the forward arrival from `lone`;
		// scrolling back from `network` just tweens the actors into place
		revealFrom: ["lone"]
	},
	// network: no labels — the zoom-out drops labels and edges (feedback
	// 2026-07-05); scrolling back into networkIntro re-adds them once the
	// zoom-back settles (see labelsRevealed in ScrollyVisual.svelte)
	network: {
		layout: layoutNetwork,
		keyframes: networkKeyframes,
		pulse: ANCHOR_ID,
		// the zoom ratchet is authored for the forward arrival from
		// `networkIntro`; from `hopBands` backwards the crowd is already visible,
		// so the staged reveal would read as lag — just tween back in unison
		revealFrom: ["networkIntro"]
	}
};

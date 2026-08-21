import { NODE_COUNT, ANCHOR_ID, INTRO_IDS } from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	STRIDE,
	MARGIN,
	HOP_RGB,
	CROWD,
	INK,
	EDGE_HIGHLIGHT,
	set,
	setEdge,
	pairKey,
	parkHidden,
	graphCenter,
	introPosition,
	NETWORK_INTRO_RADIUS
} from "../layout-shared.js";
import { routesTo, routeActors, routeHeadline } from "../intro-routes.js";

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

// --- route focus (once the reveal has landed; see the `params` selector below) ---
const FOCUS_RADIUS = 9; // the picked actor
const ROUTE_RADIUS = 7; // the hub(s) their route passes through
const DIM_ALPHA = 0.24; // everyone off the route — their names ride this alpha
const ROUTE_EDGE_ALPHA = 0.95;
const DIM_EDGE_ALPHA = 0.07;
// hit regions: square, centred on the dot, sized off the tightest gap in the
// fitted layout so boxes never overlap (a 360px viewport squeezes the graph hard)
const HIT_MIN = 26;
const HIT_MAX = 44;
const HIT_SHARE = 0.85;
// An actor's name, as ScrollyVisual draws it under the dot (.node-label), and the
// summary line, as it draws a note. Layouts run before anything is in the DOM, so
// a label's footprint has to be predicted; these are measured off the rendered
// face — Atlas Typewriter is fixed-pitch and the root font size is a constant
// 16px, so a character count is an exact width.
const LABEL_LINE_PX = 13.2;
const NOTE_CHAR_PX = 7.68;
const NOTE_LINE_PX = 16.8;
const NAME_TOP_GAP = 4; // gap from a dot's edge to its name (see .node-label)
const SUMMARY_GAP_PX = 18; // from the lowest name label to the summary line
const SUMMARY_WRAP_PX = 300;

/**
 * Footprint of a piece of text, wrapping it if a single line's box would be wider
 * than `maxPx`. The face is fixed-pitch, so packing words by character count is
 * exact — `wrapWidth` is the longest resulting line, which reproduces the same
 * break in the browser (box-sizing is border-box, so it includes the padding)
 * while keeping the box tight around the ink.
 * @returns {{ w: number, h: number, wrapWidth: number|null }}
 */
function measureLabel(text, charPx, linePx, maxPx, padX = 0) {
	const pad = padX * 2;
	if (text.length * charPx + pad <= maxPx) {
		return { w: text.length * charPx + pad, h: linePx, wrapWidth: null };
	}
	const maxChars = Math.max(1, Math.floor((maxPx - pad) / charPx));
	const lines = [];
	for (const word of text.split(" ")) {
		const last = lines.at(-1);
		if (last === undefined || last.length + 1 + word.length > maxChars) {
			lines.push(word);
		} else {
			lines[lines.length - 1] = `${last} ${word}`;
		}
	}
	const w = Math.max(...lines.map((l) => l.length)) * charPx + pad;
	return { w, h: lines.length * linePx, wrapWidth: w + 1 };
}

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
function layoutNetworkIntro(nodes, w, h, edges, params) {
	// `armed` is false for the whole authored reveal, so nothing is tappable,
	// dimmed or labelled until the walk has landed (see the state's params below)
	const armed = params?.armed ?? false;
	const focus = armed ? (params?.focus ?? null) : null;
	const routes = focus == null ? [] : routesTo(focus);
	const routeEdges = new Set(routes.flat().map((seg) => seg.edge));
	const routeNodes = focus == null ? new Set() : routeActors(focus);
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

	/** @type {Map<number, [number, number]>} */
	const pos = new Map();
	for (const n of nodes) {
		if (!introSet.has(n.id)) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const [x, y] = introPosition(n.id, w, h);
		pos.set(n.id, [x, y]);
		let r = NETWORK_INTRO_RADIUS[n.hop];
		let rgb = n.id === ANCHOR_ID ? HOP_RGB[0] : CROWD;
		let alpha = 1;
		if (focus != null && n.id !== ANCHOR_ID) {
			if (n.id === focus) {
				r = FOCUS_RADIUS;
				rgb = EDGE_HIGHLIGHT;
			} else if (routeNodes.has(n.id)) {
				r = ROUTE_RADIUS;
				rgb = INK;
			} else {
				// their name label rides this alpha, so the crowd's names dim too
				alpha = DIM_ALPHA;
			}
		}
		set(attrs, n.id, x, y, r, rgb, alpha);
		delays[n.id] = nodeDelay.get(n.id) ?? 0;
	}
	edges.forEach(({ source, target }, e) => {
		const onRoute = routeEdges.has(e);
		const alpha =
			focus == null
				? INTRO_EDGE_ALPHA
				: onRoute
					? ROUTE_EDGE_ALPHA
					: DIM_EDGE_ALPHA;
		setEdge(attrs, e, 1, alpha, onRoute ? 1 : 0);
		// secondary links (not on any path) fill in once both ends are up
		delays[NODE_COUNT + e] =
			edgeDelay.get(e) ??
			Math.max(nodeDelay.get(source) ?? 0, nodeDelay.get(target) ?? 0) +
				INTRO_EDGE_LAG_MS;
	});
	if (!armed) return { attrs, delays };

	// Tap regions: one square per actor, all the same size so none can overlap.
	// The label is the region's accessible name and ScrollyVisual keys the
	// buttons on it, so it must NOT change with the selection — aria-pressed
	// carries that.
	let tightest = Infinity;
	for (const [a, [ax, ay]] of pos) {
		for (const [b, [bx, by]] of pos) {
			if (a >= b) continue;
			tightest = Math.min(tightest, Math.hypot(ax - bx, ay - by));
		}
	}
	const side = Math.max(HIT_MIN, Math.min(HIT_MAX, tightest * HIT_SHARE));
	const hits = INTRO_IDS.map((id) => {
		const [x, y] = pos.get(id);
		return {
			x: x - side / 2,
			y: y - side / 2,
			w: side,
			h: side,
			label:
				id === ANCHOR_ID
					? "Kevin Bacon, the center — clears the highlighted route"
					: `${nodes[id].name}, trace their route to Kevin Bacon`,
			value: id,
			selected: id === focus,
			round: true
		};
	});
	if (focus == null) return { attrs, delays, hits };

	// The summary reads as a caption under the constellation, clear of its lowest
	// name label.
	const graphBottom = Math.max(
		...INTRO_IDS.map(
			(id) =>
				pos.get(id)[1] + attrs[id * STRIDE + 2] + NAME_TOP_GAP + LABEL_LINE_PX
		)
	);
	const text = routeHeadline(focus, routes);
	const summary = measureLabel(
		text,
		NOTE_CHAR_PX,
		NOTE_LINE_PX,
		Math.min(SUMMARY_WRAP_PX, w - MARGIN * 2)
	);
	const notes = [
		{
			x: MARGIN,
			y: graphBottom + SUMMARY_GAP_PX,
			text,
			strong: true,
			wrap: summary.wrapWidth != null,
			wrapWidth: summary.wrapWidth ?? undefined
		}
	];
	return { attrs, delays, hits, notes };
}

export const states = {
	lone: {
		layout: layoutLone,
		labels: [ANCHOR_ID],
		pulse: ANCHOR_ID
	},
	networkIntro: {
		layout: layoutNetworkIntro,
		// with a route focused, only its own actors are named: 15 names plus the film
		// titles is unreadable on a phone, and the crowd's names aren't the point
		labels: (p) => (p?.focus == null ? INTRO_IDS : [...routeActors(p.focus)]),
		pulse: ANCHOR_ID,
		// the path-walk reveal is authored for the forward arrival from `lone`;
		// stepping back from the hopSeed step just tweens the actors into place
		revealFrom: ["lone"],
		// Held back until this state's own arrival tween has landed, so the reveal
		// plays with nothing tappable or dimmed; `story.settled` names the state that
		// landed, so an interrupted reveal never arms. Nothing is focused until the
		// reader picks someone — the step card's hint carries the invitation.
		params: (s) => {
			const armed = s.settled === "networkIntro";
			return { armed, focus: armed ? s.introFocus : null };
		},
		// a toggle: tapping the highlighted actor again clears it, as does tapping
		// Bacon — a route from the anchor to itself says nothing
		pick: (s, value) =>
			(s.introFocus =
				value === ANCHOR_ID || value === s.introFocus ? null : value)
	}
};

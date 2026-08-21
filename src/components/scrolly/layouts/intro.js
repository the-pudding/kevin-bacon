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
// Film labels: ScrollyVisual's .note — mono, 0.7rem, nowrap. Layouts run before
// anything is in the DOM, so a label's footprint has to be predicted; these are
// measured from the rendered face (Atlas Typewriter is fixed-pitch, and the root
// font size is a constant 16px, so a character count is an exact width).
const FILM_CHAR_PX = 7.68;
const FILM_LINE_PX = 16.8;
// a title wider than this share of the canvas wraps instead — a 20-character
// film name is half a phone's width on one line, and can't sit near its own link
const FILM_WRAP_SHARE = 0.3;
// how far off its line a label may sit, along the normal, and how far it may
// then step up or down (in FILM_GAP_PX units) to dodge something
const FILM_OFFSETS_PX = [11, 24, 38];
const FILM_GAP_PX = 18;
const FILM_STEPS = [0, -1, 1, -2, 2, -3, 3];
// how far along its line a label may slide off the midpoint — Bacon's dot is
// large enough that a long title can't always sit halfway along a short link
const FILM_TS = [0.5, 0.62, 0.38, 0.74, 0.26];
const FILM_SLIDE_COST_PX = 60; // cost of sliding the full half-length
const FILM_INWARD_COST_PX = 8; // tie-break: prefer the spot away from Bacon
// Every spot a film label may take, nearest to its line first, so a label that
// has to dodge still lands as close to the line it names as it can. Built once —
// the offsets are in px, independent of the fit.
const FILM_SPOTS = FILM_TS.flatMap((t) =>
	FILM_OFFSETS_PX.flatMap((dist) =>
		FILM_STEPS.flatMap((step) =>
			[1, -1].map((side) => ({
				t,
				side,
				dist,
				step,
				cost:
					dist +
					Math.abs(step) * FILM_GAP_PX +
					Math.abs(t - 0.5) * FILM_SLIDE_COST_PX +
					(side < 0 ? FILM_INWARD_COST_PX : 0)
			}))
		)
	)
).sort((a, b) => a.cost - b.cost);
// the actor names ScrollyVisual draws centred under each dot — same face, 11px
// with line-height 1.2 (see its .node-label)
const NAME_CHAR_PX = 7.04;
const NAME_LINE_PX = 13.2;
const NAME_TOP_GAP = 4;
const DOT_CLEARANCE_PX = 3; // breathing room around a dot (Bacon's pulse ring)
const HEADLINE_WRAP_PX = 300;
// the intro fit reaches this far down the canvas — nothing may sit below it, or
// it lands under the step card
const INTRO_FRAME_BOTTOM = 0.72;

/** @typedef {{ x0: number, x1: number, y0: number, y1: number }} Box */

/** @returns {Box} box of a centre-aligned label of a known size */
const labelBox = (cx, top, w, h) => ({
	x0: cx - w / 2,
	x1: cx + w / 2,
	y0: top,
	y1: top + h
});

/**
 * Footprint of a label, wrapping it if a single line would eat more than
 * `maxPx`. The face is fixed-pitch, so packing words by character count is
 * exact — `wrapWidth` is the longest resulting line, which reproduces the same
 * break in the browser while keeping the box tight around the ink.
 * @returns {{ w: number, h: number, wrapWidth: number|null }}
 */
function measureLabel(text, charPx, linePx, maxPx) {
	if (text.length * charPx <= maxPx) {
		return { w: text.length * charPx, h: linePx, wrapWidth: null };
	}
	const maxChars = Math.max(1, Math.floor(maxPx / charPx));
	const lines = [];
	for (const word of text.split(" ")) {
		const last = lines.at(-1);
		if (last === undefined || last.length + 1 + word.length > maxChars) {
			lines.push(word);
		} else {
			lines[lines.length - 1] = `${last} ${word}`;
		}
	}
	const widest = Math.max(...lines.map((l) => l.length)) * charPx;
	return { w: widest, h: lines.length * linePx, wrapWidth: widest + 1 };
}

const overlaps = (/** @type {Box} */ a, /** @type {Box} */ b) =>
	a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Places one film label per highlighted line, taking the nearest spot to that
 * line that hits nothing (see FILM_SPOTS: offset along the line's normal, stepped
 * up/down, and slid along the line itself). Obstacles are the dots and names
 * already on the chart plus the labels already placed — a layout runs before
 * anything is in the DOM, so it has to predict its own labels' footprints, which
 * it can: it is the thing that decided where the lines and dots go.
 * @param {{ note: import("../layout-shared.js").Note, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number }[]} candidates
 * @param {Box[]} obstacles
 */
function placeFilmLabels(candidates, obstacles, h) {
	const bottom = h * INTRO_FRAME_BOTTOM - FILM_LINE_PX;
	const spot = (c, t, side, dist, step) => {
		const x = c.x0 + (c.x1 - c.x0) * t + c.nx * side * dist;
		const y = Math.min(
			bottom - c.size.h + FILM_LINE_PX,
			c.y0 +
				(c.y1 - c.y0) * t +
				c.ny * side * dist -
				c.size.h / 2 +
				step * FILM_GAP_PX
		);
		return { x, y, box: labelBox(x, y, c.size.w, c.size.h) };
	};
	for (const c of candidates) {
		let placed = null;
		for (const { t, side, dist, step } of FILM_SPOTS) {
			const at = spot(c, t, side, dist, step);
			if (obstacles.some((o) => overlaps(at.box, o))) continue;
			placed = at;
			break;
		}
		// every spot collides — take the nearest one and let the halo carry it
		placed ??= spot(c, 0.5, 1, FILM_OFFSETS_PX[0], 0);
		c.note.x = placed.x;
		c.note.y = placed.y;
		obstacles.push(placed.box);
	}
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

	// One film title per highlighted line, at its midpoint and nudged clear of it
	// along the line's normal — outward from Bacon first, so labels sit outside
	// the graph rather than inside the constellation.
	const [cx, cy] = graphCenter(w, h);
	const candidates = [...routeEdges].map((e) => {
		const { source, target } = edges[e];
		const [x0, y0] = pos.get(source);
		const [x1, y1] = pos.get(target);
		const mx = (x0 + x1) / 2;
		const my = (y0 + y1) / 2;
		const len = Math.hypot(x1 - x0, y1 - y0) || 1;
		let nx = -(y1 - y0) / len;
		let ny = (x1 - x0) / len;
		if (nx * (mx - cx) + ny * (my - cy) < 0) {
			nx = -nx;
			ny = -ny;
		}
		// t runs from the endpoint further from Bacon toward him, so sliding a label
		// off the midpoint moves it outward first, the direction the eye travels
		const outward =
			Math.hypot(x0 - cx, y0 - cy) >= Math.hypot(x1 - cx, y1 - cy);
		const size = measureLabel(
			edges[e].film,
			FILM_CHAR_PX,
			FILM_LINE_PX,
			w * FILM_WRAP_SHARE
		);
		return {
			size,
			note: /** @type {import("../layout-shared.js").Note} */ ({
				x: mx,
				y: my,
				text: edges[e].film,
				align: "center",
				wrap: size.wrapWidth != null,
				wrapWidth: size.wrapWidth ?? undefined
			}),
			x0: outward ? x0 : x1,
			y0: outward ? y0 : y1,
			x1: outward ? x1 : x0,
			y1: outward ? y1 : y0,
			nx,
			ny
		};
	});
	// The route's own dots and names get right of way. The crowd's don't: their
	// dots are ghosts at DIM_ALPHA and their names are hidden entirely while a
	// route is focused (see the state's `labels`), and treating them as obstacles
	// pushes long titles right off their own line on a narrow viewport.
	const obstacles = [...routeNodes].flatMap((id) => {
		const [x, y] = pos.get(id);
		const r = attrs[id * STRIDE + 2];
		const clear = r + DOT_CLEARANCE_PX;
		return [
			{ x0: x - clear, x1: x + clear, y0: y - clear, y1: y + clear },
			labelBox(
				x,
				y + r + NAME_TOP_GAP,
				nodes[id].name.length * NAME_CHAR_PX,
				NAME_LINE_PX
			)
		];
	});
	placeFilmLabels(candidates, obstacles, h);
	const notes = candidates.map((c) => c.note);
	notes.push({
		x: MARGIN,
		y: MARGIN,
		text: routeHeadline(focus, routes),
		strong: true,
		wrap: true,
		wrapWidth: Math.min(HEADLINE_WRAP_PX, w - MARGIN * 2)
	});
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

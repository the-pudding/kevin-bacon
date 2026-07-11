import {
	NODE_COUNT,
	EDGE_COUNT,
	ANCHOR_ID,
	INTRO_IDS,
	INTRO_LAYOUT,
	NETWORK_COUNT,
	hash01
} from "./nodes.js";
import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";

// x, y, radius, red, green, blue, alpha — one group per node, then one
// (mostly empty) group per edge so the tweener staggers edges individually:
// edge slot 0 = draw progress (0–1, drawn from the anchor outward toward the
// higher-hop endpoint), edge slot 1 = alpha
export const STRIDE = 7;
export const EDGE_BASE = NODE_COUNT * STRIDE;
export const ATTR_SIZE = (NODE_COUNT + EDGE_COUNT) * STRIDE;
// one delay slot per node, then one per edge
export const DELAY_SIZE = NODE_COUNT + EDGE_COUNT;
export const edgeIndex = (e) => EDGE_BASE + e * STRIDE;

/**
 * @typedef {import("./nodes.js").ActorNode} ActorNode
 * @typedef {import("./nodes.js").Edge} Edge
 *
 * @typedef {Object} Tick
 * @property {number} pos px along the axis
 * @property {string} label
 *
 * @typedef {Object} Note
 * @property {number} x px
 * @property {number} y px
 * @property {string} text
 * @property {"left"|"center"|"right"} [align] default "left"
 * @property {boolean} [strong] render emphasised
 * @property {boolean} [wrap] allow multi-line (default nowrap)
 *
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + STRIDE per edge
 * @property {Float64Array} [delays] DELAY_SIZE per-node/per-edge start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 * @property {Float64Array} [trails] TRAIL_SIZE polyline vertices + alpha per trail;
 *   omitted = trails fade out in place
 * @property {Float64Array} [trailDelays] per-trail start delays in ms
 * @property {{ x?: Tick[], y?: Tick[], xBase?: number, yBase?: number }} [axes]
 * @property {Note[]} [notes]
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
 * @param {Edge[]} edges
 * @param {Object} [params] step params merged with interaction state (see STATE_PARAMS)
 * @returns {LayoutResult}
 */

// rgb values of the tokens in src/styles/variables.css (canvas can't read CSS custom properties)
export const HOP_RGB = [
	[34, 34, 34], // hop 0 — --color-gray-900
	[238, 102, 119], // hop 1 — --category-red
	[68, 119, 170], // hop 2 — --category-blue
	[102, 204, 238], // hop 3 — --category-cyan
	[187, 187, 187] // hop 4 — --category-gray
];
export const INK = [34, 34, 34]; // --color-gray-900
export const CROWD = [187, 187, 187]; // --category-gray
export const RED = [238, 102, 119]; // --category-red
export const BLUE = [68, 119, 170]; // --category-blue
export const GREEN = [34, 136, 51]; // --category-green
export const YELLOW = [204, 187, 68]; // --category-yellow
export const PURPLE = [170, 51, 119]; // --category-purple

export const MARGIN = 32;
// charts live in the top ~2/3 of the canvas — the step card owns the bottom,
// and the x-axis ticks need to clear it too
export const plotBottom = (h) => h * 0.66;

export const lin = (v, d0, d1, r0, r1) =>
	r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

// unordered endpoint key so an edge can be looked up regardless of orientation
export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function set(attrs, id, x, y, r, [red, green, blue], alpha) {
	const i = id * STRIDE;
	attrs[i] = x;
	attrs[i + 1] = y;
	attrs[i + 2] = r;
	attrs[i + 3] = red;
	attrs[i + 4] = green;
	attrs[i + 5] = blue;
	attrs[i + 6] = alpha;
}

export function setEdge(attrs, e, progress, alpha) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
}

// ---------------------------------------------------------------------------
// Named actors / corpus-wide lookups shared across chapters
// ---------------------------------------------------------------------------

const ID_BY_PID = new Map(rawNodes.nodes.map((n, id) => [n[0], id]));
export const idOf = (pid) => {
	const id = ID_BY_PID.get(pid);
	if (id === undefined) throw new Error(`scrolly states: unknown pid ${pid}`);
	return id;
};

export const SLJ = idOf(2231);
export const HANKS = idOf(31);
export const STREEP = idOf(5064);
export const DENIRO = idOf(380);
export const HACKMAN = idOf(193);
export const WELKER = idOf(15831);
export const CAGE = idOf(2963);
export const WALTERS = idOf(477);
export const OLDMAN = idOf(64);
export const KIDMAN = idOf(2227);
export const CGM = story.genz.candidates[0].id;
export const SWEENEY = idOf(115440);
export const CHASE = idOf(54812);

// ranked order over the sample (ranks are corpus-global and sparse — plot by
// sampled order, never raw rank; see notes/scrolly-framework.md)
export const BY_RANK = rawNodes.nodes
	.map((n, id) => ({ id, rank: n[5] }))
	.sort((a, b) => a.rank - b.rank);
export const ORDER_OF = new Map(BY_RANK.map((n, i) => [n.id, i]));

// fixed film-count x-scale shared by every films-scatter variant so dots only
// travel vertically when the y-metric changes
const FILM_LOGS = rawNodes.nodes.map((n) => Math.log(Math.max(1, n[3])));
export const FILM_LOG_MIN = Math.min(...FILM_LOGS);
export const FILM_LOG_MAX = Math.max(...FILM_LOGS);
export const AVG_MIN = Math.min(...rawNodes.nodes.map((n) => n[4]));
export const AVG_MAX = Math.max(...rawNodes.nodes.map((n) => n[4]));

/** distance-vs-films position — also the park spot for hidden latecomers */
export function scatterPosition(n, w, h) {
	return [
		lin(
			Math.log(Math.max(1, n.films)),
			FILM_LOG_MIN,
			FILM_LOG_MAX,
			MARGIN,
			w - MARGIN
		),
		lin(n.avgDistance, AVG_MIN, AVG_MAX, MARGIN + 8, plotBottom(h))
	];
}

// ---------------------------------------------------------------------------
// Trails: polylines tweened by a second tweener (vertex morphing = object
// constancy for lines). Fixed slots: 15 race anchors, the career trio, 40
// cohort career lines, 1 diagonal (prediction scatter).
// ---------------------------------------------------------------------------

export const TRAIL_POINTS = 48;
export const TRAIL_STRIDE = TRAIL_POINTS * 2 + 1; // vertices + alpha
export const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);
export const raceRGB = (id) =>
	id === SLJ
		? PURPLE
		: id === HACKMAN
			? BLUE
			: id === DENIRO
				? GREEN
				: id === WELKER
					? YELLOW
					: CROWD;
/** @type {{ id: number|null, rgb: number[], width: number }[]} */
export const TRAIL_META = [
	...RACE_IDS.map((id) => ({
		id,
		rgb: raceRGB(id),
		width: raceRGB(id) === CROWD ? 1 : 1.75
	})),
	{ id: SWEENEY, rgb: RED, width: 2 },
	{ id: DENIRO, rgb: BLUE, width: 2 },
	{ id: CHASE, rgb: YELLOW, width: 2 },
	...story.careers.cohort.map(() => ({ id: null, rgb: CROWD, width: 1 })),
	{ id: null, rgb: CROWD, width: 1 } // prediction diagonal
];
export const TRAIL_SIZE = TRAIL_META.length * TRAIL_STRIDE;
export const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));
export const SWEENEY_SLOT = RACE_IDS.length;
export const DENIRO_SLOT = RACE_IDS.length + 1;
export const CHASE_SLOT = RACE_IDS.length + 2;
export const COHORT_SLOT = RACE_IDS.length + 3;
export const DIAG_SLOT = TRAIL_META.length - 1;

/** writes a polyline (data pairs → px via scales) into trail slot t */
export function setTrail(trails, t, pairs, xScale, yScale, alpha) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		// resample the series uniformly in x by walking segments
		const target =
			pairs[0][0] + ((pairs.at(-1)[0] - pairs[0][0]) * k) / (TRAIL_POINTS - 1);
		let j = 1;
		while (j < pairs.length - 1 && pairs[j][0] < target) j++;
		const [x0, y0] = pairs[j - 1];
		const [x1, y1] = pairs[j];
		const t01 = x1 === x0 ? 0 : (target - x0) / (x1 - x0);
		trails[base + k * 2] = xScale(target);
		trails[base + k * 2 + 1] = yScale(y0 + (y1 - y0) * t01);
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/** collapses trail slot t onto a point (line unspools from/retracts into a dot) */
export function collapseTrail(trails, t, x, y, alpha = 0) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
}

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends */
export function clipSeries(pairs, x0, x1) {
	const out = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		if (x < x0) {
			const nxt = pairs[i + 1];
			if (nxt && nxt[0] > x0) {
				out.push([x0, y + ((nxt[1] - y) * (x0 - x)) / (nxt[0] - x)]);
			}
			continue;
		}
		if (x > x1) {
			const prv = pairs[i - 1];
			if (prv && prv[0] < x1 && (!out.length || out.at(-1)[0] < x1)) {
				out.push([x1, prv[1] + ((y - prv[1]) * (x1 - prv[0])) / (x - prv[0])]);
			}
			break;
		}
		out.push([x, y]);
	}
	return out.length >= 2 ? out : null;
}

export const NETWORK_INTRO_RADIUS = [16, 6, 6, 6, 6];
export const NETWORK_HOP_DELAY_MS = 250;

// anisotropy cap when fitting the landscape intro layout to portrait screens —
// planarity survives axis scaling, and without it 320px viewports squash the
// graph to ~200px tall with the name labels colliding
export const INTRO_MAX_STRETCH = 1.6;

/**
 * The intro fit: scales the baked 860×680 intro layout into the top ~72% of
 * the canvas (per-axis, each capped at INTRO_MAX_STRETCH beyond uniform) and
 * returns the anchor's fitted screen position plus the axis scales — the one
 * frame the intro-chapter layouts hang off, directly (lone/networkIntro) or
 * as the zoom-out's starting scale (network's entry parks).
 */
export function introFrame(w, h) {
	const availW = w - MARGIN * 2;
	const availH = h * 0.72 - MARGIN;
	const sxRaw = availW / INTRO_LAYOUT.w;
	const syRaw = availH / INTRO_LAYOUT.h;
	const sx = Math.min(sxRaw, syRaw * INTRO_MAX_STRETCH);
	const sy = Math.min(syRaw, sxRaw * INTRO_MAX_STRETCH);
	const ox = (w - INTRO_LAYOUT.w * sx) / 2;
	const oy = MARGIN + (availH - INTRO_LAYOUT.h * sy) / 2;
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	return { cx: ox + ax * sx, cy: oy + ay * sy, sx, sy };
}

/**
 * Screen position of the anchor node (Bacon) in the intro fit — the single
 * "center of the network" every hop-based layout (lone/networkIntro/network)
 * anchors on, so Bacon doesn't jump between those states.
 */
export function graphCenter(w, h) {
	const { cx, cy } = introFrame(w, h);
	return [cx, cy];
}

/**
 * Screen position of intro node k in the intro fit — the frame `lone` and
 * `networkIntro` draw the constellation in, and the one the network map's
 * camera 0 reproduces exactly.
 */
export function introPosition(k, w, h) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx, cy + (y - ay) * sy];
}

// ---------------------------------------------------------------------------
// Network map: the `network` state's crowd, generated procedurally per canvas
// size in pixel space — no baked layout. Separability is a construction
// guarantee: a jittered hex lattice (pitch floored at NETWORK_PITCH_MIN,
// jitter small enough that 3px dots can't touch) clipped to a wobble-edged
// organic blob in the top ~NETWORK_BOTTOM of the canvas. The intro
// constellation sits shrunken inside an exclusion ellipse (no crowd dots
// between the intro actors) with Bacon visibly off-centre; the crowd mass
// accumulates away from him. A ladder of NETWORK_CYCLES + 1 camera levels
// (geometric zoom, level 0 continuous with the networkIntro framing, level
// NETWORK_CYCLES the identity) drives the Google-Earth ratchet: each dot's
// reveal cycle is the first level whose viewport contains it, so growth always
// enters at the rim of the current framing (see networkKeyframes in
// layouts/intro.js). Deterministic: all jitter/dropout comes from hash01.
// ---------------------------------------------------------------------------

// every dot renders the same size; the crowd holds a faint alpha so Bacon
// (dark + pulsing) and the intro constellation read against it
export const NETWORK_DOT_R = 1.5;
export const NETWORK_CROWD_ALPHA = 0.55;
/** camera pull-backs in the zoom ratchet (level 0 = the intro framing) */
export const NETWORK_CYCLES = 4;
// the crowd occupies the top ~80% of the canvas — clear of the step card
const NETWORK_BOTTOM = 0.8;
// hex lattice pitch floor. Doubles as the constellation-blend floor: the
// settled constellation's median spacing is tied to the pitch (see sigma in
// makeNetworkMap), and the burst's closest pair sits at ~0.7× its median, so
// 6px keeps intro dots off each other while the crowd matches their density
const NETWORK_PITCH_MIN = 6;
const NETWORK_JITTER = 0.12; // per-axis point jitter, fraction of pitch
const NETWORK_DROPOUT = 0.06; // lattice cells left empty (organic texture)
// Bacon's spot in blob-radius units: clearly off-centre, but far enough in
// that the crowd encloses his pocket on every side — surrounded, not ashore
const BACON_OFFSET = [-0.42, -0.3];

// inward-only wobble of the blob edge, in [0.84, 1] — organic silhouette that
// never pokes past the usable rect
const wobble = (theta) =>
	1 -
	0.045 * (1 + Math.sin(3 * theta + 1.7)) -
	0.035 * (1 + Math.sin(5 * theta + 4.2));

/**
 * @typedef {Object} NetworkMap
 * @property {Float64Array} pos settled [x, y] per node id (NaN = not on the map)
 * @property {Int8Array} reveal zoom cycle (0–NETWORK_CYCLES) at which a dot
 *   first fits the viewport; -1 = never shown (non-participant, or crowd over
 *   the screen's separable capacity)
 * @property {Int32Array} cycles dots revealed per cycle
 * @property {(id: number, k: number) => [number, number]} at screen position
 *   of node id under camera level k
 */

/** @type {Map<string, NetworkMap>} */
const mapCache = new Map();

/** the procedural network map for a canvas size (memoized) */
export function networkMap(w, h) {
	const key = `${w}:${h}`;
	let map = mapCache.get(key);
	if (!map) {
		map = makeNetworkMap(w, h);
		mapCache.set(key, map);
	}
	return map;
}

/** @returns {NetworkMap} */
function makeNetworkMap(w, h) {
	const x0 = MARGIN;
	const x1 = w - MARGIN;
	const y0 = MARGIN;
	const y1 = h * NETWORK_BOTTOM;
	const ux = (x0 + x1) / 2;
	const uy = (y0 + y1) / 2;
	const rx = ((x1 - x0) / 2) * 0.98;
	const ry = ((y1 - y0) / 2) * 0.98;
	const bx = ux + BACON_OFFSET[0] * rx;
	const by = uy + BACON_OFFSET[1] * ry;

	// participants: hop-known actors keep their identity into the hop chapter
	// (object constancy), anonymous crowd rows fill the remaining capacity
	const rich = [];
	const crowd = [];
	rawNodes.nodes.forEach((n, id) => {
		if (id < INTRO_IDS.length) return;
		if (id >= NETWORK_COUNT) crowd.push(id);
		else if (n[2] >= 0) rich.push(id);
	});

	// pitch: spread every participant across the blob on large screens; on
	// small ones clamp to the floor and trim the crowd to fit
	const target = rich.length + crowd.length;
	const area = Math.PI * rx * ry * 0.85; /* mean wobble² */
	const pitch = Math.max(
		NETWORK_PITCH_MIN,
		Math.sqrt((area * (1 - NETWORK_DROPOUT)) / (0.866 * target))
	);

	// settled constellation: the intro fit scaled down around Bacon's final
	// off-centre spot, holding its shape (an affine copy is what lets camera 0
	// reproduce the networkIntro framing exactly). sigma is chosen so the
	// constellation's MEDIAN neighbour spacing equals the crowd pitch — the
	// intro actors blend into the crowd instead of reading as an airy patch.
	// The burst's closest pair sits at ~0.7× its median, which the pitch floor
	// keeps above the no-overlap line.
	const [gx, gy] = graphCenter(w, h);
	const fitted = INTRO_IDS.map((k) => introPosition(k, w, h));
	const fitNN = fitted
		.map((p, i) =>
			Math.min(
				...fitted
					.filter((_, j) => j !== i)
					.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))
			)
		)
		.sort((a, b) => a - b);
	const sigma = pitch / fitNN[(fitNN.length / 2) | 0];
	const pos = new Float64Array(NODE_COUNT * 2).fill(NaN);
	for (const k of INTRO_IDS) {
		pos[k * 2] = bx + sigma * (fitted[k][0] - gx);
		pos[k * 2 + 1] = by + sigma * (fitted[k][1] - gy);
	}

	// camera ladder: level 0 reproduces the networkIntro framing exactly (Bacon
	// at graphCenter, constellation at full intro scale — the zoom-out is
	// seamless with the previous state); level NETWORK_CYCLES is the identity.
	// Scale steps geometrically (a camera zooms in ratios, not increments) while
	// the focus walks from Bacon to the blob centre, so each pull-back recentres
	// on the growing mass and Bacon drifts toward the edge of frame.
	const s0 = 1 / sigma;
	const cameras = [];
	for (let k = 0; k <= NETWORK_CYCLES; k++) {
		const t = k / NETWORK_CYCLES;
		cameras.push({
			s: s0 ** (1 - t),
			fx: bx + (ux - bx) * t,
			fy: by + (uy - by) * t,
			ex: gx + (ux - gx) * t,
			ey: gy + (uy - gy) * t
		});
	}
	const at = (id, k) => {
		const c = cameras[k];
		return [
			c.ex + (pos[id * 2] - c.fx) * c.s,
			c.ey + (pos[id * 2 + 1] - c.fy) * c.s
		];
	};

	// constellation protection, two rings with different fates. A clearance
	// disc per actor stays empty forever (dots never touch an intro actor). The
	// hull ellipse over the whole burst is only *deferred*: crowd dots inside
	// it exist in the settled map (no permanent moat around Bacon — the
	// insignificance frame wants the crowd hugging him) but hold their reveal
	// until the final fill, so nothing pops in between the intro actors while
	// the constellation is still big enough to read as a shape.
	const pad = pitch;
	const clear = pitch * 1.1;
	const conX = INTRO_IDS.map((k) => pos[k * 2]);
	const conY = INTRO_IDS.map((k) => pos[k * 2 + 1]);
	const ecx = (Math.min(...conX) + Math.max(...conX)) / 2;
	const ecy = (Math.min(...conY) + Math.max(...conY)) / 2;
	const erx = (Math.max(...conX) - Math.min(...conX)) / 2 + pad;
	const ery = (Math.max(...conY) - Math.min(...conY)) / 2 + pad;
	const nearActor = (px, py) =>
		INTRO_IDS.some(
			(k) => Math.hypot(px - pos[k * 2], py - pos[k * 2 + 1]) < clear
		);

	const points = [];
	const rowH = pitch * 0.866;
	const cols = Math.ceil((x1 - x0) / pitch) + 1;
	let idx = 0;
	for (let row = 0; y0 + row * rowH <= y1; row++) {
		for (let col = 0; col < cols; col++, idx++) {
			if (hash01(idx, 12) < NETWORK_DROPOUT) continue;
			const px =
				x0 +
				(col + (row % 2) / 2) * pitch +
				(hash01(idx, 10) - 0.5) * 2 * NETWORK_JITTER * pitch;
			const py =
				y0 + row * rowH + (hash01(idx, 11) - 0.5) * 2 * NETWORK_JITTER * pitch;
			const nx = (px - ux) / rx;
			const ny = (py - uy) / ry;
			if (Math.hypot(nx, ny) > wobble(Math.atan2(ny, nx))) continue;
			if (nearActor(px, py)) continue;
			const qx = (px - ecx) / erx;
			const qy = (py - ecy) / ery;
			points.push([px, py, hash01(idx, 13), qx * qx + qy * qy < 1]);
		}
	}
	// deterministic shuffle: rich ids are assigned first and must scatter
	// across the blob, not cluster in lattice order; over capacity the same
	// order decides which lattice points go unused
	points.sort((a, b) => a[2] - b[2]);

	const reveal = new Int8Array(NODE_COUNT).fill(-1);
	const cycles = new Int32Array(NETWORK_CYCLES + 1);
	for (const k of INTRO_IDS) {
		reveal[k] = 0;
		cycles[0]++;
	}
	[...rich, ...crowd].forEach((id, i) => {
		const p = points[i];
		if (!p) {
			// over the screen's separable capacity: no dot — park invisibly
			pos[id * 2] = ux + (hash01(id, 14) - 0.5) * rx;
			pos[id * 2 + 1] = uy + (hash01(id, 15) - 0.5) * ry;
			return;
		}
		pos[id * 2] = p[0];
		pos[id * 2 + 1] = p[1];
		if (p[3]) {
			// inside the constellation hull: deferred to the final fill
			reveal[id] = NETWORK_CYCLES;
			cycles[NETWORK_CYCLES]++;
			return;
		}
		// reveal cycle: the first camera level whose viewport contains the dot
		for (let k = 0; k <= NETWORK_CYCLES; k++) {
			const [sx, sy] = at(id, k);
			if (
				sx >= x0 - pitch &&
				sx <= x1 + pitch &&
				sy >= y0 - pitch &&
				sy <= y1 + pitch
			) {
				reveal[id] = k;
				cycles[k]++;
				break;
			}
		}
	});
	return { pos, reveal, cycles, at };
}

/**
 * Hidden park spot for any node not placed by the current state: network-map
 * participants park where the zoom ratchet will reveal them (so they fade in
 * in place and ride the remaining pull-backs — and disperse back out along the
 * same path when the camera zooms back in); later-chapter actors outside the
 * map park on the scatter plot.
 */
export function parkHidden(attrs, n, w, h) {
	if (n.id >= NETWORK_COUNT || n.hop >= 0) {
		const map = networkMap(w, h);
		const k = map.reveal[n.id];
		const [x, y] = map.at(n.id, k >= 0 ? k : NETWORK_CYCLES);
		set(attrs, n.id, x, y, NETWORK_DOT_R, CROWD, 0);
	} else {
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
}

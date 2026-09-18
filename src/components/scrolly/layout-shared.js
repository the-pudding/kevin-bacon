import {
	NODE_COUNT,
	EDGE_COUNT,
	ANCHOR_ID,
	INTRO_IDS,
	INTRO_LAYOUT,
	hash01
} from "./nodes.js";
import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";

// x, y, radius, red, green, blue, alpha — one group per node, then one
// (mostly empty) group per edge so the tweener staggers edges individually:
// edge slot 0 = draw progress (0–1, drawn from the anchor outward toward the
// higher-hop endpoint), edge slot 1 = alpha, edge slot 2 = highlight (0–1,
// blends the stroke grey → EDGE_HIGHLIGHT and thickens it; see setEdge)
export const STRIDE = 7;
export const EDGE_BASE = NODE_COUNT * STRIDE;

/**
 * Spare edge slots past the baked ones, for links whose ENDPOINTS are chosen at
 * runtime rather than at build time — the chapter card's highlight spokes (see
 * galaxy-highlight.js), which fan out from whichever actor the beat is on.
 *
 * The baked edges are a fixed table: `edgeEnds` in ScrollyVisual binds slot e to
 * one node pair at module load, so a link between an arbitrary pair has nowhere
 * to live. Rather than a second line-drawing path with its own colour, weight,
 * draw-on and fade rules, the pool lets a runtime link rent a slot and be drawn
 * by the SAME loop as the constellation's — which already reads both endpoints
 * out of the live buffer every frame, and so follows dots that are moving.
 *
 * This is also the spoke count the most prolific actor in the cast gets, so the
 * pool is full exactly when the beat is at its densest and can never be asked
 * for more — galaxy-highlight.js asserts that at module load rather than
 * clamping, so an over-large spoke range is a startup error and not a silently
 * shortened fan.
 */
export const GALAXY_LINK_MAX = 80;
/** edge-slot index of the pool's first slot (the baked edges occupy 0..EDGE_COUNT) */
export const GALAXY_LINK_BASE = EDGE_COUNT;

export const ATTR_SIZE = (NODE_COUNT + EDGE_COUNT + GALAXY_LINK_MAX) * STRIDE;
// one delay slot per node, then one per edge (pool included)
export const DELAY_SIZE = NODE_COUNT + EDGE_COUNT + GALAXY_LINK_MAX;
export const edgeIndex = (e) => EDGE_BASE + e * STRIDE;

/**
 * @typedef {import("./nodes.js").ActorNode} ActorNode
 * @typedef {import("./nodes.js").Edge} Edge
 *
 * @typedef {Object} Tick
 * @property {number} pos px along the axis
 * @property {string} label the text drawn. On the race chart this is a year in
 *   TWO digits (see raceTickLabel), so it is lossy — anything keying off a
 *   particular year must read `year`, never this
 * @property {number} [year] the year a race tick stands for
 * @property {number} [alpha] 0-1 opacity; omitted = fully opaque. Only the
 *   future strip's years use it, fading toward the horizon with the block they
 *   sit under (see raceFutureTicks)
 *
 * @typedef {Object} Note
 * @property {number} x px
 * @property {number} y px
 * @property {string} text
 * @property {"left"|"center"|"right"} [align] default "left"
 * @property {boolean} [strong] render emphasised
 * @property {boolean} [wrap] allow multi-line (default nowrap)
 * @property {number} [wrapWidth] px line width, overriding the default cap (wrap
 *   only). Set as a real `width`, not a max: an absolutely-positioned box is
 *   shrink-to-fit within `containing block - left`, so a centred note at x = w/2
 *   would otherwise never wrap wider than half the canvas.
 *
 * @typedef {Object} TakeoverCallout
 * @property {{x: number, y: number}} ring px, centre of the ring on the crossing
 * @property {{x: number, y: number, width: number}} note px, the note box's
 *   top-left and its line width. A real `width`, not a max — an absolutely
 *   positioned box is shrink-to-fit, so a max would let the rendered box run
 *   wider than the geometry that placed it (same trap as Note.wrapWidth)
 * @property {{ax: number, ay: number, bx: number, by: number, h1x: number,
 *   h1y: number, h2x: number, h2y: number}} arrow the leader — a straight
 *   segment: start, tip, and the head's two trailing corners. Numbers, not path
 *   strings — this is built in the per-frame writer, which documents itself as
 *   allocating nothing per frame
 * @property {number} alpha 0-1, ramped down over the last px of travel at each
 *   plot edge so the callout fades out instead of popping on the cull
 *
 * @typedef {Object} FutureBand
 * @property {number} x px, left edge — the RACE_DATA_END column, where the data
 *   ends. Also the AXIS BREAK: the strip to its right is on its own fitted scale
 *   (raceFutureScale), and this border is the only thing that says so
 * @property {number} y px, top edge (the plot's top)
 * @property {number} width px, x → the frontier's position on that scale. Grows
 *   from 0 as the strip opens
 * @property {number} height px, the plot's full height
 * @property {{x: number, y: number}} label px, top-left of the block's label.
 *   ABOVE the box, not inside its corner — the crown's own name renders just
 *   inside the box's left edge, and on a landscape phone the two line boxes
 *   would overlap
 *
 * @typedef {Object} LegendItem
 * @property {number[]} color rgb triple
 * @property {string} label
 * @property {number} [x] px, left edge — when set (with `y`), this item renders as
 *   its own pinned label at that position instead of joining the shared bottom row
 * @property {number} [y] px, vertical centre of the pinned label (see `x`)
 *
 * @typedef {Object} Hit
 * @property {number} x px, left edge
 * @property {number} y px, top edge
 * @property {number} w px
 * @property {number} h px
 * @property {string} label accessible name for the region
 * @property {unknown} value handed to the state's `pick` (see STATE_PICK)
 * @property {boolean} [selected] currently the picked region
 * @property {boolean} [round] hover/selected tint is a circle, not a rectangle —
 *   for a region centred on a dot rather than covering a bar
 *
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + STRIDE per edge
 * @property {Float64Array} [delays] DELAY_SIZE per-node/per-edge start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 * @property {Float64Array} [trails] TRAIL_SIZE polyline vertices + alpha +
 *   highlight per trail; omitted = trails fade out in place
 * @property {Float64Array} [trailDelays] per-trail start delays in ms
 * @property {{ x?: Tick[], y?: Tick[], xBase?: number, yBase?: number }} [axes]
 * @property {Note[]} [notes]
 * @property {TakeoverCallout|null} [takeover] the race chart's takeover callout
 *   (the SLJ/Hackman crossing); null when it is off camera
 * @property {FutureBand|null} [band] the race chart's future block (raceFuture);
 *   null on every other step, and for the whole of that step's first leg
 * @property {LegendItem[]} [legend]
 * @property {Hit[]} [hits] tappable regions over the chart (see STATE_PICK)
 * @property {number} [legendY] px, top of the legend row; omitted = pinned to bottom
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
 * @param {Edge[]} edges
 * @param {Object} [params] step params merged with interaction state (see STATE_PARAMS)
 * @param {number} [bleed] px the canvas extends past `w` on EACH side. Almost every
 *   layout ignores this and stays inside [0, w]: `w` is the reading column, and a
 *   chart drawn wider than the prose it belongs to stops being readable. Only the
 *   chapter card spends it, to author its crowd across the full screen (galaxyBox).
 * @returns {LayoutResult}
 */

// What a hop crowd's dots are drawn at wherever they are packed tightly enough
// to overlap — the hopBands rows and the rank ladder's strips both. At this
// alpha the overlap is the point: two dots on the same spot read darker, so a
// dense band shows its own density instead of flattening into a solid block.
// Shared so the ladder inherits the chart it dissolves out of; the anchor and
// anything drawn as a single node stay opaque.
export const HOP_DOT_ALPHA = 0.5;

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
// --category-yellow. No layout reads this one: its only user is raceFuture's
// future block, which is DOM rather than canvas and so takes the colour from
// --category-yellow directly. Kept for parity with the rest of the palette.
export const YELLOW = [204, 187, 68];
export const PURPLE = [170, 51, 119]; // --category-purple
export const CYAN = [102, 204, 238]; // --category-cyan
export const EDGE_GREY = [120, 120, 120]; // network links at rest
// A highlighted link, and the actor a highlight is about (see setEdge's
// `highlight`). Ink, not a colour: step 1 is the only user, and the route it
// picks out already reads against the crowd's grey through weight and
// darkness alone — a hue there would be the story's only decorative colour.
export const EDGE_HIGHLIGHT = INK;

export const MARGIN = 32;

/**
 * px of strip reserved above the canvas box for each chart's title, between the
 * progress bar and the canvas's own MARGIN clearance. This is the source of the
 * `--title-band` custom property, which Index.svelte sets from it — canvas can't
 * read CSS custom properties, and the render path needs the number.
 *
 * The canvas ELEMENT bleeds up into the strip (see ScrollyVisual's render
 * transform), which is why it is a constant and not a per-state or measured
 * value: the backing store is rebuilt on resize, and a band that moved between
 * states would resize the canvas on exactly the transitions that animate.
 * Coordinates are unaffected — the origin is pushed back down by the same
 * amount, so only `galaxyBox` reaches into the strip.
 */
export const TITLE_BAND = 26;

// charts live in the top ~3/5 of the canvas — the step card owns the bottom,
// and the x-axis ticks + axis label (drawn ~32px below this line) need to clear
// the tallest step cards too, so keep the plot clear of the bottom ~40%.
//
// BESIDE the prose (a wide viewport — see Index.svelte's side-by-side rule) the
// step card is not over the canvas at all, so the only thing left to clear is
// the axis furniture and the plot takes nearly the whole column.
//
// It is a module variable rather than a seventh layout argument because
// `plotBottom(h)` is read from ten layout modules and from the render path,
// none of which are handed the page's layout mode — the same idiom
// `setRaceDevBands` uses for the dev curve. ScrollyVisual owns the setter AND
// puts the fraction in its layout cache key, which is what stops a chart built
// for one mode being handed back in the other: `w` changes with the mode today,
// so the key would usually miss anyway, but relying on that would make this a
// coincidence rather than a rule.
export const PLOT_BOTTOM_STACKED = 0.6;
export const PLOT_BOTTOM_BESIDE = 0.86;
let plotBottomFrac = PLOT_BOTTOM_STACKED;
export const setPlotBottomFrac = (frac) => (plotBottomFrac = frac);
export const plotBottomFraction = () => plotBottomFrac;
export const plotBottom = (h) => h * plotBottomFrac;

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

/**
 * Writes one edge's render state. `highlight` (0–1) blends the stroke from the
 * plain grey toward EDGE_HIGHLIGHT and thickens it (see ScrollyVisual's drawScene);
 * a scalar rather than an rgb triple so the untouched slots of every layout that
 * doesn't draw edges still mean "plain grey" rather than black.
 */
export function setEdge(attrs, e, progress, alpha, highlight = 0) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
	attrs[i + 2] = highlight;
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
export const CAGE = idOf(2963);
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

// how many top-ranked actors RankBars renders — shared with the rank-guess
// search so a search result is never outside the visible/scrollable list
export const RANK_TOP_N = 250;

// ---------------------------------------------------------------------------
// Rank hop-breakdown bar: a hop-bands chart turned on its side, hops 1→4 left
// to right, individual actors drawn as dots inside their band. Shared by the
// canvas handoff (layouts/rank.js) and the HTML list it dissolves into
// (RankBars.svelte) so the two land dot-for-dot on the same geometry.
// ---------------------------------------------------------------------------

export const RANK_BAR_H = 10; // px, the dotted strip's height
// px floor per band. Also the minimum-nodes guarantee: dots are units of width,
// so the floor that keeps a sparse hop (hop 4 is ~0.1% of a row) visible is
// what keeps a handful of its dots on screen.
export const RANK_SEG_MIN = 10;
// Whitespace between adjacent hop bands — the horizontal twin of hop-bands.js's
// BAND_GAP. Reserved out of the width BEFORE the shares are struck, so it is
// real whitespace and every band still gets its honest share of what is left.
// Small where that one is 12px: this strip is only RANK_BAR_H tall, so 12px of
// hole in it reads as four missing dot columns rather than a seam.
export const RANK_BAND_GAP = 5;
export const RANK_DOT_D = 2.4; // px dot diameter
export const RANK_DOT_ROWS = 5; // dot rows stacked within RANK_BAR_H
export const RANK_DOT_PITCH = 3; // px between dot columns
// How much of its own lattice cell a dot may wander over — 1 is the whole cell,
// so past about half of one neighbours start to overlap and the strip reads as
// a crowd rather than a stamped grid. Deliberately NOT a fraction of the slack
// left around the dot: at this pitch that slack is half a pixel, so a
// slack-based nudge is no nudge at all and the lattice shows straight through.
export const RANK_DOT_JITTER = 0.9;
// How long the list's bars take to collapse into single nodes when the story
// steps on into the race chapter (RankBars' `collapse`). Shared vocabulary: the
// panel owns the clock and the canvas waits for it (story.rankCollapsed), so
// this lives here rather than in either component.
export const RANK_COLLAPSE_MS = 500;

/**
 * The boxes of hop bands 1–4 across `width`: each gets RANK_SEG_MIN plus its
 * share of whatever those floors and the three gaps between the bands leave
 * behind, so the proportions still read while no band disappears. Widths plus
 * gaps sum to exactly `width`.
 * @param {number[]} fractions four shares summing to 1
 * @param {number} width px
 * @returns {{x: number, w: number}[]} one box per hop band
 */
export function hopBandBoxes(fractions, width) {
	const free = width - RANK_SEG_MIN * fractions.length - RANK_BAND_GAP * 3;
	const boxes = [];
	let x = 0;
	for (const fraction of fractions) {
		const w = RANK_SEG_MIN + free * fraction;
		boxes.push({ x, w });
		x += w + RANK_BAND_GAP;
	}
	return boxes;
}

/** an actor's hop 1–4 shares of the corpus, from the rankHopBands export */
export function hopFractions(id) {
	const counts = story.rankHopBands[id];
	const total = counts.reduce((sum, count) => sum + count, 0);
	return counts.map((count) => count / total);
}

/**
 * The four hop shares as reader-facing percentages, shared by every chart that
 * prints them so the story states the same split the same way everywhere.
 *
 * Hops 1–3 are apportioned by largest remainder rather than rounded one by one:
 * independent rounding lands on 99 or 101 for 58 of the ladder's 250 rows, and
 * a reader adding up four numbers on one bar notices. Hop 4 is deliberately
 * outside that arithmetic — it is under 0.25% of every actor's corpus, so it
 * can only ever be the rounding dust, and it takes a bound (`<0.1%`) instead of
 * an integer because "0%" would write off a whole degree of separation that
 * genuinely has people in it. That leaves the three printed integers summing to
 * exactly 100 on every row.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @returns {string[]} four display strings
 */
export function hopShareLabels(fractions) {
	const pct = fractions.map((share) => share * 100);
	const counted = pct.slice(0, 3);
	const whole = counted.map(Math.floor);
	// at most one unit per band is ever lost to the floors, so a single pass
	// down the remainders always spends the shortfall
	let short = 100 - whole.reduce((sum, n) => sum + n, 0);
	const byRemainder = counted
		.map((p, band) => ({ band, rem: p - whole[band] }))
		.sort((a, b) => b.rem - a.rem);
	for (const { band } of byRemainder) {
		if (short <= 0) break;
		whole[band] += 1;
		short -= 1;
	}
	const hop4 = Math.ceil(pct[3] * 10) / 10;
	return [...whole.map((n) => `${n}%`), `<${hop4.toFixed(1)}%`];
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Keeps one band's jitter keys clear of the next band's. Must exceed the widest
// band's own key range, `cols * RANK_DOT_ROWS` — about 3300 at the widest
// viewport this list is read at.
const DOT_KEY_STRIDE = 4096;

/**
 * The dot lattice's own nudge, in place of `hash01`. hash01 is a sine hash, so
 * stepping its input by a constant — which walking the lattice column by column
 * does — steps the sine's phase by a constant too. At the jitter width the
 * strip needs that period is plainly visible: the dots comb into a repeating
 * wave every few columns. An integer bit-mix (the lowbias32 finaliser) has no
 * such period, and nothing else in the story jitters hard enough to care.
 *
 * Exported for the highlight beat's spoke picker, which walks a candidate
 * counter by one per attempt and so hits exactly the periodicity above.
 * @param {number} key
 * @param {number} salt
 * @returns {number} 0–1
 */
export function dotHash(key, salt) {
	let h = (key ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
	return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The dot positions of one actor's bar: per band, a lattice of columns × rows
 * across the band's own width, each dot nudged off the lattice so the strip
 * reads as a crowd. `id` keys that nudge, so a row's dots are stable.
 *
 * Both sides of the rank handoff draw these exact points — the HTML row as one
 * path per band, the canvas as the spot each converging actor lands on — so
 * the frame the canvas settles into is the frame the panel then covers.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @param {number} width px
 * @param {number} id node id keying the jitter
 * @returns {{x: number, y: number}[][]} one array of dots per hop band
 */
export function hopDotSlots(fractions, width, id) {
	const rowH = RANK_BAR_H / RANK_DOT_ROWS;
	const r = RANK_DOT_D / 2;
	const jitterY = rowH * RANK_DOT_JITTER;
	return hopBandBoxes(fractions, width).map(({ x: x0, w: segW }, band) => {
		// at least one column: a band this narrow is one the min-width floor is
		// carrying, and it still owes the reader its colour
		const cols = Math.max(1, Math.round(segW / RANK_DOT_PITCH));
		const pitch = segW / cols;
		const jitterX = pitch * RANK_DOT_JITTER;
		const dots = [];
		for (let col = 0; col < cols; col++) {
			for (let row = 0; row < RANK_DOT_ROWS; row++) {
				const key =
					(id * 4 + band) * DOT_KEY_STRIDE + col * RANK_DOT_ROWS + row;
				// clamped to the band's own box: a jitter this wide is meant to spill
				// across cells, but spilling past the band would eat the gap that
				// separates the colours and clip against the strip's top and bottom
				dots.push({
					x: clamp(
						x0 + (col + 0.5) * pitch + (dotHash(key, 8) - 0.5) * jitterX,
						x0 + r,
						x0 + segW - r
					),
					y: clamp(
						(row + 0.5) * rowH + (dotHash(key, 9) - 0.5) * jitterY,
						r,
						RANK_BAR_H - r
					)
				});
			}
		}
		return dots;
	});
}

// fixed film-count x-scale shared by every films-scatter variant so dots only
// travel vertically when the y-metric changes. Floored at 5 films: below that
// the corpus is mostly one-and-done credits, a low-signal vertical smear on the
// left, so the axis starts here and thinner actors park off the left edge
// (alpha 0). It matches build-scrolly-nodes.js's FILM_MIN exactly — the node
// file carries the *whole* corpus from this count up, so every column of the
// plotted cloud is a full population rather than a sample.
export const FILM_MIN_SHOWN = 5;
const FILM_LOGS = rawNodes.nodes.map((n) => Math.log(Math.max(1, n[3])));
export const FILM_LOG_MIN = Math.log(FILM_MIN_SHOWN);
export const FILM_LOG_MAX = Math.max(...FILM_LOGS);
// inverts top50's log(films + 1) build transform back to a plain film count.
// The raw log value means nothing to a reader, so everything that surfaces
// top50 — the degScatter axis and its labels, the Gen Z breakdown — shows the
// de-logged count instead, and shares this so they all read the same number.
export const deLogFilms = (t) => Math.round(Math.exp(t) - 1);

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
// Simulation race (layouts/sim-race.js): the reader replays the 10,000 recorded
// simulation runs and watches each contender's win count climb. Every contender
// gets a line, so the lines account for all 10,000 runs between them.
// ---------------------------------------------------------------------------

/** one line per contender, in win order */
export const SIM_SERIES = story.genz.candidates.map((c) => c.id);
/** how many of the leaders carry a name beside their dot. Every line is the same
 * grey (see TRAIL_META), so a name is what makes a line followable — and 99
 * names down one edge is a wall of text rather than a legend. */
export const SIM_LABEL_N = 5;
/** the contenders whose line carries their name */
export const SIM_LABEL_IDS = SIM_SERIES.slice(0, SIM_LABEL_N);

/**
 * The Gen-Z race step's backdrop: a stratified sample of working actors spread
 * across the remoteness the contenders live on, so the camera's pan down lands
 * on a populated plot instead of an empty one. Built in the analysis repo and
 * already stripped of anyone another cast draws (see build-scrolly-nodes.js) —
 * the chart's one-writer-per-node rule means this list and RACE_IDS/SIM_SERIES
 * are disjoint by construction.
 *
 * Sorted, unlike SIM_SERIES: there is no rank among them and nothing labels one,
 * so the only thing an order has to be is stable.
 *
 * Named BACKDROP rather than FIELD because this file already owns a FIELD_*
 * vocabulary for something else entirely — the pull-back crowd (FIELD_IDS below,
 * fieldSpot, FIELD_ALPHA), the hop 1-4 actors the chapter card and hopBands
 * sort. Two unrelated "fields" on one chart module is the kind of collision that
 * reads fine until someone imports the wrong one.
 */
export const BACKDROP_IDS = Object.keys(story.backdropSeries)
	.map(Number)
	.sort((a, b) => a - b);

/**
 * The seven Gen-Z contenders the story picks out by name — the five likeliest
 * winners plus two from the remote end of the field, so the cloud reads as a
 * range rather than a shortlist.
 *
 * Declared here rather than in either chart because BOTH draw them: the films
 * scatter (`layouts/scatters.js`, where each also carries a hand-tuned label
 * side) and the race chart's Gen-Z step (`layouts/race.js`, where every name
 * sits to the right of its dot like every other race label). One list is what
 * makes "the same seven" true by construction instead of by two lists agreeing.
 *
 * Keyed by TMDB id deliberately, NOT by position in the win-sorted field: a
 * rebuild that reorders the candidates should throw in `idOf` rather than
 * silently rename the people the story is about.
 */
export const GENZ_NAMED_IDS = [
	idOf(56734), // Chloë Grace Moretz
	idOf(1767250), // Ariana Greenblatt
	idOf(1903874), // Maya Hawke
	idOf(1428070), // Isabela Merced
	idOf(2099497), // Fred Hechinger
	idOf(1590797), // Sadie Sink
	idOf(2034418) // Jacob Elordi
];

// ---------------------------------------------------------------------------
// Trails: polylines tweened by a second tweener (vertex morphing = object
// constancy for lines). Fixed slots, in order: one per race actor (RACE_IDS),
// the career trio, one per cohort career line, 1 reference rule.
// Every slot constant below is derived from those lengths, so the race cast and
// the cohort can grow without touching any index here.
// ---------------------------------------------------------------------------

export const TRAIL_POINTS = 48;
// vertices + alpha + highlight. The last channel (0-1) blends a line's stroke
// from its TRAIL_META colour toward INK and thickens it, exactly as edge slot 2
// does for links (see setEdge and ScrollyVisual's drawScene). It rides the
// buffer rather than being decided at draw time so the trail tweener
// interpolates it: a line that gains or loses the ink between two states
// crossfades instead of flipping.
export const TRAIL_STRIDE = TRAIL_POINTS * 2 + 2;
export const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);
/** @type {{ id: number|null, rgb: number[], width: number }[]} */
export const TRAIL_META = [
	// The race chart carries no hue at all: every line is the same grey at the
	// same width. The one actor set apart from the field is whoever LEADS at the
	// camera's right edge, and they are set apart in ink (the trail highlight
	// channel above, written per frame by writeRaceSweepFrame) — nobody is
	// identified BY a colour, one is identified as being in front. A per-actor
	// palette would in any case be unworkable with a cast of hundreds.
	...RACE_IDS.map((id) => ({ id, rgb: CROWD, width: 1 })),
	// career chapter: red hero trajectory, grey comparison lines (the dots are
	// blue marks — see layouts/career.js)
	{ id: SWEENEY, rgb: RED, width: 1.5 },
	{ id: DENIRO, rgb: CROWD, width: 1.5 },
	{ id: CHASE, rgb: CROWD, width: 1.5 },
	...story.careers.cohort.map(() => ({ id: null, rgb: CROWD, width: 1 })),
	// simulation race: one line per contender. Grey like the race chart and for
	// the same reason — emphasis is which lines the step labels, not a palette of
	// 99 hues
	...SIM_SERIES.map((id) => ({ id, rgb: CROWD, width: 1 })),
	// the Gen-Z step's backdrop field. Grey and 1px like everything else on that
	// chart — what sets it back is alpha, written per frame by the writer, not a
	// colour or a weight here
	...BACKDROP_IDS.map((id) => ({ id, rgb: CROWD, width: 1 })),
	{ id: null, rgb: CROWD, width: 1 } // reference rule (prediction diagonal, Gen Z number line)
];
export const TRAIL_SIZE = TRAIL_META.length * TRAIL_STRIDE;
export const RACE_SLOT = new Map(RACE_IDS.map((id, i) => [id, i]));
export const SWEENEY_SLOT = RACE_IDS.length;
export const DENIRO_SLOT = RACE_IDS.length + 1;
export const CHASE_SLOT = RACE_IDS.length + 2;
export const COHORT_SLOT = RACE_IDS.length + 3;
export const SIM_SLOT_BASE = COHORT_SLOT + story.careers.cohort.length;
/** slot -> contender, and the inverse of SIM_SERIES' index */
export const SIM_SLOT = new Map(
	SIM_SERIES.map((id, i) => [id, SIM_SLOT_BASE + i])
);
/**
 * The simulation block as a set, for the two charts that own it: the simulation
 * race and the race chart's Gen-Z step, which draw the SAME 99 actors and so
 * share one block of slots rather than allocating a second. Reusing them is what
 * lets a contender's trajectory line become their win-count climb four steps
 * later instead of two unrelated lines occupying two slots.
 */
export const SIM_TRAIL_SLOTS = new Set(SIM_SLOT.values());
export const BACKDROP_SLOT_BASE = SIM_SLOT_BASE + SIM_SERIES.length;
/** slot -> backdrop actor */
export const BACKDROP_SLOT = new Map(
	BACKDROP_IDS.map((id, i) => [id, BACKDROP_SLOT_BASE + i])
);
/** the backdrop block, owned by the one step that draws it */
export const BACKDROP_TRAIL_SLOTS = new Set(BACKDROP_SLOT.values());
export const RULE_SLOT = TRAIL_META.length - 1;

// ---------------------------------------------------------------------------
// Monotone-cubic smoothing (ported from the pudding-post race-chart). A
// Fritsch–Carlson monotone spline never overshoots the data between points, so
// a dot riding the curve never dips below/above the real values. The x control
// points are uniformly spaced within each interval (Bx(t) is linear in t), so a
// screen-x maps to an exact t and the curve can be sampled at any x directly.
// ---------------------------------------------------------------------------

/** monotone-cubic segments through `points`: one cubic [p0, c1, c2, p3] per interval */
export function monotoneSegments(points) {
	const n = points.length;
	if (n < 2) return [];
	// secant slopes between consecutive points
	const h = [];
	const s = [];
	for (let i = 0; i < n - 1; i++) {
		const dx = points[i + 1][0] - points[i][0];
		h.push(dx);
		s.push(dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx);
	}
	// tangents: endpoints take the adjacent secant; interior points use the
	// sign-aware bounded estimate that zeroes at extrema and caps magnitude
	const m = [s[0]];
	for (let i = 1; i < n - 1; i++) {
		const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
		m.push(
			(Math.sign(s[i - 1]) + Math.sign(s[i])) *
				Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0
		);
	}
	m.push(s[n - 2]);
	// one cubic per interval, control points a third of dx along each tangent
	const segs = [];
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		const dx = h[i] / 3;
		segs.push([
			[x0, y0],
			[x0 + dx, y0 + dx * m[i]],
			[x1 - dx, y1 - dx * m[i + 1]],
			[x1, y1]
		]);
	}
	return segs;
}

/** De Casteljau split of cubic [p0, c1, c2, p3] at t → { left, right } */
export function splitCubic(seg, t) {
	const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	const [p0, c1, c2, p3] = seg;
	const a = lerp(p0, c1);
	const b = lerp(c1, c2);
	const c = lerp(c2, p3);
	const d = lerp(a, b);
	const e = lerp(b, c);
	const f = lerp(d, e);
	return { left: [p0, a, d, f], right: [f, e, c, p3] };
}

/** curve y at data-x on monotone segments (Bx linear in t → exact t per segment) */
export function curveYAt(segs, x) {
	if (!segs.length) return null;
	const xa = segs[0][0][0];
	const xb = segs.at(-1)[3][0];
	const cx = Math.max(xa, Math.min(xb, x));
	let seg = segs[0];
	for (const s of segs) {
		if (cx <= s[3][0]) {
			seg = s;
			break;
		}
	}
	const x0 = seg[0][0];
	const x3 = seg[3][0];
	const t = x3 === x0 ? 0 : (cx - x0) / (x3 - x0);
	const u = 1 - t;
	return (
		u * u * u * seg[0][1] +
		3 * u * u * t * seg[1][1] +
		3 * u * t * t * seg[2][1] +
		t * t * t * seg[3][1]
	);
}

/**
 * resamples TRAIL_POINTS vertices uniformly in data-x over [x0, x1], reading y
 * off PRE-BUILT monotone segments, into trail slot t. Because the segments are
 * supplied (not rebuilt from a clipped subset here), the caller can pass segments
 * of the FULL series and sample any window without the window-edge tangents
 * snapping — the per-frame race sweep relies on this. `curveYAt` clamps a target
 * past the segments' x-range to the terminal value, so a window wider than the
 * data samples flat at the ends rather than extrapolating.
 */
export function sampleTrail(trails, t, segs, x0, x1, xScale, yScale, alpha) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		const target = x0 + ((x1 - x0) * k) / (TRAIL_POINTS - 1);
		trails[base + k * 2] = xScale(target);
		trails[base + k * 2 + 1] = yScale(curveYAt(segs, target));
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
}

/**
 * writes a polyline (data pairs → px via scales) into trail slot t, sampled along
 * the monotone-cubic curve of `pairs` so the 48 vertices land on a smooth line.
 * Thin wrapper over `sampleTrail` for callers holding raw pairs; a single data
 * point collapses the slot onto its position.
 */
export function setTrail(trails, t, pairs, xScale, yScale, alpha) {
	const segs = monotoneSegments(pairs);
	if (!segs.length) {
		collapseTrail(trails, t, xScale(pairs[0][0]), yScale(pairs[0][1]), alpha);
		return;
	}
	sampleTrail(
		trails,
		t,
		segs,
		pairs[0][0],
		pairs.at(-1)[0],
		xScale,
		yScale,
		alpha
	);
}

/**
 * Writes an EXPLICIT vertex list (already in px) into trail slot t, padding the
 * unused vertices onto the last point — so a line with fewer than TRAIL_POINTS
 * vertices ends where its data ends, the surplus piling up as zero-length
 * segments at the tip.
 *
 * The counterpart to `sampleTrail`, for a line that GROWS at its tip rather than
 * sliding under a camera: resampling a widening window puts every interior
 * vertex on different data each frame, so the line's real wobble slides
 * backwards through it and the whole thing shimmers. Vertices handed in here
 * stay exactly where the caller put them, frame after frame.
 */
export function setTrailPoints(trails, t, points, alpha) {
	const base = t * TRAIL_STRIDE;
	const last = points.length - 1;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		const [x, y] = points[Math.min(k, last)];
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
}

/** collapses trail slot t onto a point (line unspools from/retracts into a dot) */
export function collapseTrail(trails, t, x, y, alpha = 0) {
	const base = t * TRAIL_STRIDE;
	for (let k = 0; k < TRAIL_POINTS; k++) {
		trails[base + k * 2] = x;
		trails[base + k * 2 + 1] = y;
	}
	trails[base + TRAIL_POINTS * 2] = alpha;
	trails[base + TRAIL_POINTS * 2 + 1] = 0;
}

/**
 * The closing beat: a layout with every alpha taken to zero, so the tween
 * dissolves whatever the reader was looking at WHERE IT LIES instead of sliding
 * it off to some parking spot on its way out.
 *
 * A wrapper rather than a fresh empty buffer, and a shared one rather than a
 * copy per chapter: the story's last step has to dissolve whichever chart
 * precedes it, and that has changed once already.
 *
 * @param {LayoutFn} fn the layout to fade out
 * @returns {LayoutFn}
 */
export function dissolve(fn) {
	return function layoutDissolve(nodes, w, h, edges, params) {
		const { attrs, trails } = fn(nodes, w, h, edges, params);
		for (let i = 0; i < EDGE_BASE; i += STRIDE) attrs[i + 6] = 0;
		for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) attrs[i + 1] = 0;
		for (let t = 0; t < TRAIL_META.length; t++) {
			trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
		}
		// the buffers only: a layout's axes, block and callouts are FURNITURE, and
		// dropping them here is what empties the canvas. They have no alpha to
		// take down — they are HTML in the annotations layer — so an empty canvas
		// under a full set of axes is the one thing this beat must not leave.
		return { attrs, trails };
	};
}

/**
 * Sets trail slot t's ink (0-1). Every other trail writer ZEROES this channel,
 * so a slot can only carry ink while the writer that owns it keeps saying so —
 * which is what stops a chapter inheriting the previous one's emphasis in the
 * live buffer, where nothing is re-allocated between frames.
 */
export function setTrailHighlight(trails, t, hi) {
	trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2 + 1] = hi;
}

/** clip a [x, y][] series to [x0, x1], interpolating the cut ends on the curve */
export function clipSeries(pairs, x0, x1) {
	// cut-ends read off the monotone curve of the full series, so the clipped
	// endpoints (and the dot placed at series.at(-1)) sit on the same smooth line
	const segs = monotoneSegments(pairs);
	const out = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		if (x < x0) {
			const nxt = pairs[i + 1];
			if (nxt && nxt[0] > x0) {
				out.push([x0, curveYAt(segs, x0)]);
			}
			continue;
		}
		if (x > x1) {
			const prv = pairs[i - 1];
			if (prv && prv[0] < x1 && (!out.length || out.at(-1)[0] < x1)) {
				out.push([x1, curveYAt(segs, x1)]);
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
 * frame every intro-chapter layout hangs off (lone/networkIntro at full size,
 * hopSeed pulled back, see introPosition's `scale`).
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
 * Screen position of intro node k in the intro fit — the frame `lone` and
 * `networkIntro` draw the constellation in.
 *
 * `scale` pulls the camera back about the anchor: every other node collapses
 * toward Bacon while Bacon himself stays exactly where he was, so the one dot
 * the reader has been told is the centre never moves between the full-size
 * constellation and hopSeed's zoomed-out one.
 */
export function introPosition(k, w, h, scale = 1) {
	const { cx, cy, sx, sy } = introFrame(w, h);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx * scale, cy + (y - ay) * sy * scale];
}

/**
 * Hidden park spot for any node not placed by the current state: its position
 * on the distance-vs-films scatter (alpha 0), so it fades in where a later
 * scatter chapter will want it and rides one tween into place.
 */
export function parkHidden(attrs, n, w, h) {
	const [x, y] = scatterPosition(n, w, h);
	set(attrs, n.id, x, y, 2, CROWD, 0);
}

// ---------------------------------------------------------------------------
// The pull-back, and the crowd that arrives during it
//
// hopSeed backs the camera off the intro constellation about Bacon (see
// introPosition's `scale`) while a wider crowd of real actors fades in around
// it. The geometry lives here because two chapters need it: hop-bands draws the
// pulled-back frame, and the intro states have to park the same crowd where the
// pull-back would have left it, or stepping backwards drags the whole field
// across the canvas to their scatter spots instead of letting the camera push
// them back out.
// ---------------------------------------------------------------------------

// how far the camera pulls back: far enough that the crowd dots land at the 2px
// the scatter chapters draw the corpus at (and near hopBands' own 3px), so the
// step ends on marks the rest of the story already reads as "one of many"
// rather than on shrunken portraits
export const PULLBACK_DOT_R = 2;
export const PULLBACK_ZOOM = PULLBACK_DOT_R / NETWORK_INTRO_RADIUS[1];

/**
 * The crowd that arrives as the camera pulls back: every actor the corpus can
 * place at hop 1–4 — the exact set hopBands is about to sort into rows, so the
 * bands sort the crowd the reader just met rather than swapping it for a bigger
 * one. Unreachable actors (hop -1) stay out: they have no band to land in.
 *
 * The intro fifteen are excluded: they are drawn by the constellation writer,
 * and including them would drag them out of the graph into the field.
 */
const INTRO_SET = new Set(INTRO_IDS);
export const FIELD_IDS = rawNodes.nodes.reduce(
	(ids, n, id) =>
		n[2] >= 1 && n[2] <= 4 && !INTRO_SET.has(id) ? (ids.push(id), ids) : ids,
	/** @type {number[]} */ ([])
);

// the constellation's own crowd alpha: by the end of the pull-back the fifteen
// are meant to be indistinguishable members of the field, which is the whole
// point of the beat — only Bacon stays darker and larger.
//
// Well under 1, because the galaxy is meant to read as deep space rather than
// as a page of dots: faint enough that the display type on a chapter card sits
// in front of it rather than in it, and that the field the camera pulls back
// into reads as depth. Every galaxy writer takes its alpha from here — the
// crowd (writeFieldCrowd), the fifteen greying into it (chapters.js) and the
// closing chart's cast (race.js) — so they cannot drift apart.
//
// The field's MEAN rather than its flat value: every writer spreads it about
// this number by the dot's depth (depthFade), which is what makes the sky read
// as a volume standing still as well as moving.
export const FIELD_ALPHA = 0.35;
// How the field opens, all measured as shares of the camera's travel rather
// than as clocks, so a scrubbed or interrupted pull-back stays consistent with
// itself. The edge ramp alone cannot hold the opening frame clean: a dot has to
// be authored a third of the canvas out from Bacon before full zoom pushes it
// off the edge, which leaves a ring of white between the constellation and the
// nearest field dot. Gating on the camera instead lets a dot be authored right
// up against the constellation — the ones already in frame simply fade up where
// they stand while the outer ones still cross in.
//
// The reader gets the constellation alone for a beat (HOLD) so the camera is
// visibly pulling back off Bacon's network before anything else arrives; then
// the crowd trickles in dot by dot over STAGGER rather than arriving as one
// sheet, each fading up over SHARE. HOLD + STAGGER + SHARE stays under 1 so the
// last dot lands before the camera stops.
//
// SKEW back-loads the trickle: a dot's slot is its hash raised to this power, so
// spreading arrivals evenly over STAGGER is not what the eye reads as gradual.
// A field this size looks full long before it is — the first two thousand dots
// already read as a crowd — so an even rate spends its whole second half adding
// dots nobody can see arriving, and the visible part of the build is over in a
// blink. Below 1 the early arrivals are sparse and countable and the rate climbs
// from there, which tracks how the crowd actually reads.
const FIELD_OPEN_HOLD = 0.12;
const FIELD_OPEN_STAGGER = 0.75;
const FIELD_OPEN_SHARE = 0.08;
const FIELD_OPEN_SKEW = 0.5;
// Keep-out disc around Bacon. The field is authored blind across the whole plot
// rect, and Bacon's fitted spot is the exact horizontal centre of it at every
// viewport width (the baked intro layout puts the anchor at w/2), so a dot whose
// x-hash is ~0.5 sits on his column on every screen — several of the field do,
// and they land under the one dot the reader has been told to watch. Anything
// authored inside the disc is moved out into the annulus just beyond it, on an
// angle and a radius of its own: at this field size a whole handful gets moved,
// and snapping them all to the disc edge would ring Bacon in evenly-spaced dots.
// Sized in constellation units and scaled with the camera, so the gap the reader
// sees is the same at every scale; enforcing it at the landing covers the whole
// leg, since a dot's distance from Bacon only shrinks as the camera pulls back.
//
// It is enforced where a dot ENTERS the flow, which is a weaker guarantee than
// it used to be: the flow carries dots outward from the canvas centre, and Bacon
// sits about 30px above that, so a ray can cross the disc on its way out. Counted
// rather than assumed — 1 to 4 of the twelve thousand are inside it at any
// moment, transiently, against a Bacon drawn opaque at five times their radius.
// The systematic version of this problem is what the disc is for (a dot whose
// x-hash is ~0.5 parked on his column at every viewport, on every frame); a
// handful drifting through is not it, and chasing them would mean deflecting
// dots mid-flight, which is a visible jump to fix an invisible one.
const FIELD_KEEPOUT_GAP = 12;
const FIELD_KEEPOUT =
	(NETWORK_INTRO_RADIUS[0] + NETWORK_INTRO_RADIUS[1] + FIELD_KEEPOUT_GAP) *
	PULLBACK_ZOOM;

/**
 * Writes the field into `attrs` at the pull-back's live `scale` (1 = full zoom,
 * PULLBACK_ZOOM = landed), leaving every other slot alone.
 *
 * Each dot is authored at the spot it holds when the camera lands, and its
 * position at any wider scale is that spot pushed out from Bacon — the point the
 * pull-back turns about — so the field contracts into frame exactly as the
 * constellation does, and expands back out of it on the way back. Radius follows
 * the constellation's crowd rather than the landing size, so a dot arrives at
 * whatever the graph's dots are at that moment instead of popping in already
 * shrunk. Opacity is geometry and camera only — the trickle-in is a per-dot
 * offset into the camera's own travel, not a clock — so the same call serves the
 * static frame and every animated one, and a scrub lands on the same frame the
 * animation would have drawn at that scale.
 */
/** the field's rect: the plot area, which is the whole canvas above the step card */
const fieldBox = (w, h) => [MARGIN, w - MARGIN, MARGIN, plotBottom(h)];

/**
 * The chapter card's rect: the whole bled canvas, edge to edge and from the top
 * of the screen down. A card carries no chart and no step prose, so nothing
 * needs the margins or the bottom 40% that `fieldBox` keeps clear — the crowd
 * is the picture, and boxing it into the column reads as a rectangle of dots
 * rather than a sky.
 *
 * `bleed` is how far the canvas extends past the 700px reading column on each
 * side, and TITLE_BAND how far it extends above the box (see ScrollyVisual's
 * render transform), so negative x, x past `w` and negative y are all on screen.
 * Everything else keeps `fieldBox`: the pull-back and hopBands share the column,
 * and widening theirs would spread the bands' rain across the whole viewport
 * too.
 *
 * The rect is then inflated past the canvas by GALAXY_SPREAD, and the flow
 * carries dots out past that again, so most of the crowd is off screen at any
 * moment and what remains on it is a thin scatter rather than a solid ground of
 * dots. Spread is the only sparsity lever available: the crowd cannot lose
 * members, because hopBands sorts this exact set and a dot missing from the sky
 * would have no row to fall into. Dots off the canvas cost a fill the context
 * clips and nothing else.
 */
// How much bigger than the canvas dots ENTER the sky across, each way from its
// centre. Lower than it reads, because entry is the far plane and the flow then
// carries a dot out by up to SKY_FAR / SKY_NEAR: averaged over the volume that
// magnification spreads the crowd about a further half again, so this is the
// number that leaves the same share of it on the canvas as a flat field at 2.2
// did. Retune it against the on-canvas count, not by eye on one frame — the
// whole point of the spread is how much of the crowd is off screen at any moment.
export const GALAXY_SPREAD = 1.46;

/**
 * How far the canvas ELEMENT extends past the reading column, per side, in the
 * CSS pixels every layout is authored in. Two numbers rather than one because
 * the column is only centred in the viewport while the prose sits over it: in
 * the side-by-side layout the column is a half of the screen and the canvas
 * reaches much further out on one side than the other.
 *
 * Only five places do arithmetic on it — `galaxyCentre`, `galaxyBox`,
 * `targetHolds` in galaxy-highlight, and ScrollyVisual's render transform and
 * clear rect. Every other layout takes it as an opaque value and forwards it,
 * which is why widening it from a scalar to a pair costs those five and nothing
 * else.
 * @typedef {{ l: number, r: number }} Bleed
 */
/** @type {Bleed} */
export const NO_BLEED = { l: 0, r: 0 };

/**
 * The middle of the bled canvas — the point `galaxyBox` is struck about, and so
 * the point the sky spreads out from. It is also the flow's VANISHING POINT: the
 * crowd streams outward from here, and it has to be the same centre the field
 * was authored about or the sky drifts off to one side as it flies. Factored out
 * rather than written twice for that reason.
 *
 * It is the middle of the SCREEN, not of the column, and stays so when the two
 * differ: a chapter card fills the viewport, so a vanishing point sitting in the
 * half the charts use would fly the sky off toward one edge.
 * @returns {[number, number]}
 */
export const galaxyCentre = (w, h, bleed = NO_BLEED) => [
	(-bleed.l + (w + bleed.r)) / 2,
	(-TITLE_BAND + h) / 2
];

export const galaxyBox = (w, h, bleed = NO_BLEED) => {
	const [cx, cy] = galaxyCentre(w, h, bleed);
	const kx = ((w + bleed.l + bleed.r) / 2) * GALAXY_SPREAD;
	const ky = ((h + TITLE_BAND) / 2) * GALAXY_SPREAD;
	return [cx - kx, cx + kx, cy - ky, cy + ky];
};

// ---------------------------------------------------------------------------
// The sky's third dimension, and the flow through it.
//
// The crowd is a volume, not a plane, and the camera moves forward through it
// forever: a dot enters at the far plane, streams out from the vanishing point
// as it comes toward the reader, passes the camera and enters again. That is
// what reads as flying THROUGH something rather than looking at it — a lateral
// sway gives parallax but nothing ever comes past you.
//
// Everything below is a pure function of (id, t). It has to be: the static
// layouts are the flow's own t = 0, and `hopBands` reads the flow's LIVE frame
// to know what column a dot leaves the chapter card in. One definition, read by
// the per-frame writer and by the layouts alike.
//
// Depths are in FOCAL units, so a dot's distance from the vanishing point is its
// entry offset times SKY_FAR / z — 1 at the far plane, SKY_FAR / SKY_NEAR at the
// near one. That magnification is the whole of the motion.
// ---------------------------------------------------------------------------

export const SKY_NEAR = 1;
export const SKY_FAR = 4;
const SKY_SPAN = SKY_FAR - SKY_NEAR;
const SKY_MID = (SKY_NEAR + SKY_FAR) / 2;

/**
 * How long one dot takes to cross the whole volume, far plane to near plane.
 * The story's main feel knob: at this length a dot out near the canvas edge
 * moves 15–25px a second, which reads as travel without turning the sky a
 * chapter title sits in front of into weather.
 */
export const FLIGHT_CYCLE_MS = 26000;
// The share of that trip spent fading in at the far plane and out at the near
// one. A dot has to cross the whole volume and start again, and that wrap is a
// jump — from the biggest and brightest a dot ever is, back to the smallest and
// faintest — so it happens behind a fade at both ends rather than in the open.
// The same window is applied to the static field (see writeFieldCrowd), which is
// what keeps the loop's first tick identical to the frame it joins.
//
// Exported because the highlight beat has to know it: an actor picked while it is
// inside either ramp would be named as it fades, so `galaxy-highlight.js` keeps
// its cast and its spoke targets clear of both ends of the trip.
export const FLIGHT_FADE = 0.12;

/**
 * The flow's clock, in ms since the running flight began — the ONE piece of live
 * state the sky publishes. `makeFlight` writes it every frame it draws; a layout
 * that receives the crowd off a galaxy state reads it to place dots where the
 * sky actually has them rather than where they rest.
 *
 * Its initial value is zero, which is not a fallback but the truth: before any
 * flight has run the sky IS at t = 0, which is where every static galaxy layout
 * is authored, so a cold load or a reduced-motion read gets the frame it should.
 *
 * A layout reading this is the one thing in the story that is not a pure
 * function of (state, w, h, bleed, params), so the render layer drops its layout
 * cache whenever a flight stops — see ScrollyVisual's stopSweep, which is also
 * what fixes the moment a departing state is struck against.
 */
export const skyFlight = { t: 0 };

/** where in its trip a dot starts the story — its offset into the flow's clock */
const skyPhase = (id) => hash01(id, 21);
/** a dot's place in its trip at time t: 0 just entered at the far plane, 1 about to pass the camera */
export function skyFrac(id, t) {
	const u = skyPhase(id) + t / FLIGHT_CYCLE_MS;
	return u - Math.floor(u);
}
/** how far out from the vanishing point a dot at depth z is carried */
export const skyMag = (z) => SKY_FAR / z;
/** fades a dot up as it enters at the far plane and down as it passes the camera */
export const flightWindow = (frac) =>
	Math.min(1, frac / FLIGHT_FADE, (1 - frac) / FLIGHT_FADE);

/**
 * Where one actor stands through the sky's depth when the field is at rest —
 * the flow's own t = 0, so the static layouts and the flight cannot disagree
 * about the volume. Uniform over [SKY_NEAR, SKY_FAR], because a dot crosses the
 * volume at a constant rate and the phases are uniform.
 */
export const fieldDepth = (id) => SKY_FAR - skyFrac(id, 0) * SKY_SPAN;

// Aerial perspective, referenced to the middle of the volume so the field keeps
// the overall weight `FIELD_ALPHA` and `PULLBACK_DOT_R` give it and only spreads
// about it. Both are the SAME law — a square root of the depth ratio — for two
// reasons: a dot's size and brightness have to change at the same rate as it
// comes toward the reader or it reads as swelling rather than approaching, and
// one `Math.sqrt` then serves both in a loop that runs over twelve thousand dots
// a frame. A softer law than the 1/z a true projection would use for size: at
// full strength the far plane is a quarter of the near one, which on a light
// ground takes the back of the sky to nothing and leaves a field of foreground
// dots.
const SKY_DEPTH_GAMMA = 0.5;

/** a dot's radius multiplier at depth z — about 1.6x at the near plane, 0.8x at the far */
export const depthSize = (z) => (SKY_MID / z) ** SKY_DEPTH_GAMMA;

// A dot's ink goes as radius squared times alpha, and that power of (MID / z) is
// convex, so spreading the field about the middle of the volume ADDS weight even
// though both multipliers average to about 1 — a quarter again as much ink as
// the flat field, which is the opposite of what a sky a title sits in front of
// wants. The entry/exit window takes some back. So the fade carries both means
// and divides them out: the sky is exactly as heavy as FIELD_ALPHA and the
// crowd's radius make it, only now distributed through the depth.
//
// Derived rather than written down — the mean of (MID / z)^p over a uniform z,
// closed form, times the window's own mean — so retuning any of it cannot leave
// a stale number behind.
const SKY_INK_POWER = 3 * SKY_DEPTH_GAMMA;
const SKY_INK_MEAN =
	((SKY_MID ** SKY_INK_POWER *
		(SKY_FAR ** (1 - SKY_INK_POWER) - SKY_NEAR ** (1 - SKY_INK_POWER))) /
		((1 - SKY_INK_POWER) * SKY_SPAN)) *
	(1 - FLIGHT_FADE);

/** a dot's alpha multiplier at depth z — about 1.4x at the near plane, 0.7x at the far */
export const depthFade = (z) => (SKY_MID / z) ** SKY_DEPTH_GAMMA / SKY_INK_MEAN;

/**
 * Where one actor ENTERS the volume on its `cycle`-th trip through — a uniform
 * spot in the sky's box, clear of Bacon at the moment it enters (see
 * FIELD_KEEPOUT, and the note there on what the flow does to that guarantee),
 * which the magnification then carries outward. Cycle 0 is the resting field, so
 * this is also what authors the static sky.
 *
 * `dotHash` rather than `hash01`: the cycle walks the salt by one on every trip,
 * and stepping a sine hash's input by a constant steps its phase by a constant —
 * a dot would enter on a slow march across the sky instead of somewhere new.
 *
 * @returns {[number, number]}
 */
function entrySpot(id, cycle, box, bx, by) {
	const [x0, x1, y0, y1] = box;
	const fx = x0 + dotHash(id, cycle * 2) * (x1 - x0);
	const fy = y0 + dotHash(id, cycle * 2 + 1) * (y1 - y0);
	if (Math.hypot(fx - bx, fy - by) >= FIELD_KEEPOUT) return [fx, fy];
	const a = dotHash(id, cycle * 2 + 0x40000) * Math.PI * 2;
	const d = FIELD_KEEPOUT * (1 + dotHash(id, cycle * 2 + 0x80000));
	return [bx + Math.cos(a) * d, by + Math.sin(a) * d];
}

/**
 * Where one actor stands in the flow at time `t` — the single definition of a
 * field dot's position, so anything else placing the same crowd (the chapter
 * card's universe, `hopBands` reading the column a dot leaves the card in) lands
 * on the identical frame rather than one that merely looks the same. A pixel of
 * drift between them would twitch the whole field on a step change.
 *
 * `box` is the rect the crowd ENTERS across, defaulting to the plot area. The
 * chapter card passes `galaxyBox` to spread the same dots over the whole screen;
 * every other caller takes the default, so the pull-back and hopBands stay
 * pixel-identical. Because both boxes are struck about the same centre and the
 * magnification is about that centre too, one is exactly the other contracted —
 * which is what `skyToColumn` trades on.
 *
 * @returns {[number, number]}
 */
export function flowSpot(id, w, h, box, t) {
	const [x0, x1, y0, y1] = box;
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	const u = skyPhase(id) + t / FLIGHT_CYCLE_MS;
	const cycle = Math.floor(u);
	const m = skyMag(SKY_FAR - (u - cycle) * SKY_SPAN);
	const [ex, ey] = entrySpot(id, cycle, box, bx, by);
	return [cx + (ex - cx) * m, cy + (ey - cy) * m];
}

/**
 * Where one actor stands when the pull-back has landed: the flow at rest.
 * @returns {[number, number]}
 */
export function fieldSpot(id, w, h, box = fieldBox(w, h)) {
	return flowSpot(id, w, h, box, 0);
}

/**
 * Where one actor stands on the chapter card — `fieldSpot` for the crowd, and
 * for the intro fifteen the place hopSeed's landed camera already has them: the
 * card holds the constellation's geometry and changes only how the dots are
 * drawn, so the fifteen blend into the crowd where they stand instead of flying
 * out across the plot to scatter spots of their own. They are the one part of
 * the sky that is NOT in the flow — a constellation streaming past the reader
 * would stop being a diagram — so they simply stand in front of it.
 *
 * `box` is the rect the crowd is authored across, exactly as on `fieldSpot`, and
 * defaults the same way. The fifteen ignore it: they stand where hopSeed's
 * landed camera left them whichever box the crowd is spread across.
 *
 * @returns {[number, number]}
 */
export function cardSpot(id, w, h, box = fieldBox(w, h)) {
	return INTRO_SET.has(id)
		? introPosition(id, w, h, PULLBACK_ZOOM)
		: fieldSpot(id, w, h, box);
}

/**
 * @param {Set<number>} [skip] ids to leave untouched — a caller drawing some of
 * these ids itself elsewhere in the same frame, whose position/alpha this
 * writer would otherwise overwrite with a fieldSpot placement
 */
export function writeFieldCrowd(
	attrs,
	w,
	h,
	scale,
	box = fieldBox(w, h),
	skip
) {
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	const k = scale / PULLBACK_ZOOM;
	// how far through the pull-back the camera is: 0 at full zoom, 1 at landing
	const travel = (1 - scale) / (1 - PULLBACK_ZOOM);
	const r = NETWORK_INTRO_RADIUS[1] * scale;
	for (const id of FIELD_IDS) {
		if (skip?.has(id)) continue;
		const [fx, fy] = fieldSpot(id, w, h, box);
		const x = bx + (fx - bx) * k;
		const y = by + (fy - by) * k;
		// this dot's own slot in the trickle: the hold, plus its place in the stagger
		const start =
			FIELD_OPEN_HOLD + hash01(id, 14) ** FIELD_OPEN_SKEW * FIELD_OPEN_STAGGER;
		const opening = Math.max(
			0,
			Math.min(1, (travel - start) / FIELD_OPEN_SHARE)
		);
		// depth rides the camera's radius rather than replacing it, so the crowd
		// still arrives at whatever size the constellation's dots are at that
		// moment — it is spread about that size, not pinned to one of its own.
		// The entry/exit window rides alpha for the same reason it does in the
		// flight: this frame IS the flow's t = 0, so a dot part-way through
		// entering has to be part-way faded here too or the loop's first tick
		// would brighten it.
		const d = fieldDepth(id);
		set(
			attrs,
			id,
			x,
			y,
			r * depthSize(d),
			CROWD,
			FIELD_ALPHA * depthFade(d) * flightWindow(skyFrac(id, 0)) * opening
		);
	}
}

/**
 * How far a sky pixel travels when the crowd funnels back into the reading
 * column — the ratio between `galaxyBox` and the plot's own `fieldBox`, so the
 * handoff off a chapter card is a uniform contraction.
 *
 * The two boxes share a centre only while the column is centred in the viewport.
 * Side by side with the prose they do not, and the contraction becomes that same
 * scale about the sky's centre followed by a translation onto the column's
 * (`departureColumn` applies both). The commute survives it: the flow's
 * magnification `m` is struck about the sky's centre `c`, so contracting then
 * translating gives `s·m·(p − c) + f`, and flowing a contracted dot about the
 * column's centre `f` gives `m·(s·(p − c) + f − f) + f` — the same point. A
 * dot's live sky position put through this is still exactly where that dot would
 * be if the whole flow had been authored in the column.
 */
export function skyToColumn(w, h, bleed) {
	const [x0, x1] = galaxyBox(w, h, bleed);
	const [cx0, cx1] = fieldBox(w, h);
	return (cx1 - cx0) / (x1 - x0);
}

/**
 * Is this one of the intro fifteen — the exception `cardSpot` already makes, and
 * the one the contraction above has to make too? They stand at
 * `introPosition(PULLBACK_ZOOM)` in both boxes and are outside the flow
 * entirely, so nothing about them funnels when the sky does.
 */
export const isIntroActor = (id) => INTRO_SET.has(id);

// ---------------------------------------------------------------------------
// The galaxy's flight: the per-frame half of the flow above.
//
// The camera advances forever, so a dot's trip through the volume has an end —
// it passes the camera and starts again at the far plane. That wrap is the one
// thing this has to hide, and it hides it twice over: behind `flightWindow`,
// which takes the dot to nothing at both ends of its trip, and by the fact that
// a dot at the near plane is SKY_FAR / SKY_NEAR times further out than it
// entered, so most wraps happen off the canvas entirely.
//
// The base is still rebuilt from the state's own static layout, and the writer
// still touches only its own slots — but unlike a drift it does not offset that
// base, it recomputes the flow from it. What makes t = 0 exact is that the
// static layout IS the flow at t = 0 (see fieldSpot), so the first tick
// reproduces the frame the arrival landed on rather than nudging it.
// ---------------------------------------------------------------------------

/**
 * The flight over one galaxy state. Every state that rests on the sky shares
 * this one writer, so the motion cannot differ between the pull-back, the
 * chapter cards and the outro.
 *
 * `layoutFn` is the state's OWN static layout, rebuilt here with the same
 * `bleed` the arrival was built with — that rebuild is what makes the base the
 * frame the tween landed on, and a different bleed would snap the whole sky
 * inward on settle. `ids` is who flies: the crowd everywhere, plus the intro
 * fifteen on a card, where they have stopped being a diagram and joined it.
 *
 * A dot's size and alpha follow its depth every frame, because a thing coming
 * toward you grows and darkens and that is most of what makes the motion read as
 * approach. Both take the same square root of the depth ratio, so the loop
 * spends one `Math.sqrt` on the pair; the entry spot is only re-drawn on the
 * frames a dot actually wraps, which across the whole field is a few hundred
 * hashes a second rather than twelve thousand a frame.
 *
 * The FIRST trip is flown on the base frame, not on a hashed entry spot: a dot's
 * entry offset is read back off whatever the static layout put it at, divided by
 * the magnification its resting depth implies. That is what makes t = 0 exact
 * for dots the flow did not author — the intro fifteen standing where hopSeed's
 * camera left them on a card, the closing chart's cast greyed in where the
 * camera found them — and it keeps this writer's one job the same as the drift's
 * before it: take the frame the arrival landed on and move it.
 *
 * Radius and alpha are taken from the crowd's landed constants rather than read
 * back, which is exact because an ambient only ever starts at `settle()`: by
 * then every flown dot is at PULLBACK_DOT_R and FIELD_ALPHA, the pull-back's
 * trickle is over and the outro's cast has finished greying in.
 *
 * @param {LayoutFn} layoutFn
 * @param {number[]} ids
 * @returns {import("./states.js").AmbientAnim["frames"]}
 */
export function makeFlight(layoutFn, ids) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED) => {
		const { attrs: base } = layoutFn(nodes, w, h, edges, params, bleed);
		const box = galaxyBox(w, h, bleed);
		const [cx, cy] = galaxyCentre(w, h, bleed);
		const [bx, by] = introPosition(ANCHOR_ID, w, h);
		const n = ids.length;
		const at = new Int32Array(n);
		const phase = new Float64Array(n);
		// the entry offset of the trip a dot is currently on, and which trip that
		// is — re-drawn only on the frame the dot wraps
		const ex = new Float32Array(n);
		const ey = new Float32Array(n);
		const cyc = new Int32Array(n);
		for (let k = 0; k < n; k++) {
			const id = ids[k];
			const i = id * STRIDE;
			const p = skyPhase(id);
			// the magnification the base frame already stands at
			const m0 = skyMag(SKY_FAR - p * SKY_SPAN);
			at[k] = i;
			phase[k] = p;
			cyc[k] = 0;
			ex[k] = (base[i] - cx) / m0;
			ey[k] = (base[i + 1] - cy) / m0;
		}
		// size and alpha are a ratio to the middle of the volume; the loop wants it
		// as a multiplier on 1 / sqrt(z)
		const ref = Math.sqrt(SKY_MID);
		const alphaRef = (FIELD_ALPHA * ref) / SKY_INK_MEAN;
		const sizeRef = PULLBACK_DOT_R * ref;
		const invFade = 1 / FLIGHT_FADE;
		return (attrs, _trails, t) => {
			skyFlight.t = t;
			const march = t / FLIGHT_CYCLE_MS;
			for (let k = 0; k < n; k++) {
				const u = phase[k] + march;
				const c = u | 0;
				if (c !== cyc[k]) {
					cyc[k] = c;
					const [nx, ny] = entrySpot(ids[k], c, box, bx, by);
					ex[k] = nx - cx;
					ey[k] = ny - cy;
				}
				const frac = u - c;
				const z = SKY_FAR - frac * SKY_SPAN;
				// one divide and one square root serve position, size and alpha
				const q = 1 / Math.sqrt(z);
				const i = at[k];
				const m = SKY_FAR * q * q;
				attrs[i] = cx + ex[k] * m;
				attrs[i + 1] = cy + ey[k] * m;
				attrs[i + 2] = sizeRef * q;
				attrs[i + 6] =
					alphaRef * q * Math.min(1, frac * invFade, (1 - frac) * invFade);
			}
		};
	};
}

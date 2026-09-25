import story from "$data/scrolly-story.json";
import rawNodes from "$data/scrolly-nodes.json";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import { SLJ, CAGE, idOf } from "../cast.js";
import { CROWD, GREEN, RED } from "../palette.js";
import { MARGIN, plotBottom, lin } from "../plot.js";
import {
	scatterPosition,
	deLogFilms,
	filmAxisTicks,
	FILM_MIN_SHOWN,
	SCATTER_PAD
} from "../scatter-scales.js";
import {
	SEARCH_DOT_R,
	SEARCH_RGB,
	searchedId,
	withSearchLabel,
	withSearchParams
} from "../search.js";

// ---------------------------------------------------------------------------
// Films scatters: shared log-films x-axis, swappable y metric. Non-participants
// (missing metric) hold their distance-scatter spot at alpha 0 so metric swaps
// read as vertical travel, not churn.
// ---------------------------------------------------------------------------

/**
 * @param {Object} cfg
 * @param {(n: import("../nodes.js").ActorNode) => number|null} cfg.yOf
 * @param {boolean} [cfg.invert] smaller value = higher up (avg-distance charts)
 * @param {number} [cfg.tickStep] y ticks at even steps of the metric (default 0.5)
 * @param {number[]} [cfg.ticks] y ticks at these raw metric values instead of even steps; any outside the domain are dropped
 * @param {Map<number, { rgb: number[], r: number, alpha?: number }>} [cfg.highlights]
 * @param {(t: number) => string} [cfg.labelOf] formats a y tick's raw value; default 1dp of the raw value
 * @param {number} [cfg.floor] raises the y-domain's lower bound past the data minimum; actors below it clamp to the floor, dimmed, same as anyone past vMax
 * @param {number} [cfg.ceil] raises the y-domain's upper bound past the data maximum, widening headroom above the highest actor without clamping anyone
 */
function filmsScatter(nodes, w, h, cfg) {
	const attrs = new Float64Array(ATTR_SIZE);
	const values = nodes.map((n) => cfg.yOf(n));
	const [vMin, vMax] = scatterDomain(nodes, values, cfg);
	const pad = (vMax - vMin) * SCATTER_PAD;
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const yS = cfg.invert
		? (v) => lin(v, vMin - pad, vMax + pad, top, bottom)
		: (v) => lin(v, vMin - pad, vMax + pad, bottom, top);
	for (const n of nodes) {
		const hi = cfg.highlights?.get(n.id);
		placeScatterDot(attrs, n, values[n.id], hi, w, h, yS, vMin, vMax);
	}
	return {
		attrs,
		axes: {
			xBase: bottom + 10,
			x: filmAxisTicks(w),
			y: scatterTicks(vMin, vMax, cfg, yS)
		}
	};
}

/**
 * The y domain, from the SHOWN subset only — sub-threshold actors' long tail
 * would stretch the domain and squash the plotted cloud — then widened by the
 * config's floor and ceiling.
 */
function scatterDomain(nodes, values, cfg) {
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		const v = values[n.id];
		if (v == null || n.films < FILM_MIN_SHOWN) continue;
		vMin = Math.min(vMin, v);
		vMax = Math.max(vMax, v);
	}
	if (cfg.floor != null) vMin = Math.max(vMin, cfg.floor);
	if (cfg.ceil != null) vMax = Math.max(vMax, cfg.ceil);
	return [vMin, vMax];
}

/** a dot's mark: the highlight's own radius, colour and alpha, or the crowd's */
const dotStyle = (hi) =>
	hi
		? { r: hi.r ?? 2, rgb: hi.rgb ?? CROWD, alpha: hi.alpha ?? 1 }
		: { r: 2, rgb: CROWD, alpha: 0.3 };

/**
 * One actor on the scatter. Only actors at or above the film floor are plotted
 * (see FILM_LOG_MIN); everyone else — and anyone missing the y-metric — holds
 * their scatter spot at alpha 0. Highlighted actors are always drawn, unless
 * the metric is missing (nothing to plot); a value past the domain clamps to
 * its edge, dimmed.
 */
function placeScatterDot(attrs, n, v, hi, w, h, yS, vMin, vMax) {
	const [sx, sy] = scatterPosition(n, w, h);
	if (v == null || (n.films < FILM_MIN_SHOWN && !hi)) {
		set(attrs, n.id, sx, sy, 2, CROWD, 0);
		return;
	}
	const clamped = v < vMin || v > vMax;
	const { r, rgb, alpha } = dotStyle(hi);
	set(
		attrs,
		n.id,
		sx,
		yS(Math.min(vMax, Math.max(vMin, v))),
		r,
		rgb,
		alpha * (clamped ? 0.35 : 1)
	);
}

// y ticks at the config's own values, else at even metric steps; no gridlines
function scatterTicks(vMin, vMax, cfg, yS) {
	const labelOf = cfg.labelOf ?? ((t) => t.toFixed(1));
	return tickValues(vMin, vMax, cfg).map((t) => ({
		pos: yS(t),
		label: labelOf(t)
	}));
}

function tickValues(vMin, vMax, cfg) {
	if (cfg.ticks) return cfg.ticks.filter((t) => t >= vMin && t <= vMax);
	const step = cfg.tickStep ?? 0.5;
	const values = [];
	for (let t = Math.ceil(vMin / step) * step; t <= vMax; t += step) {
		values.push(t);
	}
	return values;
}

/**
 * The reader's own actor, folded into whatever the step was already marking.
 * Added LAST so it wins a collision: if they searched for a dot the step
 * already singles out, the mark that answers their own question is the one that
 * should be on it. Copies rather than mutates — two of the three callers pass a
 * module-level map.
 */
const withSearch = (highlights, params) => {
	const id = searchedId(params);
	if (id == null) return highlights;
	return new Map(highlights).set(id, { rgb: SEARCH_RGB, r: SEARCH_DOT_R });
};

const avgScatter = (nodes, w, h, highlights, params) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.avgDistance,
		invert: true, // lower average distance = better connected = up
		highlights: withSearch(highlights, params)
	});

// by tmdb id, not QUIZ_IDS position: Portman/Kendrick are the worked example
// for scatterCenters/degScatter regardless of whether
// they're one of the quiz pairs, and this stays correct across data rebuilds
export const PORTMAN = idOf(524);
export const KENDRICK = idOf(84223);

// quiz pairs exclude Portman/Kendrick — they're the dedicated worked example,
// not a quiz question
export const QUIZ_PAIRS = story.quiz.filter(
	(p) => ![p.a, p.b].includes(PORTMAN) && ![p.a, p.b].includes(KENDRICK)
);
export const QUIZ_IDS = QUIZ_PAIRS.flatMap((p) => [p.a, p.b]);

const rankOf = (id) => rawNodes.nodes[id][5];

/**
 * The closer-to-the-center actor in a quiz pair: the lower corpus rank wins,
 * which is the same order the chart plots them in (rank IS the sort on
 * avgDistance), so the answer can never disagree with the dot heights the
 * reader is reading it off.
 *
 * The ONE place that answer is decided. PairQuiz marks its chips from it,
 * `layoutScatterQuiz` below colours the landed dots from it, and the analytics
 * write reports it — three consumers, one rule. It lives here rather than in
 * states.js beside `nodeRank` because states.js imports QUIZ_IDS from this
 * module, so the other direction is a cycle.
 */
export const quizWinner = (pair) =>
	rankOf(pair.a) < rankOf(pair.b) ? pair.a : pair.b;

// single-subject highlight discipline (prototype): exactly one ringed subject
// per state, no supporting-cast dots, no on-canvas callouts — the facts live
// in the step prose. SLJ takes the default red highlight.

/** @type {import("../layout-types.js").LayoutFn} */
const layoutScatterCenters = (nodes, w, h, _edges, params) => {
	// the pair step hands the subject over to Portman and Kendrick — they are
	// the two extremes the prose points at, so SLJ drops back into the cloud.
	// Each takes the colour their costar group wears on the zoom step that
	// follows, so the reader carries the pairing across into it.
	if (params?.showPair) {
		return avgScatter(
			nodes,
			w,
			h,
			new Map([
				[PORTMAN, { rgb: CROWD, r: 5.5 }],
				[KENDRICK, { rgb: CROWD, r: 5.5 }]
			]),
			params
		);
	}
	const highlights = new Map([[SLJ, { rgb: CROWD, r: 6 }]]);
	// the film-count step names the runner-up as well, so he gets a mark of his
	// own — subordinate to the subject, and only on that step
	if (params?.showFilms) highlights.set(CAGE, { rgb: CROWD, r: 5 });
	return avgScatter(nodes, w, h, highlights, params);
};

// Is this pair on the chart? Either the reader has settled it, or they have
// been past the step and every pair is shown whether they answered it or not
// (`revealAll`, see the params selector below).
const pairShown = (params, i) =>
	params?.revealAll || params?.picks?.[i] !== undefined;

// A shown dot's colour. Crowd grey unless it is the one the reader actually
// picked, which goes green or red on whether it was the closer of the two —
// so colour says "you called this one, and here is how it went" and never
// competes with height, which is still the whole of who is closer. A pair the
// reader never answered has no picked dot, so it stays grey on both sides.
const verdictRgb = (pair, id, picked) =>
	id !== picked ? CROWD : id === quizWinner(pair) ? GREEN : RED;

// Label placement for the quiz dots, to keep names off each other in the tight
// cluster: high-film pairs sit on the right of the cloud so their labels go
// right; low-film pairs sit on the left so theirs go left. Pairs left out of
// this map fall back to the default below-dot placement, which also keeps
// them out of the beside-dot vertical decollision pool — with five pairs
// crowding the cloud, only Theron/Rogen/Robbie/Franco/Murphy/DiCaprio need
// beside-dot placement; the rest read fine underneath.
export const QUIZ_LABEL_DIRS = {
	[QUIZ_IDS[0]]: "right", // Charlize Theron (49 films)
	[QUIZ_IDS[1]]: "right", // Seth Rogen (48 films)
	[QUIZ_IDS[2]]: "left", // Margot Robbie (27 films)
	[QUIZ_IDS[3]]: "left", // Dave Franco (26 films)
	[QUIZ_IDS[4]]: "left", // Cillian Murphy (33 films)
	[QUIZ_IDS[5]]: "left" // Leonardo DiCaprio (31 films)
	// Harrison Ford, Colin Firth, Rupert Grint, Mahershala Ali: underneath
};

/** @type {import("../layout-types.js").LayoutFn} */
function layoutScatterQuiz(nodes, w, h, _edges, params) {
	const highlights = new Map();
	QUIZ_PAIRS.forEach((pair, i) => {
		if (!pairShown(params, i)) return;
		const choice = params?.picks?.[i];
		const picked = choice === undefined ? null : [pair.a, pair.b][choice];
		highlights.set(pair.a, { rgb: verdictRgb(pair, pair.a, picked), r: 5.5 });
		highlights.set(pair.b, { rgb: verdictRgb(pair, pair.b, picked), r: 5.5 });
	});
	return avgScatter(nodes, w, h, highlights, params);
}

// this step narrows the highlight to just the Portman/Kendrick pair from the
// earlier scatter steps — every other dot stays in frame as plain crowd
const DEG_SCATTER_HIGHLIGHTS = new Map([
	[PORTMAN, { rgb: CROWD, r: 5.5 }],
	[KENDRICK, { rgb: CROWD, r: 5.5 }]
]);

// the axis runs from a 10-film to a 100-film costar average, so its ends and
// its ticks are round film counts. top50 is a mean log(films + 1), hence the
// + 1. Below 10 isn't a meaningful "big dog" costar anyway — anyone there
// clamps to the floor, dimmed — and the true data max (~61) sits well clear
// of the ceiling, so Portman's dot isn't crowded against the top.
const filmCountAt = (films) => Math.log(films + 1);
const DEG_SCATTER_FLOOR = filmCountAt(10);
const DEG_SCATTER_CEIL = filmCountAt(100);
const DEG_SCATTER_TICKS = [10, 25, 50, 100].map(filmCountAt);

/** @type {import("../layout-types.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h, _edges, params) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// ticks sit at round film counts in log space (that's the plotted scale)
		ticks: DEG_SCATTER_TICKS,
		highlights: withSearch(DEG_SCATTER_HIGHLIGHTS, params),
		floor: DEG_SCATTER_FLOOR,
		ceil: DEG_SCATTER_CEIL,
		// the label de-logs back to a film count — the raw log value on its own
		// means nothing to a reader
		labelOf: (t) => String(deLogFilms(t))
	});

// the y-axis direction is conveyed by the pinned "more central"/"less central"
// mini-labels (see ScrollyVisual's .y-hint), not by an arrow in the title
const AVG_OVERLAY = {
	xLabel: "Film count (log scale)",
	yLabel: "Remoteness",
	// these render inside writing-mode: vertical-rl + rotate(180deg) (see
	// ScrollyVisual's .y-hint), which visually rotates → to ↑ and ← to ↓
	yTopLabel: "more central →",
	yBottomLabel: "← less central"
};

export const states = {
	scatterCenters: {
		layout: layoutScatterCenters,
		title: "Films vs. remoteness",
		labels: (params) =>
			withSearchLabel(
				params?.showPair ? [PORTMAN, KENDRICK] : [SLJ, CAGE],
				params
			),
		// the step's own params, plus the reader's actor — this state hosts the
		// remoteness search (steps 15-19)
		params: withSearchParams(),
		// the pair labels carry their metric, so they're too wide to sit beside
		// their dots at the right edge of the cloud — they hang below (clamped)
		// on the pair step. On the film-count step, SLJ and Cage's dots sit close
		// together at the crowded top-right corner, so the default below/clamped
		// placement can shove one label onto the other dot. "right" clips off the
		// canvas edge (their dots already sit at the far-right data extent, with
		// no room left), so they go "left" instead — beside their dots but toward
		// the open cloud, where the decollider keeps them vertically apart (same
		// mechanism QUIZ_LABEL_DIRS uses for its pairs)
		labelDirs: (params) =>
			params?.showPair
				? {}
				: { ...QUIZ_LABEL_DIRS, [SLJ]: "left", [CAGE]: "left" },
		// this state's three shapes are the film-count step, the avg-distance
		// pair step, and the costar-count pair step — each puts its own metric
		// in the names, since the number is the point being made
		labelText: (nodes, params) =>
			params?.showCostars
				? {
						[PORTMAN]: `${nodes[PORTMAN].name} · 97 of the top 250`,
						[KENDRICK]: `${nodes[KENDRICK].name} · 35 of the top 250`
					}
				: params?.showPair
					? Object.fromEntries(
							[PORTMAN, KENDRICK].map((id) => [
								id,
								`${nodes[id].name} · ${nodes[id].avgDistance.toFixed(2)} remoteness`
							])
						)
					: Object.fromEntries(
							[SLJ, CAGE].map((id) => [
								id,
								`${nodes[id].name} · ${nodes[id].films} films`
							])
						),
		pulse: (params) => (params?.showPair ? null : SLJ),
		overlay: AVG_OVERLAY
	},
	scatterQuiz: {
		layout: layoutScatterQuiz,
		title: "Films vs. remoteness",
		labels: (params) =>
			withSearchLabel(
				QUIZ_PAIRS.flatMap((pair, i) =>
					pairShown(params, i) ? [pair.a, pair.b] : []
				),
				params
			),
		// Once the reader has been past this step every pair is SHOWN, answered or
		// not: the reveal is unconditional, so a skipped quiz is revealed too
		// rather than left blank (see story.svelte.js — "every interaction is
		// skippable"). `revealAll` carries that as its own flag rather than as a
		// synthetic set of picks, which is what it used to be: a fabricated pick
		// threw away WHICH option the reader had chosen, and that is exactly what
		// the verdict colour is read off — so stepping back into the step used to
		// erase the reader's own answers from the chart.
		// The search is here too, as the glyph at the title's right (step 21). It
		// costs the card nothing — the quiz already owns that — because the
		// control is over the canvas, and a pick made earlier is sticky, so the
		// mark rides in already made whether or not the reader opens it.
		params: withSearchParams((s) => ({
			picks: { ...s.quiz.picks },
			revealAll: s.quiz.revealed
		})),
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: AVG_OVERLAY
	},
	degScatter: {
		layout: layoutDegScatter,
		title: "Films vs. costar film count",
		labels: (params) => withSearchLabel([PORTMAN, KENDRICK], params),
		// this state hosts the costar-count search (step 20)
		params: withSearchParams(),
		// no labelDirs entry for either id: they fall back to hanging below the
		// dot, which is what "only these two" calls for once the crowd is gone
		labelDirs: {},
		// names carry the de-logged film count, same number the axis itself now
		// shows, so Portman's dot reads as "Natalie Portman · 54" rather than
		// just her name
		labelText: (nodes) =>
			Object.fromEntries(
				[PORTMAN, KENDRICK].map((id) => [
					id,
					`${nodes[id].name} · ${deLogFilms(nodes[id].top50)}`
				])
			),
		overlay: {
			xLabel: "Film count (log scale)",
			yLabel: "Costar film count average (log scale)"
		}
	}
};

import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	deLogFilms,
	FILM_MIN_SHOWN,
	CROWD,
	INK,
	SLJ,
	CAGE,
	idOf
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Films scatters: shared log-films x-axis, swappable y metric. Non-participants
// (missing metric) hold their distance-scatter spot at alpha 0 so metric swaps
// read as vertical travel, not churn.
// ---------------------------------------------------------------------------

/**
 * @param {Object} cfg
 * @param {(n: import("../layout-shared.js").ActorNode) => number|null} cfg.yOf
 * @param {boolean} [cfg.invert] smaller value = higher up (avg-distance charts)
 * @param {number} [cfg.tickStep] y ticks at even steps of the metric (default 0.5)
 * @param {Map<number, { rgb: number[], r: number, alpha?: number }>} [cfg.highlights]
 * @param {(t: number) => string} [cfg.labelOf] formats a y tick's raw value; default 1dp of the raw value
 * @param {number} [cfg.floor] raises the y-domain's lower bound past the data minimum; actors below it clamp to the floor, dimmed, same as anyone past vMax
 * @param {number} [cfg.ceil] raises the y-domain's upper bound past the data maximum, widening headroom above the highest actor without clamping anyone
 */
function filmsScatter(nodes, w, h, cfg) {
	const attrs = new Float64Array(ATTR_SIZE);
	const values = nodes.map((n) => cfg.yOf(n));
	// y-domain from the SHOWN subset only — sub-threshold actors' long tail
	// would stretch the domain and squash the plotted cloud
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
	const pad = (vMax - vMin) * 0.04;
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const yS = cfg.invert
		? (v) => lin(v, vMin - pad, vMax + pad, top, bottom)
		: (v) => lin(v, vMin - pad, vMax + pad, bottom, top);
	for (const n of nodes) {
		const v = values[n.id];
		const [sx] = scatterPosition(n, w, h);
		const hi = cfg.highlights?.get(n.id);
		// only actors at or above the film floor are plotted (see FILM_LOG_MIN);
		// everyone else — and anyone missing the y-metric — holds their scatter
		// spot at alpha 0. Highlighted actors are always drawn, unless the metric
		// is missing (nothing to plot).
		if (v == null || (n.films < FILM_MIN_SHOWN && !hi)) {
			const [, sy] = scatterPosition(n, w, h);
			set(attrs, n.id, sx, sy, 2, CROWD, 0);
			continue;
		}
		const clamped = v < vMin || v > vMax;
		set(
			attrs,
			n.id,
			sx,
			yS(Math.min(vMax, Math.max(vMin, v))),
			hi?.r ?? 2,
			hi?.rgb ?? CROWD,
			(hi ? (hi.alpha ?? 1) : 0.3) * (clamped ? 0.35 : 1)
		);
	}
	// x-axis carries no ticks or numbers — just the title below (the log scale
	// is described, not quantified); y ticks at even metric steps, no gridlines
	const step = cfg.tickStep ?? 0.5;
	const labelOf = cfg.labelOf ?? ((t) => t.toFixed(1));
	const y = [];
	for (let t = Math.ceil(vMin / step) * step; t <= vMax; t += step) {
		y.push({ pos: yS(t), label: labelOf(t) });
	}
	return { attrs, axes: { xBase: bottom + 10, y } };
}

const avgScatter = (nodes, w, h, highlights) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.avgDistance,
		invert: true, // lower average distance = better connected = up
		highlights
	});

// by tmdb id, not QUIZ_IDS position: Portman/Kendrick are the worked example
// for scatterCenters/concurrenceScatter/degScatter regardless of whether
// they're one of the quiz pairs, and this stays correct across data rebuilds
const PORTMAN = idOf(524);
const KENDRICK = idOf(84223);

// quiz pairs exclude Portman/Kendrick — they're the dedicated worked example,
// not a quiz question
export const QUIZ_PAIRS = story.quiz.filter(
	(p) => ![p.a, p.b].includes(PORTMAN) && ![p.a, p.b].includes(KENDRICK)
);
export const QUIZ_IDS = QUIZ_PAIRS.flatMap((p) => [p.a, p.b]);

// single-subject highlight discipline (prototype): exactly one ringed subject
// per state, no supporting-cast dots, no on-canvas callouts — the facts live
// in the step prose. SLJ takes the default red highlight.

/** @type {import("../layout-shared.js").LayoutFn} */
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
			])
		);
	}
	const highlights = new Map([[SLJ, { rgb: CROWD, r: 6 }]]);
	// the film-count step names the runner-up as well, so he gets a mark of his
	// own — subordinate to the subject, and only on that step
	if (params?.showFilms) highlights.set(CAGE, { rgb: CROWD, r: 5 });
	return avgScatter(nodes, w, h, highlights);
};

// every pair index marked picked: the shape layoutScatterQuiz's picks-lookup
// expects, forcing its "answered" highlight regardless of story.quizPicks
const ALL_PICKED = Object.fromEntries(QUIZ_PAIRS.map((_, i) => [i, true]));

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

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterQuiz(nodes, w, h, _edges, params) {
	const highlights = new Map();
	const picks = params?.picks ?? {};
	// Neutral reveal: both actors in an answered pair get the same larger mark.
	// The dot's height (closer = higher) is the answer — no colour coding.
	QUIZ_PAIRS.forEach((pair, i) => {
		if (picks[i] === undefined) return;
		highlights.set(pair.a, { rgb: CROWD, r: 5.5 });
		highlights.set(pair.b, { rgb: CROWD, r: 5.5 });
	});
	return avgScatter(nodes, w, h, highlights);
}

// all six quiz actors as uniform marks (the prototype's single mark
// family — no per-pair colour coding)
const PAIR_HIGHLIGHTS = new Map(
	QUIZ_IDS.map((id) => [id, { rgb: CROWD, r: 5.5 }])
);

const PAIR_LABELS = [...QUIZ_IDS];

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutConcScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.conc,
		invert: true, // lower concurrence = more new co-stars = better connected = up
		tickStep: 0.1,
		highlights: PAIR_HIGHLIGHTS
	});

// this step narrows the highlight to just the Portman/Kendrick pair from the
// earlier scatter steps — every other dot stays in frame as plain crowd
const DEG_SCATTER_HIGHLIGHTS = new Map([
	[PORTMAN, { rgb: CROWD, r: 5.5 }],
	[KENDRICK, { rgb: CROWD, r: 5.5 }]
]);

// raises the axis floor to a ~19-film costar average — below that isn't a
// meaningful "big dog" costar anyway, and the true data minimum (~16) left
// most of the range spent on actors nobody in the prose is pointing at.
// Kendrick (47) still clears it comfortably, so she isn't pinned to the
// floor. The ceiling gets a ~10% widening above the true data max (~61), so
// the top of the range isn't crowded right up against Portman's dot either.
const DEG_SCATTER_FLOOR = Math.log(20);
const DEG_SCATTER_CEIL = Math.log(68);

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// top50 is mean log(films + 1) of the 50 most prolific costars, so the
		// plotted range is ~2-5. The 0.5 default was tuned for the retired
		// log-degree metric's ~7-8 band and leaves too few ticks here.
		tickStep: 0.25,
		highlights: DEG_SCATTER_HIGHLIGHTS,
		floor: DEG_SCATTER_FLOOR,
		ceil: DEG_SCATTER_CEIL,
		// ticks stay evenly spaced in log space (that's the plotted scale), but
		// the label de-logs back to a film count — the raw log value on its own
		// means nothing to a reader
		labelOf: (t) => String(deLogFilms(t))
	});

// The Gen Z frame is zoomed onto the candidate pool rather than sharing the
// corpus-wide films axis: no candidate has more than 37 films, so the shared
// scale (up to SLJ's 116) spends its right-hand half on actors this chapter
// never mentions, and its SLJ-driven y domain leaves the green cloud sagging in
// the lower band with the thinnest candidates clamped off the bottom: base
// frame from avgScatter, then every position rewritten through locally fitted
// scales. The shared scatterPosition scale is deliberately left alone — five
// other chapters park their hidden dots on it.
// the thinnest candidate has 5 films, which is also the corpus floor the node
// file carries in full — so the window opens exactly where the backdrop crowd
// stops being a complete population
const GENZ_FILM_MIN = FILM_MIN_SHOWN;
const GENZ_FILM_MAX = 40;
/** actors the zoomed frame draws in grey behind the candidates */
const inGenzWindow = (n) =>
	n.films >= GENZ_FILM_MIN && n.films <= GENZ_FILM_MAX;

// The cloud is 99 dots packed within ~10px of each other, so naming all of
// them is impossible and naming none of them leaves the reader with a contest
// and no contestants. These seven are named instead: the five likeliest
// winners, which the simulation chapter goes on to talk about, and two from the
// remote end of the same cloud.
//
// Every one is placed beside its dot rather than left to the default
// below-dot placement: below-dot labels sit outside the decollider's pool (see
// ScrollyVisual's drawScene), so at this density two of these names would land
// on top of each other. The side is hand-picked per dot from where the zoomed
// frame leaves room, the same way QUIZ_LABEL_DIRS is tuned above. Moretz sits
// at 36 films against the zoom's clamped ceiling of 40, so a name to her right
// runs off canvas — the constraint SLJ and Cage hit on scatterCenters. At every
// viewport width this leaves at least a line-height between the names on a
// side, so the decollider never has to nudge one and no leader stubs are drawn;
// it stays as insurance rather than the mechanism.
//
// Keyed by tmdb id like PORTMAN/KENDRICK above, not by position in the
// win-sorted candidate list: a data rebuild that reorders the field would
// otherwise leave seven hand-tuned sides attached to seven different actors,
// silently. An id that drops out of the corpus throws from idOf instead.
const GENZ_LABEL_DIRS = {
	[idOf(56734)]: "left", // Chloë Grace Moretz
	[idOf(1767250)]: "left", // Ariana Greenblatt
	[idOf(1903874)]: "left", // Maya Hawke
	[idOf(1428070)]: "right", // Isabela Merced
	[idOf(2099497)]: "right", // Fred Hechinger
	// Two from the far end of the same cloud. Every contender above is up in the
	// well-connected band, which leaves the bottom of the frame reading as
	// anonymous filler when it is the more surprising half: Sink and Elordi are
	// as famous as anyone here and sit among the most remote actors in the pool.
	// The band is sparse enough to take a name where the top is not.
	[idOf(1590797)]: "left", // Sadie Sink
	[idOf(2034418)]: "right" // Jacob Elordi
};
const GENZ_LABELS = Object.keys(GENZ_LABEL_DIRS).map(Number);

// CGM is candidates[0], so she wears the same candidate mark
const GENZ_MARK = { rgb: CROWD, r: 3.5, alpha: 0.9 };
// A named dot is drawn darker and larger than the 92 it sits among, because a
// name beside an identical grey dot in an identical grey column doesn't say
// which dot it belongs to — the label reads as a caption on the whole cluster.
// Size and ink rather than a hue, the same way scatterCenters marks its
// subject: the piece spends colour on hop distance, not on emphasis.
const GENZ_NAMED_MARK = { rgb: INK, r: 5, alpha: 1 };
const GENZ_HIGHLIGHTS = new Map(
	story.genz.candidates.map((c) => [
		c.id,
		GENZ_LABEL_DIRS[c.id] ? GENZ_NAMED_MARK : GENZ_MARK
	])
);

/**
 * The zoomed frame's scales and the spot it gives a node. Shared by the layout
 * and by `seedGenzCandidates` below, so a candidate that arrives hidden enters
 * on the row the layout will hold it at.
 */
function genzFrame(nodes, w, h) {
	// y fits everything the frame actually draws — candidates *and* the crowd
	// inside the film window. Fitting the candidates alone would clamp the ~150
	// crowd dots that are better connected than CGM into a stripe on the top edge
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		if (!GENZ_HIGHLIGHTS.has(n.id) && !inGenzWindow(n)) continue;
		vMin = Math.min(vMin, n.avgDistance);
		vMax = Math.max(vMax, n.avgDistance);
	}
	const xLogMin = Math.log(GENZ_FILM_MIN);
	const xLogMax = Math.log(GENZ_FILM_MAX);
	const xPad = (xLogMax - xLogMin) * 0.04;
	const vPad = (vMax - vMin) * 0.04;
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const xS = (films) =>
		lin(Math.log(films), xLogMin - xPad, xLogMax + xPad, MARGIN, w - MARGIN);
	const yS = (v) => lin(v, vMin - vPad, vMax + vPad, top, bottom); // inverted
	// unlike the corpus-wide frame this one has an end to fall off, and the crowd
	// avgScatter draws runs past it. Everyone outside the window parks on the
	// clamped edge at alpha 0 — a zoom carries its surplus off frame, and letting
	// the 84 actors past the ceiling pile up on the boundary instead would read
	// as a real cluster. Parked dots are clamped on both axes: an unclamped y
	// would fling the long tail of thin, distant actors hundreds of pixels off
	// canvas, and the neighbouring states would tween them all the way back in.
	const place = (n) => [
		xS(Math.min(GENZ_FILM_MAX, Math.max(GENZ_FILM_MIN, n.films))),
		yS(Math.min(vMax, Math.max(vMin, n.avgDistance)))
	];
	return { vMin, vMax, bottom, xS, yS, place };
}

// No seeding step here any more: the thinnest Gen Z candidate has 5 films, which
// is the shared scatter floor, so every candidate is already on screen in the
// crowd on the step scatterGenZ arrives from. The zoom is the only thing that
// moves them, which is what the old off-canvas parking was arranging by hand.

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterGenZ(nodes, w, h) {
	const result = avgScatter(nodes, w, h, GENZ_HIGHLIGHTS);
	const { attrs } = result;
	const { vMin, vMax, bottom, xS, yS, place } = genzFrame(nodes, w, h);
	for (const n of nodes) {
		const hi = GENZ_HIGHLIGHTS.get(n.id);
		const shown = hi || inGenzWindow(n);
		const [x, y] = place(n);
		set(
			attrs,
			n.id,
			x,
			y,
			hi?.r ?? 2,
			hi?.rgb ?? CROWD,
			shown ? (hi ? (hi.alpha ?? 1) : 0.3) : 0
		);
	}
	// both axes are re-ticked against the local scales — avgScatter's ticks were
	// positioned by the corpus-wide y domain this frame just replaced. 0.25 steps
	// because the zoomed band is only ~0.7 wide and filmsScatter's 0.5 default
	// would leave it with a single tick
	const y = [];
	for (let t = Math.ceil(vMin / 0.25) * 0.25; t <= vMax; t += 0.25) {
		y.push({ pos: yS(t), label: t.toFixed(2) });
	}
	// the shared films axis is described but never quantified (see filmsScatter);
	// this one is narrow enough to label
	result.axes = {
		x: [5, 10, 20, 40].map((f) => ({ pos: xS(f), label: String(f) })),
		xBase: bottom + 10,
		y
	};
	return result;
}

// the y-axis direction is conveyed by the pinned "lower"/"higher" mini-labels
// (see ScrollyVisual's .y-hint), not by an arrow in the title
const AVG_OVERLAY = {
	xLabel: "Films (log scale)",
	yLabel: "Remoteness",
	// these render inside writing-mode: vertical-rl + rotate(180deg) (see
	// ScrollyVisual's .y-hint), which visually rotates → to ↑ and ← to ↓
	yTopLabel: "lower →",
	yBottomLabel: "← higher"
};

export const states = {
	scatterCenters: {
		layout: layoutScatterCenters,
		labels: (params) => (params?.showPair ? [PORTMAN, KENDRICK] : [SLJ, CAGE]),
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
		labels: (params) => {
			const picks = params?.picks ?? {};
			return QUIZ_PAIRS.flatMap((pair, i) =>
				picks[i] === undefined ? [] : [pair.a, pair.b]
			);
		},
		// once the reader has been past this step, every pair reads as answered:
		// the reveal is unconditional, so a skipped quiz is revealed too rather
		// than left blank (see story.svelte.js — "every interaction is skippable")
		params: (s) => ({
			picks: s.quizRevealed ? ALL_PICKED : { ...s.quizPicks }
		}),
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: AVG_OVERLAY
	},
	concurrenceScatter: {
		layout: layoutConcScatter,
		labels: PAIR_LABELS,
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Fewer recurring co-stars →"
		}
	},
	degScatter: {
		layout: layoutDegScatter,
		labels: [PORTMAN, KENDRICK],
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
			xLabel: "Films (log scale)",
			yLabel: "Costar film count average (log scale)"
		}
	},
	scatterGenZ: {
		layout: layoutScatterGenZ,
		// plain names, no labelText: the win percentages that pick five of these
		// seven are the simulation chapter's payoff, and printing them on the
		// contenders' first appearance gives the ending away
		labels: GENZ_LABELS,
		labelDirs: GENZ_LABEL_DIRS,
		overlay: AVG_OVERLAY
	}
};

import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	STRIDE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	FILM_MIN_SHOWN,
	CROWD,
	SLJ,
	CAGE,
	CGM,
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
	// y-domain from the SHOWN (>10-film) subset only — sub-threshold actors'
	// long tail would stretch the domain and squash the plotted cloud
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		const v = values[n.id];
		if (v == null || n.films <= FILM_MIN_SHOWN) continue;
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
		// only the >10-film actors are plotted (see FILM_LOG_MIN); everyone
		// else — and anyone missing the y-metric — holds their scatter spot at
		// alpha 0. Highlighted actors are always drawn, unless the metric is
		// missing (nothing to plot).
		if (v == null || (n.films <= FILM_MIN_SHOWN && !hi)) {
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
	// yS rides along for the one caller that seeds a later state's cast on this
	// frame's scale (seedGenzCandidates); the framework ignores the extra key
	return { attrs, yS, axes: { xBase: bottom + 10, y } };
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
	const result = avgScatter(nodes, w, h, highlights);
	// this is the step scatterGenZ arrives from — seed its cast (below)
	seedGenzCandidates(result.attrs, nodes, w, h, result.yS);
	return result;
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

// inverts top50's log(films + 1) build transform back to a plain film count,
// shared by the axis ticks and the node labels so both read the same number
const deLogFilms = (t) => Math.round(Math.exp(t) - 1);

// raises the axis floor to a ~27-film costar average (10% below the earlier
// 30-film cut) — below that isn't a meaningful "big dog" costar anyway, and
// the true data minimum (~16) left most of the range spent on actors nobody
// in the prose is pointing at. Kendrick (47) still clears it comfortably, so
// she isn't pinned to the floor. The ceiling gets the same ~10% widening
// above the true data max (~61), so the top of the range isn't crowded right
// up against Portman's dot either.
const DEG_SCATTER_FLOOR = Math.log(28);
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
const GENZ_FILM_MIN = 4;
const GENZ_FILM_MAX = 40;
/** actors the zoomed frame draws in grey behind the candidates */
const inGenzWindow = (n) =>
	n.films > FILM_MIN_SHOWN && n.films <= GENZ_FILM_MAX;

// CGM is candidates[0], so she wears the same candidate mark
const GENZ_MARK = { rgb: CROWD, r: 3.5, alpha: 0.9 };
const GENZ_HIGHLIGHTS = new Map(
	story.genz.candidates.map((c) => [c.id, GENZ_MARK])
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

/**
 * Park every Gen Z candidate the *calling* chart hides on the spot that chart
 * would have given it had it plotted them, at alpha 0 — so scatterGenZ's zoom is
 * the only thing that moves them, exactly as it moves the ~40 candidates already
 * on screen, and the pool arrives with the crowd instead of separately.
 *
 * Neither leg of the entry is authored, then: the x comes from the caller's own
 * films scale below its 10-film floor (a 5-film actor waits ~200px off the left
 * of the canvas, and the zoom onto 4–40 films carries every candidate the same
 * ~340px in), and the y from the caller's fitted avg-distance scale, which sits
 * 30–60px lower than the zoomed one — the drop the crowd makes on the way in.
 * `scatterPosition`'s y is what can't be used: it runs the whole corpus domain
 * out to 4.79, bunching this pool near the top edge, which is why they came in
 * from above.
 *
 * @param {(v: number) => number} yS the caller's avg-distance scale
 */
function seedGenzCandidates(attrs, nodes, w, h, yS) {
	for (const id of GENZ_HIGHLIGHTS.keys()) {
		if (attrs[id * STRIDE + 6] > 0) continue; // on screen here — let it travel
		const [x] = scatterPosition(nodes[id], w, h);
		// unclamped: the shift has to stay smooth across the pool, and the few
		// candidates past the caller's domain land only ~20px below its plot floor
		set(attrs, id, x, yS(nodes[id].avgDistance), GENZ_MARK.r, GENZ_MARK.rgb, 0);
	}
}

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

// directional y-axis titles (prototype): the y-axes are inverted/relative, so
// the title carries the reading — the arrow points where "better" lives
const AVG_OVERLAY = {
	xLabel: "Films (log scale)",
	yLabel: "Closer to centre →"
};

export const states = {
	scatterCenters: {
		layout: layoutScatterCenters,
		labels: (params) => (params?.showPair ? [PORTMAN, KENDRICK] : [SLJ, CAGE]),
		// the pair labels carry their metric, so they're too wide to sit beside
		// their dots at the right edge of the cloud — they hang below (clamped)
		// on the pair step, and take QUIZ_LABEL_DIRS' right placement on the
		// film-count one
		labelDirs: (params) => (params?.showPair ? {} : QUIZ_LABEL_DIRS),
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
								`${nodes[id].name} · ${nodes[id].avgDistance.toFixed(2)} avg. distance`
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
		pulse: CGM,
		overlay: AVG_OVERLAY
	}
};

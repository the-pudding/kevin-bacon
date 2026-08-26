import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	FILM_MIN_SHOWN,
	CROWD,
	RED,
	BLUE,
	GREEN,
	YELLOW,
	CYAN,
	SLJ,
	CAGE,
	WALTERS,
	CGM
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
	const y = [];
	for (let t = Math.ceil(vMin / step) * step; t <= vMax; t += step) {
		y.push({ pos: yS(t), label: t.toFixed(1) });
	}
	return { attrs, axes: { xBase: bottom + 10, y } };
}

const avgScatter = (nodes, w, h, highlights) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.avgDistance,
		invert: true, // lower average distance = better connected = up
		highlights
	});

export const QUIZ_IDS = story.quiz.flatMap((p) => [p.a, p.b]);

const PORTMAN = QUIZ_IDS[2];
const KENDRICK = QUIZ_IDS[3];

// single-subject highlight discipline (prototype): exactly one ringed subject
// per state, no supporting-cast dots, no on-canvas callouts — the facts live
// in the step prose. SLJ takes the default red highlight; Walters a yellow
// variant, kept consistent everywhere she carries over through step 19.

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
				[PORTMAN, { rgb: BLUE, r: 5.5 }],
				[KENDRICK, { rgb: RED, r: 5.5 }]
			])
		);
	}
	const highlights = new Map([[SLJ, { rgb: RED, r: 6 }]]);
	// the film-count step names the runner-up as well, so he gets a mark of his
	// own — subordinate to the red subject, and only on that step
	if (params?.showFilms) highlights.set(CAGE, { rgb: CYAN, r: 5 });
	return avgScatter(nodes, w, h, highlights);
};

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutScatterWalters = (nodes, w, h) =>
	avgScatter(nodes, w, h, new Map([[WALTERS, { rgb: YELLOW, r: 6 }]]));

// every pair index marked picked: the shape layoutScatterQuiz's picks-lookup
// expects, forcing its "answered" highlight regardless of story.quizPicks
const ALL_PICKED = Object.fromEntries(story.quiz.map((_, i) => [i, true]));

// Label placement for the quiz dots, to keep names off each other in the tight
// cluster: the high-film pair sits on the right of the cloud so their labels go
// right; the low-film pair sits on the left so theirs go left.
export const QUIZ_LABEL_DIRS = {
	[QUIZ_IDS[0]]: "right", // Charlize Theron
	[QUIZ_IDS[1]]: "right", // Seth Rogen
	[QUIZ_IDS[2]]: "right", // Natalie Portman
	[QUIZ_IDS[3]]: "right", // Anna Kendrick
	[QUIZ_IDS[4]]: "left", // Margot Robbie
	[QUIZ_IDS[5]]: "left" // Dave Franco
};

// step-18 metric scatters also carry Walters (her mid-cloud film count puts her
// label left); a direction is what enrols a label in ScrollyVisual's vertical
// de-collision pass, so every name shown here needs one
const PAIR_LABEL_DIRS = { ...QUIZ_LABEL_DIRS, [WALTERS]: "left" };

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterQuiz(nodes, w, h, _edges, params) {
	const highlights = new Map();
	const picks = params?.picks ?? {};
	// Neutral reveal: both actors in an answered pair land the same blue. The dot's
	// height (closer = higher) is the answer — no right/wrong colour coding.
	story.quiz.forEach((pair, i) => {
		if (picks[i] === undefined) return;
		highlights.set(pair.a, { rgb: BLUE, r: 5.5 });
		highlights.set(pair.b, { rgb: BLUE, r: 5.5 });
	});
	// Walters carries over from her earlier solo step, in a distinct yellow so
	// she's never mistaken for a quiz pair
	highlights.set(WALTERS, { rgb: YELLOW, r: 6 });
	return avgScatter(nodes, w, h, highlights);
}

// all six quiz actors as uniform blue marks (the prototype's single mark
// family — no per-pair colour coding); Walters keeps her own yellow so she
// stays visually consistent from her solo step through step 19
const PAIR_HIGHLIGHTS = new Map([
	...QUIZ_IDS.map((id) => [id, { rgb: BLUE, r: 5.5 }]),
	[WALTERS, { rgb: YELLOW, r: 6 }]
]);

const PAIR_LABELS = [...QUIZ_IDS, WALTERS];

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
	[PORTMAN, { rgb: BLUE, r: 5.5 }],
	[KENDRICK, { rgb: RED, r: 5.5 }]
]);

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// top50 is mean log(films + 1) of the 50 most prolific costars, so the
		// plotted range is ~2-5. The 0.5 default was tuned for the retired
		// log-degree metric's ~7-8 band and leaves too few ticks here.
		tickStep: 0.25,
		highlights: DEG_SCATTER_HIGHLIGHTS
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

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterGenZ(nodes, w, h) {
	// CGM is candidates[0], so she wears the same green candidate mark
	const highlights = new Map(
		story.genz.candidates.map((c) => [c.id, { rgb: GREEN, r: 3.5, alpha: 0.9 }])
	);
	const result = avgScatter(nodes, w, h, highlights);
	const { attrs } = result;
	// y fits everything the frame actually draws — candidates *and* the crowd
	// inside the film window. Fitting the candidates alone would clamp the ~150
	// crowd dots that are better connected than CGM into a stripe on the top edge
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		if (!highlights.has(n.id) && !inGenzWindow(n)) continue;
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
	for (const n of nodes) {
		const hi = highlights.get(n.id);
		const shown = hi || inGenzWindow(n);
		// unlike the corpus-wide frame this one has an end to fall off, and the
		// crowd avgScatter just drew runs past it. Everyone outside the window
		// parks on the clamped edge at alpha 0 — a zoom carries its surplus off
		// frame, and letting the 84 actors past the ceiling pile up on the
		// boundary instead would read as a real cluster
		const films = Math.min(GENZ_FILM_MAX, Math.max(GENZ_FILM_MIN, n.films));
		// parked dots are clamped on both axes too: an unclamped y would fling
		// the long tail of thin, distant actors hundreds of pixels off canvas,
		// and the neighbouring states would tween them all the way back in
		const dist = Math.min(vMax, Math.max(vMin, n.avgDistance));
		set(
			attrs,
			n.id,
			xS(films),
			yS(dist),
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
		// on the pair step, and take PAIR_LABEL_DIRS' right placement on the
		// film-count one
		labelDirs: (params) => (params?.showPair ? {} : PAIR_LABEL_DIRS),
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
	scatterWalters: {
		layout: layoutScatterWalters,
		labels: [WALTERS],
		overlay: AVG_OVERLAY
	},
	scatterQuiz: {
		layout: layoutScatterQuiz,
		labels: (params) => {
			const picks = params?.picks ?? {};
			return [
				...story.quiz.flatMap((pair, i) =>
					picks[i] === undefined ? [] : [pair.a, pair.b]
				),
				WALTERS
			];
		},
		// the step *after* the interactive quiz card (params.revealed) recaps it,
		// same as every downstream chapter: reveal all pairs unconditionally,
		// regardless of whether the reader actually answered (see story.svelte.js
		// — "every interaction is skippable... reveals its answer unconditionally")
		params: (s, p) => ({
			picks: p?.revealed ? ALL_PICKED : { ...s.quizPicks }
		}),
		labelDirs: PAIR_LABEL_DIRS,
		overlay: AVG_OVERLAY
	},
	concurrenceScatter: {
		layout: layoutConcScatter,
		labels: PAIR_LABELS,
		labelDirs: PAIR_LABEL_DIRS,
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
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Stronger co-stars →"
		}
	},
	scatterGenZ: {
		layout: layoutScatterGenZ,
		pulse: CGM,
		overlay: AVG_OVERLAY
	}
};

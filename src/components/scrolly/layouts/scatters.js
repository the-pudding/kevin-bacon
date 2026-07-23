import story from "$data/scrolly-story.json";
import {
	STRIDE,
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
	PURPLE,
	SLJ,
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

const attrX = (attrs, id) => attrs[id * STRIDE];
const attrY = (attrs, id) => attrs[id * STRIDE + 1];

// single-subject highlight discipline (prototype): exactly one ringed subject
// per state, no supporting-cast dots, no on-canvas callouts — the facts live
// in the step prose. SLJ takes the default red highlight; Walters the blue
// variant (graph.css `.scatter--blue-highlight`).

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutScatterCenters = (nodes, w, h) =>
	avgScatter(nodes, w, h, new Map([[SLJ, { rgb: RED, r: 6 }]]));

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutScatterWalters = (nodes, w, h) =>
	avgScatter(nodes, w, h, new Map([[WALTERS, { rgb: BLUE, r: 6 }]]));

export const QUIZ_IDS = story.quiz.flatMap((p) => [p.a, p.b]);

// every pair index marked picked: the shape layoutScatterQuiz's picks-lookup
// expects, forcing its "answered" highlight regardless of story.quizPicks
const ALL_PICKED = Object.fromEntries(story.quiz.map((_, i) => [i, true]));

// Label placement for the quiz dots, to keep names off each other in the tight
// cluster: the high-film pair sits on the right of the cloud so their labels go
// right; the low-film pair sits on the left so theirs go left.
export const QUIZ_LABEL_DIRS = {
	[QUIZ_IDS[0]]: "right", // Charlize Theron
	[QUIZ_IDS[1]]: "right", // Seth Rogen
	[QUIZ_IDS[4]]: "left", // Margot Robbie
	[QUIZ_IDS[5]]: "left" // Dave Franco
};

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
	return avgScatter(nodes, w, h, highlights);
}

// all six quiz actors as uniform blue marks (the prototype's single mark
// family — no per-pair colour coding)
const PAIR_HIGHLIGHTS = new Map(
	QUIZ_IDS.map((id) => [id, { rgb: BLUE, r: 5.5 }])
);

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutConcScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.conc,
		invert: true, // lower concurrence = more new co-stars = better connected = up
		tickStep: 0.1,
		highlights: PAIR_HIGHLIGHTS
	});

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		highlights: PAIR_HIGHLIGHTS
	});

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterGenZ(nodes, w, h) {
	const highlights = new Map(
		story.genz.candidates.map((c) => [c.id, { rgb: GREEN, r: 3.5, alpha: 0.9 }])
	);
	highlights.set(CGM, { rgb: RED, r: 6 });
	highlights.set(SLJ, { rgb: PURPLE, r: 4.5, alpha: 0.9 });
	const result = avgScatter(nodes, w, h, highlights);
	result.notes = [
		{
			x: attrX(result.attrs, CGM) + 10,
			y: attrY(result.attrs, CGM) - 4,
			text: "lowest average distance of any Gen Z actor"
		}
	];
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
		labels: [SLJ],
		pulse: SLJ,
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
			return story.quiz.flatMap((pair, i) =>
				picks[i] === undefined ? [] : [pair.a, pair.b]
			);
		},
		// the step *after* the interactive quiz card (params.revealed) recaps it,
		// same as every downstream chapter: reveal all pairs unconditionally,
		// regardless of whether the reader actually answered (see story.svelte.js
		// — "every interaction is skippable... reveals its answer unconditionally")
		params: (s, p) => ({
			picks: p?.revealed ? ALL_PICKED : { ...s.quizPicks }
		}),
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: AVG_OVERLAY
	},
	concurrenceScatter: {
		layout: layoutConcScatter,
		labels: QUIZ_IDS,
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Fewer recurring co-stars →"
		}
	},
	degScatter: {
		layout: layoutDegScatter,
		labels: QUIZ_IDS,
		labelDirs: QUIZ_LABEL_DIRS,
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Stronger co-stars →"
		}
	},
	scatterGenZ: {
		layout: layoutScatterGenZ,
		labels: [CGM, SLJ],
		pulse: CGM,
		overlay: AVG_OVERLAY
	}
};

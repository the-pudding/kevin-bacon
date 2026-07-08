import { ANCHOR_ID } from "../nodes.js";
import story from "$data/scrolly-story.json";
import {
	STRIDE,
	ATTR_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	FILM_LOG_MIN,
	FILM_LOG_MAX,
	AVG_MIN,
	AVG_MAX,
	INK,
	CROWD,
	RED,
	BLUE,
	GREEN,
	PURPLE,
	SLJ,
	CAGE,
	WALTERS,
	OLDMAN,
	KIDMAN,
	STREEP,
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
 * @param {[number, number]} [cfg.yDomain] values beyond it clamp to the edge, faded
 * @param {boolean} [cfg.invert] smaller value = higher up (avg-distance charts)
 * @param {(v: number) => string} [cfg.fmt]
 * @param {Map<number, { rgb: number[], r: number, alpha?: number }>} [cfg.highlights]
 */
function filmsScatter(nodes, w, h, cfg) {
	const attrs = new Float64Array(ATTR_SIZE);
	const values = nodes.map((n) => cfg.yOf(n));
	const [vMin, vMax] = cfg.yDomain ?? [
		Math.min(...values.filter((v) => v != null)),
		Math.max(...values.filter((v) => v != null))
	];
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const yS = cfg.invert
		? (v) => lin(v, vMin, vMax, top, bottom)
		: (v) => lin(v, vMin, vMax, bottom, top);
	for (const n of nodes) {
		const v = values[n.id];
		const [sx] = scatterPosition(n, w, h);
		const hi = cfg.highlights?.get(n.id);
		if (v == null) {
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
	const fmt = cfg.fmt ?? ((v) => v.toFixed(2));
	const axes = {
		x: [3, 10, 30, 100]
			.filter((f) => Math.log(f) >= FILM_LOG_MIN && Math.log(f) <= FILM_LOG_MAX)
			.map((f) => ({
				pos: lin(Math.log(f), FILM_LOG_MIN, FILM_LOG_MAX, MARGIN, w - MARGIN),
				label: String(f)
			})),
		xBase: bottom + 10,
		y: [vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: yS(v),
			label: fmt(v)
		}))
	};
	return { attrs, axes };
}

// clamp the long tail of barely-connected actors (max ~4.4) so the story's
// cast isn't squashed into the top third
const AVG_DOMAIN = /** @type {[number, number]} */ ([
	AVG_MIN,
	Math.min(AVG_MAX, 3.2)
]);
const avgScatter = (nodes, w, h, highlights) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.avgDistance,
		yDomain: AVG_DOMAIN,
		invert: true, // lower average distance = better connected = up
		highlights
	});

const attrX = (attrs, id) => attrs[id * STRIDE];
const attrY = (attrs, id) => attrs[id * STRIDE + 1];

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterCenters(nodes, w, h) {
	const result = avgScatter(
		nodes,
		w,
		h,
		new Map([
			[SLJ, { rgb: PURPLE, r: 6 }],
			[CAGE, { rgb: BLUE, r: 4.5 }],
			[ANCHOR_ID, { rgb: INK, r: 4.5 }]
		])
	);
	result.notes = [
		{
			x: attrX(result.attrs, SLJ) - 12,
			y: attrY(result.attrs, SLJ) + 16,
			align: "right",
			text: `${nodes[SLJ].films} films — 20 more than Nicolas Cage`
		}
	];
	return result;
}

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterWalters(nodes, w, h) {
	const result = avgScatter(
		nodes,
		w,
		h,
		new Map([
			[WALTERS, { rgb: RED, r: 6 }],
			[OLDMAN, { rgb: BLUE, r: 4 }],
			[KIDMAN, { rgb: BLUE, r: 4 }],
			[STREEP, { rgb: BLUE, r: 4 }]
		])
	);
	result.notes = [
		{
			x: attrX(result.attrs, WALTERS) + 10,
			y: attrY(result.attrs, WALTERS) - 4,
			text: "same films as far better-connected actors"
		}
	];
	return result;
}

export const QUIZ_IDS = story.quiz.flatMap((p) => [p.a, p.b]);

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterQuiz(nodes, w, h, _edges, params) {
	const highlights = new Map();
	const picks = params?.picks ?? {};
	story.quiz.forEach((pair, i) => {
		if (picks[i] === undefined) return;
		const pickedRight = picks[i] === pair.answer;
		highlights.set(pair.answer === 0 ? pair.a : pair.b, {
			rgb: GREEN,
			r: 5.5
		});
		highlights.set(pair.answer === 0 ? pair.b : pair.a, {
			rgb: pickedRight ? BLUE : RED,
			r: 5.5
		});
	});
	return avgScatter(nodes, w, h, highlights);
}

const PAIR_HIGHLIGHTS = new Map([
	[QUIZ_IDS[0], { rgb: BLUE, r: 5.5 }], // Charlize Theron
	[QUIZ_IDS[1], { rgb: RED, r: 5.5 }], // Seth Rogen
	[QUIZ_IDS[2], { rgb: BLUE, r: 4 }],
	[QUIZ_IDS[3], { rgb: RED, r: 4 }],
	[QUIZ_IDS[4], { rgb: BLUE, r: 4 }],
	[QUIZ_IDS[5], { rgb: RED, r: 4 }]
]);

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutConcScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.conc,
		highlights: PAIR_HIGHLIGHTS
	});

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// ticks in actual costars, not log units
		fmt: (v) => Math.round(Math.exp(v)).toLocaleString("en-US"),
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

const AVG_OVERLAY = {
	xLabel: "Films (log scale)",
	yLabel: "Avg distance"
};

export const states = {
	scatterCenters: {
		layout: layoutScatterCenters,
		labels: [SLJ, CAGE, ANCHOR_ID],
		pulse: SLJ,
		overlay: AVG_OVERLAY
	},
	scatterWalters: {
		layout: layoutScatterWalters,
		labels: [WALTERS, OLDMAN, KIDMAN, STREEP],
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
		params: (s) => ({ picks: { ...s.quizPicks } }),
		overlay: AVG_OVERLAY
	},
	concurrenceScatter: {
		layout: layoutConcScatter,
		labels: [QUIZ_IDS[0], QUIZ_IDS[1]],
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Concurrence"
		}
	},
	degScatter: {
		layout: layoutDegScatter,
		labels: [QUIZ_IDS[0], QUIZ_IDS[1], QUIZ_IDS[2], QUIZ_IDS[4]],
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Costar degree (log)"
		}
	},
	scatterGenZ: {
		layout: layoutScatterGenZ,
		labels: [CGM, SLJ],
		pulse: CGM,
		overlay: AVG_OVERLAY
	}
};

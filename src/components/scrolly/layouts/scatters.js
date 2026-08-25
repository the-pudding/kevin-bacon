import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	STRIDE,
	DELAY_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	FILM_MIN_SHOWN,
	FILM_LOG_MAX,
	BY_RANK,
	RANK_TOP_N,
	INK,
	CROWD,
	RED,
	BLUE,
	GREEN,
	PURPLE,
	YELLOW,
	CYAN,
	SLJ,
	CAGE,
	WALTERS
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

// ---------------------------------------------------------------------------
// The costar zoom: the same films-vs-distance scatter, but framed on the top
// 250 most central actors — the set the rank chapter already showed the reader
// — with each of them coloured by which of the two named actors has worked
// with them. Counts come from the build (story.centerCostars), never recomputed
// here, so the step prose and the marks can't drift apart.
// ---------------------------------------------------------------------------

const CENTER_MEMBERS = BY_RANK.slice(0, RANK_TOP_N).map((n) => n.id);
const WITH_PORTMAN = new Set(story.centerCostars.withPortman);
const WITH_KENDRICK = new Set(story.centerCostars.withKendrick);

// px past the plot edge where the drifting-out crowd is parked. Their true
// zoomed positions run ~1,700px off canvas, which would tween as a burst out
// and a rocket back — clamping keeps the direction and drops the distance.
const OFF_FRAME = 90;

// the two marks, shared with the entry choreography below so the frame it
// animates towards can't drift from the frame the static layout lands on
const COSTAR_CROWD = { r: 2.5, alpha: 0.45 };
const COSTAR_MARK = { r: 4, alpha: 0.95 };

// the crowd holds still this long before the camera moves, so the two names
// carried in from the pair step are gone before anything travels. Matches the
// opacity transition on .node-label in ScrollyVisual — a name's alpha drops to
// 0 the instant the state flips, and this is how long the CSS takes to run it out.
const LABEL_CLEAR_MS = 300;
// how long the groups take to light up, once the move has landed
const COSTAR_COLOUR_MS = 500;

// every dot and edge waits out the label fade before it moves
const COSTAR_DELAYS = new Float64Array(DELAY_SIZE).fill(LABEL_CLEAR_MS);

/**
 * This is the ONE films-scatter step that doesn't use the global fixed x domain
 * — it fits both axes to the 250 in frame — which is why it's its own state
 * rather than a param on scatterCenters: every other step in the family still
 * only travels vertically.
 *
 * Everyone off the guest list gets the same zoomed projection rather than a
 * park spot, so the camera move carries them: rank is monotonic in average
 * distance, so every non-member sits below the fitted y domain by construction
 * and slides down out of frame, with the less prolific pulled left as well.
 * Their travel is capped to a band just outside the plot (OFF_FRAME) so this
 * reads as a drift rather than a burst — and so the return leg into degScatter
 * is a short glide in, not a rocket from a thousand pixels away.
 *
 * NB Portman is herself in the top 250 (rank 69) and isn't her own costar, so
 * she sits in the grey "neither" group; Kendrick (rank 678) is outside the set
 * and drifts out with the crowd. Both are named in the prose, not on the canvas.
 *
 * @type {import("../layout-shared.js").LayoutFn}
 */
function layoutScatterCostars(nodes, w, h) {
	const result = avgScatter(nodes, w, h, new Map());
	const { attrs } = result;
	// both domains fitted to the members only. The film max IS the corpus max
	// (SLJ is rank 1), so only the left edge of x moves in.
	const xMin = Math.min(
		...CENTER_MEMBERS.map((id) => Math.log(nodes[id].films))
	);
	const xPad = (FILM_LOG_MAX - xMin) * 0.04;
	const vals = CENTER_MEMBERS.map((id) => nodes[id].avgDistance);
	const vMin = Math.min(...vals);
	const vMax = Math.max(...vals);
	const vPad = (vMax - vMin) * 0.04;
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const yS = (v) => lin(v, vMin - vPad, vMax + vPad, top, bottom); // inverted
	const xS = (films) =>
		lin(Math.log(films), xMin - xPad, FILM_LOG_MAX + xPad, MARGIN, w - MARGIN);
	const inSet = new Set(CENTER_MEMBERS);
	for (const n of nodes) {
		const member = inSet.has(n.id);
		const both = WITH_PORTMAN.has(n.id) && WITH_KENDRICK.has(n.id);
		const withP = !both && WITH_PORTMAN.has(n.id);
		const withK = !both && WITH_KENDRICK.has(n.id);
		// the 9 in both sets take the neutral ink: each of the two counts
		// includes them, so putting them in either colour would contradict the
		// arithmetic the prose is making
		const rgb = both ? INK : withP ? BLUE : withK ? RED : CROWD;
		const marked = member && (both || withP || withK);
		set(
			attrs,
			n.id,
			member
				? xS(n.films)
				: Math.max(MARGIN - OFF_FRAME, xS(Math.max(1, n.films))),
			member
				? yS(n.avgDistance)
				: Math.min(bottom + OFF_FRAME, yS(n.avgDistance)),
			marked ? COSTAR_MARK.r : COSTAR_CROWD.r,
			member ? rgb : CROWD,
			member ? (marked ? COSTAR_MARK.alpha : COSTAR_CROWD.alpha) : 0
		);
	}
	// y ticks: the zoomed band is only ~0.22 wide, so the 0.5 default used by
	// filmsScatter would clear vMax and silently render no ticks at all
	const y = [];
	for (let t = Math.ceil(vMin / 0.1) * 0.1; t <= vMax; t += 0.1) {
		y.push({ pos: yS(t), label: t.toFixed(1) });
	}
	return {
		...result,
		delays: COSTAR_DELAYS,
		axes: { xBase: bottom + 10, y },
		legend: [
			{ color: BLUE, label: "Portman" },
			{ color: RED, label: "Kendrick" },
			{ color: INK, label: "Both" }
		],
		legendY: bottom + 14
	};
}

/**
 * Entry choreography: the camera move lands first, then the groups light up.
 * Leg 0 at e=0 is the frame the arrival tween aims at — every one of the 250 an
 * anonymous crowd dot — and at e=1 it reproduces the static layout exactly, so
 * the settle has nothing left to move.
 *
 * Unlike the trail-drawing choreographies, the slots this animates are NOT
 * transparent at e=0: these dots are continuous with the previous step's cloud
 * and have to stay visible to be seen travelling. The transparency contract
 * guards against a state's own stale geometry animating away on a re-visit,
 * which can't arise here — every state writes every dot, every frame.
 */
const costarEntryFrames = (nodes, w, h) => {
	const final = layoutScatterCostars(nodes, w, h).attrs;
	return (attrs, _trails, _phase, e) => {
		// exact at the ends: a lerp to e=1 is not bit-identical to the target
		const mix = (from, to) => (e >= 1 ? to : from + (to - from) * e);
		for (const id of CENTER_MEMBERS) {
			const i = id * STRIDE;
			attrs[i + 2] = mix(COSTAR_CROWD.r, final[i + 2]);
			attrs[i + 3] = mix(CROWD[0], final[i + 3]);
			attrs[i + 4] = mix(CROWD[1], final[i + 4]);
			attrs[i + 5] = mix(CROWD[2], final[i + 5]);
			attrs[i + 6] = mix(COSTAR_CROWD.alpha, final[i + 6]);
		}
	};
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

/** @type {import("../layout-shared.js").LayoutFn} */
const layoutDegScatter = (nodes, w, h) =>
	filmsScatter(nodes, w, h, {
		yOf: (n) => n.top50,
		// top50 is mean log(films + 1) of the 50 most prolific costars, so the
		// plotted range is ~2-5. The 0.5 default was tuned for the retired
		// log-degree metric's ~7-8 band and leaves too few ticks here.
		tickStep: 0.25,
		highlights: PAIR_HIGHLIGHTS
	});

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutScatterGenZ(nodes, w, h) {
	// CGM is candidates[0], so she wears the same green candidate mark
	const highlights = new Map(
		story.genz.candidates.map((c) => [c.id, { rgb: GREEN, r: 3.5, alpha: 0.9 }])
	);
	highlights.set(SLJ, { rgb: PURPLE, r: 4.5, alpha: 0.9 });
	const result = avgScatter(nodes, w, h, highlights);
	result.legend = [{ color: GREEN, label: "Gen Z actors" }];
	result.legendY = plotBottom(h) + 14;
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
		// this state's two shapes are the film-count step and the pair step, and
		// each puts its own metric in the names — the number is the point being
		// made
		labelText: (nodes, params) =>
			params?.showPair
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
	scatterCostars: {
		layout: layoutScatterCostars,
		// no labels and no pulse: the two subjects are named in the prose, and
		// the colour groups plus the legend carry the comparison
		entry: { phases: [COSTAR_COLOUR_MS], frames: costarEntryFrames },
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
		labels: PAIR_LABELS,
		labelDirs: PAIR_LABEL_DIRS,
		overlay: {
			xLabel: "Films (log scale)",
			yLabel: "Stronger co-stars →"
		}
	},
	// The contender list (GenZList.svelte) covers the canvas on this state, so
	// the layout here exists only to hold the Gen Z scatter frame underneath:
	// careerTrio's draw-on is authored to morph out of the films-vs-distance
	// cloud, and keeping that cloud in place is what leaves the morph unchanged.
	// No labels/pulse/overlay — the panel hides the dots, but axis titles, ticks
	// and name labels would otherwise show around its edges.
	genzList: { layout: layoutScatterGenZ }
};

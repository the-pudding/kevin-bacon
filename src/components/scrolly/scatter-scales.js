// The films scatters' shared scales: the fixed log-films x axis every variant
// plots against, and the avg-distance range.
import rawNodes from "$data/scrolly-nodes.json";
import { MARGIN, lin, plotBottom } from "./plot.js";

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

// px the x axis's left end is held in from MARGIN, so the 5-film column and its
// tick clear the y tick labels (.tick-y, indented 1.1rem past the axis title)
// instead of printing under and through them
const FILM_X_INSET = 24;

/** px from the canvas's left edge to the films scatters' left plot edge */
export const FILM_X_LEFT = MARGIN + FILM_X_INSET;

const filmX = (logFilms, w) =>
	lin(logFilms, FILM_LOG_MIN, FILM_LOG_MAX, FILM_X_LEFT, w - MARGIN);

// inverts top50's log(films + 1) build transform back to a plain film count.
// The raw log value means nothing to a reader, so everything that surfaces
// top50 — the degScatter axis and its labels, the Gen Z breakdown — shows the
// de-logged count instead, and shares this so they all read the same number.
export const deLogFilms = (t) => Math.round(Math.exp(t) - 1);

/** the share of a films scatter's y domain left clear at each end of the plot */
export const SCATTER_PAD = 0.04;

// the avg-distance scatter's y domain, from the plotted actors only — the same
// range filmsScatter fits, so this y is exactly where scatterCenters draws a
// dot, and the race's hidden spots (the frontier column, layouts/race.js) send
// the crowd across to it without a vertical slide. The whole corpus's range
// (sub-floor actors reach 4.79 against the plotted 3.14) squashed that y into
// the top of the plot, and every scatter arrival slid down from above.
const SHOWN_AVGS = rawNodes.nodes
	.filter((n) => n[3] >= FILM_MIN_SHOWN)
	.map((n) => n[4]);

const AVG_MIN = Math.min(...SHOWN_AVGS);

const AVG_MAX = Math.max(...SHOWN_AVGS);

const AVG_PAD = (AVG_MAX - AVG_MIN) * SCATTER_PAD;

/** the height the avg-distance scatter draws actor `id` at, by id */
export const scatterY = (id, h) =>
	lin(
		rawNodes.nodes[id][4],
		AVG_MIN - AVG_PAD,
		AVG_MAX + AVG_PAD,
		MARGIN + 8,
		plotBottom(h)
	);

/** distance-vs-films position: where the avg-distance scatter draws an actor */
export function scatterPosition(n, w, h) {
	return [filmX(Math.log(Math.max(1, n.films)), w), scatterY(n.id, h)];
}

/**
 * An axis's ticks from a tier of raw values: every `major` is labelled, every
 * `minor` is an unlabelled mark between them. Majors come first, so a reader
 * of the array meets the labels before the in-between marks.
 * @param {{ major: number[], minor: number[] }} tier
 * @param {(v: number) => number} toPos
 * @param {(v: number) => string} labelOf
 * @returns {import("./layout-types.js").Tick[]}
 */
export const markedTicks = (tier, toPos, labelOf) => [
	...tier.major.map((v) => ({
		pos: toPos(v),
		label: labelOf(v),
		mark: /** @type {const} */ ("major")
	})),
	...tier.minor.map((v) => ({
		pos: toPos(v),
		label: "",
		mark: /** @type {const} */ ("minor")
	}))
];

// the canvas width at which the log axis has room to label 30 as well; the
// same 900px the race chart writes its years in full from
const FILM_AXIS_WIDE_W = 900;

// round film counts to tick the shared log axis at: labels on the 1-2-5
// series, marks on the integer multiples within each decade (so none between
// 10 and 20). Filtered to whatever falls inside the fixed FILM_LOG_MIN/MAX
// range — a corpus rebuild that shrinks the data below one of these just drops
// that tick rather than clamping it into the plot
const FILM_AXIS = {
	narrow: {
		major: [5, 10, 20, 50, 100, 200],
		minor: [6, 7, 8, 9, 30, 40, 60, 70, 80, 90]
	},
	wide: {
		major: [5, 10, 20, 30, 50, 100, 200],
		minor: [6, 7, 8, 9, 40, 60, 70, 80, 90]
	}
};

const inFilmAxis = (f) => Math.log(f) <= FILM_LOG_MAX;

/** x ticks every films-scatter shares: same log scale as scatterPosition's x */
export function filmAxisTicks(w) {
	const tier = FILM_AXIS[w >= FILM_AXIS_WIDE_W ? "wide" : "narrow"];
	return markedTicks(
		{
			major: tier.major.filter(inFilmAxis),
			minor: tier.minor.filter(inFilmAxis)
		},
		(f) => filmX(Math.log(f), w),
		String
	);
}

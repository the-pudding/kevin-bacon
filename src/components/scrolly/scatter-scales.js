// The films scatters' shared scales: the fixed log-films x axis every variant
// plots against, the avg-distance range, and the park spot a node holds when
// the current state does not place it.
import rawNodes from "$data/scrolly-nodes.json";
import { set } from "./attr-buffer.js";
import { CROWD } from "./palette.js";
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

/**
 * Hidden park spot for any node not placed by the current state: its position
 * on the distance-vs-films scatter (alpha 0), so it fades in where a later
 * scatter chapter will want it and rides one tween into place.
 *
 * That is the ARRIVAL case, and it is the only one this still serves. A dot the
 * reader can currently SEE is parked where it stands instead, by ScrollyVisual's
 * parkLeavers, which overrides this spot on the way out — otherwise a departing
 * crowd is lerped to a scatter it is invisible at, in full view, which is what
 * sent the career crowd climbing off the top of the plot. A dot that has never
 * been drawn is untouched and still lands here.
 */
export function parkHidden(attrs, n, w, h) {
	const [x, y] = scatterPosition(n, w, h);
	set(attrs, n.id, x, y, 2, CROWD, 0);
}

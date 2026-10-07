// The plot's geometry on the canvas: the margin, the title band above the
// box, each chart group's plot floor (stacked under the prose or beside it),
// a linear scale, and the bleed the canvas element reaches past the column.

export const MARGIN = 32;

/**
 * px of strip reserved above the canvas box for each chart's title, between the
 * progress bar and the canvas's own MARGIN clearance. This is the source of the
 * `--title-band` custom property, which Stage.svelte sets from it — canvas can't
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

// Where each chart's plot starts and stops, which is how much of the canvas it
// leaves to the chart title above it, and to the step card and its own x-axis
// furniture below it.
//
// STACKED, the step card lies over the canvas's bottom edge, so each chart
// group keeps its foot clear of the TALLEST card among its steps, not the step
// on screen: the plot is one height across the whole group, so a step change
// inside it leaves the axes where they are (motion.md rule 7). Likewise the
// top: a group's plot starts under the tallest of its chart titles.
//
// Both are MEASURED, at the live width and type (Stage.svelte measures a hidden
// copy of every step's card, ScrollyVisual one of every chart title), and
// handed in through `setPlotGeometry`. A constant measured once at one phone
// width cannot see the card or the title a reader actually gets: 375px, 200%
// text, Safari's fonts, a title that wraps. There is no default, either: a
// layout asked for a plot before its geometry has been measured throws rather
// than drawing to a guess (see `geometryOf`), and the canvas does not draw
// until the geometry is in.
//
// BESIDE the prose (a wide viewport — see Stage.svelte's side-by-side rule) the
// step card is not over the canvas at all, so the only thing left to clear is
// the axis furniture and the plot takes nearly the whole column.
//
// Which of the two modes the page is in, and the geometry, are module variables
// rather than more layout arguments because `plotBottom(h, group)` is read from
// the layout modules and from the render path, none of which are handed the
// page's layout. ScrollyVisual owns the setters AND puts both in its layout
// cache key, which is what stops a chart built for one being handed back in
// another.

// Where the x-axis title sits, in canvas coordinates. The title's own home is
// below the tick row; the lifted home is above it, over the bottom of the plot
// (its text-shadow is what makes that legible over the dots).
const X_LABEL_DROP = 32;
const X_LABEL_LIFT = 14;
// clear air kept between the title and the top of the step card
const X_LABEL_CARD_GAP = 24;

export const AXIS_ROOM = X_LABEL_DROP + X_LABEL_CARD_GAP;

/**
 * The groups a state can belong to (`plot` or `card` in the registry,
 * states.js): the five charts with axes, plus three that draw none but are
 * measured the same way — the opening constellation and the rank chapter keep
 * their foot clear of their cards (`intro`, `rank`), and the hop bands their
 * top clear of their title (`hops`).
 * @typedef {"race" | "scatter" | "quiz" | "career" | "sim" | "intro" | "rank" | "hops"} PlotGroup
 */

/**
 * What the DOM measured, for the canvas to lay out against:
 *
 * - `reserves`: per group, the px of the canvas's foot its tallest step card
 *   covers, stacked — capped at the card's own max-height, past which the
 *   card scrolls rather than the plot shrinking further (Stage.svelte). The
 *   opening's also carries the tour caption's band, which sits between the
 *   constellation and the card (Index.svelte).
 * - `titles`: per group, how far its tallest chart title runs past one line,
 *   in px — 0 for a group whose titles all fit on one line.
 * @typedef {{ reserves: Partial<Record<PlotGroup, number>>, titles: Partial<Record<PlotGroup, number>> }} PlotGeometry
 */

export const PLOT_BOTTOM_BESIDE = 0.86;

// the share of the canvas the sky's field crowd is authored down to, stacked:
// what every chart's floor was before the reserves (see shareBottomAt)
const FIELD_BOTTOM_STACKED = 0.6;

let plotBeside = false;

export const setPlotBeside = (beside) => (plotBeside = beside);

export const isPlotBeside = () => plotBeside;

/** @type {PlotGeometry | null} */
let plotGeometry = null;

/** @param {PlotGeometry | null} geometry */
export const setPlotGeometry = (geometry) => (plotGeometry = geometry);

/**
 * The geometry in force, or a throw: there is no reserve or title height to
 * fall back on that would be right for the card or title the reader has.
 * @param {PlotGeometry | null} geometry
 * @returns {PlotGeometry}
 */
function geometryOf(geometry) {
	if (!geometry) throw new Error("plot geometry has not been measured");
	return geometry;
}

/**
 * One measured value of a group, or a throw: a group nothing measured would
 * otherwise read as a plot with no reserve at all.
 * @param {Partial<Record<PlotGroup, number>>} values
 * @param {PlotGroup} group
 */
function measured(values, group) {
	const v = values[group];
	if (v == null) throw new Error(`plot group "${group}" has not been measured`);
	return v;
}

/**
 * The rect the sky's field crowd is authored across (sky.js's fieldBox), which
 * carries no axis and belongs to no chart group: a share of the canvas alone.
 * @param {number} h
 * @param {boolean} beside
 */
export const shareBottomAt = (h, beside) =>
	h * (beside ? PLOT_BOTTOM_BESIDE : FIELD_BOTTOM_STACKED);

/** @param {number} h */
export const shareBottom = (h) => shareBottomAt(h, plotBeside);

/**
 * The px `group` keeps clear at the canvas's foot, stacked.
 * @param {PlotGroup} group
 * @param {PlotGeometry | null} [geometry]
 */
export const reserveOf = (group, geometry = plotGeometry) =>
	measured(geometryOf(geometry).reserves, group);

/**
 * The plot floor for `group` on a canvas `h` tall, in either mode — the pure
 * form, for a caller that tracks `beside` and the geometry itself
 * (ScrollyVisual's furniture). Stacked, the group's reserve and AXIS_ROOM, the
 * room `xLabelTop` wants between the floor and the card to keep the x-axis
 * title at its home under the ticks.
 * @param {number} h
 * @param {PlotGroup} group
 * @param {boolean} beside
 * @param {PlotGeometry | null} [geometry]
 */
export const plotBottomAt = (h, group, beside, geometry = plotGeometry) =>
	beside ? shareBottomAt(h, true) : h - reserveOf(group, geometry) - AXIS_ROOM;

/**
 * @param {number} h
 * @param {PlotGroup} group
 */
export const plotBottom = (h, group) => plotBottomAt(h, group, plotBeside);

/**
 * Where a plot group's chart ends, stacked, in canvas coordinates: the plot
 * floor, the x-axis title's own home under the ticks, and the clear air the
 * title keeps above the step card — the whole of the canvas that is not the
 * card. Stage.svelte centres the step card in what is left below it.
 * @param {number} h
 * @param {PlotGroup} group
 * @param {PlotGeometry | null} [geometry]
 */
export const chartFloor = (h, group, geometry = plotGeometry) =>
	h - reserveOf(group, geometry);

/**
 * How far `group`'s tallest chart title runs past one line, in px.
 * @param {PlotGroup} group
 * @param {PlotGeometry | null} [geometry]
 */
export const titleOverrunOf = (group, geometry = plotGeometry) =>
	measured(geometryOf(geometry).titles, group);

/**
 * How far down the canvas `group`'s chart title leaves room for what hangs
 * under it, in canvas coordinates: MARGIN under a one-line title, and as much
 * further down as the group's tallest title runs past one line. What a chart
 * with no plot floor hangs off it directly (the hop bands, the rank ladder);
 * a plot's own top is `plotTop`, which also keeps the plot from vanishing.
 * @param {PlotGroup} group
 * @param {PlotGeometry | null} [geometry]
 */
export const titleClearance = (group, geometry = plotGeometry) =>
	MARGIN + titleOverrunOf(group, geometry);

/**
 * The least height a plot keeps, title or no title. At a large text size on a
 * small screen the card's reserve, the axis furniture and a four-line title
 * can come to more than the canvas: past this the title runs over the plot's
 * top rather than pushing the top under the floor, which turned the chart
 * upside down into the card.
 */
export const MIN_PLOT_H = 48;

/**
 * The top of `group`'s plot area, in canvas coordinates — the pure form, for a
 * caller that tracks `beside` and the geometry itself: under the group's
 * title (`titleClearance`), so a title that wraps pushes the plot down rather
 * than printing over it, but never closer than MIN_PLOT_H to the floor. Each
 * layout keeps its own offset off it (`+ 8`, `+ 10`, …) for the clear air its
 * top furniture wants.
 * @param {number} h
 * @param {PlotGroup} group
 * @param {boolean} beside
 * @param {PlotGeometry | null} [geometry]
 */
export const plotTopAt = (h, group, beside, geometry = plotGeometry) =>
	Math.min(
		titleClearance(group, geometry),
		plotBottomAt(h, group, beside, geometry) - MIN_PLOT_H
	);

/**
 * @param {number} h
 * @param {PlotGroup} group
 */
export const plotTop = (h, group) => plotTopAt(h, group, plotBeside);

export const lin = (v, d0, d1, r0, r1) =>
	r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/**
 * The `top` of the x-axis title, given the canvas height, how much of the
 * canvas's bottom edge the step card covers (`overlayHeight` — zero beside the
 * prose), the top of the tick row the layout drew (`axes.xBase`) and the
 * plot floor it drew it under (`plotBottom` for the state's group).
 *
 * TWO homes and nothing between them. On a long-prose step the card climbs up
 * the canvas and covers the title's own home under the ticks, so the title
 * crosses the tick row and sits above it instead.
 *
 * The in-between is the part that has to be refused, and a clamp cannot: the
 * two rows are barely a line apart, so a title lifted PART of the way off its
 * home lands on the very numbers it is titling. `Math.max(xBase - 14, ...)`
 * used to allow exactly that — it kept the title from being lifted PAST the
 * ticks without keeping it from being lifted INTO them — and at 375x667 the
 * careerMany card (two paragraphs where careerTrio has one) was 16px tall
 * enough to land in the gap and print "Care20 age30year40" through its own
 * 10/20/30/40. careerTrio cleared the same ticks by 0.2px.
 *
 * Choosing between the homes rather than sliding between them also holds the
 * title still across a scene: careerTrio and careerMany share one scene and
 * their cards differ in height, so a continuous rule walked the title 16px on a
 * step change that is supposed to leave the furniture alone (motion.md rule 7).
 */
export const xLabelTop = (h, cardHeight, xBase, floor) =>
	h - cardHeight - X_LABEL_CARD_GAP >= floor + X_LABEL_DROP
		? floor + X_LABEL_DROP
		: xBase - X_LABEL_LIFT;

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

// The screen-wide chart's cap and its inset from the screen's edges. The inset
// is the reading column's own gutter (#scrolly's --column-gutter), so on a phone
// the chart's left edge lines up with the prose's.
export const SCREEN_CHART_MAX_W = 900;
export const SCREEN_CHART_EDGE = 16;

/**
 * The horizontal span of a chart that runs across the SCREEN rather than the
 * reading column — the hop bands, which the prose lies over (`proseOver` in the
 * state registry). The bled canvas, capped at SCREEN_CHART_MAX_W about the
 * screen's centre, less SCREEN_CHART_EDGE each side. In the column coordinates
 * every layout is authored in, so x0 is negative wherever the screen is wider
 * than the column.
 *
 * One definition because three places line up with it: the layout that plots
 * into it, the chart title centred over it and the search glyph at its right
 * end.
 * @param {number} w
 * @param {Bleed} bleed
 * @returns {[number, number]}
 */
export function screenSpan(w, bleed) {
	const left = -bleed.l;
	const right = w + bleed.r;
	const cx = (left + right) / 2;
	const half =
		Math.min(right - left, SCREEN_CHART_MAX_W) / 2 - SCREEN_CHART_EDGE;
	return [cx - half, cx + half];
}

/**
 * An axis's values at every multiple of `step` inside [vMin, vMax]. Counted in
 * whole steps and rounded, so 0.1-steps land on 2.3 and not
 * 2.3000000000000003 and a minor on a major's value is recognisably the same
 * number.
 * @param {number} step
 * @returns {(vMin: number, vMax: number) => number[]}
 */
export const stepped = (step) => (vMin, vMax) => {
	const values = [];
	for (let k = Math.ceil(vMin / step - 1e-9); k * step <= vMax + 1e-9; k++) {
		values.push(Math.round(k * step * 1e6) / 1e6);
	}
	return values;
};

/**
 * An axis's ticks from a tier of raw values: every `major` is labelled, every
 * `minor` is an unlabelled mark between them, and a minor that lands on a
 * major is dropped. Majors come first, so a reader of the array meets the
 * labels before the in-between marks.
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
	...tier.minor
		.filter((v) => !tier.major.some((m) => Math.abs(m - v) < 1e-9))
		.map((v) => ({
			pos: toPos(v),
			label: "",
			mark: /** @type {const} */ ("minor")
		}))
];

// The plot's geometry on the canvas: the margin, the title band above the
// box, the plot's share of the column (stacked under the prose or beside it),
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

// charts live in the top ~3/5 of the canvas — the step card owns the bottom,
// and the x-axis ticks + axis label (drawn ~32px below this line) need to clear
// the tallest step cards too, so keep the plot clear of the bottom ~40%.
//
// BESIDE the prose (a wide viewport — see Stage.svelte's side-by-side rule) the
// step card is not over the canvas at all, so the only thing left to clear is
// the axis furniture and the plot takes nearly the whole column.
//
// It is a module variable rather than a seventh layout argument because
// `plotBottom(h)` is read from ten layout modules and from the render path,
// none of which are handed the page's layout mode — the same idiom
// `raceTuning` uses for the race dials (layouts/race.js). ScrollyVisual owns the setter AND
// puts the fraction in its layout cache key, which is what stops a chart built
// for one mode being handed back in the other: `w` changes with the mode today,
// so the key would usually miss anyway, but relying on that would make this a
// coincidence rather than a rule.
export const PLOT_BOTTOM_STACKED = 0.6;

export const PLOT_BOTTOM_BESIDE = 0.86;

let plotBottomFrac = PLOT_BOTTOM_STACKED;

export const setPlotBottomFrac = (frac) => (plotBottomFrac = frac);

export const plotBottomFraction = () => plotBottomFrac;

export const plotBottom = (h) => h * plotBottomFrac;

export const lin = (v, d0, d1, r0, r1) =>
	r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

// Where the x-axis title sits, in canvas coordinates. The title's own home is
// below the tick row; the lifted home is above it, over the bottom of the plot
// (its text-shadow is what makes that legible over the dots).
const X_LABEL_DROP = 32;
const X_LABEL_LIFT = 14;
// clear air kept between the title and the top of the step card
const X_LABEL_CARD_GAP = 24;

/**
 * The `top` of the x-axis title, given the canvas height, how much of the
 * canvas's bottom edge the step card covers (`overlayHeight` — zero beside the
 * prose), and the top of the tick row the layout drew (`axes.xBase`).
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
export const xLabelTop = (h, cardHeight, xBase) =>
	h - cardHeight - X_LABEL_CARD_GAP >= plotBottom(h) + X_LABEL_DROP
		? plotBottom(h) + X_LABEL_DROP
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

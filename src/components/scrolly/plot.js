// The plot's geometry on the canvas: the margin, the title band above the
// box, the plot's share of the column (stacked under the prose or beside it),
// a linear scale, and the bleed the canvas element reaches past the column.

export const MARGIN = 32;

/**
 * px of strip reserved above the canvas box for each chart's title, between the
 * progress bar and the canvas's own MARGIN clearance. This is the source of the
 * `--title-band` custom property, which Index.svelte sets from it — canvas can't
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
// BESIDE the prose (a wide viewport — see Index.svelte's side-by-side rule) the
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

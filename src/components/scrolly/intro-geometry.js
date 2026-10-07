// The intro constellation's frame: how the baked planar layout fits the
// canvas, where each of the fifteen stands in it, and the camera pull-back
// about Bacon that hopSeed lands on.
import { ANCHOR_ID, INTRO_LAYOUT } from "./nodes.js";
import { MARGIN, isPlotBeside, reserveOf } from "./plot.js";

export const NETWORK_INTRO_RADIUS = [16, 6, 6, 6, 6];

export const NETWORK_HOP_DELAY_MS = 250;

// anisotropy cap when fitting the landscape intro layout to portrait screens —
// planarity survives axis scaling, and without it 320px viewports squash the
// graph to ~200px tall with the name labels colliding
export const INTRO_MAX_STRETCH = 1.6;

// Where the fit may reach down to. Stacked, the intro group's measured reserve
// owns the foot — the tallest of the opening's cards and, above it, the tour
// caption's own band (Index.svelte), so the caption hangs under the
// constellation without ever being lifted into it. Beside the prose nothing is
// over the canvas, so the graph takes the column down to where the charts'
// plots end, less the caption's line.
const INTRO_BOTTOM_BESIDE = 0.86;

/**
 * @param {number} h
 * @param {import("./plot.js").PlotGeometry} [geometry] the module's own when omitted
 */
const introFitBottom = (h, geometry) =>
	isPlotBeside() ? h * INTRO_BOTTOM_BESIDE : h - reserveOf("intro", geometry);

// px kept between the outermost dots and the canvas's side edges: half the
// widest edge label ("Anya Taylor-Joy" at the labels' 0.75rem), since each name
// is centred under its dot and it is the label, not the dot, that meets the edge
export const INTRO_LABEL_INSET = 60;

// ...and beside the prose, this much more on the right: step 0's "click to
// continue" cue hangs at the next notch on the screen's right edge
// (Stage.svelte's .nav-cue.beside), so the outermost names stop this far short
// of the canvas's edge rather than running in under it.
const INTRO_BESIDE_RIGHT = 100;

// the dots' own x-extent in the baked layout, which sits well inside its 860
// box (and off-centre in it), so fitting the box wasted width on a phone
const INTRO_XS = Object.values(INTRO_LAYOUT.xy).map(([x]) => x);
const INTRO_X0 = Math.min(...INTRO_XS);
const INTRO_X1 = Math.max(...INTRO_XS);

/**
 * The intro fit: scales the baked intro layout into the canvas above the
 * intro group's reserve (~86% of it beside the prose, see introFitBottom; per-axis, each capped at INTRO_MAX_STRETCH beyond uniform) and returns the
 * anchor's fitted screen position plus the axis scales — the one frame every
 * intro-chapter layout hangs off (networkIntro at full size, hopSeed pulled
 * back, see introPosition's `scale`). Across, it fits and centres the dots'
 * extent inside INTRO_LABEL_INSET, less INTRO_BESIDE_RIGHT on the right
 * beside the prose; down, the layout's full 680 height, whose
 * padding below the lowest dot is what keeps that dot's label off the card.
 *
 * `geometry` is for a caller in the DOM (Index.svelte's caption), which has
 * the measurements in hand before ScrollyVisual has handed them to plot.js.
 * @param {number} w
 * @param {number} h
 * @param {import("./plot.js").PlotGeometry} [geometry]
 */
export function introFrame(w, h, geometry) {
	const right = isPlotBeside() ? INTRO_BESIDE_RIGHT : 0;
	const availW = w - INTRO_LABEL_INSET * 2 - right;
	const availH = introFitBottom(h, geometry) - MARGIN;
	const sxRaw = availW / (INTRO_X1 - INTRO_X0);
	const syRaw = availH / INTRO_LAYOUT.h;
	const sx = Math.min(sxRaw, syRaw * INTRO_MAX_STRETCH);
	const sy = Math.min(syRaw, sxRaw * INTRO_MAX_STRETCH);
	// centred in what is left once the right-hand reserve is taken off (the
	// stacked case keeps the plain centring, so its layouts are unchanged)
	const ox = right
		? (w - right - (INTRO_X0 + INTRO_X1) * sx) / 2
		: (w - (INTRO_X0 + INTRO_X1) * sx) / 2;
	const oy = MARGIN + (availH - INTRO_LAYOUT.h * sy) / 2;
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	return { cx: ox + ax * sx, cy: oy + ay * sy, sx, sy };
}

/**
 * Screen position of intro node k in the intro fit — the frame `networkIntro`
 * draws the constellation in.
 *
 * `scale` pulls the camera back about the anchor: every other node collapses
 * toward Bacon while Bacon himself stays exactly where he was, so the one dot
 * the reader has been told is the centre never moves between the full-size
 * constellation and hopSeed's zoomed-out one.
 */
export function introPosition(k, w, h, scale = 1, geometry = undefined) {
	const { cx, cy, sx, sy } = introFrame(w, h, geometry);
	const [ax, ay] = INTRO_LAYOUT.xy[ANCHOR_ID];
	const [x, y] = INTRO_LAYOUT.xy[k];
	return [cx + (x - ax) * sx * scale, cy + (y - ay) * sy * scale];
}

// how far the camera pulls back: far enough that the crowd dots land at the 2px
// the scatter chapters draw the corpus at (and near hopBands' own 3px), so the
// step ends on marks the rest of the story already reads as "one of many"
// rather than on shrunken portraits
export const PULLBACK_DOT_R = 2;

export const PULLBACK_ZOOM = PULLBACK_DOT_R / NETWORK_INTRO_RADIUS[1];

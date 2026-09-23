// The intro constellation's frame: how the baked planar layout fits the
// canvas, where each of the fifteen stands in it, and the camera pull-back
// about Bacon that hopSeed and the chapter cards share.
import { ANCHOR_ID, INTRO_LAYOUT } from "./nodes.js";
import { MARGIN } from "./plot.js";

export const NETWORK_INTRO_RADIUS = [16, 6, 6, 6, 6];

export const NETWORK_HOP_DELAY_MS = 250;

// anisotropy cap when fitting the landscape intro layout to portrait screens —
// planarity survives axis scaling, and without it 320px viewports squash the
// graph to ~200px tall with the name labels colliding
export const INTRO_MAX_STRETCH = 1.6;

/**
 * The intro fit: scales the baked 860×680 intro layout into the top ~72% of
 * the canvas (per-axis, each capped at INTRO_MAX_STRETCH beyond uniform) and
 * returns the anchor's fitted screen position plus the axis scales — the one
 * frame every intro-chapter layout hangs off (networkIntro at full size,
 * hopSeed pulled back, see introPosition's `scale`).
 */
export function introFrame(w, h) {
	const availW = w - MARGIN * 2;
	const availH = h * 0.72 - MARGIN;
	const sxRaw = availW / INTRO_LAYOUT.w;
	const syRaw = availH / INTRO_LAYOUT.h;
	const sx = Math.min(sxRaw, syRaw * INTRO_MAX_STRETCH);
	const sy = Math.min(syRaw, sxRaw * INTRO_MAX_STRETCH);
	const ox = (w - INTRO_LAYOUT.w * sx) / 2;
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
export function introPosition(k, w, h, scale = 1) {
	const { cx, cy, sx, sy } = introFrame(w, h);
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

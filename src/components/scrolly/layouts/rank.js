import { ANCHOR_ID, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	MARGIN,
	set,
	parkHidden,
	HOP_RGB,
	INK
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Rank chapter (present): the canvas's only job now is the handoff from
// hopBands — Bacon's hop-breakdown bar tweens from his hopBands position into
// this small stacked dot-waffle, staying fully visible (no fade-out) since
// the rank list's opaque HTML panel (RankBars.svelte, faded in by
// Index.svelte once the tween has had time to read) lands on top and covers
// it — the dots don't need to dissolve themselves.
// ---------------------------------------------------------------------------

// fallback before RankBars has measured its centered focus row (see params
// below) — only ever visible for a frame or two on first mount
const BACON_Y = MARGIN + 40;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutRank(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const x0 = MARGIN;
	// RankBars reports where its centered focus row actually lands on screen
	// (story.rankFocusY) — the bar tweens to meet it there, not a fixed spot
	const baconY = params?.baconY ?? BACON_Y;

	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) if (n.hop >= 0) counts[n.hop]++;
	const dataTotal = counts[1] + counts[2] + counts[3] + counts[4];
	const maxBarW = w - MARGIN * 2;

	// segment boundaries mirror RankBars' own per-actor bar proportions
	const segBounds = [x0];
	for (let hop = 1; hop <= 4; hop++) {
		segBounds.push(segBounds[hop - 1] + (counts[hop] / dataTotal) * maxBarW);
	}

	// every hop 1–4 actor (not just a sample) tweens from its hopBands spot
	// into its own color's segment — the whole band converges into the bar,
	// not a borrowed handful of stand-ins
	for (const n of nodes) {
		if (n.hop < 1 || n.hop > 4) continue;
		const segX = segBounds[n.hop - 1];
		const segW = segBounds[n.hop] - segX;
		const x = segX + hash01(n.id, 6) * segW;
		const y = baconY + (hash01(n.id, 7) - 0.5) * 4;
		set(attrs, n.id, x, y, 1.6, HOP_RGB[n.hop], 0.5);
	}
	set(attrs, ANCHOR_ID, x0 - 10, baconY, 7, INK, 1);

	// everyone else parks off-canvas (hidden), ready for whichever chapter
	// picks them up next, instead of jittering around as background noise
	for (const n of nodes) {
		if (n.id === ANCHOR_ID || (n.hop >= 1 && n.hop <= 4)) continue;
		parkHidden(attrs, n, w, h);
	}

	// no canvas legend: the hop key lives inside the RankBars panel it explains
	return { attrs };
}

const params = (s) => ({ baconY: s.rankFocusY });

export const states = {
	rankFocus: { layout: layoutRank, params },
	rankReveal: { layout: layoutRank, params }
};

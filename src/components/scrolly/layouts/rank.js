import { ANCHOR_ID, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	MARGIN,
	set,
	parkHidden,
	HOP_RGB,
	INK,
	RANK_BAR_H,
	RANK_DOT_D,
	hopDotSlots,
	hopFractions
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
	// RankBars reports the box its centered row's bar actually occupies
	// (story.rankFocusBar) — the canvas bar tweens to meet it there, not a fixed
	// spot, so the strip the dots land on is the strip the panel then draws
	const bar = params?.bar;
	const baconY = bar?.y ?? BACON_Y;
	const x0 = bar?.x ?? MARGIN;
	const maxBarW = bar?.w ?? w - MARGIN * 2;

	// Bacon's own corpus hop shares and dot lattice — the exact points his
	// RankBars row draws (layout-shared.js), not an approximation of them, so
	// the frame this tween settles on is the frame the panel then fades over.
	const slots = hopDotSlots(hopFractions(ANCHOR_ID), maxBarW, ANCHOR_ID);

	// every hop 1–4 actor (not just a sample) tweens from its hopBands spot onto
	// one of his row's dots — the whole band converges into the bar, several
	// hundred actors per dot, rather than a borrowed handful of stand-ins
	for (const n of nodes) {
		if (n.hop < 1 || n.hop > 4) continue;
		const dots = slots[n.hop - 1];
		const dot = dots[Math.floor(hash01(n.id, 6) * dots.length)];
		set(
			attrs,
			n.id,
			x0 + dot.x,
			baconY - RANK_BAR_H / 2 + dot.y,
			RANK_DOT_D / 2,
			HOP_RGB[n.hop],
			1
		);
	}
	// Bacon himself sits in the gutter to the left of the bar (the row's own
	// left padding, once the panel lands), flush against its start
	const BACON_R = 7;
	set(attrs, ANCHOR_ID, x0 - BACON_R - 2, baconY, BACON_R, INK, 1);

	// everyone else parks off-canvas (hidden), ready for whichever chapter
	// picks them up next, instead of jittering around as background noise
	for (const n of nodes) {
		if (n.id === ANCHOR_ID || (n.hop >= 1 && n.hop <= 4)) continue;
		parkHidden(attrs, n, w, h);
	}

	// no canvas legend: the hop key lives inside the RankBars panel it explains
	return { attrs };
}

const params = (s) => ({ bar: s.rankFocusBar });

export const states = {
	rankFocus: { layout: layoutRank, params },
	rankReveal: { layout: layoutRank, params }
};

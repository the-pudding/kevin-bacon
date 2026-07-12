import { ANCHOR_ID, NODE_COUNT, hash01 } from "../nodes.js";
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
// hopBands — Bacon's own hop-breakdown bar tweens from his hopBands position
// into this small stacked dot-waffle, fading out as it arrives (target alpha
// 0), so the motion reads as "Bacon flies up here, dissolving into the
// legend." The legend (the "key" explaining the bar colours) is the only
// thing left standing once the tween settles; everyone else's bar lives in
// the plain HTML/CSS list (RankBars.svelte) rendered underneath — see
// notes/scrolly-framework.md for why per-actor hop-breakdowns beyond Bacon's
// aren't real data we have.
// ---------------------------------------------------------------------------

const BACON_BAR_DOTS = 60;
const BACON_Y = MARGIN + 40;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutRank(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const x0 = MARGIN;

	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) if (n.hop >= 0) counts[n.hop]++;
	const dataTotal = counts[1] + counts[2] + counts[3] + counts[4];
	const maxBarW = w - MARGIN * 2;
	const cell = Math.min(5, maxBarW / BACON_BAR_DOTS);

	// borrow spare node ids as waffle dots for Bacon's stacked bar (the
	// renderer draws one dot per node id — see win-bars.js for the pattern)
	const pool = [...Array(NODE_COUNT).keys()]
		.filter((id) => id !== ANCHOR_ID)
		.sort((a, b) => hash01(a, 6) - hash01(b, 6));
	let p = 0;
	const used = new Set();

	// target alpha 0: these dots still tween into their bar position (the
	// visible handoff from hopBands), they just arrive fully faded out
	let segX = x0;
	for (let hop = 1; hop <= 4; hop++) {
		const dots = Math.round((counts[hop] / dataTotal) * BACON_BAR_DOTS);
		for (let k = 0; k < dots; k++) {
			const id = pool[p++];
			used.add(id);
			set(attrs, id, segX + k * cell, BACON_Y, 2.4, HOP_RGB[hop], 0);
		}
		segX += dots * cell;
	}
	set(attrs, ANCHOR_ID, x0 - 10, BACON_Y, 7, INK, 0);

	// everyone else parks off-canvas (hidden), ready for whichever chapter
	// picks them up next, instead of jittering around as background noise
	for (const n of nodes) {
		if (n.id === ANCHOR_ID || used.has(n.id)) continue;
		parkHidden(attrs, n, w, h);
	}

	const legend = [1, 2, 3, 4].map((hop) => ({
		color: HOP_RGB[hop],
		label: `${hop} movie${hop > 1 ? "s" : ""}`
	}));

	return { attrs, legend, legendY: BACON_Y + 20 };
}

export const states = {
	rankFocus: { layout: layoutRank },
	rankReveal: { layout: layoutRank }
};

import { ANCHOR_ID, hash01 } from "../nodes.js";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import { RIGHT, drain } from "../drain.js";
import { CROWD, HOP_RGB, HOP_DOT_ALPHA, INK } from "../palette.js";
import { MARGIN } from "../plot.js";
import {
	RANK_BAR_H,
	RANK_DOT_D,
	hopDotSlots,
	hopFractions
} from "../rank-geometry.js";

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

/** @type {import("../layout-types.js").LayoutFn} */
function layoutRank(nodes, w, _h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	// RankBars reports the box its centered row's bar actually occupies
	// (story.rank.focusBar) — the canvas bar tweens to meet it there, not a fixed
	// spot, so the strip the dots land on is the strip the panel then draws
	const {
		x: x0,
		y: baconY,
		w: maxBarW
	} = params?.bar ?? { x: MARGIN, y: BACON_Y, w: w - MARGIN * 2 };

	// Bacon's own corpus hop shares, cut through the strip's shared scatter —
	// the exact points his RankBars row draws (rank-geometry.js), not an
	// approximation of them, so the frame this tween settles on is the frame the
	// panel then fades over.
	const slots = hopDotSlots(hopFractions(ANCHOR_ID), maxBarW);
	// stepping back out of the race, the ladder is rebuilt over the canvas
	// rather than landing on a bar the canvas has built first: the race cast
	// leaves, and nothing is drawn under the panel's fade-in (story.rank.bareCanvas).
	// Bare, the bar is still where every dot stands, hidden.
	const shown = params?.bare ? 0 : 1;
	// Bacon himself sits in the gutter to the left of the bar (the row's own
	// left padding, once the panel lands), flush against its start
	const BACON_R = 7;
	const bx = x0 - BACON_R - 2;
	// Everyone the bar does not hold stands hidden on Bacon's dot, so the rows
	// a step back onto the hop chart shows grow out of his bar, as the forward
	// step poured them into it, and the race cast the rank handoff shows sets
	// off from it too.
	for (const n of nodes) {
		if (inBar(n)) placeInBar(attrs, n, slots, x0, baconY, shown);
		else set(attrs, n.id, bx, baconY, RANK_DOT_D / 2, CROWD, 0);
	}
	set(attrs, ANCHOR_ID, bx, baconY, BACON_R, INK, shown);
	// no hop key on the canvas: this bar is only ever on screen for the length of
	// the arrival tween before the panel covers it, and the hop-bands step just
	// before it establishes the colours. The key the rank chapter does owe the
	// reader is on the panel instead, where every row prints its own four shares
	// of the corpus under its bands (RankBars.svelte) — something this bar, drawn
	// from one actor's shares, could never do for the other 249.
	return { attrs };
}

// every hop 1–4 actor (not just a sample) tweens from its hopBands spot onto
// one of Bacon's row's dots — the whole band converges into the bar, several
// hundred actors per dot, rather than a borrowed handful of stand-ins. The race
// cast converges with everyone else: the race arrival doesn't glide anyone out
// of the bar, it freezes the whole rank scene where it stands, fades it out in
// place, and draws the chart on fresh (see the draw-on entry in
// layouts/race.js), so excluding them bought nothing and cost the bar 18% of
// its hop-1 dots. Everyone else waits hidden on Bacon's dot rather than
// jittering around as background noise.
const inBar = (n) => n.hop >= 1 && n.hop <= 4;
/** `shown` 0 hides the dot on its bar spot (the bare canvas) */
function placeInBar(attrs, n, slots, x0, baconY, shown) {
	const dots = slots[n.hop - 1];
	const dot = dots[Math.floor(hash01(n.id, 6) * dots.length)];
	set(
		attrs,
		n.id,
		x0 + dot.x,
		baconY - RANK_BAR_H / 2 + dot.y,
		RANK_DOT_D / 2,
		HOP_RGB[n.hop],
		// the same alpha the hopBands crowd arrives wearing: these dots pack
		// several hundred actors onto each other, so the overlap has to read
		HOP_DOT_ALPHA * shown
	);
}

const params = (s) => ({ bar: s.rank.focusBar, bare: s.rank.bareCanvas });

const title = "Ranking Actors by Remoteness Score";

export const states = {
	// one scene, so the title holds across the reveal rather than fading out and in
	rankFocus: {
		layout: layoutRank,
		params,
		scene: "rank",
		title,
		// the bands collapse onto Bacon's bar on a curve: the drain (drain.js),
		// turning the way the title card's fall does. Back out of the bar (a
		// step back past rankReveal) fans out straight.
		curve: { from: ["hopAnchor"], bows: drain(RIGHT) }
	},
	rankReveal: { layout: layoutRank, params, scene: "rank", title }
};

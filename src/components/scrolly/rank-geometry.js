// The rank hop-breakdown bar: a hop-bands chart turned on its side, hops 1→4
// left to right, individual actors drawn as dots inside their band. Shared by
// the canvas handoff (layouts/rank.js) and the HTML list it dissolves into
// (RankBars.svelte) so the two land dot-for-dot on the same geometry.
import story from "$data/scrolly-story.json";
import { dotHash } from "./nodes.js";

export const RANK_BAR_H = 10;

// px, the dotted strip's height
// px floor per band. Also the minimum-nodes guarantee: dots are units of width,
// so the floor that keeps a sparse hop (hop 4 is ~0.1% of a row) visible is
// what keeps a handful of its dots on screen.
export const RANK_SEG_MIN = 10;

// Whitespace between adjacent hop bands — the horizontal twin of hop-bands.js's
// BAND_GAP. Reserved out of the width BEFORE the shares are struck, so it is
// real whitespace and every band still gets its honest share of what is left.
// Small where that one is 12px: this strip is only RANK_BAR_H tall, so 12px of
// hole in it reads as four missing dot columns rather than a seam.
export const RANK_BAND_GAP = 5;

export const RANK_DOT_D = 2.4;

// px dot diameter
export const RANK_DOT_ROWS = 5;

// dot rows stacked within RANK_BAR_H
export const RANK_DOT_PITCH = 3;

// px between dot columns
// How much of its own lattice cell a dot may wander over — 1 is the whole cell,
// so past about half of one neighbours start to overlap and the strip reads as
// a crowd rather than a stamped grid. Deliberately NOT a fraction of the slack
// left around the dot: at this pitch that slack is half a pixel, so a
// slack-based nudge is no nudge at all and the lattice shows straight through.
export const RANK_DOT_JITTER = 0.9;

// How long the list's bars take to collapse into single nodes when the story
// steps on into the race chapter (RankBars' `collapse`). Shared vocabulary: the
// panel owns the clock and the canvas waits for it (story.rank.collapsed), so
// this lives here rather than in either component.
export const RANK_COLLAPSE_MS = 500;

/**
 * The boxes of hop bands 1–4 across `width`: each gets RANK_SEG_MIN plus its
 * share of whatever those floors and the three gaps between the bands leave
 * behind, so the proportions still read while no band disappears. Widths plus
 * gaps sum to exactly `width`.
 * @param {number[]} fractions four shares summing to 1
 * @param {number} width px
 * @returns {{x: number, w: number}[]} one box per hop band
 */
export function hopBandBoxes(fractions, width) {
	const free = width - RANK_SEG_MIN * fractions.length - RANK_BAND_GAP * 3;
	const boxes = [];
	let x = 0;
	for (const fraction of fractions) {
		const w = RANK_SEG_MIN + free * fraction;
		boxes.push({ x, w });
		x += w + RANK_BAND_GAP;
	}
	return boxes;
}

/** an actor's hop 1–4 shares of the corpus, from the rankHopBands export */
export function hopFractions(id) {
	const counts = story.rankHopBands[id];
	const total = counts.reduce((sum, count) => sum + count, 0);
	return counts.map((count) => count / total);
}

/**
 * The four hop shares as reader-facing percentages, shared by every chart that
 * prints them so the story states the same split the same way everywhere.
 *
 * Hops 1–3 are apportioned by largest remainder rather than rounded one by one:
 * independent rounding lands on 99 or 101 for 58 of the ladder's 250 rows, and
 * a reader adding up four numbers on one bar notices. Hop 4 is deliberately
 * outside that arithmetic — it is under 0.25% of every actor's corpus, so it
 * can only ever be the rounding dust, and it takes a bound (`<0.1%`) instead of
 * an integer because "0%" would write off a whole degree of separation that
 * genuinely has people in it. That leaves the three printed integers summing to
 * exactly 100 on every row.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @returns {string[]} four display strings
 */
export function hopShareLabels(fractions) {
	const pct = fractions.map((share) => share * 100);
	const counted = pct.slice(0, 3);
	const whole = counted.map(Math.floor);
	// at most one unit per band is ever lost to the floors, so a single pass
	// down the remainders always spends the shortfall
	let short = 100 - whole.reduce((sum, n) => sum + n, 0);
	const byRemainder = counted
		.map((p, band) => ({ band, rem: p - whole[band] }))
		.sort((a, b) => b.rem - a.rem);
	for (const { band } of byRemainder) {
		if (short <= 0) break;
		whole[band] += 1;
		short -= 1;
	}
	const hop4 = Math.ceil(pct[3] * 10) / 10;
	return [...whole.map((n) => `${n}%`), `<${hop4.toFixed(1)}%`];
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Keeps one band's jitter keys clear of the next band's. Must exceed the widest
// band's own key range, `cols * RANK_DOT_ROWS` — about 3300 at the widest
// viewport this list is read at.
const DOT_KEY_STRIDE = 4096;

/**
 * The dot positions of one actor's bar: per band, a lattice of columns × rows
 * across the band's own width, each dot nudged off the lattice so the strip
 * reads as a crowd. `id` keys that nudge, so a row's dots are stable.
 *
 * Both sides of the rank handoff draw these exact points — the HTML row as one
 * path per band, the canvas as the spot each converging actor lands on — so
 * the frame the canvas settles into is the frame the panel then covers.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @param {number} width px
 * @param {number} id node id keying the jitter
 * @returns {{x: number, y: number}[][]} one array of dots per hop band
 */
export function hopDotSlots(fractions, width, id) {
	const rowH = RANK_BAR_H / RANK_DOT_ROWS;
	const r = RANK_DOT_D / 2;
	const jitterY = rowH * RANK_DOT_JITTER;
	return hopBandBoxes(fractions, width).map(({ x: x0, w: segW }, band) => {
		// at least one column: a band this narrow is one the min-width floor is
		// carrying, and it still owes the reader its colour
		const cols = Math.max(1, Math.round(segW / RANK_DOT_PITCH));
		const pitch = segW / cols;
		const jitterX = pitch * RANK_DOT_JITTER;
		const dots = [];
		for (let col = 0; col < cols; col++) {
			for (let row = 0; row < RANK_DOT_ROWS; row++) {
				const key =
					(id * 4 + band) * DOT_KEY_STRIDE + col * RANK_DOT_ROWS + row;
				// clamped to the band's own box: a jitter this wide is meant to spill
				// across cells, but spilling past the band would eat the gap that
				// separates the colours and clip against the strip's top and bottom
				dots.push({
					x: clamp(
						x0 + (col + 0.5) * pitch + (dotHash(key, 8) - 0.5) * jitterX,
						x0 + r,
						x0 + segW - r
					),
					y: clamp(
						(row + 0.5) * rowH + (dotHash(key, 9) - 0.5) * jitterY,
						r,
						RANK_BAR_H - r
					)
				});
			}
		}
		return dots;
	});
}

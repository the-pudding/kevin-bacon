// The rank hop-breakdown bar: a hop-bands chart turned on its side, hops 1→4
// left to right, individual actors drawn as dots inside their band. Shared by
// the canvas handoff (layouts/rank.js) and the HTML list it dissolves into
// (RankBars.svelte) so the two land dot-for-dot on the same geometry.
import story from "$data/scrolly-story.json";
import { blueNoiseSeats } from "./blue-noise.js";

// px, the dotted strip's height
export const RANK_BAR_H = 20;

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

// px dot diameter
export const RANK_DOT_D = 2.4;

// px, the least clear space between neighbours, edge to edge — hop-bands.js's
// DOT_GAP in proportion to this strip's much smaller dot (0.5px on a 6px dot
// there), so the two crowds pack alike
export const RANK_DOT_GAP = 0.2;

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

/**
 * The seats every row's strip is cut from: one blue-noise scatter (see
 * blue-noise.js) across the strip with its three band gaps taken out, sorted
 * left to right — hop-bands' crowdSeats turned on its side. One scatter for
 * all 250 rows, the way hop bands keeps one for every anchor: an actor's row
 * is where the cuts fall, not a deal of its own.
 * @param {number} width px, the whole strip's, gaps included
 * @returns {number[][]} [x, y] per seat, x measured along the gapless strip
 */
function stripSeats(width) {
	const r = RANK_DOT_D / 2;
	return blueNoiseSeats(
		{
			x: r,
			y: r,
			w: width - RANK_BAND_GAP * 3 - RANK_DOT_D,
			h: RANK_BAR_H - RANK_DOT_D
		},
		RANK_DOT_D + RANK_DOT_GAP,
		8,
		0
	);
}

/**
 * The dot positions of one actor's bar, per band: the strip's seats cut at the
 * band boundaries, each band moved right a RANK_BAND_GAP further than the one
 * before it — hop-bands' rows and bandOffset, on the other axis. The seats are
 * sorted by x, so the gaps only pull the bands apart and no two dots overlap
 * across a cut. The boxes are hopBandBoxes' own, so the share labels laid out
 * against them sit under the dots they name.
 *
 * Both sides of the rank handoff draw these exact points — the HTML row as one
 * path per band, the canvas as the spot each converging actor lands on — so
 * the frame the canvas settles into is the frame the panel then covers.
 * @param {number[]} fractions four hop shares (see hopFractions)
 * @param {number} width px
 * @returns {{x: number, y: number}[][]} one array of dots per hop band
 */
export function hopDotSlots(fractions, width) {
	const seats = stripSeats(width);
	return hopBandBoxes(fractions, width).map(({ x, w }, band) => {
		const shift = band * RANK_BAND_GAP;
		const lo = x - shift;
		return seats
			.filter(([sx]) => sx >= lo && sx < lo + w)
			.map(([sx, sy]) => ({ x: sx + shift, y: sy }));
	});
}

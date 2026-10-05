// The canvas renderer: one frame of the attr and trail buffers onto a 2D
// context, in four passes — trails under everything, then the network's edges,
// then the dots, then the leader lines that tie a nudged name back to its dot.
// Pure over (ctx, buffers): it reads nothing reactive and owns no state beyond
// the scratch collections it reuses so a frame allocates nothing.
import { STRIDE, EDGE_BASE } from "./attr-buffer.js";
import {
	ANCHOR_HALO,
	EDGE_GREY,
	EDGE_HIGHLIGHT,
	FOCUS,
	INK
} from "./palette.js";
import { TITLE_BAND } from "./plot.js";
import { TRAIL_STRIDE, TRAIL_POINTS, TRAIL_META } from "./trails.js";

/**
 * Below this a mark is not drawn. Exported because it is the renderer's own
 * floor and the arrival path has to ask the same question — "can the reader see
 * this?" — when it decides what is leaving and what is arriving. A difference
 * this small is also Float32 noise, which matters when the live frame and a
 * target are compared across the two precisions.
 */
export const ALPHA_SEEN = 0.004;

const TAU = Math.PI * 2;
// one Path2D per (quantised rgb, alpha bucket): batches ~1k dots into a
// handful of fills instead of a fillStyle + fill per dot
const dotBuckets = new Map();
// slots drawn in the second and third trail passes, reused rather than
// allocated per frame
/** @type {number[]} */
const inkedTrails = [];
/** @type {number[]} */
const focusedTrails = [];
// ...and the dots drawn over the rest, likewise
/** @type {number[]} */
const lateDots = [];
const focusedDots = [];
// A focused dot's least radius: the race leader's (raceDotSpec), so the actor a
// hovered callout is about reads as the leader does.
const FOCUS_DOT_R = 4;
/** @type {ReadonlySet<number>} */
const NO_FOCUS = new Set();

/** a plain network link's stroke at `alpha` */
const edgeStroke = (alpha) => `rgba(${EDGE_GREY.join(", ")}, ${alpha})`;

/**
 * A highlighted route's stroke, over the plain link it runs along. Its own
 * opacity rather than the link's: the link under a route is as dim as the rest
 * of the network, so that the ink travelling along it is the only thing that
 * moves (see layouts/intro.js's DIM_EDGE_ALPHA).
 */
const routeStroke = (fade) =>
	`rgba(${EDGE_HIGHLIGHT.join(", ")}, ${0.95 * fade})`;
const ROUTE_WIDTH = 2.25;

/**
 * How much of an edge its route covers, and how opaque it is. A route being
 * drawn grows along the line at full ink. A route being LEFT (its target
 * covers none of the line) does not retract: it holds the length it had when
 * the pick changed — the frame the tween left, as a dying line holds its ends
 * (motion.md rule 2) — and fades out in place, its opacity riding the covered
 * share down to zero.
 * @returns {[number, number]} [covered, fade]
 */
function routeDraw(attrs, target, start, i) {
	const covered = attrs[i + 2];
	const leaving = !target || target[i + 2] <= ALPHA_SEEN;
	if (!leaving) return [covered, 1];
	const held = start[i + 2];
	return held > ALPHA_SEEN ? [held, covered / held] : [covered, 1];
}

/**
 * Clear the bled canvas: past the column on both sides and above its top edge.
 * The origin sits on `.visual`'s top left corner, so clearing [0, w] x [0, h]
 * would leave a full-bleed sky smeared across the bleed and the title
 * band for the rest of the story.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./plot.js").Bleed} bleed
 */
export function clearCanvas(ctx, w, h, bleed) {
	ctx.clearRect(-bleed.l, -TITLE_BAND, w + bleed.l + bleed.r, h + TITLE_BAND);
}

// every trail slot in its own order: drawTrails' paint order without one given
const SLOT_ORDER = TRAIL_META.map((_, t) => t);

// actor id -> the solid [r, g, b] their dot takes this frame: their line's
// colour (rankShades). Empty unless a style ranks the lines.
const dotTints = new Map();

/**
 * A dot's rgb: its line's, where the frame tints it (dotTints), else its own.
 * Ink dots (the leader, the named Gen-Z cast) keep their own. Written into
 * `out` rather than returned, since drawDots asks this of every dot.
 * @param {Float32Array} attrs @param {number} i @param {number[]} out
 */
function dotRgb(attrs, i, out) {
	const tint = dotTints.size ? dotTints.get(i / STRIDE) : undefined;
	const ink =
		attrs[i + 3] === INK[0] &&
		attrs[i + 4] === INK[1] &&
		attrs[i + 5] === INK[2];
	const src = tint && !ink ? tint : null;
	out[0] = src ? src[0] : attrs[i + 3];
	out[1] = src ? src[1] : attrs[i + 4];
	out[2] = src ? src[2] : attrs[i + 5];
	return out;
}
const rgbScratch = [0, 0, 0];

// Each slot's rank this frame among the lines on screen, 0 at the top to 1 at
// the bottom (rankShades); -1 for a line that is not ranked.
const ranks = new Float32Array(TRAIL_META.length);
const ranked = [];

/**
 * Every ranked line's place among the lines on screen: the order is 2025's
 * (most remote first), so the first drawn is the lowest ranked, at 1, and the
 * last the highest, at 0. Ranked on screen rather than against the whole cast,
 * so the handful a step shows spans the range. See rankedStroke for what a
 * rank buys.
 * @param {Float32Array} trailAttrs
 * @param {readonly number[] | undefined} order
 * @param {{ shadeSlots?: ReadonlySet<number> } | null | undefined} style
 */
function rankShades(trailAttrs, order, style) {
	ranks.fill(-1);
	dotTints.clear();
	if (!order || !style?.shadeSlots) return;
	ranked.length = 0;
	for (const t of order) {
		const alpha = trailAttrs[t * TRAIL_STRIDE + TRAIL_POINTS * 2];
		if (style.shadeSlots.has(t) && alpha > 0.008) ranked.push(t);
	}
	const n = ranked.length;
	for (let i = 0; i < n; i++) ranks[ranked[i]] = n < 2 ? 0 : 1 - i / (n - 1);
	// each ranked line's actor's dot, in the colour the line reads as: its rgb
	// at its resting alpha, laid over the halo colour (the plot's ground), so
	// the dot is solid and still matches it
	for (const t of ranked) {
		const [rgb, a] = rankedStroke(t, TRAIL_META[t].rgb, style.full, style);
		dotTints.set(
			TRAIL_META[t].id,
			rgb.map((c, k) => Math.round(c * a + style.rgb[k] * (1 - a)))
		);
	}
}

/**
 * A ranked line's colour and alpha: from `style.top` (an rgb and the alpha it
 * is drawn at) for the highest ranked, down to its own colour taken
 * `style.shade` of the way toward the halo's at its own alpha for the lowest,
 * evenly between. The alpha is scaled rather than set, so a line fading in or
 * out still fades in proportion. Unranked lines are returned as they came.
 * @returns {[number[], number]}
 */
function rankedStroke(t, own, alpha, style) {
	const r = style ? ranks[t] : -1;
	if (r < 0) return [own, alpha];
	const bottom = own.map((c, k) => c + (style.rgb[k] - c) * style.shade);
	const rgb = bottom.map((c, k) =>
		Math.round(style.top.rgb[k] + (c - style.top.rgb[k]) * r)
	);
	const lift = style.top.alpha / style.full;
	return [rgb, Math.min(1, alpha * (lift + (1 - lift) * r))];
}

// how much wider than its line a trail's halo is, both sides together
const HALO_SPREAD = 2;

/**
 * One trail polyline. `hi` (0-1) blends its TRAIL_META colour toward `toward`
 * — INK is the whole of how the race chart marks whoever is leading at its
 * camera, at the field's own width; FOCUS, the line a hovered callout is about,
 * also thickens by up to half a pixel.
 *
 * With a `halo`, the same path is stroked first in the halo's colour, two
 * pixels wider (a pixel each side), so the line parts any line drawn before it
 * where the two cross.
 * The halo fades with its line: solid for a line at `halo.full` alpha or more,
 * so a line fading out does not leave a dark groove where it was. The line's
 * own colour is taken toward the halo's by its shade (rankShades) first.
 * @param {{ rgb: number[], full: number } | null} [halo]
 */
function strokeTrail(ctx, trailAttrs, t, alpha, hi, toward = INK, halo = null) {
	const base = t * TRAIL_STRIDE;
	const { rgb: own, width: lw } = TRAIL_META[t];
	const [rgb, lineAlpha] = hi
		? [own, alpha]
		: rankedStroke(t, own, alpha, halo);
	const width = toward === FOCUS ? lw + hi * 0.5 : lw;
	ctx.beginPath();
	ctx.moveTo(trailAttrs[base], trailAttrs[base + 1]);
	for (let k = 1; k < TRAIL_POINTS; k++) {
		ctx.lineTo(trailAttrs[base + k * 2], trailAttrs[base + k * 2 + 1]);
	}
	if (halo) {
		ctx.strokeStyle = `rgba(${halo.rgb[0]}, ${halo.rgb[1]}, ${halo.rgb[2]}, ${Math.min(1, alpha / halo.full)})`;
		ctx.lineWidth = width + HALO_SPREAD;
		ctx.stroke();
	}
	ctx.strokeStyle = hi
		? `rgba(${rgb.map((c, k) => Math.round(c + (toward[k] - c) * hi)).join(", ")}, ${alpha})`
		: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${lineAlpha})`;
	ctx.lineWidth = width;
	ctx.stroke();
}

/**
 * Trails under everything: race/career lines, the prediction diagonal. An
 * INKED line (the race chart's leader — see setTrailHighlight) is held back to
 * a second pass so the crown is drawn over the field rather than buried under
 * whichever grey neighbour happens to own a later slot, and a FOCUSED one (the
 * actor a hovered callout is about) to a third, over the crown as well.
 *
 * Focus is the renderer's alone, not the buffer's: it is a hover, so it goes on
 * and off with the pointer rather than tweening with the step.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} trailAttrs
 * @param {ReadonlySet<number>} [focus] trail slots drawn in FOCUS
 * @param {{ rgb: number[], full: number, shade?: number, top?: { rgb: number[], alpha: number }, shadeSlots?: ReadonlySet<number> } | null} [halo]
 *   a band behind every line (see strokeTrail), and with `shadeSlots`, each of
 *   those lines graded by rank from `top` down to `shade` (rankedStroke)
 * @param {readonly number[] | null} [order] every trail slot, in the order to
 *   paint them (the race chart's RACE_PAINT_ORDER); slot order without one
 */
export function drawTrails(ctx, trailAttrs, focus = NO_FOCUS, halo, order) {
	inkedTrails.length = 0;
	focusedTrails.length = 0;
	rankShades(trailAttrs, order, halo);
	for (const t of order ?? SLOT_ORDER) {
		const base = t * TRAIL_STRIDE;
		const alpha = trailAttrs[base + TRAIL_POINTS * 2];
		if (alpha <= 0.008) continue;
		const hi = trailAttrs[base + TRAIL_POINTS * 2 + 1];
		if (focus.has(t)) focusedTrails.push(t);
		else if (hi > ALPHA_SEEN) inkedTrails.push(t);
		else strokeTrail(ctx, trailAttrs, t, alpha, 0, INK, halo);
	}
	// the leader's line is solid white, not the field's 0.35: its alpha rises
	// to 1 with the highlight, so a lead changing hands mid-pan still blends
	for (const t of inkedTrails) {
		const base = t * TRAIL_STRIDE;
		const alpha = trailAttrs[base + TRAIL_POINTS * 2];
		const hi = trailAttrs[base + TRAIL_POINTS * 2 + 1];
		strokeTrail(ctx, trailAttrs, t, alpha + (1 - alpha) * hi, hi, INK, halo);
	}
	for (const t of focusedTrails) {
		strokeTrail(
			ctx,
			trailAttrs,
			t,
			trailAttrs[t * TRAIL_STRIDE + TRAIL_POINTS * 2],
			1,
			FOCUS,
			halo
		);
	}
	ctx.lineWidth = 1;
}

/**
 * The network's edges, each drawn from its lower-hop end toward the other by
 * its own progress slot, so a line grows from Bacon outward.
 *
 * A highlighted route travels the other way: slot 2 is how much of the line
 * the route has covered, measured from the OUTER end, so a route lit from an
 * actor reads as a walk from them in to Bacon — and one being left fades
 * where it lies rather than walking back out (routeDraw) (the layout chains the legs;
 * see layouts/intro.js's routeWalk). The routes go on in a second pass, over
 * every plain line, so a later link never cuts across one.
 *
 * A live (target alpha > 0) line's far endpoint is drawn at its FINAL spot,
 * not its live position, so the line points to where the actor is going and
 * the actor slides onto it, instead of the angle swinging as the actor tweens
 * into place; a dying line (faded out in the target frame) is drawn to the frame
 * the tween left instead — BOTH ends — because it is leaving, and what is
 * leaving holds still while it fades (motion.md rule 2). The target says nothing
 * about it (those endpoint positions belong to a layout this edge isn't part of)
 * and the live buffer would drag it across the canvas behind two travelling
 * dots. "Where it is going" is the TWEENER's target, not the state's
 * static layout: an entry choreography arrives onto its own frame 0 first, and
 * aiming at the static layout through that arrival detaches every link from
 * its dots. While a choreography owns the frame (`liveEnds`) it is writing
 * positions directly into `attrs`, so the stale target says nothing and the
 * lines track both live dots.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs the live frame
 * @param {Float64Array | null} target where the frame is heading
 * @param {Float32Array} start the frame an in-flight tween is easing from
 * @param {[number, number][]} edgeEnds node pair per edge slot, lower hop first
 * @param {boolean} liveEnds draw every edge to live endpoints
 */
export function drawEdges(ctx, attrs, target, start, edgeEnds, liveEnds) {
	/** @type {[number, number, number, number, number, number][]} */
	const routes = [];
	ctx.lineWidth = 1;
	for (let e = 0; e < edgeEnds.length; e++) {
		const i = EDGE_BASE + e * STRIDE;
		const progress = attrs[i];
		const alpha = attrs[i + 1];
		if (alpha <= ALPHA_SEEN || progress <= ALPHA_SEEN) continue;
		const [xa, ya, xb, yb] = edgeLine(
			attrs,
			target,
			start,
			edgeEnds[e],
			i,
			liveEnds
		);
		ctx.strokeStyle = edgeStroke(alpha);
		ctx.beginPath();
		ctx.moveTo(xa, ya);
		ctx.lineTo(xa + (xb - xa) * progress, ya + (yb - ya) * progress);
		ctx.stroke();
		if (attrs[i + 2] <= ALPHA_SEEN) continue;
		routes.push([xa, ya, xb, yb, ...routeDraw(attrs, target, start, i)]);
	}
	ctx.lineWidth = ROUTE_WIDTH;
	for (const [xa, ya, xb, yb, covered, fade] of routes) {
		ctx.strokeStyle = routeStroke(fade);
		ctx.beginPath();
		ctx.moveTo(xb, yb);
		ctx.lineTo(xb + (xa - xb) * covered, yb + (ya - yb) * covered);
		ctx.stroke();
	}
	ctx.lineWidth = 1;
}

/**
 * One edge's two ends, near (lower hop) first. While a choreography owns the
 * frame nothing but the live buffer means anything; a dying line reads both
 * ends off the frame it left; a live one keeps its near end live and aims its
 * far end at the target.
 */
function edgeLine(attrs, target, start, [from, to], i, liveEnds) {
	const dying = !target || target[i + 1] <= ALPHA_SEEN;
	const held = liveEnds ? attrs : dying ? start : null;
	const near = held || attrs;
	const far = held || target;
	return [
		near[from * STRIDE],
		near[from * STRIDE + 1],
		far[to * STRIDE],
		far[to * STRIDE + 1]
	];
}

// How many exact-colour buckets a frame may open before solid dots fall back
// to the quantised ones: a colour tween across a large solid crowd would
// otherwise turn one fill into one per dot.
const EXACT_BUCKETS_MAX = 64;
let exactBuckets = 0;

/**
 * The fill a dot joins: one per quantised (rgb, alpha), made on first use. A
 * fully opaque dot gets its exact colour at alpha 1 instead: quantised, a
 * solid #6a636f came out a flat grey (104, 104, 104) at 0.97, which is neither
 * the colour nor solid (the race chart's field dots, raceDotSpec).
 * @param {Float32Array} attrs
 * @param {number} i the dot's base index
 * @param {number} alpha
 */
function dotBucket(attrs, i, alpha) {
	const [r0, g0, b0] = dotRgb(attrs, i, rgbScratch);
	if (alpha >= 1 && exactBuckets < EXACT_BUCKETS_MAX) {
		const r = r0 | 0;
		const g = g0 | 0;
		const b = b0 | 0;
		// above every quantised key (those stop at 0xffff)
		const key = 0x1000000 + ((r << 16) | (g << 8) | b);
		let bucket = dotBuckets.get(key);
		if (!bucket) {
			bucket = { path: new Path2D(), style: `rgb(${r}, ${g}, ${b})` };
			dotBuckets.set(key, bucket);
			exactBuckets++;
		}
		return bucket;
	}
	const rB = r0 >> 4;
	const gB = g0 >> 4;
	const bB = b0 >> 4;
	const aB = alpha >= 1 ? 15 : (alpha * 16) | 0;
	const key = (rB << 12) | (gB << 8) | (bB << 4) | aB;
	let bucket = dotBuckets.get(key);
	if (!bucket) {
		bucket = {
			path: new Path2D(),
			style: `rgba(${(rB << 4) | 8}, ${(gB << 4) | 8}, ${(bB << 4) | 8}, ${(aB + 0.5) / 16})`
		};
		dotBuckets.set(key, bucket);
	}
	return bucket;
}

/**
 * Whether a circle reaches into the rect at all, edge-straddlers included.
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {readonly [number, number, number, number]} view [left, top, right, bottom]
 */
function circleMeetsView(x, y, r, view) {
	return (
		x + r >= view[0] && x - r <= view[2] && y + r >= view[1] && y - r <= view[3]
	);
}

/**
 * The dots, bucketed by quantised colour and alpha into a handful of fills.
 * `skip(i)` culls a dot by its base index (the race cast off its plot
 * mid-chapter); null draws everything with alpha. A FOCUSED dot (the actor a
 * hovered callout is about — see drawTrails) is drawn last, over the rest, in
 * FOCUS at full strength; like the trail's, the focus is the renderer's alone.
 * Any other dot whose circle lies wholly outside `view` is never added to a path: the
 * context would clip it, but only after paying for its arc (the sky puts most
 * of its crowd off the canvas — see GALAXY_SPREAD in sky.js).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs
 * @param {((i: number) => boolean) | null} skip
 * @param {ReadonlySet<number>} focus base indices of the dots drawn in FOCUS
 * @param {readonly [number, number, number, number]} view the drawable rect,
 *   [left, top, right, bottom] — the one clearCanvas clears
 * @param {ReadonlyMap<number, number>} [late] base index -> layer (1, 2, …):
 *   dots drawn in passes of their own after the rest, layer by layer, so each
 *   layer sits on top of the one before (the Gen-Z field over the crowd it
 *   arrives into, and the named contenders over the field)
 */
export function drawDots(ctx, attrs, skip, focus, view, late) {
	dotBuckets.clear();
	exactBuckets = 0;
	focusedDots.length = 0;
	for (const layer of lateDots) layer.length = 0;
	for (let i = 0; i < EDGE_BASE; i += STRIDE) {
		if (attrs[i + 6] <= ALPHA_SEEN) continue;
		if (skip && skip(i)) continue;
		const layer = late?.get(i);
		if (focus.has(i)) focusedDots.push(i);
		else if (layer) holdLate(i, layer);
		else addDot(attrs, i, view);
	}
	fillBuckets(ctx);
	fillLate(ctx, attrs, view);
	ctx.fillStyle = `rgb(${FOCUS.join(", ")})`;
	for (const i of focusedDots) {
		ctx.beginPath();
		ctx.arc(
			attrs[i],
			attrs[i + 1],
			Math.max(attrs[i + 2], FOCUS_DOT_R),
			0,
			TAU
		);
		ctx.fill();
	}
}

/** one dot into its colour's bucket, unless it lies wholly outside `view` */
function addDot(attrs, i, view) {
	const x = attrs[i];
	const y = attrs[i + 1];
	const r = attrs[i + 2];
	if (!circleMeetsView(x, y, r, view)) return;
	const bucket = dotBucket(attrs, i, attrs[i + 6]);
	// moveTo before arc so consecutive circles aren't joined by a chord
	bucket.path.moveTo(x + r, y);
	bucket.path.arc(x, y, r, 0, TAU);
}

/** hold a `late` dot back for its layer's pass */
function holdLate(i, layer) {
	while (lateDots.length < layer) lateDots.push([]);
	lateDots[layer - 1].push(i);
}

/** drawDots' later passes: each layer of `late` dots, over everything before it */
function fillLate(ctx, attrs, view) {
	for (const layer of lateDots) {
		if (!layer.length) continue;
		dotBuckets.clear();
		exactBuckets = 0;
		for (const i of layer) addDot(attrs, i, view);
		fillBuckets(ctx);
	}
}

/** fill every bucket opened since the last clear, in the order they opened */
function fillBuckets(ctx) {
	for (const { path, style } of dotBuckets.values()) {
		ctx.fillStyle = style;
		ctx.fill(path);
	}
}

// The halo behind Bacon's dot: #fce5ff45, the token's rgb at 0x45 / 255, out
// to this many of his own radii — a ratio, so it shrinks with the pull-back
// camera instead of staying a fixed ring round a shrinking dot.
const ANCHOR_HALO_ALPHA = 0.27;
const ANCHOR_HALO_SCALE = 1.6;

/**
 * The halo behind the anchor's dot, drawn under the dots from his live frame so
 * it grows in, travels and shrinks with him. `level` (0–1) is how much of it
 * the state asks for: ScrollyVisual eases it between the states that draw it
 * (hasAnchorHalo) and the rest, so it fades on the step change instead of
 * popping. It cannot key off his colour — he is the same white on the hop and
 * rank charts as on the opening network.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs
 * @param {number} i the anchor's base index
 * @param {number} level
 */
export function drawAnchorHalo(ctx, attrs, i, level) {
	const alpha = ANCHOR_HALO_ALPHA * attrs[i + 6] * level;
	if (!(alpha > ALPHA_SEEN)) return;
	ctx.fillStyle = `rgba(${ANCHOR_HALO.join(", ")}, ${alpha})`;
	ctx.beginPath();
	ctx.arc(attrs[i], attrs[i + 1], attrs[i + 2] * ANCHOR_HALO_SCALE, 0, TAU);
	ctx.fill();
}

/**
 * A thin leader from each dot to a name that has been visibly nudged off the
 * dot's own y (see annotations.js), mirroring the reference's stub line.
 *
 * By default in the dot's own colour at 0.4 of the name's alpha, over the dot.
 * A chart can hand its own `style` instead: one colour at a fixed `alpha` for
 * every name showing at `full` alpha or more, scaled down below that, so a
 * leader still fades with its name rather than popping; and with `under`, each
 * dot is painted again over its leader, so the line runs from behind it (which
 * only reads as "behind" on a solid dot).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs
 * @param {{ id: number, x: number, y: number, r: number, labelAlpha: number, labelOffset: number }[]} labels
 * @param {Record<number, "left" | "right">} dirs
 * @param {{ rgb: number[], alpha: number, full: number, under?: boolean }} [style]
 */
export function drawLabelLeaders(ctx, attrs, labels, dirs, style) {
	ctx.lineWidth = 1;
	for (const t of labels) {
		if (Math.abs(t.labelOffset) <= 0.5) continue;
		const i = t.id * STRIDE;
		const dir = dirs[t.id];
		const gap = 4;
		const lx = dir === "right" ? t.x + t.r + gap : t.x - t.r - gap;
		ctx.strokeStyle = style
			? `rgba(${style.rgb[0]}, ${style.rgb[1]}, ${style.rgb[2]}, ${style.alpha * Math.min(1, t.labelAlpha / style.full)})`
			: `rgba(${attrs[i + 3]}, ${attrs[i + 4]}, ${attrs[i + 5]}, ${t.labelAlpha * 0.4})`;
		ctx.beginPath();
		ctx.moveTo(t.x + (dir === "right" ? t.r : -t.r), t.y);
		ctx.lineTo(lx, t.y + t.labelOffset);
		ctx.stroke();
	}
	if (!style?.under) return;
	for (const t of labels) {
		if (Math.abs(t.labelOffset) <= 0.5) continue;
		const i = t.id * STRIDE;
		const [r, g, b] = dotRgb(attrs, i, rgbScratch);
		ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${attrs[i + 6]})`;
		ctx.beginPath();
		ctx.arc(attrs[i], attrs[i + 1], attrs[i + 2], 0, TAU);
		ctx.fill();
	}
}

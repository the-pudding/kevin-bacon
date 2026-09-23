// The canvas renderer: one frame of the attr and trail buffers onto a 2D
// context, in four passes — trails under everything, then the network's edges,
// then the dots, then the leader lines that tie a nudged name back to its dot.
// Pure over (ctx, buffers): it reads nothing reactive and owns no state beyond
// the two scratch collections it reuses so a frame allocates nothing.
import { STRIDE, EDGE_BASE } from "./attr-buffer.js";
import { EDGE_GREY, EDGE_HIGHLIGHT, INK } from "./palette.js";
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
// slots drawn in the second trail pass, reused rather than allocated per frame
/** @type {number[]} */
const inkedTrails = [];

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
 * would leave the chapter card's sky smeared across the bleed and the title
 * band for the rest of the story.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./plot.js").Bleed} bleed
 */
export function clearCanvas(ctx, w, h, bleed) {
	ctx.clearRect(-bleed.l, -TITLE_BAND, w + bleed.l + bleed.r, h + TITLE_BAND);
}

/**
 * One trail polyline. `hi` (0-1) blends its TRAIL_META colour toward INK and
 * thickens it — the whole of how the race chart marks whoever is leading at
 * its camera.
 */
function strokeTrail(ctx, trailAttrs, t, alpha, hi) {
	const base = t * TRAIL_STRIDE;
	const { rgb, width: lw } = TRAIL_META[t];
	ctx.strokeStyle = hi
		? `rgba(${rgb.map((c, k) => Math.round(c + (INK[k] - c) * hi)).join(", ")}, ${alpha})`
		: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
	ctx.lineWidth = lw + hi * 0.5;
	ctx.beginPath();
	ctx.moveTo(trailAttrs[base], trailAttrs[base + 1]);
	for (let k = 1; k < TRAIL_POINTS; k++) {
		ctx.lineTo(trailAttrs[base + k * 2], trailAttrs[base + k * 2 + 1]);
	}
	ctx.stroke();
}

/**
 * Trails under everything: race/career lines, the prediction diagonal. An
 * INKED line (the race chart's leader — see setTrailHighlight) is held back to
 * a second pass so the crown is drawn over the field rather than buried under
 * whichever grey neighbour happens to own a later slot.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} trailAttrs
 */
export function drawTrails(ctx, trailAttrs) {
	inkedTrails.length = 0;
	for (let t = 0; t < TRAIL_META.length; t++) {
		const base = t * TRAIL_STRIDE;
		const alpha = trailAttrs[base + TRAIL_POINTS * 2];
		if (alpha <= 0.008) continue;
		const hi = trailAttrs[base + TRAIL_POINTS * 2 + 1];
		if (hi > ALPHA_SEEN) inkedTrails.push(t);
		else strokeTrail(ctx, trailAttrs, t, alpha, 0);
	}
	for (const t of inkedTrails) {
		const base = t * TRAIL_STRIDE;
		strokeTrail(
			ctx,
			trailAttrs,
			t,
			trailAttrs[base + TRAIL_POINTS * 2],
			trailAttrs[base + TRAIL_POINTS * 2 + 1]
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

/**
 * The dots, bucketed by quantised colour and alpha into a handful of fills.
 * `skip(i)` culls a dot by its base index (the race cast off its plot
 * mid-chapter); null draws everything with alpha.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs
 * @param {((i: number) => boolean) | null} skip
 */
export function drawDots(ctx, attrs, skip) {
	dotBuckets.clear();
	for (let i = 0; i < EDGE_BASE; i += STRIDE) {
		const alpha = attrs[i + 6];
		if (alpha <= ALPHA_SEEN) continue;
		if (skip && skip(i)) continue;
		const rB = attrs[i + 3] >> 4;
		const gB = attrs[i + 4] >> 4;
		const bB = attrs[i + 5] >> 4;
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
		const x = attrs[i];
		const y = attrs[i + 1];
		const r = attrs[i + 2];
		// moveTo before arc so consecutive circles aren't joined by a chord
		bucket.path.moveTo(x + r, y);
		bucket.path.arc(x, y, r, 0, TAU);
	}
	for (const { path, style } of dotBuckets.values()) {
		ctx.fillStyle = style;
		ctx.fill(path);
	}
}

/**
 * A thin leader from each dot to a name that has been visibly nudged off the
 * dot's own y (see annotations.js), mirroring the reference's stub line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} attrs
 * @param {{ id: number, x: number, y: number, r: number, labelAlpha: number, labelOffset: number }[]} labels
 * @param {Record<number, "left" | "right">} dirs
 */
export function drawLabelLeaders(ctx, attrs, labels, dirs) {
	ctx.lineWidth = 1;
	for (const t of labels) {
		if (Math.abs(t.labelOffset) <= 0.5) continue;
		const i = t.id * STRIDE;
		const dir = dirs[t.id];
		const gap = 4;
		const lx = dir === "right" ? t.x + t.r + gap : t.x - t.r - gap;
		ctx.strokeStyle = `rgba(${attrs[i + 3]}, ${attrs[i + 4]}, ${attrs[i + 5]}, ${t.labelAlpha * 0.4})`;
		ctx.beginPath();
		ctx.moveTo(t.x + (dir === "right" ? t.r : -t.r), t.y);
		ctx.lineTo(lx, t.y + t.labelOffset);
		ctx.stroke();
	}
}

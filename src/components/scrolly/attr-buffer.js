// The frame buffer every layout writes and every writer reads: one Float64
// group of STRIDE values per node — x, y, radius, r, g, b, alpha — then one
// group per edge (progress, alpha, highlight), then the runtime edge pool the
// chapter card's highlight spokes rent. Alpha carries visibility: a hidden
// node keeps its position at alpha 0, so a later fade-in never teleports.
import { EDGE_COUNT, NODE_COUNT } from "./nodes.js";
import { TRAIL_META, TRAIL_POINTS, TRAIL_STRIDE } from "./trails.js";

// x, y, radius, red, green, blue, alpha — one group per node, then one
// (mostly empty) group per edge so the tweener staggers edges individually:
// edge slot 0 = draw progress (0–1, drawn from the anchor outward toward the
// higher-hop endpoint), edge slot 1 = alpha, edge slot 2 = highlight (0–1,
// blends the stroke grey → EDGE_HIGHLIGHT and thickens it; see setEdge)
export const STRIDE = 7;

export const EDGE_BASE = NODE_COUNT * STRIDE;

/**
 * Spare edge slots past the baked ones, for links whose ENDPOINTS are chosen at
 * runtime rather than at build time — the chapter card's highlight spokes (see
 * galaxy-highlight.js), which fan out from whichever actor the beat is on.
 *
 * The baked edges are a fixed table: `edgeEnds` in ScrollyVisual binds slot e to
 * one node pair at module load, so a link between an arbitrary pair has nowhere
 * to live. Rather than a second line-drawing path with its own colour, weight,
 * draw-on and fade rules, the pool lets a runtime link rent a slot and be drawn
 * by the SAME loop as the constellation's — which already reads both endpoints
 * out of the live buffer every frame, and so follows dots that are moving.
 *
 * This is also the spoke count the most prolific actor in the cast gets, so the
 * pool is full exactly when the beat is at its densest and can never be asked
 * for more — galaxy-highlight.js asserts that at module load rather than
 * clamping, so an over-large spoke range is a startup error and not a silently
 * shortened fan.
 */
export const GALAXY_LINK_MAX = 80;

/** edge-slot index of the pool's first slot (the baked edges occupy 0..EDGE_COUNT) */
export const GALAXY_LINK_BASE = EDGE_COUNT;

export const ATTR_SIZE = (NODE_COUNT + EDGE_COUNT + GALAXY_LINK_MAX) * STRIDE;

// one delay slot per node, then one per edge (pool included)
export const DELAY_SIZE = NODE_COUNT + EDGE_COUNT + GALAXY_LINK_MAX;

export const edgeIndex = (e) => EDGE_BASE + e * STRIDE;

// unordered endpoint key so an edge can be looked up regardless of orientation
export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function set(attrs, id, x, y, r, [red, green, blue], alpha) {
	const i = id * STRIDE;
	attrs[i] = x;
	attrs[i + 1] = y;
	attrs[i + 2] = r;
	attrs[i + 3] = red;
	attrs[i + 4] = green;
	attrs[i + 5] = blue;
	attrs[i + 6] = alpha;
}

/**
 * Writes one edge's render state. `highlight` (0–1) blends the stroke from the
 * plain grey toward EDGE_HIGHLIGHT and thickens it (see ScrollyVisual's drawScene);
 * a scalar rather than an rgb triple so the untouched slots of every layout that
 * doesn't draw edges still mean "plain grey" rather than black.
 */
export function setEdge(attrs, e, progress, alpha, highlight = 0) {
	const i = edgeIndex(e);
	attrs[i] = progress;
	attrs[i + 1] = alpha;
	attrs[i + 2] = highlight;
}

/**
 * The closing beat: a layout with every alpha taken to zero, so the tween
 * dissolves whatever the reader was looking at WHERE IT LIES instead of sliding
 * it off to some parking spot on its way out.
 *
 * A wrapper rather than a fresh empty buffer, and a shared one rather than a
 * copy per chapter: the story's last step has to dissolve whichever chart
 * precedes it, and that has changed once already.
 *
 * @param {LayoutFn} fn the layout to fade out
 * @returns {LayoutFn}
 */
export function dissolve(fn) {
	return function layoutDissolve(nodes, w, h, edges, params) {
		const { attrs, trails } = fn(nodes, w, h, edges, params);
		for (let i = 0; i < EDGE_BASE; i += STRIDE) attrs[i + 6] = 0;
		for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) attrs[i + 1] = 0;
		for (let t = 0; t < TRAIL_META.length; t++) {
			trails[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
		}
		// the buffers only: a layout's axes, block and callouts are FURNITURE, and
		// dropping them here is what empties the canvas. They have no alpha to
		// take down — they are HTML in the annotations layer — so an empty canvas
		// under a full set of axes is the one thing this beat must not leave.
		return { attrs, trails };
	};
}

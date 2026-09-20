// The annotation layer's per-frame decisions: which names a frame shows, the
// tracked entries the HTML labels ride, and the vertical de-collision that
// keeps beside-dot names apart. Pure functions over the frame buffer plus one
// small stateful stacker; nothing here touches the DOM or the story.
import { STRIDE } from "./attr-buffer.js";
import { createLabelDecollider } from "./label-decollide.js";
import { ALPHA_SEEN } from "./render.js";

/**
 * @typedef {Object} TrackedLabel
 * @property {number} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {number} alpha the dot's own alpha
 * @property {number} labelAlpha the name's alpha: the dot's, or 0 while held
 * @property {number} labelOffset vertical nudge from the de-collider
 */

/**
 * The race labels one FRAME shows: the step's own subject, then the labelled
 * dots nearest the centre of Hollywood, up to `top` in all.
 *
 * Ranks on screen-y rather than avg-distance because the two are the same
 * order — the axis is fitted with the record at the top — and y is already in
 * the buffer the frame just wrote, so no curve has to be re-read per frame.
 *
 * The subject is exempt from the cut — a step's ink dot must never be the
 * anonymous one, and raceFull rests on cameras where Hackman is outside the
 * ten nearest the centre — but not from the plot test: a name the draw pass has
 * culled has nothing left to label.
 *
 * @param {Float32Array | Float64Array} attrs the frame's dot buffer
 * @param {{ highlight?: number[], labelIds: Iterable<number>, onPlot: (id: number) => boolean, top: number }} rule
 * @returns {Set<number>}
 */
export function raceLabelCut(attrs, { highlight, labelIds, onPlot, top }) {
	const keep = new Set((highlight ?? []).filter(onPlot));
	/** @type {[number, number][]} */
	const rest = [];
	for (const id of labelIds) {
		// a name whose dot the frame has faded out — or whose dot the draw pass
		// is culling off the plot — isn't shown either way, and must not eat one
		// of the slots on its way off the plot
		if (keep.has(id) || attrs[id * STRIDE + 6] <= ALPHA_SEEN || !onPlot(id)) {
			continue;
		}
		rest.push([id, attrs[id * STRIDE + 1]]);
	}
	rest.sort((a, b) => a[1] - b[1]);
	for (const [id] of rest) {
		if (keep.size >= top) break;
		keep.add(id);
	}
	return keep;
}

/**
 * The tracked entries for one frame: every id any state labels or pulses, read
 * live out of the attr array so the HTML annotations stay glued to their dots
 * mid-tween. A name rides its dot's alpha, except while `shown` leaves it out,
 * while an entry choreography's `gate` has not introduced it yet, or while the
 * arrival lag is holding it (`held`).
 *
 * @param {Float32Array | Float64Array} attrs
 * @param {number[]} ids
 * @param {{ names: (id: number) => string, shown: Set<number>, gate: Set<number> | null, held: Set<number> | null }} rule
 * @returns {TrackedLabel[]}
 */
export function trackLabels(attrs, ids, { names, shown, gate, held }) {
	return ids.map((id) => {
		const i = id * STRIDE;
		const visible =
			shown.has(id) && (!gate || gate.has(id)) && !(held && held.has(id));
		return {
			id,
			name: names(id),
			x: attrs[i],
			y: attrs[i + 1],
			r: attrs[i + 2],
			alpha: attrs[i + 6],
			labelAlpha: visible ? attrs[i + 6] : 0,
			labelOffset: 0
		};
	});
}

/**
 * Vertical de-collision for beside-dot names (labelDirs "left"/"right"):
 * nudges apart labels whose dots have landed within a line-height of each
 * other, easing the displacement per id so a rank swap slides names past each
 * other instead of snapping. Ported from the pudding-post race-chart.
 *
 * Only beside-dot labels stack — below-dot labels are already x-separated by
 * their own dot. Left and right labels sit on opposite sides of the cloud and
 * never visually collide, so each side de-collides on its own; otherwise a left
 * label can shove a right label down just for sharing a y.
 *
 * The stack only ever grows DOWNWARD, which is free when the names sit in the
 * plot's right-hand gutter. A step whose names lie over the plot passes a
 * `floor`, and the whole set is lifted as a body by any overflow past it —
 * rather than clamping the names that cross the line, which would stop them
 * making room for the ones under them and pile the sweep up behind them.
 *
 * @param {number} gapPx the line-height a name needs
 */
export function createLabelStacker(gapPx) {
	const left = createLabelDecollider();
	const right = createLabelDecollider();
	return {
		/**
		 * Nudge this frame's beside-dot names apart, writing each one's
		 * `labelOffset`. Returns the names moved and whether the stack has come to
		 * rest — a de-collider relaxes toward its target a little per frame, so a
		 * caller keeps drawing until it has.
		 * @param {TrackedLabel[]} labels
		 * @param {Record<number, "left" | "right">} dirs
		 * @param {number | null} floor
		 */
		stack(labels, dirs, floor) {
			const beside = labels.filter(
				(t) => t.labelAlpha > 0 && dirs[t.id] != null
			);
			if (beside.length === 0) return { moved: beside, settled: true };
			const offsets = new Map([
				...left(
					beside.filter((t) => dirs[t.id] === "left"),
					gapPx
				),
				...right(
					beside.filter((t) => dirs[t.id] === "right"),
					gapPx
				)
			]);
			if (floor != null) {
				let over = 0;
				for (const t of beside) {
					over = Math.max(over, t.y + (offsets.get(t.id) ?? 0) - floor);
				}
				if (over > 0) {
					for (const [id, off] of offsets) offsets.set(id, off - over);
				}
			}
			for (const t of beside) t.labelOffset = offsets.get(t.id) ?? 0;
			return { moved: beside, settled: left.settled() && right.settled() };
		}
	};
}

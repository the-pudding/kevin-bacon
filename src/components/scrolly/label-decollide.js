// Ported from the pudding-post race-chart reference's `_easeLabelOffsets` +
// top-down sweep: when two beside-dot name labels fall within `minGap` of each
// other, nudge the lower one down (capped — see LABEL_MAX_OFFSET_PX), and ease
// that displacement per id so a rank swap between two dots
// slides their names past each other instead of snapping.

// How far a name may be nudged from its own dot. It is a readability budget, not
// a tidiness one: a displaced label draws a leader line back to its dot (see
// ScrollyVisual's besideDot pass), so the real cost of a big offset is only the
// length of that line — whereas the cost of a cap that binds is labels drawn on
// top of each other, because a clamped name stops making room for the ones under
// it and the rest of the sweep piles up behind it.
//
// So it is sized to the worst stack the chart can ask for rather than to a
// comfortable drift: ten names (RACE_LABEL_TOP) at a 16px line gap need ~144px
// of spread, which the race chart's leaders demand whenever the axis compresses
// them into a short band — a fixed y range does exactly that, putting all nine
// chasers inside ~44px of plot.
const LABEL_MAX_OFFSET_PX = 150;
const LABEL_EASE_MS = 200;

/**
 * A per-frame de-collider: call it once per rendered frame with the current
 * {id, y} of every beside-dot label, and it returns id → vertical offset (px)
 * to add to that dot's own y. `settled` reports whether that relaxation has
 * finished, so the caller knows when it still owes a frame.
 *
 * @typedef {{
 *   (entries: {id: number, y: number}[], minGap: number): Map<number, number>;
 *   settled(): boolean;
 * }} LabelDecollider
 */

/** @returns {LabelDecollider} */
export function createLabelDecollider() {
	const offsets = new Map();
	let lastT = null;
	/**
	 * How far the furthest label still is from where it wants to be. The caller
	 * reads it to decide whether another frame is owed — see `settled`.
	 */
	let maxDelta = 0;
	function decollide(entries, minGap) {
		const sorted = [...entries].sort((a, b) => a.y - b.y);
		let prevY = -Infinity;
		const targets = new Map();
		for (const e of sorted) {
			let ly = Math.max(e.y, prevY + minGap);
			if (ly - e.y > LABEL_MAX_OFFSET_PX) ly = e.y + LABEL_MAX_OFFSET_PX;
			prevY = ly;
			targets.set(e.id, ly - e.y);
		}
		const now = performance.now();
		const dt = lastT != null ? now - lastT : 0;
		lastT = now;
		const f = dt > 0 ? 1 - Math.exp(-dt / LABEL_EASE_MS) : 1;
		const shown = new Map();
		for (const [id, target] of targets) {
			let cur = offsets.get(id);
			cur = cur == null ? target : cur + (target - cur) * f;
			offsets.set(id, cur);
			shown.set(id, cur);
		}
		for (const id of [...offsets.keys()]) {
			if (!targets.has(id)) offsets.delete(id);
		}
		maxDelta = 0;
		for (const [id, target] of targets) {
			maxDelta = Math.max(maxDelta, Math.abs(target - shown.get(id)));
		}
		return shown;
	}
	/**
	 * Whether every label has arrived where the sweep put it, to within half a
	 * pixel.
	 *
	 * The ease above advances by wall-clock but only ON A DRAWN FRAME, and the
	 * thing that drives frames — a tween, a pan — stops as soon as the DOTS are
	 * in place. The labels are still mid-relaxation at that moment (one frame of
	 * ease is ~8% of the way), so without this the last frame drawn is the one
	 * they keep, and any name that needed a real displacement is left sitting on
	 * top of its neighbour. The caller owes another frame while this is false.
	 */
	decollide.settled = () => maxDelta < 0.5;
	return decollide;
}

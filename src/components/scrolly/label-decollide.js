// Ported from the pudding-post race-chart reference's `_easeLabelOffsets` +
// top-down sweep: when two beside-dot name labels fall within `minGap` of each
// other, nudge the lower one down (capped so a name never drifts far from its
// own dot), and ease that displacement per id so a rank swap between two dots
// slides their names past each other instead of snapping.

const LABEL_MAX_OFFSET_PX = 30;
const LABEL_EASE_MS = 200;

/**
 * @returns {(entries: {id: number, y: number}[], minGap: number) => Map<number, number>}
 *   a per-frame de-collider; call once per rendered frame with the current
 *   {id, y} of every beside-dot label. Returns id → vertical offset (px) to
 *   add to that dot's own y.
 */
export function createLabelDecollider() {
	const offsets = new Map();
	let lastT = null;
	return function decollide(entries, minGap) {
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
		return shown;
	};
}

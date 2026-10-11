// The circles a frame has already added to each dot bucket, so drawDots can
// leave an exact repeat out of its path. One bucket is one Path2D filled
// nonzero, so a circle exactly on top of one already in it adds no pixels —
// only work: Chromium rasters every subpath, and a crowd stacked on one point
// costs more the higher the stack. careerMany's arrival from simRace starts
// 12.8k of its 15.5k dots on a single pixel, which took 4s at a 4× CPU
// throttle (650ms without throttling) to raster in one frame; the career charts stack
// ~15.5k dots on ~1.7k grid points on every frame of their tweens. Measured in
// `notes/perf/tween-sweep-2026-10-10.md`.
//
// An open-addressing table over plain typed arrays, keyed on (bucket id, x, y,
// r) by exact value, cleared by bumping a generation rather than zeroing — so a
// frame allocates nothing.

const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer);

/** one value's bits folded into the hash */
function mix(h, v) {
	scratch[0] = v;
	const lo = Math.imul(h ^ words[0], 0x9e3779b1);
	const hi = Math.imul(lo ^ words[1], 0x85ebca77);
	return hi ^ (hi >>> 15);
}

/**
 * @param {number} capacity the most circles added between two clears
 */
export function createCircleSet(capacity) {
	let size = 1;
	while (size < capacity * 2) size *= 2;
	const mask = size - 1;
	const ids = new Int32Array(size);
	const xs = new Float64Array(size);
	const ys = new Float64Array(size);
	const rs = new Float64Array(size);
	// the generation each slot was last written in; a slot from an older one is
	// empty
	const stamps = new Uint32Array(size);
	let generation = 1;

	const holds = (slot, id, x, y, r) =>
		ids[slot] === id && xs[slot] === x && ys[slot] === y && rs[slot] === r;

	return {
		/** forget every circle added so far */
		clear() {
			generation += 1;
			if (generation > 0xffffffff) {
				stamps.fill(0);
				generation = 1;
			}
		},
		/**
		 * Adds the circle to bucket `id`'s set.
		 * @returns {boolean} false when the bucket already holds this exact circle
		 */
		add(id, x, y, r) {
			let slot = mix(mix(mix(Math.imul(id, 0x27d4eb2d), x), y), r) & mask;
			while (stamps[slot] === generation) {
				if (holds(slot, id, x, y, r)) return false;
				slot = (slot + 1) & mask;
			}
			stamps[slot] = generation;
			ids[slot] = id;
			xs[slot] = x;
			ys[slot] = y;
			rs[slot] = r;
			return true;
		}
	};
}

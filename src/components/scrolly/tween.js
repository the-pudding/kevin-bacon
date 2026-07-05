import { hash01 } from "./nodes.js";

/** @param {number} t normalized time 0–1 */
export const easeCubicInOut = (t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * @typedef {Object} Tweener
 * @property {Float32Array} current live rendered values
 * @property {(next: Float64Array, ms: number, jitter?: number, nodeDelays?: Float64Array) => void} to
 * @property {() => void} stop
 */

/**
 * Tweens groups of `stride` consecutive values; each group gets its own
 * start delay so nodes begin/finish at different times. Delays come from
 * `nodeDelays` (ms per group, layout-choreographed) when provided, otherwise
 * from a deterministic hash scaled by `jitter` (0 = in unison).
 *
 * @param {number} size total number of values
 * @param {(attrs: Float64Array) => void} draw called every frame
 * @param {number} stride values per group (one group per node)
 * @returns {Tweener}
 */
export function createTweener(size, draw, stride = 1) {
	const groups = Math.ceil(size / stride);
	// Float32 for the per-frame hot arrays; layout `target` stays Float64
	const current = new Float32Array(size);
	const start = new Float32Array(size);
	const delays = new Float64Array(groups);
	let target = null;
	let startTime = 0;
	let duration = 0;
	let frame = 0;

	function tick(now) {
		const elapsed = now - startTime;
		let done = true;
		for (let g = 0; g < groups; g++) {
			const t = Math.min(1, Math.max(0, (elapsed - delays[g]) / duration));
			if (t < 1) done = false;
			const eased = easeCubicInOut(t);
			const end = Math.min((g + 1) * stride, size);
			for (let i = g * stride; i < end; i++) {
				current[i] = start[i] + (target[i] - start[i]) * eased;
			}
		}
		draw(current);
		if (!done) frame = requestAnimationFrame(tick);
	}

	function to(next, ms, jitter = 0, nodeDelays = null) {
		cancelAnimationFrame(frame);
		if (ms <= 0) {
			current.set(next);
			draw(current);
			return;
		}
		start.set(current);
		target = next;
		duration = ms;
		for (let g = 0; g < groups; g++) {
			delays[g] = nodeDelays ? nodeDelays[g] : hash01(g, 9) * ms * jitter;
		}
		startTime = performance.now();
		frame = requestAnimationFrame(tick);
	}

	function stop() {
		cancelAnimationFrame(frame);
	}

	return { current, to, stop };
}

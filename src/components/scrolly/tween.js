import { hash01 } from "./nodes.js";

export const easeCubicInOut = (t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Tweens groups of `stride` consecutive values; each group gets its own
// deterministic start delay so nodes begin/finish at different times.
// `jitter` scales the max delay relative to the base duration (0 = in unison).
export function createTweener(size, draw, stride = 1) {
	const groups = Math.ceil(size / stride);
	const current = new Float64Array(size);
	const start = new Float64Array(size);
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

	function to(next, ms, jitter = 0) {
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
			delays[g] = hash01(g, 9) * ms * jitter;
		}
		startTime = performance.now();
		frame = requestAnimationFrame(tick);
	}

	function stop() {
		cancelAnimationFrame(frame);
	}

	return { current, to, stop };
}

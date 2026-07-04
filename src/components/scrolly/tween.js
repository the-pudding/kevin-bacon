export const easeCubicInOut = (t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function createTweener(size, draw) {
	const current = new Float64Array(size);
	const start = new Float64Array(size);
	let target = null;
	let startTime = 0;
	let duration = 0;
	let frame = 0;

	function tick(now) {
		const t = Math.min(1, (now - startTime) / duration);
		const eased = easeCubicInOut(t);
		for (let i = 0; i < size; i++) {
			current[i] = start[i] + (target[i] - start[i]) * eased;
		}
		draw(current);
		if (t < 1) frame = requestAnimationFrame(tick);
	}

	function to(next, ms) {
		cancelAnimationFrame(frame);
		if (ms <= 0) {
			current.set(next);
			draw(current);
			return;
		}
		start.set(current);
		target = next;
		duration = ms;
		startTime = performance.now();
		frame = requestAnimationFrame(tick);
	}

	function stop() {
		cancelAnimationFrame(frame);
	}

	return { current, to, stop };
}

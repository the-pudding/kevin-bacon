// The one owner of the choreography. Everything that writes the live frame
// buffers per tick — an entry's legs, a reader's ask, an ambient loop, the pan
// glide — runs here, so there is exactly one writer at a time: `stop` abandons
// whatever is in flight, and `active` says a choreography owns the frame (the
// render effect steps aside; the renderer draws edges to live endpoints).
//
// It knows nothing about states, the story or what a frame means. The runner
// in ScrollyVisual hands it writers and gets ticks back; `loop` is the frame
// the tweeners share (tween.js createFrameLoop), which runs each tick and then
// repaints once, `ease` shapes a leg's progress, and `onStop` is where the owner
// hears that a choreography was abandoned (to reset what it armed for it).

/**
 * @param {{ ease: (p: number) => number, loop: import("./tween.js").FrameLoop, onStop?: () => void }} deps
 */
export function createChoreographer({ ease, loop: frames, onStop }) {
	/** @type {((now: number) => void) | null} the tick on the frame loop */
	let current = null;
	let active = false;

	function run(step) {
		current = step;
		frames.start(step);
	}

	function end(step) {
		frames.stop(step);
		if (current === step) current = null;
	}

	/** abandon whatever is in flight */
	function stop() {
		if (current) end(current);
		active = false;
		onStop?.();
	}

	/**
	 * Run `frame(eased, elapsedMs)` for `ms`, one tick a frame, then
	 * `onDone`. `frame` gets the leg's LINEAR elapsed ms as well as its eased
	 * progress, for a writer whose motion is a schedule in real time rather than
	 * a share of the leg — the trapezoidal ease would stretch such a schedule's
	 * ends and compress its middle.
	 * @param {number} ms
	 * @param {(e: number, ms: number) => void} frame
	 * @param {() => void} [onDone]
	 */
	function phase(ms, frame, onDone) {
		active = true;
		const t0 = performance.now();
		const step = (now) => {
			const p = Math.min(1, (now - t0) / ms);
			frame(ease(p), Math.min(ms, now - t0));
			if (p < 1) return;
			end(step);
			onDone?.();
		};
		run(step);
	}

	/**
	 * Run `frame(elapsedMs)` every tick — no duration, no easing — until it
	 * returns false (then `onEnd`) or something calls stop(). `frame` is handed
	 * elapsed ms since the loop started, so a writer can be a pure function of
	 * time and reproduce itself exactly at t = 0.
	 * @param {(t: number) => boolean | void} frame
	 * @param {() => void} [onEnd]
	 */
	function loop(frame, onEnd) {
		active = true;
		const t0 = performance.now();
		const step = (now) => {
			if (frame(now - t0) !== false) return;
			end(step);
			active = false;
			onEnd?.();
		};
		run(step);
	}

	/**
	 * The legs of one choreography back to back: `writeLeg(i, e, ms)` per tick,
	 * `onBeat(i)` as leg i lands, `onDone` after the last. No legs is a
	 * choreography that is over before it began: `onDone` at once.
	 * @param {number[]} phases each leg's duration in ms
	 * @param {(i: number, e: number, ms: number) => void} writeLeg
	 * @param {(i: number) => void} onBeat
	 * @param {() => void} onDone
	 */
	function legs(phases, writeLeg, onBeat, onDone) {
		const runLeg = (i) => {
			if (i >= phases.length) {
				active = false;
				onDone();
				return;
			}
			phase(
				phases[i],
				(e, ms) => writeLeg(i, e, ms),
				() => {
					onBeat(i);
					runLeg(i + 1);
				}
			);
		};
		runLeg(0);
	}

	return {
		stop,
		phase,
		loop,
		legs,
		get active() {
			return active;
		}
	};
}

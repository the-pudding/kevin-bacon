import { hash01 } from "./nodes.js";

/** @param {number} t normalized time 0–1 */
export const easeCubicInOut = (t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * The share of a tween in which a mark's ALPHA finishes. Position takes the
 * whole tween; opacity is done in the first FADE_LEAD of it.
 *
 * Every value in a group used to share one eased `t`, which meant a dot was at
 * half its opacity at exactly the half-way point of its travel. The crowd rests
 * at alpha 0.31, so "half opacity" is a 15%-grey 2px dot, and a dot that had to
 * fade in did most of its flying at opacities nobody can track — measured on the
 * chapter-card arrival, 61% of the travel happened below alpha 0.15 and 13% of
 * it before the renderer drew the dot at all. The motion was real and unseen,
 * which is why an arrival read as an apparition rather than a landing.
 *
 * Leading the fade fixes both ends of motion.md rule 6 (out, travel, in): what
 * is leaving is gone before the crowd has moved far, and what is arriving is
 * legible for the whole of its flight instead of the last third. It is a ramp
 * and not a step — the same cubic, run over a shorter window — so nothing pops
 * (rule 7), and it lands on the same frame at t = 1 either way, which is what
 * keeps a settle byte-identical to its tween's last frame.
 */
export const FADE_LEAD = 0.4;

const easeFade = (t) => easeCubicInOut(Math.min(1, t / FADE_LEAD));

const clamp01 = (t) => Math.min(1, Math.max(0, t));

// one group's progress this frame: written by the two functions below and read
// straight back by the tick, so the hot loop allocates nothing
const progress = { eased: 0, faded: 0 };

/** a group on its own clock, `delay` ms late; returns its raw progress */
function delayProgress(delay, elapsed, duration) {
	const t = clamp01((elapsed - delay) / duration);
	progress.eased = easeCubicInOut(t);
	progress.faded = easeFade(t);
	return t;
}

/** a group covering its `windows` share of the tween's time, linearly; returns the tween's raw progress */
function windowProgress(windows, g, share) {
	const t = clamp01(share);
	const from = windows[g * 2];
	const to = windows[g * 2 + 1];
	progress.eased = clamp01((t - from) / (to - from));
	progress.faded = progress.eased;
	return t;
}

/**
 * One group's frame at the progress the two functions above left in
 * `progress`: every value on the eased lerp, the led value restated on the
 * shorter window, then x and y pushed off the line by the group's bow.
 *
 * The hump is a late one, 27/4·s²(1−s): 0 at both ends, 1 at two thirds of
 * the way, the curve of a cubic Bézier whose control point sits beside the
 * TARGET — the group leaves along its line and sweeps in at the end. Late
 * rather than the symmetric 4s(1−s) because most of a crowd arrives from off
 * the canvas: a bow that peaked half-way was spent before the reader could see
 * the dot, and the visible tail read as straight (Bacon on 3 → 4, 2026-09-25).
 * Either way a bowed group sets off from and lands on exactly the frames a
 * straight one does.
 *
 * @param {Float32Array} current
 * @param {Float32Array} start
 * @param {Float64Array} target
 * @param {number} from the group's first slot
 * @param {number} end one past its last
 * @param {number} fadeOffset the led value's offset within the group, or -1
 * @param {Float64Array | null} bows
 * @param {number} b the group's slot in `bows`
 */
function writeGroup(current, start, target, from, end, fadeOffset, bows, b) {
	const { eased, faded } = progress;
	for (let i = from; i < end; i++) {
		current[i] = start[i] + (target[i] - start[i]) * eased;
	}
	const a = from + fadeOffset;
	if (fadeOffset >= 0 && a < end) {
		current[a] = start[a] + (target[a] - start[a]) * faded;
	}
	if (bows) {
		const hump = 6.75 * eased * eased * (1 - eased);
		current[from] += bows[b] * hump;
		current[from + 1] += bows[b + 1] * hump;
	}
}

/**
 * @typedef {Object} Tweener
 * @property {Float32Array} current live rendered values
 * @property {Float32Array} start the frame an in-flight tween is easing FROM —
 *   where the marks a departing state left are standing. `drawEdges` draws a
 *   dying line to it, so a line that is leaving holds still while it fades
 *   instead of being stretched between two travelling dots (motion.md rule 2).
 *   Re-snapshotted from `current` by every timed `to()`, so an interrupted
 *   departure freezes at exactly the pixel the last frame drew.
 * @property {Float64Array | null} target the frame `current` is heading for —
 *   the last frame handed to `to()`, whether it is being tweened toward or was
 *   set instantly. Read it to know where a mark is going; null before the first
 *   `to()`.
 * @property {boolean} running a timed tween is in flight — `current` is still
 *   easing toward `target`. False after an instant `to`, after the tween has
 *   landed, and after `stop()`.
 * @property {(next: Float64Array, ms: number, jitter?: number, nodeDelays?: Float64Array | null, onDone?: (() => void) | null, windows?: Float64Array | null, bows?: Float64Array | null) => void} to
 * @property {(apply: (buf: Float32Array) => void) => void} reframe
 * @property {() => void} stop
 */

/**
 * @typedef {Object} FrameLoop
 * @property {(tick: (now: number) => void) => void} start run `tick` on every
 *   frame from the next one until `stop(tick)`
 * @property {(tick: (now: number) => void) => void} stop
 * @property {() => void} request owe one more drawn frame, with nothing to tick
 * @property {() => void} draw paint now, outside the frame — the synchronous
 *   paint of an instant `to`
 */

/**
 * The one animation frame every writer shares: both tweeners, the
 * choreographer's phases and loops, and the label stack's relax frames. Each
 * frame runs every registered tick, then draws the scene ONCE — where a
 * requestAnimationFrame per writer drew it once per writer, twice a frame on
 * every state tween and race choreography (notes/perf/mobile-perf-review.md,
 * finding 2), the first of the two with the other writer's last-frame values.
 *
 * A tick started during a frame first runs on the next one, as its own rAF
 * would have; one stopped during a frame — by an earlier tick's `onDone` —
 * does not run in it. That is what the per-start registration buys: a tick
 * stopped and started again inside one frame is a new registration, and the
 * frame's list still holds the old one.
 *
 * One ordering differs from a rAF per writer: a tween's `onDone` now runs
 * before its frame's draw rather than after it.
 *
 * @param {() => void} draw
 * @returns {FrameLoop}
 */
export function createFrameLoop(draw) {
	/** @type {Map<(now: number) => void, object>} tick -> its registration */
	const ticks = new Map();
	let raf = 0;
	let inFrame = false;
	let wanted = false;

	function schedule() {
		if (!raf && !inFrame) raf = requestAnimationFrame(frame);
	}

	function frame(now) {
		raf = 0;
		inFrame = true;
		wanted = false;
		for (const [tick, reg] of [...ticks]) {
			if (ticks.get(tick) === reg) tick(now);
		}
		inFrame = false;
		draw();
		if (ticks.size > 0 || wanted) schedule();
	}

	return {
		start(tick) {
			ticks.set(tick, {});
			schedule();
		},
		stop(tick) {
			ticks.delete(tick);
			if (ticks.size > 0 || wanted || !raf) return;
			cancelAnimationFrame(raf);
			raf = 0;
		},
		request() {
			wanted = true;
			schedule();
		},
		draw
	};
}

/**
 * Tweens groups of `stride` consecutive values; each group gets its own
 * start delay so nodes begin/finish at different times. Delays come from
 * `nodeDelays` (ms per group, layout-choreographed) when provided, otherwise
 * from a deterministic hash scaled by `jitter` (0 = in unison).
 *
 * `windows` (two per group: `[from, to]`, shares 0–1 of the tween's time)
 * runs each group LINEARLY over its own stretch of the tween instead. Chained windows ([0, .5] then [.5, 1]) make one motion carried by
 * several groups at a constant rate — the second picks up at exactly the speed
 * the first hands over at, where two delayed tweens would each ease out and in
 * and stall at the join. Alpha rides the group's window with everything else;
 * there is no lead to take inside a stretch that short.
 *
 * `bows` (two per group: an x and a y offset) bends a group's first two values
 * off the straight line onto a cubic Bézier that sweeps in at the end: two
 * thirds of the way the group stands `bow` away from the lerp, and at either
 * end exactly on it, so every contract written on a tween's endpoints holds
 * for a bowed one (see `writeGroup` for the hump). The bow
 * is an offset, not a place — `reframe` moves the line and the bow rides it —
 * and it belongs to one `to()`: the next `to()` without bows retargets straight
 * from the live frame (motion.md rules 8 and 15). A group's first two values
 * must be a position for this to mean anything (stride ≥ 2).
 *
 * @param {number} size total number of values
 * @param {FrameLoop} loop the shared frame: ticks on it while a tween runs,
 *   and paints through its `draw` for an instant `to`
 * @param {number} stride values per group (one group per node)
 * @param {number} fadeOffset the offset within a group holding the mark's
 *   alpha, which eases on `FADE_LEAD`'s shorter window instead of the tween's
 *   own. -1 for a buffer whose groups carry no alpha to lead.
 * @returns {Tweener}
 */
export function createTweener(size, loop, stride = 1, fadeOffset = -1) {
	const groups = Math.ceil(size / stride);
	// Float32 for the per-frame hot arrays; layout `target` stays Float64
	const current = new Float32Array(size);
	const start = new Float32Array(size);
	const delays = new Float64Array(groups);
	let target = null;
	let startTime = 0;
	let duration = 0;
	let running = false;
	// fired once when the current tween settles; cleared if a new `to` supersedes
	let onDone = null;
	/** @type {Float64Array | null} */
	let windows = null;
	/** @type {Float64Array | null} */
	let bows = null;

	function tick(now) {
		const elapsed = now - startTime;
		let done = true;
		for (let g = 0; g < groups; g++) {
			const t = windows
				? windowProgress(windows, g, elapsed / duration)
				: delayProgress(delays[g], elapsed, duration);
			if (t < 1) done = false;
			const from = g * stride;
			const end = Math.min(from + stride, size);
			writeGroup(current, start, target, from, end, fadeOffset, bows, g * 2);
		}
		if (!done) return;
		loop.stop(tick);
		running = false;
		if (onDone) {
			const cb = onDone;
			onDone = null;
			cb();
		}
	}

	function to(
		next,
		ms,
		jitter = 0,
		nodeDelays = null,
		done = null,
		groupWindows = null,
		groupBows = null
	) {
		loop.stop(tick);
		onDone = done;
		target = next;
		windows = groupWindows;
		bows = groupBows;
		if (ms <= 0) {
			running = false;
			current.set(next);
			loop.draw();
			if (done) {
				onDone = null;
				done();
			}
			return;
		}
		start.set(current);
		duration = ms;
		for (let g = 0; g < groups; g++) {
			delays[g] = nodeDelays ? nodeDelays[g] : hash01(g, 9) * ms * jitter;
		}
		startTime = performance.now();
		running = true;
		loop.start(tick);
	}

	/**
	 * Restate the live frame without drawing the change — used to move a mark
	 * the reader cannot see (a concealed dot, a re-entering line at alpha 0) so
	 * the move is not undone on the next tick.
	 *
	 * `apply` is handed BOTH buffers, and that is the contract: `current` is what
	 * is on screen, `start` is where an in-flight tween is easing from, and a
	 * tween that kept a start in the old coordinates would drag every mark back
	 * across the delta as it ran. `target` is deliberately not offered — it is the
	 * layout's own array and is cached, so mutating it would poison the cache for
	 * every later visit; a caller that needs a new target rebuilds the layout.
	 *
	 * This is the live frame's restater in general, not only for a moved origin:
	 * anything that needs a mark to be somewhere else without anything drawn
	 * appearing to move goes through here, because writing `current` alone would
	 * be undone on the next tick by the tween easing from an unmoved `start`.
	 *
	 * @param {(buf: Float32Array) => void} apply
	 */
	function reframe(apply) {
		apply(current);
		apply(start);
	}

	function stop() {
		loop.stop(tick);
		running = false;
		onDone = null;
	}

	// `target` and `running` change on every `to`, so they are exposed as getters
	return {
		current,
		start,
		get target() {
			return target;
		},
		get running() {
			return running;
		},
		to,
		reframe,
		stop
	};
}

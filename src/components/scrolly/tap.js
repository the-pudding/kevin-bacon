// @ts-check
/**
 * A tap on the story, shared by TapNav's two halves and by the one surface
 * that has to lie above them yet still answer a tap the way they do: the rank
 * ladder (Stage's .rank-bars-panel). The ladder scrolls, and a scroll only
 * reaches the element under the pointer and its ancestors — beneath the
 * halves it was never under the pointer, so it could not be scrolled at all.
 * Lifted over them it scrolls natively, and forwards its taps here instead.
 *
 * Both callers go through the registry's `go()` (via next/prev), so the gate
 * refuses a forward tap on either exactly as it does an arrow key.
 */

// how far a press can travel and still be a tap. A touch-drag that scrolls
// the ladder still fires `click` on release, which would step the story out
// from under the reader; past this it was a scroll, and the click is dropped.
const SLOP = 10;

/**
 * @param {() => ReturnType<typeof import("./step-registry.svelte.js").createStepRegistry>} getSteps
 *   a getter, so a caller holding the registry as a prop reads it live
 */
export function createTap(getSteps) {
	/** @type {{ x: number, y: number } | null} */
	let downAt = null;

	return {
		/** @param {PointerEvent} e */
		down(e) {
			downAt = { x: e.clientX, y: e.clientY };
		},
		/**
		 * Step the story for a click, unless the press behind it was a drag.
		 * @param {MouseEvent} e
		 * @param {"prev" | "next"} direction
		 * @returns {boolean} whether it was a tap
		 */
		tap(e, direction) {
			// a keyboard-synthesised click reports (0, 0) and never sees a
			// pointerdown, so gate the whole test on having one
			const dragged =
				downAt !== null &&
				Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > SLOP;
			downAt = null;
			if (dragged) return false;
			const steps = getSteps();
			// At step 0 the prev half advances rather than going back (the cue there
			// says "tap to continue", so the whole screen has to answer).
			// Forward off the last step leaves the wizard for the credits, one-way —
			// there is nothing beyond it in the registry for next()/go() to land on.
			if (direction === "prev" && steps.current > 0) steps.prev();
			else if (steps.current >= steps.count - 1) steps.exit();
			else steps.next();
			return true;
		}
	};
}

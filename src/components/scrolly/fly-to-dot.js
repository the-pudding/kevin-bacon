// @ts-check
// The card→canvas flight: an HTML control that has just been picked travels out
// of the step card and lands ON the dot it stands for, morphing into it on the
// way. Ported out of PairQuiz.svelte on 2026-09-21, when a second control
// (ActorSearch) wanted the same move — the quiz's chips and the search's result
// row are the same gesture, and a second copy of the keyframes would be a second
// place for the landing to drift out of agreement with `drawDots`.
//
// Deliberately plain JS over the Web Animations API rather than a Svelte
// transition: the element is not entering or leaving, it is being carried, and
// it must stay in flow while it travels. A transform off the element's own
// resting box is the only frame that works here — nothing is dropped out of
// flow, so the card's measured height never moves (see the card-height rule in
// notes/design/interactions.md), and a `fixed` element would resolve against the
// step wrapper's own in:fly transform rather than the viewport.

/** The ✓/✗ (or the picked row's own highlight) held still before the flight.
 * One beat, not a duration of its own: motion.md rule 10 keeps durations in the
 * framework's hands, and 450ms is the one it already spends on an in-state
 * change. */
export const MARK_MS = 450;

export const FLIGHT_MS = 900;

/** matches ScrollyVisual's PARAM_TWEEN_MS — how long the flown element is held
 * over the canvas dot fading in underneath it, so there is no pop when it goes */
export const HOLD_MS = 450;

/** the landing dot is r 5.5; the element squishes to this footprint */
const DOT_DIAMETER = 11;

const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

/**
 * Does this reader want the flight at all? Read at the moment of the press
 * rather than tracked: the only question ever asked of it is "should THIS pick
 * fly", and a click handler is a synchronous place to ask.
 */
export const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fly one element onto its dot and resolve when it lands.
 *
 * `rect` is passed in rather than measured here, and that is the contract: a
 * caller flying more than one element must capture EVERY box and target before
 * it starts the first animation, or a resize between the two measurements sends
 * them to different coordinate spaces.
 *
 * @param {{ el: HTMLElement, rect: DOMRect, target: { x: number, y: number },
 *   fill: string }} plan `target` is in viewport coordinates, as
 *   ScrollyVisual's `locate()` returns them — `getBoundingClientRect` is viewport
 *   too, so the two subtract cleanly.
 * @returns {Promise<unknown>}
 */
export function flyToDot({ el, rect, target, fill }) {
	const dx = target.x - (rect.left + rect.width / 2);
	const dy = target.y - (rect.top + rect.height / 2);
	const sx = DOT_DIAMETER / rect.width;
	const sy = DOT_DIAMETER / rect.height;
	// One animation, not two: the move and the element→dot morph (text fading
	// out, non-uniform squish to a round footprint) share a clock, so the thing
	// that arrives is already a dot rather than a chip that then becomes one.
	return el.animate(
		[
			{
				transform: "translate(0, 0) scale(1, 1)",
				backgroundColor: "var(--surface-raised)",
				borderColor: fill,
				color: "var(--prose-fg)",
				borderRadius: "2rem"
			},
			{
				transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
				backgroundColor: fill,
				borderColor: fill,
				color: "transparent",
				borderRadius: "50%"
			}
		],
		{ duration: FLIGHT_MS, easing: EASE, fill: "forwards" }
	).finished;
}

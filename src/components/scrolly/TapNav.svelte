<script>
	// @ts-check
	/**
	 * The story's navigation: two narrow full-height tap gutters at the far left
	 * and right of the layout, plus ArrowLeft/ArrowRight. Both go through the
	 * registry's `go()`, so a tap gets exactly what a key does: the gated steps'
	 * refusal, the backward skip past them, and everything Index's navigate()
	 * prepares on arrival (see notes/scrolly-framework.md).
	 *
	 * The next gutter goes disabled while the active step's gate is shut, so a
	 * step that is holding the reader reads as held rather than as a dead tap —
	 * the gutters carry no marking of their own, so the missing press tint is
	 * the only signal available.
	 *
	 * Gutters, not a full-bleed left/right split: the middle of the canvas is
	 * where the story's own interactions live (the race scrubber's drag, the
	 * quiz cards, the movers rows, step 1's actor targets). Anything that must
	 * stay tappable *through* a gutter is lifted to --z-tap-above instead — see
	 * the z ladder in Index.svelte.
	 */
	import { getContext } from "svelte";

	const steps = getContext("scrolly-steps");

	const atStart = $derived(steps.current <= 0);
	const atEnd = $derived(steps.current >= steps.count - 1);
	// $derived, not read inline: the gate closures read `story`, and those reads
	// have to land in a tracked scope for the gutter to re-enable the moment the
	// reader answers
	const held = $derived(atEnd || steps.nextBlocked);

	function onKeydown(e) {
		const el = e.target;
		// don't hijack arrow keys from text fields or a focused slider thumb
		// (bits-ui thumbs are role="slider" and step by year themselves)
		if (
			el &&
			(el.tagName === "INPUT" ||
				el.tagName === "TEXTAREA" ||
				el.closest?.('[role="slider"]'))
		)
			return;
		if (e.key === "ArrowLeft") steps.prev();
		else if (e.key === "ArrowRight") steps.next();
	}

	// A gutter lies over two scrollable lists (the rank ladder and the Gen Z
	// movers). A touch-drag that starts on the gutter is the reader trying to
	// scroll the list under it, but the browser still fires `click` on release —
	// which would step the story out from under them. Measure the travel and
	// swallow those.
	const SLOP = 10;
	/** @type {{ x: number, y: number } | null} */
	let downAt = null;

	function onPointerDown(e) {
		downAt = { x: e.clientX, y: e.clientY };
	}

	function onTap(e, direction) {
		// a keyboard-synthesised click reports (0, 0) and never sees a
		// pointerdown, so gate the whole test on having one
		const dragged =
			downAt !== null &&
			Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > SLOP;
		downAt = null;
		if (dragged) return;
		if (direction === "prev") steps.prev();
		else steps.next();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button
	type="button"
	class="tap-gutter prev"
	aria-label="Previous step"
	disabled={atStart}
	onpointerdown={onPointerDown}
	onclick={(e) => onTap(e, "prev")}
></button>

<button
	type="button"
	class="tap-gutter next"
	aria-label="Next step"
	disabled={held}
	onpointerdown={onPointerDown}
	onclick={(e) => onTap(e, "next")}
></button>

<style>
	/* Full height of the layout, top to bottom — the reader's thumb rests at the
	   foot of the screen, so a gutter that stopped at the step card would put
	   the target where the hand isn't. What the card holds that must still be
	   reachable is lifted to --z-tap-above instead (GuessRank's controls, the
	   inline InfoTerm triggers); the dot bar is already up there and takes no
	   pointer events, so a tap over it steps the story like any other.

	   --tap-gutter comes from .scrolly-layout — see the comment there. */
	.tap-gutter {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--tap-gutter);
		z-index: var(--z-tap);
		/* reset.css styles every bare button as filled-primary; a tap region is
		   the opposite of that. Restated on :hover below for the same reason
		   ui.infoterm.css documents — the global rule is easy to re-specify. */
		background: none;
		border: none;
		border-radius: 0;
		padding: 0;
		cursor: pointer;
		/* no 300ms wait, and no double-tap-to-zoom swallowing the first tap */
		touch-action: manipulation;
	}

	.tap-gutter:hover {
		background: none;
	}

	.prev {
		left: 0;
	}

	.next {
		right: 0;
	}

	/* The gutters carry no mark of their own, so the press tint is the only
	   feedback a tap gets — keep it. */
	.tap-gutter:active {
		background: color-mix(in oklch, var(--color-fg) 6%, transparent);
	}

	.tap-gutter:disabled {
		cursor: default;
	}

	/* reset.css's outline-offset: 2px would draw a full-height rectangle bleeding
	   outside the layout box; keep the ring inside the strip it belongs to */
	.tap-gutter:focus-visible {
		outline-offset: -4px;
	}
</style>

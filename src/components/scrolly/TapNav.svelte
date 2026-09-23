<script>
	// @ts-check
	/**
	 * The story's navigation: the screen split down the middle into two
	 * full-height tap halves, plus ArrowLeft/ArrowRight. Both go through the
	 * registry's `go()`, so a tap gets exactly what a key does: the gated steps'
	 * refusal, the backward skip past them, and everything the arrival rules
	 * (arrivals.js) prepare (see notes/scrolly-framework.md).
	 *
	 * The next half goes disabled while the active step's gate is shut, so a
	 * tap there does nothing and the cursor drops back to the default arrow.
	 * The halves carry no marking of their own and no press tint — a tap's
	 * only feedback is the step it takes. At the very last step it stays live instead:
	 * a forward press there exits the wizard for the credits, one-way (see
	 * `exit` on the registry) — the back half disappears along with the rest
	 * of the step chrome once that happens, so there is no route back in.
	 *
	 * At the title card (the one step `atStart` is ever true for — nothing
	 * before it to go back to) the prev half stays live rather than disabled,
	 * and advances instead of going back: the splash cue's instruction is
	 * "click to continue" or "tap to continue", not "tap the right side", so
	 * the whole screen has to answer a tap, left half included.
	 *
	 * A full left/right split, edge to edge: the halves reach out past the
	 * reading column's own padding (--column-gutter) so the outermost pixels of
	 * a phone screen — exactly where a thumb lands — are live rather than dead.
	 * There is no third region: everything the reader has to hit lies OVER a
	 * half rather than beside it, lifted to --z-tap-above (the actor targets,
	 * the search, the year slider, the InfoTerm triggers) or hosted in the step
	 * card, which is pointer-transparent at --z-card and opts its own controls
	 * back in. See the z ladder in Stage.svelte.
	 *
	 * The one thing the split took: the race chart used to be pannable by
	 * dragging its middle (RaceScrubber's .drag-surface, which loses to the
	 * halves by design). There is no middle now, so the year slider is the way
	 * to scrub.
	 */
	import { getContext } from "svelte";
	import { createTap } from "./tap.js";

	const steps = getContext("scrolly-steps");

	const atStart = $derived(steps.current <= 0);
	const atEnd = $derived(steps.current >= steps.count - 1);
	// $derived, not read inline: the gate closures read `story`, and those reads
	// have to land in a tracked scope for the half to re-enable the moment the
	// reader answers. atEnd no longer holds the half shut — it opens the
	// credits instead (see tap.js) — so only the active step's own gate can
	// still hold it.
	const held = $derived(steps.nextBlocked);

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
		else if (e.key === "ArrowRight") {
			if (atEnd) steps.exit();
			else steps.next();
		}
	}

	// the tap itself — the drag test and where it steps — is shared with the
	// rank ladder, which lies over the halves (see tap.js)
	const tap = createTap(() => steps);

	function onTap(e, direction) {
		if (!tap.tap(e, direction)) return;
		// A pointer click leaves the half focused, and :focus-visible starts
		// matching it the moment the reader touches the keyboard — so a tap
		// followed by arrow keys paints a full-height ring the reader has no way
		// to dismiss (arrows never move focus; they go through <svelte:window>).
		// Hand focus back to the body. A keyboard-driven click (detail 0) keeps
		// its focus, which is the only way that reader can reach the half at all.
		if (e.detail > 0) e.currentTarget.blur();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button
	type="button"
	class="tap-half prev"
	aria-label={atStart ? "Continue" : "Previous step"}
	onpointerdown={tap.down}
	onclick={(e) => onTap(e, "prev")}
></button>

<button
	type="button"
	class="tap-half next"
	aria-label="Next step"
	disabled={held}
	onpointerdown={tap.down}
	onclick={(e) => onTap(e, "next")}
></button>

<style>
	/* Full height of the layout, top to bottom — the reader's thumb rests at the
	   foot of the screen, so a half that stopped at the step card would put the
	   target where the hand isn't. What the card holds that must still be
	   reachable opts back into pointer events up at --z-card (GuessRank's
	   controls, the pair quiz, the Start buttons, the inline InfoTerm
	   triggers); the progress bar is higher still and takes no pointer events, so a
	   tap over it steps the story like any other.

	   Half the SCREEN, not half the layout: #scrolly pads the column by
	   --column-gutter, and a half that stopped at the column's edge would leave
	   that padding dead on a phone — the strip the thumb reaches first. Each
	   half reaches back out over it, so the two meet in the middle and together
	   cover the whole box. */
	.tap-half {
		position: absolute;
		top: 0;
		bottom: 0;
		width: calc(50% + var(--column-gutter));
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

	.tap-half:hover {
		background: none;
	}

	.prev {
		left: calc(-1 * var(--column-gutter));
	}

	.next {
		right: calc(-1 * var(--column-gutter));
	}

	.tap-half:disabled {
		cursor: default;
	}

	/* reset.css's outline-offset: 2px would draw a full-height rectangle bleeding
	   outside the layout box; keep the ring inside the strip it belongs to */
	.tap-half:focus-visible {
		outline-offset: -4px;
	}
</style>

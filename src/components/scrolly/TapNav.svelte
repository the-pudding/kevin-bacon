<script>
	// @ts-check
	/**
	 * The story's navigation, in one of two forms by width, plus
	 * ArrowLeft/ArrowRight at every width. Every form goes through the
	 * registry's `go()`, so a tap, a notch and a key all get the same thing:
	 * the gated steps' refusal, the backward skip past them, and everything the
	 * arrival rules (arrivals.js) prepare (see notes/scrolly-framework.md).
	 *
	 * STACKED (below Stage's `beside` breakpoint): the screen split down the
	 * middle into two full-height tap halves.
	 *
	 * BESIDE (the side-by-side layout, >= 1200px): no tap halves. A click on a
	 * desktop screen is too easy to make by accident, so the story moves only by
	 * two notches pinned to the viewport's left and right edges, in a gutter
	 * Stage reserves for them (`--notch-w`), and by the keys. The prev notch is
	 * hidden on step 0 but keeps its box; the next notch's chevron pans there instead
	 * of a written cue, once the prose has landed.
	 *
	 * The next half goes disabled while the active step's gate is shut and its
	 * `onnext` cannot be pressed yet, so a press there does nothing. The next
	 * notch never does: every gated step's Next presses the step's own control
	 * (`onnext`), and in the moment before that control can be pressed a press
	 * simply does nothing. The halves carry no marking of their own and no
	 * press tint — a tap's only feedback is the step it takes. At the very last
	 * step next stays live instead: a forward press there exits the
	 * wizard for the credits, one-way (see `exit` on the registry) — the
	 * navigation disappears along with the rest of the step chrome once that
	 * happens, so there is no route back in.
	 *
	 * At step 0 (the one step `atStart` is ever true for — nothing before it to
	 * go back to) the prev half stays live rather than disabled, and advances
	 * instead of going back: the cue Stage shows there says
	 * "click to continue" or "tap to continue", not "tap the right side", so
	 * the whole screen has to answer a tap, left half included.
	 *
	 * A full left/right split, edge to edge: each half is fixed to the
	 * viewport at 50vw, not sized off the reading column, so the outermost
	 * pixels of the screen — exactly where a thumb lands, and wherever the
	 * column's own max-width leaves margin either side of it — are live
	 * rather than dead. There is no third region: everything the reader has
	 * to hit lies OVER a half rather than beside it, lifted to --z-tap-above
	 * (the actor targets, the search, the year slider, the InfoTerm triggers)
	 * or hosted in the step card, which is pointer-transparent at --z-card and
	 * opts its own controls back in. See the z ladder in Stage.svelte.
	 *
	 * The one thing the split took: the race chart used to be pannable by
	 * dragging its middle (RaceScrubber's .drag-surface, which loses to the
	 * halves by design). There is no middle now, so the year slider is the way
	 * to scrub.
	 */
	import { getContext } from "svelte";
	import Button from "$components/ui/Button.svelte";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { createTap } from "./tap.js";
	// DEV-ONLY: paints the halves with a light, very-low-opacity tint while
	// scrolly/dev/TapZonesDev.svelte's HUD toggle is on, so their extent —
	// full viewport width, edge to edge — can be checked visually.
	// tapZonesDev.visible is always false in a production build (the toggle
	// that could flip it never mounts there), so this import costs a dead
	// read, not a dead component.
	import { tapZonesDev } from "./dev/tapZones.svelte.js";

	/** @type {{ beside: boolean }} */
	let { beside } = $props();

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
		else if (e.key === "ArrowRight") forward();
	}

	// what the arrow key and the next notch do: forward off the last step
	// leaves the wizard for the credits
	function forward() {
		if (atEnd) steps.exit();
		else steps.next();
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

{#if beside}
	<div class="notch prev" class:hidden={atStart}>
		<Button
			variant="notch"
			data-side="left"
			aria-label="Previous step"
			onclick={() => steps.prev()}
		>
			<ChevronLeft />
		</Button>
	</div>
	<div class="notch next" class:pan={atStart && !steps.held}>
		<Button
			variant="notch"
			data-side="right"
			aria-label="Next step"
			onclick={forward}
		>
			<ChevronRight />
		</Button>
	</div>
{:else}
	<button
		type="button"
		class="tap-half prev"
		class:debug-visible={tapZonesDev.visible}
		aria-label={atStart ? "Continue" : "Previous step"}
		onpointerdown={tap.down}
		onclick={(e) => onTap(e, "prev")}
	></button>

	<button
		type="button"
		class="tap-half next"
		class:debug-visible={tapZonesDev.visible}
		aria-label="Next step"
		disabled={held}
		onpointerdown={tap.down}
		onclick={(e) => onTap(e, "next")}
	></button>
{/if}

<style>
	/* Full height of the SCREEN, top to bottom — the reader's thumb rests at
	   the foot of the screen, so a half that stopped at the step card would
	   put the target where the hand isn't. What the card holds that must
	   still be reachable opts back into pointer events up at --z-card
	   (GuessRank's controls, the pair quiz, the Start buttons, the inline
	   InfoTerm triggers); the progress bar is higher still and takes no
	   pointer events, so a tap over it steps the story like any other.

	   Half the SCREEN, not half the layout: fixed against the viewport
	   (50vw a side, left/right: 0) rather than sized off #scrolly's own box,
	   which the reading column caps at --column below the `beside` breakpoint
	   and again above --column's wide-mode value — a half sized off that box
	   would leave the excess viewport width dead on either side once the
	   column stops growing with it (confirmed empty on every step at 900,
	   1024, 1600 and 1920px; see notes/scrolly-framework.md). `position:
	   fixed` needs no ancestor to create its containing block — none of
	   #scrolly's ancestors use transform/filter/will-change, which would
	   otherwise trap it — so this always resolves against the real
	   viewport. */
	.tap-half {
		position: fixed;
		top: 0;
		bottom: 0;
		width: 50vw;
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
		left: 0;
	}

	.next {
		right: 0;
	}

	.tap-half:disabled {
		cursor: default;
	}

	/* DEV-ONLY debug tint (see tapZones.svelte.js / TapZonesDev.svelte). Light
	   and very low opacity, so it marks the region without hiding the canvas
	   or prose underneath; the two halves get different hues so "prev" and
	   "next" read apart at a glance. */
	.tap-half.debug-visible.prev {
		background: rgb(59 130 246 / 0.08);
	}
	.tap-half.debug-visible.next {
		background: rgb(239 68 68 / 0.08);
	}

	/* The notches, beside the prose: fixed to the viewport's edges, vertically
	   centred, each as wide as the gutter Stage reserves for it (--notch-w), so
	   no column content ever runs under one. The look is the `notch` variant in
	   ui.button.css; this rule is only where it sits. Above the canvas, whose
	   element bleeds out to the viewport's edges beneath them.

	   --notch-bleed: how far each tab runs on past its screen edge, out of
	   sight. It is the pan's reach (below), so a tab panning away from its
	   edge uncovers more of itself rather than lifting off it; the matching
	   padding on that side keeps the chevron centred in what shows. */
	.notch {
		--notch-bleed: 3px;
		position: fixed;
		top: 50%;
		translate: 0 -50%;
		z-index: var(--z-tap-above);
		display: flex;
		width: calc(var(--notch-w) + var(--notch-bleed));
		height: calc(2 * var(--notch-w));
	}

	.notch :global(.bits-button) {
		flex: 1;
	}

	.notch.prev {
		left: calc(-1 * var(--notch-bleed));
	}

	.notch.prev :global(.bits-button) {
		padding-left: var(--notch-bleed);
	}

	.notch.next {
		right: calc(-1 * var(--notch-bleed));
	}

	.notch.next :global(.bits-button) {
		padding-right: var(--notch-bleed);
	}

	/* step 0 has nothing behind it: hidden rather than unmounted so its box
	   stays put, and `visibility` takes it out of the tab order and the a11y
	   tree with it */
	.notch.hidden {
		visibility: hidden;
	}

	/* step 0's only cue beside the prose: the whole next notch, outline and
	   chevron together, pans left and right until the reader takes it. It
	   reaches no further than --notch-bleed either way, so it never lifts off
	   its edge. `translate` keeps the vertical centring in every frame. */
	@media (prefers-reduced-motion: no-preference) {
		.notch.pan {
			animation: notch-pan 2.6s ease-in-out infinite;
		}
	}

	@keyframes notch-pan {
		0%,
		100% {
			translate: 0 -50%;
		}

		25% {
			translate: calc(-1 * var(--notch-bleed)) -50%;
		}

		75% {
			translate: var(--notch-bleed) -50%;
		}
	}

	/* reset.css's outline-offset: 2px would draw a full-height rectangle bleeding
	   outside the layout box; keep the ring inside the strip it belongs to */
	.tap-half:focus-visible {
		outline-offset: -4px;
	}
</style>

<script>
	// @ts-check
	/**
	 * The one control every reader-triggered animation has: a button that asks
	 * the active state for one of its `requests` by name (see RequestAnim in
	 * states.js) and goes quiet while it plays. ScrollyVisual owns the animation
	 * and the canvas buffers; this only asks, through `request()`, and reads
	 * back `story.running`.
	 *
	 * Mounted only on the step whose way forward the ask is: the reader's Next is
	 * refused there (the step's `gate`, see Step.svelte), so the animation can
	 * never be skipped past. `advance` moves the reader on AS it asks — the
	 * rewind removes information from the reader, so it waits for consent, and
	 * the step that reads out the answer comes forward with the press; advance()
	 * goes straight to the step index and bypasses the gate. The other asks are
	 * the step's whole payoff and carry the reader on when they land (the step's
	 * `advanceon`), so they leave the step alone.
	 *
	 * It lives in the step card, under the sentence that names it, rather than
	 * over the canvas — the copy asking for the press and the press itself
	 * belong together (notes/design/interactions.md, rule 1). So it sits in the
	 * prose flow and needs no measurement to place: its position is whatever the
	 * card's own content gives it, stable for as long as the step is. It does
	 * make the card taller, and `overlayHeight` is the card's measured height on
	 * the narrow layout, so the panels that ride the card's top edge (the race
	 * scrubber) sit that much higher here than they did.
	 */
	import { getContext } from "svelte";
	import Button from "$components/ui/Button.svelte";
	import { story, request } from "./story.svelte.js";

	/** @type {{ kind: string, label: string, advance?: boolean }} */
	let { kind, label, advance = false } = $props();

	const steps = getContext("scrolly-steps");

	function ask() {
		request(kind);
		if (advance) steps.advance();
	}
</script>

<div class="start-button">
	<Button variant="default" disabled={story.running === kind} onclick={ask}>
		{label}
	</Button>
</div>

<style>
	/* Inset clear of the tap gutters, which run the full height of the layout
	   and would otherwise swallow the button's edges. Padding rather than a
	   z-index lift, for the reason GuessRank records in its own file: a step
	   wrapper with a filling opacity animation forms a stacking context that a
	   lift cannot escape at any value. The padding is symmetric, so the button
	   stays centred in what is left. The prose above stays full width — a tap
	   on its outer edge is meant to be a step. */
	.start-button {
		display: flex;
		justify-content: center;
		margin-top: 0.75rem;
		padding-inline: var(--tap-gutter);
		/* .scrolly-steps hangs a white halo on its text to hold the prose off
		   the sky behind it; it is inherited, and on a filled button it is a
		   white glow around white glyphs on a dark plate. A button carries its
		   own background, so it needs no hold-out. */
		text-shadow: none;
	}
</style>

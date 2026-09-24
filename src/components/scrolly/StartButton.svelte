<script>
	// @ts-check
	/**
	 * The one control every reader-triggered animation has: a button that asks
	 * the active state for one of its `requests` by name (see RequestAnim in
	 * states.js) and goes quiet while it plays. ScrollyVisual owns the animation
	 * and the canvas buffers; this only asks (its `onpress` calls `request()`)
	 * and reads back `story.running`.
	 *
	 * Mounted only on the step whose way forward the ask is. The reader's Next
	 * does not leave that step (its `gate`); it makes this same press instead
	 * (its `onnext`, see Step.svelte), so `onpress` is written once in Index and
	 * handed to both. The rewind's press moves the reader on AS it asks — the
	 * rewind removes information from the reader, so it waits for consent, and
	 * the step that reads out the answer comes forward with the press. The other
	 * asks are the step's whole payoff and carry the reader on when they land
	 * (the step's `advanceon`), so their press leaves the step alone.
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
	import Button from "$components/ui/Button.svelte";
	import { story } from "./story.svelte.js";

	/** `kind` is the request `onpress` makes, which this goes quiet for while it
	 * plays
	 * @type {{ kind: string, label: string, onpress: () => void }} */
	let { kind, label, onpress } = $props();
</script>

<div class="start-button">
	<Button variant="default" disabled={story.running === kind} onclick={onpress}>
		{label}
	</Button>
</div>

<style>
	/* The tap halves cover this row's full width (TapNav), so it takes its
	   presses back — the step card above it is pointer-transparent at --z-card
	   precisely so a control can. Not a z-index lift, for the reason GuessRank
	   records in its own file: a step wrapper with a filling opacity animation
	   forms a stacking context that a lift cannot escape at any value; the lift
	   lives up on .scrolly-steps instead (Stage.svelte).

	   Still inset by --control-inset, which is now about the thumb rather than
	   about the layers: the button's edges sat exactly where a reader reaching
	   for the next step presses. The inset is symmetric, so the button stays
	   centred in what is left. The prose above stays full width and keeps giving
	   its outer edge up — a tap there is meant to be a step. */
	.start-button {
		display: flex;
		justify-content: center;
		margin-top: 0.75rem;
		/* the same 16px every prose step leaves under its last line, which sat
		   flush on the screen's edge without it — see PairQuiz's .quiz */
		margin-bottom: 1rem;
		/* Margin, not padding: this row takes pointer events back (below), and
		   padding is inside the element's own hit box — the inset would swallow
		   the very presses it exists to keep clear. */
		margin-inline: var(--control-inset);
		pointer-events: auto;
		/* .scrolly-steps hangs a white halo on its text to hold the prose off
		   the sky behind it; it is inherited, and on a filled button it is a
		   white glow around white glyphs on a dark plate. A button carries its
		   own background, so it needs no hold-out. */
		text-shadow: none;
	}
</style>

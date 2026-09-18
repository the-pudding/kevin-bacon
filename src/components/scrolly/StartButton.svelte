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
	 * Nothing above the button appears or disappears with the run, and the step
	 * card's prose is unconditional too — the card's height feeds this panel's
	 * `bottom` (see Index.svelte), so anything that unmounts on click would move
	 * the button under the reader's finger.
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
	<div class="controls">
		<Button variant="primary" disabled={story.running === kind} onclick={ask}>
			{label}
		</Button>
	</div>
</div>

<style>
	/* the panel covers the canvas, so it only claims the strip its button needs
	   and lets every pointer event through to the chart above it */
	.start-button {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		pointer-events: none;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem 0.5rem;
		pointer-events: auto;
	}
</style>

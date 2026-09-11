<script>
	// @ts-check
	/**
	 * Gen Z race-step control: one button that draws the 99 contenders'
	 * trajectories onto the race chart the camera has just panned down onto.
	 *
	 * Writes `story.genzLinesNonce` only — ScrollyVisual owns the animation and
	 * the canvas buffers, and reports back through `story.genzLinesDrawing`. Same
	 * nonce protocol as SimRunner's, though this one never replays: the draw is
	 * the step's payoff and the story moves on once it lands.
	 *
	 * This press is the only way past the step — the reader's Next is refused
	 * there — and the draw itself carries them on when it finishes (the step's
	 * `advanceon`, watching `story.genzLinesShown`). So, like SimRunner and unlike
	 * RaceRewindStart, it does not call advance() itself.
	 *
	 * Nothing above the button appears or disappears with the draw, and the step
	 * card's prose is unconditional too — the card's height feeds this panel's
	 * `bottom` (see Index.svelte), so anything that unmounts on click resizes the
	 * panel and shoves the button down under the reader's finger.
	 */
	import Button from "$components/ui/Button.svelte";
	import { story as state, requestGenzLines } from "./story.svelte.js";
</script>

<div class="genz-lines-start">
	<div class="controls">
		<Button
			variant="primary"
			disabled={state.genzLinesDrawing}
			onclick={requestGenzLines}
		>
			Show Gen Z actors
		</Button>
	</div>
</div>

<style>
	/* the panel covers the canvas, so it only claims the strip its button needs
	   and lets every pointer event through to the chart above it */
	.genz-lines-start {
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

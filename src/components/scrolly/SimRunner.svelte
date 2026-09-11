<script>
	// @ts-check
	/**
	 * Simulation-race control: one button that plays the 10,000 recorded
	 * simulation runs.
	 *
	 * Writes `story.simRunNonce` / `story.simRuns` only — ScrollyVisual owns the
	 * animation and the canvas buffers, and reports back through
	 * `story.simRunning`. The nonce is a counter rather than a flag so a second
	 * ask re-runs the same race from zero (the recorded sequence never changes,
	 * so a second run is a replay, not a resample).
	 *
	 * Nothing above the button appears or disappears with the run, and the step
	 * card's prose is unconditional too — the card's height feeds this panel's
	 * `bottom` (see Index.svelte), so anything that unmounts on click resizes the
	 * panel and shoves the button down under the reader's finger.
	 *
	 * This press is the only way past the step: the reader's Next is refused
	 * there, and the run itself carries them on when it lands (the step's
	 * `advanceon` — see Step.svelte). So the label never needs to offer a
	 * replay: the reader is on the next step by the time the race has played,
	 * and walking back into the chapter resets the chart to zero runs
	 * (`resetSimRace`, called from Index's navigate()).
	 */
	import Button from "$components/ui/Button.svelte";
	import { story as state, requestSimRun } from "./story.svelte.js";
</script>

<div class="sim-runner">
	<div class="controls">
		<Button
			variant="primary"
			disabled={state.simRunning}
			onclick={requestSimRun}
		>
			Start
		</Button>
	</div>
</div>

<style>
	/* the panel covers the canvas, so it only claims the strip its button needs
	   and lets every pointer event through to the chart above it */
	.sim-runner {
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

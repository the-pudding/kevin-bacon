<script>
	// @ts-check
	/**
	 * Simulation-race control: one button that plays the 10,000 recorded
	 * simulation runs, and replays them from zero afterwards.
	 *
	 * Writes `story.simRunNonce` / `story.simRuns` only — ScrollyVisual owns the
	 * animation and the canvas buffers, and reports back through
	 * `story.simRunning`. The nonce is a counter rather than a flag so pressing
	 * Replay re-runs the same race from zero (the recorded sequence never
	 * changes, so a second run is a replay, not a resample).
	 *
	 * Nothing above the button appears or disappears with the run, and the step
	 * card's prose is unconditional too — the card's height feeds this panel's
	 * `bottom` (see Index.svelte), so anything that unmounts on click resizes the
	 * panel and shoves the button down under the reader's finger.
	 *
	 * Reaching for Next instead of this button starts the run too — the step
	 * registers a gate that holds the story here until the race has played, then
	 * carries the reader on (see Index.svelte's `beforenext`). Pressing this
	 * button leaves them where they are, to watch it again if they want.
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
			{state.simRuns > 0 ? "Replay" : "Start"}
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

<script>
	// @ts-check
	/**
	 * Race-chapter rewind control: one button that starts the backwards camera
	 * pan through the race chart's history.
	 *
	 * Writes `story.raceRewindNonce` only — ScrollyVisual owns the animation and
	 * the canvas buffers, and reports back through `story.raceRewinding`. The
	 * nonce is a counter, same reasoning as SimRunner's, though this chapter
	 * never re-plays: a press once the chart is already rewinding is a no-op.
	 *
	 * Mounted only on the raceRecent step that introduces the rewind — the entry
	 * draw-on that reveals the present-day view plays automatically and needs no
	 * consent, but the rewind itself removes information from the reader, so it
	 * waits for this button (see notes/scrolly-framework.md).
	 *
	 * Pressing it also advances to the next step, same as GuessRank's "Give up":
	 * the reader has asked to see the answer, so the step that reveals it
	 * (raceRecent's second, SLJ-since-2006 step) should come forward with it
	 * instead of leaving the reader to scroll there themselves.
	 *
	 * And it is the ONLY way forward off that step — the reader's Next is
	 * refused there (the step's `gate`, see Step.svelte), so the pan can never
	 * be skipped past. advance() goes straight to the step index and bypasses
	 * the gate, which is what lets this button out through it.
	 */
	import { getContext } from "svelte";
	import Button from "$components/ui/Button.svelte";
	import { story as state, requestRaceRewind } from "./story.svelte.js";

	const steps = getContext("scrolly-steps");
</script>

<div class="race-rewind-start">
	<div class="controls">
		<Button
			variant="primary"
			disabled={state.raceRewinding}
			onclick={() => {
				requestRaceRewind();
				steps.advance();
			}}
		>
			Start
		</Button>
	</div>
</div>

<style>
	/* the panel covers the canvas, so it only claims the strip its button needs
	   and lets every pointer event through to the chart above it */
	.race-rewind-start {
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

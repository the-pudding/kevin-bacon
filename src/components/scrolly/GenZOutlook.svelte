<script>
	// @ts-check
	/**
	 * Gen Z number line control: which percentile of each contender's simulated
	 * future places their dot — the median run (P50) or their best tenth (P10).
	 *
	 * Writes `story.genzPercentile` only; `genzLine`'s params selector feeds it
	 * back into the layout, so a pick is a param update rather than a step change
	 * (see notes/scrolly-framework.md, "Interactive steps"). The scale is fixed
	 * across both percentiles, so the toggle slides the field up and down one
	 * number line — the gap to Samuel L. Jackson is the thing being measured, and
	 * it has to stay comparable.
	 */
	import ToggleGroup from "$components/ui/ToggleGroup.svelte";
	import { story as state } from "./story.svelte.js";

	// plain-language labels for the two percentiles: the median run is the
	// typical future, the 10th percentile is one where the actor beats it
	const items = [
		{ value: "p50", label: "typical sim" },
		{ value: "p10", label: "over-performing" }
	];
</script>

<div class="genz-outlook">
	<div class="controls">
		<ToggleGroup {items} required bind:value={state.genzPercentile} />
	</div>
</div>

<style>
	/* the panel covers the canvas, so it only claims the strip its control needs
	   and lets every pointer event through to the chart above it */
	.genz-outlook {
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

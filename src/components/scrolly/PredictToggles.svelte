<script>
	// @ts-check
	import { story } from "./story.svelte.js";

	// Each toggle swaps the prediction scatter's x metric (STATE_PARAMS
	// .predictionScatter) — dots travel toward the diagonal as features are
	// added.
</script>

<div class="toggles">
	<label>
		<input type="checkbox" bind:checked={story.predictConcurrence} />
		include concurrence
	</label>
	<label>
		<input type="checkbox" bind:checked={story.predictDegree} />
		include costar degree
	</label>
</div>

<style>
	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin-top: 0.75rem;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}

	/* the global reset strips checkbox appearance — restore a visible box */
	input[type="checkbox"] {
		appearance: auto;
		-webkit-appearance: checkbox;
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-gray-900, #222);
	}
</style>

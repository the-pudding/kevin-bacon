<script>
	// @ts-check
	import { story } from "./story.svelte.js";
	import { INTERACTIVE_IDS, nodeName } from "./states.js";

	// Picking a candidate highlights their bar and swaps the breakdown note
	// (STATE_PARAMS.winBars). Defaults to the winner — fully skippable.
</script>

<div class="picker">
	{#each INTERACTIVE_IDS.barCandidates as id (id)}
		<button
			class:picked={(story.winFocus ?? INTERACTIVE_IDS.barCandidates[0]) === id}
			onclick={() => (story.winFocus = id)}
		>
			{nodeName(id)}
		</button>
	{/each}
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	button {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--color-gray-400);
		border-radius: 2rem;
		background: var(--color-bg);
		color: var(--color-fg, #282828);
		cursor: pointer;
	}

	button.picked {
		background: var(--color-gray-900);
		color: var(--color-bg);
		border-color: var(--color-gray-900);
	}
</style>

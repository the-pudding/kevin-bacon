<script>
	// @ts-check
	import { story } from "./story.svelte.js";
	import { INTERACTIVE_IDS, nodeName, nodeRank } from "./states.js";

	// Guessing pans the rank ladder to the picked actor (a param update, not a
	// step change); the next step reveals #1 regardless — fully skippable.
</script>

<div class="guess">
	{#each INTERACTIVE_IDS.guessOptions as id (id)}
		<button
			class:picked={story.rankGuess === id}
			onclick={() => (story.rankGuess = id)}
		>
			{nodeName(id)}
		</button>
	{/each}
	{#if story.rankGuess != null}
		<p class="verdict">
			{nodeName(story.rankGuess)} ranks #{nodeRank(story.rankGuess)}.
			{nodeRank(story.rankGuess) === 1 ? "Spot on!" : "Keep scrolling…"}
		</p>
	{/if}
</div>

<style>
	.guess {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	button {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.4rem 0.7rem;
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

	.verdict {
		width: 100%;
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		font-style: italic;
	}
</style>

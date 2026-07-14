<script>
	// @ts-check
	import { story } from "./story.svelte.js";
	import { nodeName, nodeRank, searchRankOptions } from "./states.js";

	// Guessing pans the rank ladder to the picked actor (a param update, not a
	// step change); the next step reveals #1 regardless — fully skippable.
	// Search is scoped to the same top-N actors RankBars renders, so every
	// result here has a visible row to scroll to and highlight.
	let query = $state("");
	const matches = $derived(searchRankOptions(query));
</script>

<div class="guess">
	{#if story.rankGuess == null}
		<input type="text" placeholder="Search for an actor…" bind:value={query} />
		{#if query.trim().length >= 2}
			{#if matches.length > 0}
				<div class="matches">
					{#each matches as { id, name } (id)}
						<button onclick={() => (story.rankGuess = id)}>{name}</button>
					{/each}
				</div>
			{:else}
				<p class="hint">No matches in the top 250.</p>
			{/if}
		{/if}
	{:else}
		<p class="verdict">
			{nodeName(story.rankGuess)} ranks #{nodeRank(story.rankGuess)}.
			{nodeRank(story.rankGuess) === 1 ? "Spot on!" : "Keep going…"}
			<button class="change" onclick={() => (story.rankGuess = null)}>
				Guess again
			</button>
		</p>
	{/if}
</div>

<style>
	.guess {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	input {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--color-gray-400);
		border-radius: 2rem;
		background: var(--color-bg);
		color: var(--color-fg, #282828);
	}

	.matches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		max-height: 8rem;
		overflow-y: auto;
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

	.hint {
		margin: 0;
		font-size: 0.8rem;
		font-style: italic;
		color: var(--color-gray-500, #888);
	}

	.verdict {
		width: 100%;
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		font-style: italic;
	}

	.verdict button.change {
		font-size: 0.75rem;
		padding: 0.2rem 0.6rem;
		margin-left: 0.5rem;
	}
</style>

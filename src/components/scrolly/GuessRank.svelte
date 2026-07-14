<script>
	// @ts-check
	import { getContext } from "svelte";
	import { story } from "./story.svelte.js";
	import { nodeName, nodeRank, searchRankOptions } from "./states.js";
	import { SLJ } from "./layout-shared.js";

	const steps = getContext("scrolly-steps");

	// Guessing pans the rank ladder to the picked actor (a param update, not a
	// step change); the next step reveals #1 regardless — fully skippable.
	// Search is scoped to the same top-N actors RankBars renders, so every
	// result here has a visible row to scroll to and highlight.
	let query = $state("");
	let editing = $state(false);
	const matches = $derived(searchRankOptions(query));
	// "Guess again" only reopens search — it doesn't clear story.rankGuess,
	// so RankBars keeps focus on the prior guess until a new one is picked
	const showSearch = $derived(
		!story.rankGaveUp && (story.rankGuess == null || editing)
	);
	const solved = $derived(
		story.rankGuess != null && nodeRank(story.rankGuess) === 1
	);

	function pick(id) {
		story.rankGuess = id;
		editing = false;
		query = "";
		if (nodeRank(id) === 1) steps.advance();
	}

	function giveUp() {
		story.rankGaveUp = true;
		editing = false;
		query = "";
		steps.advance();
	}
</script>

<div class="guess">
	{#if story.rankGaveUp}
		<p class="verdict">{nodeName(SLJ)} ranks #1.</p>
	{:else if story.rankGuess != null}
		<p class="verdict">
			{nodeName(story.rankGuess)} ranks #{nodeRank(story.rankGuess)}.
			{solved ? "Spot on!" : "Keep going…"}
			{#if !editing && !solved}
				<button class="change" onclick={() => (editing = true)}>
					Guess again
				</button>
				<button class="give-up" onclick={giveUp}>Give up</button>
			{/if}
		</p>
	{/if}
	{#if showSearch}
		<input type="text" placeholder="Search for an actor…" bind:value={query} />
		{#if query.trim().length >= 2}
			{#if matches.length > 0}
				<div class="matches">
					{#each matches as { id, name } (id)}
						<button onclick={() => pick(id)}>{name}</button>
					{/each}
				</div>
			{:else}
				<p class="hint">No matches in the top 250.</p>
			{/if}
		{/if}
		{#if story.rankGuess == null}
			<button class="give-up" onclick={giveUp}>Give up</button>
		{/if}
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

	button.give-up {
		align-self: flex-start;
		font-size: 0.75rem;
		color: var(--color-gray-500, #888);
		background: none;
		border-color: var(--color-gray-300, #ccc);
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

	.verdict button.change,
	.verdict button.give-up {
		font-size: 0.75rem;
		padding: 0.2rem 0.6rem;
		margin-left: 0.5rem;
	}
</style>

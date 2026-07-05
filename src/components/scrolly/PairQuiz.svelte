<script>
	// @ts-check
	import { story } from "./story.svelte.js";
	import { INTERACTIVE_IDS, nodeName, nodeAvgDistance } from "./states.js";

	// Each answered pair lights up on the scatter (STATE_PARAMS.scatterQuiz);
	// the following steps explain the answers regardless — fully skippable.
	const pairs = INTERACTIVE_IDS.quiz;
</script>

<div class="quiz">
	{#each pairs as pair, i (i)}
		<div class="pair">
			{#each [pair.a, pair.b] as id, choice (id)}
				<button
					class:picked={story.quizPicks[i] === choice}
					disabled={story.quizPicks[i] !== undefined}
					onclick={() => (story.quizPicks[i] = choice)}
				>
					{nodeName(id)}
				</button>
			{/each}
			{#if story.quizPicks[i] !== undefined}
				<p class="verdict">
					{story.quizPicks[i] === pair.answer ? "✓" : "✗"}
					{nodeName(pair.answer === 0 ? pair.a : pair.b)} —
					{nodeAvgDistance(pair.answer === 0 ? pair.a : pair.b)} vs
					{nodeAvgDistance(pair.answer === 0 ? pair.b : pair.a)}
				</p>
			{/if}
		</div>
	{/each}
</div>

<style>
	.quiz {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}

	.pair {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
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

	button:disabled {
		cursor: default;
		opacity: 0.6;
	}

	button.picked {
		background: var(--color-gray-900);
		color: var(--color-bg);
		border-color: var(--color-gray-900);
		opacity: 1;
	}

	.verdict {
		margin: 0;
		font-size: 0.8rem;
		font-style: italic;
	}
</style>

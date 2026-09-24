<script>
	// @ts-check
	import { getContext } from "svelte";
	import Button from "$components/ui/Button.svelte";
	import Combobox from "$components/ui/Combobox.svelte";
	import { story } from "./story.svelte.js";
	import { nodeName, nodeRank } from "./states.js";
	import { RANK_POOL, searchActors } from "./search.js";
	import { RANK_TOP_N, SLJ } from "./cast.js";
	import { recordRankGuess } from "$utils/analytics.js";

	const steps = getContext("scrolly-steps");

	// Guessing pans the rank ladder to the picked actor (a param update, not a
	// step change). Naming #1 or skipping is the only way off this step — the
	// reader's Next is refused there (the step's `gate`, see Step.svelte), and
	// the advance() below bypasses it, so "Skip" is always the way out.
	// Search is scoped to the same top-N actors RankBars renders, so every
	// result here has a visible row to scroll to and highlight.
	let query = $state("");
	/** bits-ui carries a string value; the pool is node ids */
	let value = $state("");
	let editing = $state(false);
	const matches = $derived(searchActors(query, { pool: RANK_POOL }));
	const items = $derived(
		matches.map(({ id, name }) => ({ value: String(id), label: name }))
	);
	// the reader's current guess: the most recent pick (see story.svelte.js)
	const guess = $derived(story.rank.guesses.at(-1) ?? null);
	// "Guess again" only reopens search — it doesn't drop the prior guess,
	// so RankBars keeps focus on it until a new one is picked
	const showSearch = $derived(
		!story.rank.skipped && (guess == null || editing)
	);
	const solved = $derived(guess != null && nodeRank(guess) === 1);

	// Both handlers below record the guess LAST, after the state write and the
	// step move. It is background instrumentation called straight from a click:
	// anything it throws (blocked site data makes localStorage throw on touch —
	// see $utils/analytics.js) would otherwise land between naming #1 and the
	// advance it earns, leaving the reader on a step whose gate only their own
	// correct guess opens.
	function pick(next) {
		const id = Number(next);
		if (!Number.isInteger(id)) return;
		// re-picking an earlier guess moves it back to the end, so the last entry
		// is always the one the list focuses on
		const seen = story.rank.guesses.indexOf(id);
		if (seen !== -1) story.rank.guesses.splice(seen, 1);
		story.rank.guesses.push(id);
		editing = false;
		query = "";
		value = "";
		const correct = nodeRank(id) === 1;
		if (correct) steps.advance();
		recordRankGuess({ actorId: id, correct });
	}

	// the reader declining the question: the answer is read out and the step
	// moves on, as a correct guess does. Recorded as the `gave_up` the
	// analytics schema has always called it.
	function skip() {
		story.rank.skipped = true;
		editing = false;
		query = "";
		value = "";
		steps.advance();
		recordRankGuess({ gaveUp: true, correct: false });
	}
</script>

<div class="guess">
	{#if story.rank.skipped}
		<p class="verdict">{nodeName(SLJ)} ranks #1.</p>
	{:else if guess != null}
		<p class="verdict">
			{nodeName(guess)} ranks #{nodeRank(guess)}.
			{solved ? "Spot on!" : "Keep going…"}
		</p>
		{#if !editing && !solved}
			<!-- The same outline Button as the pair quiz's Skip, so the story's
			     two Skips read as one control. Out of the verdict's line rather
			     than inline in it, so they do not take on its italic small type. -->
			<div class="actions">
				<Button variant="outline" size="sm" onclick={() => (editing = true)}>
					Guess again
				</Button>
				<Button variant="outline" size="sm" onclick={skip}>Skip</Button>
			</div>
		{/if}
	{/if}
	{#if showSearch}
		<!-- The list is portalled out of the card (see ui/Combobox.svelte), which
		     is why there is no reserved box around it here: it opens over the
		     prose rather than pushing it, so the card's measured height — what
		     half the canvas's bottom clearances come off — never moves as the
		     reader types. The hand-rolled input this replaced grew the card on
		     every keystroke. -->
		<Combobox
			bind:value
			{items}
			placeholder="Search for an actor…"
			emptyText={query.trim().length < 2
				? "Keep typing…"
				: `No matches in the top ${RANK_TOP_N}`}
			onsearch={(text) => (query = text)}
			onValueChange={pick}
		/>
		{#if guess == null || editing}
			<div class="actions">
				<Button variant="outline" size="sm" onclick={skip}>Skip</Button>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* The tap halves cover this block's full width (TapNav), so it takes its
	   presses back — the step card above it is pointer-transparent at --z-card
	   precisely so a control can. Not a z-index lift: a step wrapper with a
	   filling opacity animation (.rank-focus-text) forms a stacking context, so
	   a lift on this element cannot escape it at any value; the lift lives up on
	   .scrolly-steps instead (Stage.svelte).

	   Still inset by --control-inset, which is now about the thumb rather than
	   about the layers: the search box's left third, the wrapped match buttons
	   and the Skip button (the actions row starts flush left) all sat
	   exactly where a reader reaching for the next step presses. The prose above
	   stays full width and keeps giving its outer edge up — a tap there is meant
	   to be a step. */
	.guess {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
		/* Margin, not padding: this block takes pointer events back (below), and
		   padding is inside the element's own hit box — the inset would swallow
		   the very presses it exists to keep clear. */
		margin-inline: var(--control-inset);
		pointer-events: auto;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.verdict {
		width: 100%;
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		font-style: italic;
	}
</style>

<script module>
	// @ts-check
	import { story } from "./story.svelte.js";
	import { recordRankGuess } from "$utils/analytics.js";

	/**
	 * The reader declining the question: the answer is read out and the step
	 * moves on, as a correct guess does. Recorded as the `gave_up` the
	 * analytics schema has always called it. Shared with the step's `onnext`
	 * (Index.svelte), so the reader's Next skips the question too.
	 * @param {{ advance: () => void }} steps the registry
	 */
	export function skipGuess(steps) {
		story.rank.skipped = true;
		steps.advance();
		recordRankGuess({ gaveUp: true, correct: false });
	}
</script>

<script>
	// @ts-check
	import { getContext } from "svelte";
	import Button from "$components/ui/Button.svelte";
	import Combobox from "$components/ui/Combobox.svelte";
	import { nodeName, nodeRank } from "./states.js";
	import { RANK_POOL, searchActors } from "./search.js";
	import { RANK_TOP_N, SLJ } from "./cast.js";

	const steps = getContext("scrolly-steps");

	// Guessing pans the rank ladder to the picked actor (a param update, not a
	// step change). Naming #1 or skipping is the only way off this step — the
	// step's `gate` never opens, and the reader's Next skips (its `onnext` is
	// skipGuess above); both go through advance(), which bypasses the gate.
	// Search is scoped to the same top-N actors RankBars renders, so every
	// result here has a visible row to scroll to and highlight.
	let query = $state("");
	/** bits-ui carries a string value; the pool is node ids */
	let value = $state("");
	// bumped by every pick, to remount the search empty (see the markup)
	let picks = $state(0);
	const matches = $derived(searchActors(query, { pool: RANK_POOL }));
	const items = $derived(
		matches.map(({ id, name }) => ({ value: String(id), label: name }))
	);
	// the reader's current guess: the most recent pick (see story.svelte.js)
	const guess = $derived(story.rank.guesses.at(-1) ?? null);
	const solved = $derived(guess != null && nodeRank(guess) === 1);
	// The search stays up until the question is answered or skipped: a wrong
	// guess is read out under it and the reader types the next one straight
	// away. RankBars keeps focus on the last guess until a new one is picked.
	const asking = $derived(!story.rank.skipped && !solved);

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
		picks += 1;
		query = "";
		value = "";
		const correct = nodeRank(id) === 1;
		if (correct) steps.advance();
		recordRankGuess({ actorId: id, correct });
	}

	function skip() {
		query = "";
		value = "";
		skipGuess(steps);
	}
</script>

<div class="guess">
	{#if asking}
		<!-- The list is portalled out of the card (see ui/Combobox.svelte), which
		     is why there is no reserved box around it here: it opens over the
		     prose rather than pushing it, so the card's measured height — what
		     half the canvas's bottom clearances come off — never moves as the
		     reader types. The hand-rolled input this replaced grew the card on
		     every keystroke.

		     It stays up across wrong guesses, and bits-ui writes the picked
		     name into the input after onValueChange returns — so each pick
		     remounts it (`picks`), which is what hands the reader an empty box
		     for the next name.

		     Skip shares the input's line, as the same `story` Button as the pair
		     quiz's Skip and the StartButtons. -->
		<div class="ask">
			<div class="search">
				{#key picks}
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
				{/key}
			</div>
			<Button variant="story" onclick={skip}>Skip</Button>
		</div>
	{/if}
	{#if story.rank.skipped}
		<p class="verdict">{nodeName(SLJ)} ranks #1.</p>
	{:else if guess != null}
		<p class="verdict">
			{nodeName(guess)} ranks #{nodeRank(guess)}.
			{solved ? "Spot on!" : "Keep going…"}
		</p>
	{/if}
</div>

<style>
	/* The tap halves cover this block's full width (TapNav), so it takes its
	   presses back — the step card above it is pointer-transparent at --z-card
	   precisely so a control can. Not a z-index lift: a step wrapper with a
	   filling opacity animation (.rank-focus-text) forms a stacking context, so
	   a lift on this element cannot escape it at any value; the lift lives up on
	   .scrolly-steps instead (Stage.svelte).

	   The full width of the prose above it, NOT inset by --control-inset as
	   the other card controls are (2026-09-24, Owen's call): the search and
	   its Skip read as the end of the paragraph, and an inset line of them
	   read as a stray box. The cost is the one the inset exists to avoid —
	   the ends of the line sit where a thumb reaching for a step lands, so a
	   tap there hits the control rather than the tap half. */
	.guess {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
		/* the same 16px every prose step leaves under its last line (`p`'s
		   margin, reset.css), which a control has none of and so sat flush on
		   the screen's edge — see PairQuiz's .quiz for the same fix */
		margin-bottom: 1rem;
		pointer-events: auto;
	}

	.ask {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* the input fills whatever the line leaves beside Skip */
	.search {
		flex: 1;
		min-width: 0;
	}

	.verdict {
		width: 100%;
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		font-style: italic;
	}
</style>

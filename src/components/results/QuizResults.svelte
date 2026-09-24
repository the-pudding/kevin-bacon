<script>
	// @ts-check
	// The credits' "Your results" block: how the reader did on the story's two
	// quizzes, against everyone who came before them. Owns the gate and the
	// copy; the read is quiz-results.svelte.js, started by Index.svelte on the
	// story's last step so it is normally in before the credits roll, and
	// ResultBars draws.
	//
	// Nothing here touches the canvas, a layout state or the step registry,
	// which is why it lives outside scrolly/ — it is plain document flow, below
	// the wizard, rendered once the reader has left it (see `exited` in
	// Index.svelte).
	import { analyticsEnabled, MIN_QUIZ_TAKERS } from "$utils/analytics.js";
	import { INTERACTIVE_IDS, nodeName } from "$components/scrolly/states.js";
	import { SLJ } from "$components/scrolly/cast.js";
	import ResultBars from "./ResultBars.svelte";

	/** @type {{ data: any, loading: boolean }} */
	let { data, loading } = $props();

	const PAIR_COUNT = INTERACTIVE_IDS.quiz.length;

	// Each chart is the reader's own or not shown: one only appears for a
	// reader who finished that quiz (the database counts only finishers, and
	// hands back a null `you` to anyone who gave up or left pairs unanswered),
	// and only once enough finishers exist for the shares to mean something.
	// The block itself shows when at least one chart does.
	const showRank = $derived(
		data?.rank?.you != null && data.rank.takers >= MIN_QUIZ_TAKERS
	);
	const showPairs = $derived(
		data?.pairs?.you != null && data.pairs.takers >= MIN_QUIZ_TAKERS
	);
	const show = $derived(analyticsEnabled && (showRank || showPairs));

	/** The "5+" bucket's key, read off the data rather than retyped, so the
	 * histogram and the "which bar is mine" test can never disagree about where
	 * the tail starts. */
	const tailKey = $derived(data?.rank?.buckets?.at(-1)?.key ?? "5+");

	const rankBars = $derived(
		(data?.rank?.buckets ?? []).map((bucket) => ({
			key: bucket.key,
			label: bucket.key,
			count: bucket.count,
			mine: data.rank.you
				? bucket.key ===
					(data.rank.you.guesses >= parseInt(tailKey, 10)
						? tailKey
						: String(data.rank.you.guesses))
				: false
		}))
	);

	// The database orders the buckets by ascending score; the chart reads
	// best-first, so a perfect score sits at the top.
	const pairBars = $derived(
		(data?.pairs?.buckets ?? []).toReversed().map((bucket) => ({
			key: bucket.key,
			label: `${bucket.score} / ${PAIR_COUNT}`,
			count: bucket.count,
			mine: data.pairs.you ? data.pairs.you.score === bucket.score : false
		}))
	);

	/** Round a percentage for display, without letting the rounding tell a lie:
	 * a reader who beat someone must not read "0%", and one who did not beat
	 * everyone must not read "100%". Returns null when there is no number. */
	function pct(value) {
		if (value == null) return null;
		const rounded = Math.round(value);
		if (rounded >= 100 && value < 100) return 99;
		if (rounded <= 0 && value > 0) return 1;
		return rounded;
	}

	// The two sentences are composed here rather than assembled out of markup
	// fragments: an {#if} inside a <p> has to fight Svelte's whitespace
	// collapsing for the single space after the full stop, and the copy is
	// easier to read and rewrite as one string anyway.
	//
	// A "better than 0%" clause is a worse sentence than no clause at all, so
	// the comparison drops out entirely at zero. The company clauses keep theirs
	// at any value — "so did 1% of readers" still reads.
	const rankLine = $derived.by(() => {
		const you = data?.rank?.you;
		if (!you) return null;
		const guesses = you.guesses === 1 ? "one guess" : `${you.guesses} guesses`;
		const better = pct(you.better_than_pct);
		return (
			`You named ${nodeName(SLJ)} in ${guesses}.` +
			(better ? ` Better than ${better}% of readers.` : "")
		);
	});

	const pairLine = $derived.by(() => {
		const you = data?.pairs?.you;
		if (!you) return null;
		if (you.score === 0) {
			const share = pct(you.company_pct);
			return (
				`You got none of the ${PAIR_COUNT} pairs right.` +
				(share ? ` So did ${share}% of readers.` : "")
			);
		}
		const better = pct(you.better_than_pct);
		return (
			`You got ${you.score} of ${PAIR_COUNT} pairs right.` +
			(better ? ` Better than ${better}% of readers.` : "")
		);
	});
</script>

{#if analyticsEnabled && loading}
	<div class="credits-block">
		<h2>Your results</h2>
		<p>Loading your results…</p>
	</div>
{:else if show}
	<div class="credits-block">
		<h2>Your results</h2>

		{#if showRank}
			<ResultBars
				bars={rankBars}
				total={data.rank.takers}
				title="Guesses to name {nodeName(SLJ)}"
			/>
			<p>{rankLine}</p>
		{/if}

		{#if showPairs}
			<ResultBars
				bars={pairBars}
				total={data.pairs.takers}
				title="Pairs answered correctly"
			/>
			<p>{pairLine}</p>
		{/if}
	</div>
{/if}

<style>
	/* the two charts want more room between them than .credits-block's own gap
	   gives, and the sentence under each wants to sit tight to its chart */
	.credits-block :global(.hist) {
		margin-top: 1.25rem;
	}

	.credits-block :global(.hist:first-of-type) {
		margin-top: 0;
	}

	p {
		max-width: 480px;
		font-size: var(--14px, 0.875rem);
	}
</style>

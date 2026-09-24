<script>
	// @ts-check
	// One horizontal histogram for the credits' results block. Dumb and
	// reusable: the caller does all the labelling and decides which bucket is
	// the reader's own. See QuizResults.svelte for both uses.

	/**
	 * `bars` is already in axis order — the caller owns that, since only it
	 * knows that "gave up" belongs at the right-hand end rather than sorted
	 * among the numbers.
	 * @type {{
	 *   bars: { key: string, label: string, count: number, mine?: boolean }[],
	 *   total: number,
	 *   title: string
	 * }}
	 */
	let { bars, total, title } = $props();

	// Bar LENGTH is relative to the tallest bucket, which is what makes the
	// distribution's shape readable when the mode holds a third of the field;
	// the number PRINTED beside it is a share of the whole, which is what makes
	// it mean something. Floor of 1 so an all-zero histogram can't divide by 0.
	const max = $derived(Math.max(1, ...bars.map((b) => b.count)));

	// The bars grow in rather than appearing at length. A CSS transition only
	// fires on a CHANGE, and an inline width is already correct on the first
	// render, so the widths start at zero and are published one frame later.
	// requestAnimationFrame, not a microtask: the zero-width paint has to land
	// first or there is nothing to transition from.
	let grown = $state(false);
	$effect(() => {
		const frame = requestAnimationFrame(() => (grown = true));
		return () => cancelAnimationFrame(frame);
	});
</script>

<figure class="hist">
	<figcaption>{title}</figcaption>
	<!-- an ordered list, so this still reads as a ranked set of buckets with CSS
	     off and to a screen reader, with no ARIA of its own -->
	<ol>
		{#each bars as bar (bar.key)}
			<li class:mine={bar.mine} class:empty={bar.count === 0}>
				<span class="key">{bar.label}</span>
				<span class="track">
					<span
						class="fill"
						style:width={grown ? `${(bar.count / max) * 100}%` : "0%"}
					></span>
				</span>
				<span class="val">{Math.round((bar.count / total) * 100)}%</span>
			</li>
		{/each}
	</ol>
</figure>

<style>
	.hist {
		width: 100%;
		max-width: 480px;
		margin: 0;
	}

	figcaption {
		font-family: var(--font-mono);
		font-size: var(--12px, 0.75rem);
		text-transform: uppercase;
		letter-spacing: var(--tracking-mono);
		color: var(--color-fg-light);
		margin-bottom: 0.6rem;
		text-align: left;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	/* grid rather than flex: every track has to start and end on the same two x
	   positions whatever the label beside it says ("gave up" against "1"), and a
	   flex row with a 1fr middle drifts as the labels change width */
	li {
		display: grid;
		grid-template-columns: 8ch 1fr 4ch;
		align-items: center;
		gap: 0.5rem;
	}

	.key,
	.val {
		font-family: var(--font-mono);
		letter-spacing: var(--tracking-mono);
		font-size: var(--12px, 0.75rem);
		color: var(--color-fg);
		/* the same halo as .credits-block p: this sits over the drifting dot
		   field, not over a plain background */
		text-shadow: var(--text-halo);
	}

	.key {
		text-align: right;
	}

	.val {
		text-align: right;
		color: var(--color-fg-light);
	}

	/* the track carries its own background for the same reason the labels carry
	   a halo — the dot field drifting behind would otherwise show through the
	   bars and turn the chart to mud */
	.track {
		position: relative;
		height: 0.85rem;
		border-radius: 2rem;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-bg) 78%, transparent);
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: 2rem;
		background: color-mix(in srgb, var(--color-fg) 22%, transparent);
		transition: width 900ms cubic-bezier(0.65, 0, 0.35, 1);
	}

	/* a bucket with one reader in it must still be visible; one with none must
	   not be, which is what the .empty guard buys */
	li:not(.empty) .fill {
		min-width: 3px;
	}

	.mine .fill {
		background: var(--color-primary);
	}

	.mine .key,
	.mine .val {
		font-weight: 700;
		color: var(--color-fg);
	}

	/* no JS clock to coordinate here, unlike PairQuiz's flight, so the
	   reduced-motion opt-out is pure CSS */
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>

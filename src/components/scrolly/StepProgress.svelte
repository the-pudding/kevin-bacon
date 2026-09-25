<script>
	// @ts-check
	/**
	 * Progress across the top of the story: one line per beat, the active one
	 * lit. No text — the lines are the whole of it.
	 *
	 * A beat is not always a step. A gated interaction step claims no line: it
	 * and the step that reads out its answer are one move to the reader, so they
	 * share a line and the bar doesn't tick twice for it. The registry works out
	 * which steps own a line, which chapter each is in and which line the active
	 * step lights (`chapters` / `currentChapter` / `dotStep` on the step
	 * registry) — nothing here counts steps by hand.
	 *
	 * Indicator only — the bar takes no pointer events, so a tap over it falls
	 * through to the tap half beneath it and steps the story by one like
	 * anywhere else. Never a jump target: that would land a reader past the gated
	 * steps without their question ever being put — they can be skipped, but
	 * only from the step itself. See notes/scrolly-framework.md.
	 */
	import { getContext } from "svelte";
	import { fade } from "svelte/transition";
	import { MediaQuery } from "svelte/reactivity";

	const steps = getContext("scrolly-steps");

	const BAR_FADE_MS = 300;
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);
	const barFade = $derived({
		duration: reducedMotion.current ? 0 : BAR_FADE_MS
	});

	const current = $derived(steps.chapters[steps.currentChapter]);

	// The bar comes back with the words, and once up it STAYS up.
	//
	// A latch rather than a live read, for the reason story.rank.revealed is one:
	// the lines ARE the step change, so an ordinary step must not blink the bar
	// out and back. It is only coming back off a hideBar step that it arrives at
	// all, and there it waits for the arriving step's prose like every other
	// piece of arriving furniture, so the bar never announces a position the
	// reader has not been given yet.
	const down = $derived(steps.hideBar);
	let up = $state(false);
	$effect(() => {
		if (down) up = false;
		else if (!steps.held) up = true;
	});
</script>

{#if !down && up && current}
	<div
		class="step-progress"
		role="group"
		aria-label="Story progress"
		transition:fade={barFade}
	>
		<!-- the lines carry no information a screen reader can use; this line is
		     the same fact, said once -->
		<span class="sr-only">
			Chapter {steps.currentChapter + 1} of {steps.chapters.length}: {current.title}.
			Step {current.steps.indexOf(steps.dotStep) + 1} of {current.steps.length}.
		</span>
		<div class="lines" aria-hidden="true">
			{#each steps.dotSteps as step (step)}
				<span
					class="line"
					class:past={step < steps.dotStep}
					class:lit={step === steps.dotStep}
				></span>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Absolute over the top of the canvas, never in flow: .scrolly-layout is
	   exactly the window height, so a sibling above it would push the page past
	   one viewport and start it scrolling. Above --z-tap-above so no over-canvas
	   panel can cover it and the quiz's backdrop-filter can't blur it. No
	   background — it lands on white everywhere, and a plate would be the only
	   thing in the piece punching a rectangle out of the canvas. What the marks
	   get instead is --bar-halo, the same hold-out the step prose carries: a
	   full-bleed state runs its crowd up under the bar, and a hairline on a
	   field of 3px dots needs separating from them without a plate. Invisible
	   wherever the canvas behind it is empty. */
	.step-progress {
		--bar-halo:
			0 0 3px var(--surface-holdout), 0 0 3px var(--surface-holdout),
			0 0 6px var(--surface-holdout), 0 0 6px var(--surface-holdout);
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: var(--progress-band);
		z-index: var(--z-tap-above);
		display: flex;
		/* centred in the band, so the lines keep clear of the chart title that
		   sits directly under it (--title-band) */
		align-items: center;
		padding: 0 var(--16px);
		pointer-events: none;
	}

	/* Every line takes an equal share, so the bar spans the screen at any
	   width whatever the step count. */
	.lines {
		display: flex;
		gap: 3px;
		width: 100%;
	}

	/* Three states by colour alone, so a step change moves no layout. */
	.line {
		flex: 1 1 0;
		height: 2px;
		background: var(--control-progress-track);
		box-shadow: var(--bar-halo);
		/* --1s rather than an explicit reduced-motion block (which is what
		   Index.svelte uses): those disable keyframe animations with delays,
		   where shrinking the duration leaves the delay standing. This is the
		   plain single-duration transition the token exists for. */
		transition: background-color calc(var(--1s) * 0.2) ease;
	}

	.line.past {
		background: var(--control-progress-past);
	}

	.line.lit {
		background: var(--control-progress-current);
	}
</style>

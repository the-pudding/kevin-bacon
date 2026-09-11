<script>
	// @ts-check
	/**
	 * Chapter-segmented progress across the top of the story: one dot per beat,
	 * chapter groups divided by a hairline tick.
	 *
	 * A beat is not always a step. Chapter cards claim no dot, and neither does
	 * a gated interaction step: it and the step that reads out its answer are
	 * one move to the reader, so they share a dot and the bar doesn't tick twice
	 * for it. The registry works out which steps own a dot and which dot the
	 * active step lights (`dotSteps` / `dotStep` in Index.svelte) — nothing here
	 * counts steps by hand.
	 *
	 * Indicator only — the dots take no pointer events, so a tap over the bar
	 * falls through to the tap gutter beneath it and steps the story by one
	 * like anywhere else. Never a jump target: that would land a reader past the
	 * gated steps, which the story deliberately makes unskippable — see
	 * notes/scrolly-framework.md.
	 *
	 * Dots are the piece's own vocabulary: the canvas behind this bar is 11,486
	 * of them, so the progress indicator is that, shrunk to a strip.
	 */
	import { getContext } from "svelte";
	import { fade } from "svelte/transition";
	import { MediaQuery } from "svelte/reactivity";
	import {
		CHAPTER_IN_MS,
		CHAPTER_IN_DELAY_MS,
		CHAPTER_OUT_MS
	} from "$components/scrolly/chapterFade.js";

	const steps = getContext("scrolly-steps");

	// [0, ...chapterStarts] — the three chapter cards open at 3, 12 and 20, and
	// the steps before the first one are a segment of their own rather than
	// being folded into a chapter that hasn't been announced yet. Each segment
	// then keeps only the steps that own a dot, so a chapter card and a gated
	// step both fall out of the bar here rather than needing a guard in the
	// markup — the tick already marks the chapter break.
	const segments = $derived.by(() => {
		const starts = [0, ...steps.chapterStarts];
		return starts.map((from, i) => {
			const to = (starts[i + 1] ?? steps.count) - 1;
			return steps.dotSteps.filter((step) => step >= from && step <= to);
		});
	});

	// Crossfades the bar against the chapter card's own fade (Index.svelte):
	// the bar leaves on the title's slow, delayed arrival, and returns on the
	// title's quick exit — one transition, not two independent ones.
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);
	const barOut = $derived(
		reducedMotion.current
			? { duration: 0 }
			: { duration: CHAPTER_IN_MS, delay: CHAPTER_IN_DELAY_MS }
	);
	const barIn = $derived(
		reducedMotion.current ? { duration: 0 } : { duration: CHAPTER_OUT_MS }
	);
</script>

{#if !steps.chapter}
	<div
		class="step-progress"
		role="group"
		aria-label="Story progress"
		in:fade={barIn}
		out:fade={barOut}
	>
		<!-- the dots carry no information a screen reader can use; this line is
		     the same fact, said once -->
		<span class="sr-only">
			Step {steps.dotSteps.indexOf(steps.dotStep) + 1} of {steps.dotSteps
				.length}
		</span>
		<div class="segments" aria-hidden="true">
			{#each segments as segment, i (i)}
				{#if i > 0}
					<span class="tick"></span>
				{/if}
				<div class="segment">
					{#each segment as step (step)}
						<span
							class="dot"
							class:past={step < steps.dotStep}
							class:current={step === steps.dotStep}
						></span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Absolute over the top of the canvas, never in flow: .scrolly-layout is
	   exactly the window height, so a sibling above it would push the page past
	   one viewport and start it scrolling. Above --z-tap-above so the movers
	   panel (top: 0, opaque) can't cover it and the quiz's backdrop-filter can't
	   blur it. No background — it lands on white everywhere, and a plate would
	   be the only thing in the piece punching a rectangle out of the canvas.
	   What the marks get instead is --bar-halo, the same hold-out the chapter
	   title and the step prose carry: a full-bleed state runs its crowd up under
	   the bar, and a 5px dot on a field of 3px dots needs separating from them
	   without a plate. Invisible wherever the canvas behind it is empty. */
	.step-progress {
		--bar-halo:
			0 0 3px var(--color-bg, #fff), 0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff), 0 0 6px var(--color-bg, #fff);
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: var(--progress-band);
		z-index: var(--z-tap-above);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.segments {
		display: flex;
		align-items: center;
		/* the chapter break, as space. The tick below makes it unambiguous — at
		   30 dots a gap alone reads as a rendering accident. */
		gap: 6px;
	}

	.segment {
		display: flex;
		align-items: center;
		gap: 3px;
		/* 24 dots is 189px at these sizes, so the bar fits 320px without
		   shrinking; never let it wrap into a second row if a step is added */
		flex-wrap: nowrap;
	}

	.tick {
		width: 1px;
		height: 10px;
		background: var(--color-border);
		box-shadow: var(--bar-halo);
	}

	/* Three states by colour alone. The current dot grows by transform, never by
	   width: a width change would reflow its 23 neighbours and jiggle the whole
	   bar on every step. */
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-gray-200);
		box-shadow: var(--bar-halo);
		/* --1s rather than an explicit reduced-motion block (which is what
		   Index.svelte uses): those disable keyframe animations with delays,
		   where shrinking the duration leaves the delay standing. This is the
		   plain single-duration transition the token exists for. */
		transition:
			background-color calc(var(--1s) * 0.2) ease,
			transform calc(var(--1s) * 0.2) ease;
	}

	.dot.past {
		background: var(--color-gray-400);
	}

	.dot.current {
		background: var(--color-fg);
		transform: scale(1.4);
	}
</style>

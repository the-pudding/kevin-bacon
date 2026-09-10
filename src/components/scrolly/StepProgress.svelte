<script>
	// @ts-check
	/**
	 * Chapter-segmented progress across the top of the story: one dot per step,
	 * chapter groups divided by a hairline tick.
	 *
	 * Indicator only — the dots take no pointer events, so a tap over the bar
	 * falls through to the tap gutter beneath it and steps the story by one
	 * like anywhere else. Never a jump target: that would let a reader past the
	 * two steps gated behind a Start button (the race rewind, the simulation),
	 * which the story deliberately makes unskippable — see `beforenext` in
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
	// being folded into a chapter that hasn't been announced yet. A segment's
	// own `from` is a chapter's step index for every segment but the first, so
	// the dot loop below skips it — the tick already marks the chapter break,
	// and a chapter card isn't a step the bar should claim a dot for.
	const segments = $derived.by(() => {
		const starts = [0, ...steps.chapterStarts];
		return starts.map((from, i) => ({
			from: i > 0 ? from + 1 : from,
			to: (starts[i + 1] ?? steps.count) - 1
		}));
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
		<span class="sr-only">Step {steps.current + 1} of {steps.count}</span>
		<div class="segments" aria-hidden="true">
			{#each segments as segment, i (segment.from)}
				{#if i > 0}
					<span class="tick"></span>
				{/if}
				<div class="segment">
					{#each { length: segment.to - segment.from + 1 } as _, n}
						{@const step = segment.from + n}
						<span
							class="dot"
							class:past={step < steps.current}
							class:current={step === steps.current}
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
	   be the only thing in the piece punching a rectangle out of the canvas. */
	.step-progress {
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
		/* 30 dots is 258px at these sizes, so the bar fits 320px without
		   shrinking; never let it wrap into a second row if a step is added */
		flex-wrap: nowrap;
	}

	.tick {
		width: 1px;
		height: 10px;
		background: var(--color-border);
	}

	/* Three states by colour alone. The current dot grows by transform, never by
	   width: a width change would reflow its 29 neighbours and jiggle the whole
	   bar on every step. */
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-gray-200);
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

<script>
	// @ts-check
	import { getContext } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { fly } from "svelte/transition";
	import { cubicInOut } from "svelte/easing";

	/**
	 * One story step: prose in the slot, visual state declared alongside it.
	 * Registers itself in document order with the "scrolly-steps" context, so
	 * the parent can map the active step index back to a layout state. Only the
	 * active step's prose renders (the story shows one step at a time);
	 * presentation is left to the parent's step container.
	 *
	 * `panel` is an optional snippet rendered *over the canvas* (not in the step
	 * card) while this step is active — for visuals that abandon the dot
	 * metaphor (see "Exception" in notes/scrolly-framework.md). Steps sharing
	 * one visual should pass the same snippet reference so it survives the step
	 * change without remounting (RankBars keeps its scroll position this way).
	 *
	 * The three gating props below make a step and the one after it read as a
	 * single beat: the reader cannot be carried to the payoff without doing the
	 * thing, and cannot land back on the controls once they have.
	 *
	 * `gate` is asked before the reader's own Next (tap gutter or ArrowRight)
	 * leaves this step; while it returns false the move is refused outright and
	 * the right-hand gutter goes disabled. A step whose only way forward is its
	 * own control passes a gate that never opens.
	 *
	 * `skipback` marks this step as one the reader passes *through* on the way
	 * back — a backward move that would land here continues to the step before,
	 * so an interaction's controls are never re-shown behind their own answer.
	 *
	 * `advanceon` is the step moving itself on: the parent watches it while this
	 * step is active and advances once it returns true (the simulation's
	 * end-of-run hand-off).
	 *
	 * `hideBar` drops the progress bar for this step alone — for a closing beat
	 * (the outro) that wants the full-bleed canvas to itself, the way a chapter
	 * card already does.
	 *
	 * The prose is held off screen while the arrival it describes is still
	 * playing — every step, not a declared few. It is read off the registry
	 * (`steps.held`, i.e. story.settledStep) rather than passed in, because the
	 * answer is the same for all of them and the question is one nothing but the
	 * canvas can answer. This used to be a `hold` prop set on five steps out of
	 * thirty, and it could not be set on the rest: the signal available was a
	 * STATE name, and six steps share a state with their neighbour.
	 *
	 * The gate is on the wrapper rather than an `{#if}` inside the prose because
	 * the wrapper is what fades: gate the prose from within and the box animates
	 * empty, then the words appear with no motion of their own.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, params?: unknown, panel?: import("svelte").Snippet, gate?: () => boolean, skipback?: boolean, advanceon?: () => boolean, hideBar?: boolean, children: import("svelte").Snippet }}
	 */
	let {
		state: layoutState,
		params,
		panel,
		gate,
		skipback,
		advanceon,
		hideBar,
		children
	} = $props();

	// The prose's own swap, out and then in with a beat between, so the column is
	// never showing two steps at once and the words read as one thing leaving and
	// another arriving rather than a cut. Brisker than the chapter card's fade
	// (chapterFade.js): a card is the only thing on screen and can take its time,
	// a paragraph is being read.
	const PROSE_OUT_MS = 200;
	const PROSE_IN_DELAY_MS = 260;
	const PROSE_IN_MS = 300;
	// Both ends drift the same way — the outgoing copy rises as it goes and the
	// incoming one rises into place — so the column reads as moving through the
	// step rather than swapping in place.
	const PROSE_RISE_PX = 8;

	const steps = getContext("scrolly-steps");
	const index = steps.register({
		state: layoutState,
		params,
		panel,
		gate,
		skipback,
		advanceon,
		hideBar
	});
	const active = $derived(steps.current === index);

	// An explicit query rather than the `--1s` token, because these carry a
	// delay: shrinking the duration would leave the 260ms standing and the prose
	// would simply arrive late (see StepProgress.svelte's note on the two idioms).
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);
	// cubicInOut is the curve the dot tweener eases on (tween.js's
	// easeCubicInOut), the same one the cards fade to
	const proseIn = $derived(
		reducedMotion.current
			? { duration: 0 }
			: {
					y: PROSE_RISE_PX,
					duration: PROSE_IN_MS,
					delay: PROSE_IN_DELAY_MS,
					easing: cubicInOut
				}
	);
	const proseOut = $derived(
		reducedMotion.current
			? { duration: 0 }
			: { y: -PROSE_RISE_PX, duration: PROSE_OUT_MS, easing: cubicInOut }
	);

	// Where this copy is standing while it is the active one. Captured in a PRE
	// effect, on the flush that deactivates it and before the DOM updates, which
	// is the only moment it is both still laid out and not yet moved: above
	// 1200px a chapter card swaps the prose column to the other side of the
	// screen (see `flipped` in Stage.svelte), and the outgoing copy is a grid
	// item of the column that just moved — so without this it is teleported a
	// full column's width and fades out over there.
	/** @type {HTMLElement | null} */
	let el = $state(null);
	/** @type {DOMRect | null} */
	let leftFrom = null;
	let wasActive = false;
	$effect.pre(() => {
		if (wasActive && !active && el) leftFrom = el.getBoundingClientRect();
		wasActive = active;
	});

	/**
	 * The exit, pinned to the side the words were read on. Freezing the box the
	 * copy already occupied is what lets the column move underneath it: the old
	 * words leave where they were, and the new ones arrive wherever the column
	 * now is.
	 */
	function proseLeave(node, params) {
		if (leftFrom) {
			node.style.position = "fixed";
			node.style.left = `${leftFrom.left}px`;
			node.style.top = `${leftFrom.top}px`;
			node.style.width = `${leftFrom.width}px`;
		}
		return fly(node, params);
	}
</script>

<!-- The wrapper is what fades, and it is a grid item of the prose column (see
     .scrolly-steps in Stage.svelte): the outgoing copy is still mounted while
     the incoming one plays its delay, and stacking them in one cell keeps the
     column's height at the taller of the two rather than the sum of them — a
     column that measured both at once would shove every clearance taken off
     stepsHeight. The column's aria-live is unaffected: a live region announces
     what ARRIVES, and the copy on its way out is only being removed. -->
{#if active && !steps.held}
	<div
		class="step-prose"
		bind:this={el}
		in:fly={proseIn}
		out:proseLeave={proseOut}
	>
		{@render children()}
	</div>
{/if}

<style>
	.step-prose {
		grid-area: 1 / 1;
	}
</style>

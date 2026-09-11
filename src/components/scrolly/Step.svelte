<script>
	// @ts-check
	import { getContext } from "svelte";

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
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, params?: unknown, panel?: import("svelte").Snippet, gate?: () => boolean, skipback?: boolean, advanceon?: () => boolean, children: import("svelte").Snippet }}
	 */
	let {
		state: layoutState,
		params,
		panel,
		gate,
		skipback,
		advanceon,
		children
	} = $props();

	const steps = getContext("scrolly-steps");
	const index = steps.register({
		state: layoutState,
		params,
		panel,
		gate,
		skipback,
		advanceon
	});
	const active = $derived(steps.current === index);
</script>

{#if active}
	{@render children()}
{/if}

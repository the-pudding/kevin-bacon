<script>
	import { getContext } from "svelte";

	/**
	 * One scrolly step: prose in the slot, visual state declared alongside it.
	 * Registers itself in document order with the "scrolly-steps" context, so
	 * the parent can map the active step index back to a layout state.
	 *
	 * @see notes/scrolly-framework.md
	 */
	let { state: layoutState, params, children } = $props();

	const steps = getContext("scrolly-steps");
	const index = steps.register(layoutState, params);
	const active = $derived(steps.current === index);
</script>

<div class="step" class:active>
	{@render children()}
</div>

<style>
	.step {
		min-height: calc(var(--viewport-height));
		display: flex;
		align-items: flex-end;
		padding: 1rem;
		padding-bottom: 3rem;
		opacity: 0.3;
		transition: opacity 0.2s ease;
	}

	.step :global(p) {
		background: var(--color-bg);
		padding: 1.5rem;
		box-shadow: 0 0 1.5rem 1rem var(--color-bg);
	}

	.step.active {
		opacity: 1;
	}
</style>

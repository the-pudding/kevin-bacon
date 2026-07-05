<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * One scrolly step: prose in the slot, visual state declared alongside it.
	 * Registers itself in document order with the "scrolly-steps" context, so
	 * the parent can map the active step index back to a layout state.
	 *
	 * `dwell` marks a free-exploration step (taller, so the reader can stop and
	 * interact before scrolling on — framework doc "Dwell steps").
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").LayoutState, params?: unknown, dwell?: boolean, children: import("svelte").Snippet }}
	 */
	let { state: layoutState, params, dwell = false, children } = $props();

	const steps = getContext("scrolly-steps");
	const index = steps.register(layoutState, params);
	const active = $derived(steps.current === index);
</script>

<div class="step" class:active class:dwell>
	<div class="card">
		{@render children()}
	</div>
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

	.card {
		background: var(--color-bg);
		padding: 1.5rem;
		box-shadow: 0 0 1.5rem 1rem var(--color-bg);
	}

	.card :global(p) {
		margin: 0;
	}

	.card :global(p + p) {
		margin-top: 0.75rem;
	}

	.step.active {
		opacity: 1;
	}

	/* free-exploration step: extra height so the reader dwells before advancing;
	   the card stays pinned near the viewport bottom for the whole dwell */
	.step.dwell {
		min-height: calc(var(--viewport-height) * 2);
	}

	.step.dwell .card {
		position: sticky;
		bottom: 3rem;
	}
</style>

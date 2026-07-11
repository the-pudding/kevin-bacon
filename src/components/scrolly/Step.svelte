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
	 * `ready` gates whether this step's *visual* ships in a production build: an
	 * unready step still renders (prose, nav, step count) but ScrollyVisual is
	 * replaced by a "visuals tbd" placeholder (see Index.svelte). `npm run dev`
	 * always shows the real visual so work-in-progress sections stay editable
	 * locally. Flip it to `true` once a step's visual is finished.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, params?: unknown, dwell?: boolean, ready?: boolean, children: import("svelte").Snippet }}
	 */
	let {
		state: layoutState,
		params,
		dwell = false,
		ready = true,
		children
	} = $props();

	const steps = getContext("scrolly-steps");
	const index = steps.register(layoutState, params, ready);
	const active = $derived(steps.current === index);
	// "wizard" mode shows one step at a time, headless; "scroll" mode (default)
	// stacks all steps full-height for the IntersectionObserver in Scrolly.
	const wizard = $derived(steps.mode === "wizard");
</script>

{#if wizard}
	{#if active}
		{@render children()}
	{/if}
{:else}
	<div class="step" class:active class:dwell>
		<div class="card">
			{@render children()}
		</div>
	</div>
{/if}

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

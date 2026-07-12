<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * One story step: prose in the slot, visual state declared alongside it.
	 * Registers itself in document order with the "scrolly-steps" context, so
	 * the parent can map the active step index back to a layout state. Only the
	 * active step's prose renders (the Wizard shows one step at a time);
	 * presentation is left to the parent's step container.
	 *
	 * `ready` gates whether this step's *visual* ships in a production build: an
	 * unready step still renders (prose, nav, step count) but ScrollyVisual is
	 * replaced by a "visuals tbd" placeholder (see Index.svelte). `npm run dev`
	 * always shows the real visual so work-in-progress sections stay editable
	 * locally. Flip it to `true` once a step's visual is finished.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, params?: unknown, ready?: boolean, children: import("svelte").Snippet }}
	 */
	let { state: layoutState, params, ready = true, children } = $props();

	const steps = getContext("scrolly-steps");
	const index = steps.register(layoutState, params, ready);
	const active = $derived(steps.current === index);
</script>

{#if active}
	{@render children()}
{/if}

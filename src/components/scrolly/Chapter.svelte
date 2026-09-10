<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * A chapter card: one step whose whole content is a title, over whatever the
	 * canvas state it declares is doing behind it. It carries no prose, so the
	 * step card below is empty and tapping forward stays live like any other
	 * step.
	 *
	 * Registers itself with the "scrolly-steps" context exactly as <Step> does —
	 * a chapter is a step, and taking its own index in document order is what
	 * keeps every later step's index shifting automatically. But unlike <Step> it
	 * renders NOTHING here: the title has to play an out-transition as the reader
	 * moves on, and content rendered from the active step's registration (the way
	 * `panel` is) is destroyed the instant the index changes, with no chance to
	 * transition out. So Index.svelte renders the card itself from
	 * `stepConfigs[value].chapter`, inside a stable {#if} block Svelte can
	 * transition both ways.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, title: string }}
	 */
	let { state: layoutState, title } = $props();

	const steps = getContext("scrolly-steps");
	steps.register({ state: layoutState, chapter: { title } });
</script>

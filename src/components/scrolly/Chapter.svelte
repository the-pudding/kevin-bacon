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
	 * transition out. So Stage.svelte renders the card itself from the
	 * registry's active config, inside a stable {#if} block Svelte can
	 * transition both ways.
	 *
	 * `params` reaches the canvas state exactly as <Step>'s does — the cards share
	 * one state (`chapterCenters`), so it is the only way to tell them apart. The
	 * galaxy highlight beat uses it to give each card a different starting point
	 * in the cast, since the flight's clock restarts at every arrival and all
	 * three would otherwise open on the same actor.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, title: string,
	 *   params?: Object }}
	 */
	let { state: layoutState, title, params } = $props();

	const steps = getContext("scrolly-steps");
	steps.register({ state: layoutState, params, chapter: { title } });
</script>

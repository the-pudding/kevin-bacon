<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * The story's title card: the piece's name over the corpus as a sky, and one
	 * line saying how to move. It is step 0 — a step like any other, so the
	 * reader leaves it with the same press that carries them through the rest of
	 * the story, which is the only thing that line has to teach.
	 *
	 * Registers itself with the "scrolly-steps" context exactly as <Step> and
	 * <Chapter> do, and like <Chapter> renders NOTHING here: the card has to play
	 * an out-transition as the reader moves on, and content rendered from the
	 * active step's registration is destroyed the instant the index changes. So
	 * Index.svelte renders it from `stepConfigs[value].splash`, inside a stable
	 * {#if} block Svelte can transition both ways.
	 *
	 * The copy comes in as snippets rather than strings so it lives in
	 * Index.svelte beside the story's other prose, and so the CTA can carry its
	 * own markup — it says a different thing on a phone than on a desktop.
	 *
	 * `hideBar` is declared here rather than passed: a title card is not a step
	 * the reader has reached, so there is no position for the dot bar to report.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState,
	 *   title: import("svelte").Snippet, cta: import("svelte").Snippet }}
	 */
	let { state: layoutState, title, cta } = $props();

	const steps = getContext("scrolly-steps");
	steps.register({ state: layoutState, hideBar: true, splash: { title, cta } });
</script>

<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * The story's title card: the piece's name over the corpus as a sky. It
	 * comes after the opening — the constellation and the pull-back that ends it
	 * — so it is a step like any other, left with the same press as every step
	 * before it. How to make that press is taught on step 0 (Stage.svelte's cue),
	 * not here.
	 *
	 * Registers itself with the "scrolly-steps" context exactly as <Step> does,
	 * but renders NOTHING here: the card has to play
	 * an out-transition as the reader moves on, and content rendered from the
	 * active step's registration is destroyed the instant the index changes. So
	 * Stage.svelte renders it from the registry's active config, inside a stable
	 * {#if} block Svelte can transition both ways.
	 *
	 * The title and byline come in as snippets rather than strings so the words
	 * live in Index.svelte beside the story's other prose.
	 *
	 * It sits outside every <Chapter>, as the opening does: the progress bar
	 * counts the chapters only, so it stays down here and claims no line.
	 *
	 * `params` reaches the canvas state exactly as <Step>'s does. Nothing on
	 * this card consumes it today — the card's own titleGalaxy state carries the
	 * highlight beat that picks its actors off a per-flight nonce rather than an
	 * authored offset into the cast — but it is the same channel every other
	 * registration uses, so a state that comes to need one already has it.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ state: import("./states.js").VisualState, params?: Object,
	 *   title: import("svelte").Snippet, byline?: import("svelte").Snippet }}
	 */
	let { state: layoutState, params, title, byline } = $props();

	const steps = getContext("scrolly-steps");
	steps.register({
		state: layoutState,
		params,
		splash: { title, byline }
	});
</script>

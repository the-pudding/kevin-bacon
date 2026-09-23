<script>
	// @ts-check
	import { getContext } from "svelte";

	/**
	 * The story's title card: the piece's name over the corpus as a sky. It is
	 * step 0 — a step like any other, so the reader leaves it with the same
	 * press that carries them through the rest of the story. How to make that
	 * press is taught by Stage.svelte's splash cue, not by this card.
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
	 * `hideBar` is declared here rather than passed: a title card is not a step
	 * the reader has reached, so there is no position for the progress bar to
	 * report. It sits outside every <Chapter> for the same reason.
	 *
	 * `params` reaches the canvas state exactly as <Step>'s does.
	 * Nothing on this card consumes it today — the card's own titleGalaxy state
	 * carries the highlight beat that picks its actors off a per-flight nonce
	 * rather than an authored offset into the cast; the outro carries no beat at
	 * all — but it is the same channel every other registration uses,
	 * so a state that comes to need one already has it.
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
		hideBar: true,
		splash: { title, byline }
	});
</script>

<script>
	// @ts-check
	import { setContext } from "svelte";

	/**
	 * A step's card, drawn again where nobody sees it, to be measured: Stage
	 * sizes each chart group's reserve off the tallest card among the group's
	 * steps (plot.js), and has to know it before the reader reaches that card,
	 * or the plot would move under them on the step change (motion.md rule 7).
	 *
	 * Absolutely placed in the prose column at the stacked card's own width and
	 * type (`--card-w`, Stage.svelte), so its height is the card's, while
	 * staying out of the column's measured height. `inert` and `aria-hidden`
	 * keep it out of the tab order and the accessibility tree, and `visibility`
	 * out of sight.
	 *
	 * Sets the `scrolly-measuring` context, which a card-hosted control reads to
	 * render its tallest static form rather than whatever the reader has done
	 * to it so far (GuessRank's verdict line) — a reserve that grew as the
	 * reader played would move the plot just the same.
	 *
	 * @type {{ class?: string, onmeasure: (px: number) => void, children: import("svelte").Snippet }}
	 */
	let { class: className = "", onmeasure, children } = $props();

	setContext("scrolly-measuring", true);

	let height = $state(0);
	$effect(() => {
		if (height) onmeasure(height);
	});
</script>

<div
	class="card-measure {className}"
	inert
	aria-hidden="true"
	bind:clientHeight={height}
>
	{@render children()}
</div>

<style>
	.card-measure {
		position: absolute;
		bottom: 0;
		left: 0;
		width: var(--card-w);
		/* a control wider than the card (the quiz's chips at a large text
		   size) must not widen the page from in here */
		overflow: hidden;
		visibility: hidden;
		pointer-events: none;
	}
</style>

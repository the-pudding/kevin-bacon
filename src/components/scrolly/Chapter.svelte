<script>
	// @ts-check
	import { setContext } from "svelte";

	/**
	 * A chapter: a run of <Step>s under one title. Renders nothing of its own —
	 * each step inside registers with the chapter's title (Step.svelte reads it
	 * from the "scrolly-chapter" context), and the progress bar groups its lines
	 * by it and names the chapter the reader is in (StepProgress.svelte).
	 *
	 * A wrapper rather than a step of its own, so it takes no index: moving
	 * between chapters is an ordinary step change, with nothing between the last
	 * step of one and the first of the next.
	 *
	 * @see notes/scrolly-framework.md
	 * @type {{ title: string, children: import("svelte").Snippet }}
	 */
	let { title, children } = $props();

	setContext("scrolly-chapter", title);
</script>

{@render children()}

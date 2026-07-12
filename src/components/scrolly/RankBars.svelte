<script>
	// @ts-check
	import rawNodes from "$data/scrolly-nodes.json";
	import { story } from "./story.svelte.js";
	import { ANCHOR_ID } from "./nodes.js";
	import {
		BY_RANK,
		HOP_RGB,
		AVG_MIN,
		AVG_MAX,
		lin,
		SLJ
	} from "./layout-shared.js";

	// The rank chapter's "everyone else" list: plain HTML/CSS bars, not canvas —
	// there's no per-actor hop-distribution data to justify canvas's tweened
	// object-constancy machinery here (see rank.js), and a native scrollable
	// list is simpler than reinventing scroll/virtualization on a canvas.
	/** @type {{ reveal?: boolean }} */
	let { reveal = false } = $props();

	const TOP_N = 250;
	const MIN_PX = 12;
	const MAX_PX = 160;

	const rows = BY_RANK.filter(({ id }) => id !== ANCHOR_ID)
		.slice(0, TOP_N)
		.map(({ id, rank }) => {
			const [, name, hop, , avgDistance] = rawNodes.nodes[id];
			return {
				id,
				rank,
				name,
				avgDistance,
				color: HOP_RGB[Math.max(hop, 0)],
				width: lin(avgDistance, AVG_MIN, AVG_MAX, MIN_PX, MAX_PX)
			};
		});

	const focusId = $derived(reveal ? SLJ : story.rankGuess);
</script>

<div class="rank-bars">
	<ul>
		{#each rows as row (row.id)}
			<li class:focus={row.id === focusId}>
				<span class="cap"></span>
				<span
					class="bar"
					style="width: {row.width}px; background: rgb({row.color.join(',')})"
				></span>
				<span class="label">#{row.rank} {row.name}</span>
			</li>
		{/each}
	</ul>
	<p class="footnote">Only the top {TOP_N} actors shown</p>
</div>

<style>
	.rank-bars {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0.5rem 1rem;
		overflow-y: auto;
		flex: 1;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.15rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
	}

	li.focus {
		font-weight: bold;
		color: var(--color-gray-900);
	}

	.cap {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-gray-900);
		flex-shrink: 0;
	}

	.bar {
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.footnote {
		margin: 0;
		padding: 0.4rem 1rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-style: italic;
		color: var(--color-gray-500, #888);
		border-top: 1px solid var(--color-gray-300, #ddd);
	}
</style>

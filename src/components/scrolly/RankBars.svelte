<script>
	// @ts-check
	import rawNodes from "$data/scrolly-nodes.json";
	import storyData from "$data/scrolly-story.json";
	import { story } from "./story.svelte.js";
	import { ANCHOR_ID } from "./nodes.js";
	import { BY_RANK, HOP_RGB, SLJ } from "./layout-shared.js";

	// The rank chapter's "everyone else" list: plain HTML/CSS stacked hop-band
	// bars (per-actor counts from scrolly-story.json's rankHopBands), not
	// canvas — a native scrollable list is simpler than reinventing
	// scroll/virtualization on a canvas (see rank.js for the canvas handoff).
	/** @type {{ reveal?: boolean }} */
	let { reveal = false } = $props();

	const TOP_N = 250;
	const BAR_MAX_PX = 160;

	const top = BY_RANK.slice(0, TOP_N);

	const rows = top.map(({ id, rank }) => {
		const [, name] = rawNodes.nodes[id];
		const avgDistance = Number(rawNodes.nodes[id][4]);
		const counts = storyData.rankHopBands[id];
		const total = counts.reduce((s, v) => s + v, 0);
		const segments = counts.map((count, i) => ({
			color: HOP_RGB[i + 1],
			width: (count / total) * BAR_MAX_PX
		}));
		return { id, rank, name, avgDistance, segments };
	});

	const legend = [
		{ color: HOP_RGB[1], label: "1 hop from Bacon" },
		{ color: HOP_RGB[2], label: "2 hops" },
		{ color: HOP_RGB[3], label: "3 hops" }
	];

	// pre-guess the list centers on Bacon (#175, the step copy's anchor) rather
	// than opening on #1 and spoiling the guess
	const focusId = $derived(reveal ? SLJ : (story.rankGuess ?? ANCHOR_ID));

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	let listHeight = $state(0);
	let hasScrolled = false;

	// keep the focused row centered: instant on first paint (no spoiler pan
	// from the top), smooth when a guess/reveal moves the focus
	$effect(() => {
		const id = focusId;
		if (!list || !listHeight || id == null) return;
		const row = list.querySelector(`[data-id="${id}"]`);
		if (!(row instanceof HTMLElement)) return;
		const behavior =
			hasScrolled &&
			!window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "smooth"
				: "auto";
		hasScrolled = true;
		list.scrollTo({
			top:
				row.offsetTop -
				list.offsetTop -
				(list.clientHeight - row.offsetHeight) / 2,
			behavior
		});
	});
</script>

<div class="rank-bars">
	<ul class="legend">
		{#each legend as item}
			<li>
				<span class="swatch" style="background: rgb({item.color.join(',')})"
				></span>
				{item.label}
			</li>
		{/each}
	</ul>
	<ul class="rows" bind:this={list} bind:clientHeight={listHeight}>
		{#each rows as row (row.id)}
			<li data-id={row.id} class:focus={row.id === focusId}>
				<span class="bar">
					{#each row.segments as segment}
						<span
							class="segment"
							style="width: {segment.width}px; background: rgb({segment.color.join(
								','
							)})"
						></span>
					{/each}
				</span>
				<span class="label">#{row.rank} {row.name}</span>
				{#if row.id === focusId}
					<span class="avg">{row.avgDistance.toFixed(2)}</span>
				{/if}
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
		padding: 0;
	}

	.legend {
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.4rem 1rem;
		white-space: nowrap;
		font-family: var(--font-mono);
		border-bottom: 1px solid var(--color-gray-300, #ddd);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.6rem;
		color: var(--color-gray-700, #444);
	}

	.swatch {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.rows {
		padding: 0.5rem 1rem;
		overflow-y: auto;
		flex: 1;
	}

	.rows li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.15rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
	}

	.rows li.focus {
		font-weight: bold;
		color: var(--color-gray-900);
	}

	.bar {
		display: flex;
		height: 6px;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: 2px;
	}

	.segment {
		height: 100%;
		flex-shrink: 0;
	}

	.label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.avg {
		flex-shrink: 0;
		font-style: italic;
		color: var(--color-gray-500, #888);
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

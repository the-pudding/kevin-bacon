<script>
	// @ts-check
	import { onMount } from "svelte";
	import rawNodes from "$data/scrolly-nodes.json";
	import storyData from "$data/scrolly-story.json";
	import { story } from "./story.svelte.js";
	import { ANCHOR_ID } from "./nodes.js";
	import { BY_RANK, HOP_RGB, SLJ, RANK_TOP_N } from "./layout-shared.js";

	// The rank chapter's "everyone else" list: plain HTML/CSS stacked hop-band
	// bars (per-actor counts from scrolly-story.json's rankHopBands), not
	// canvas — a native scrollable list is simpler than reinventing
	// scroll/virtualization on a canvas (see rank.js for the canvas handoff).
	/** @type {{ reveal?: boolean }} */
	let { reveal = false } = $props();

	const SEGMENT_MIN_PX = 10;

	const top = BY_RANK.slice(0, RANK_TOP_N);

	const rows = top.map(({ id, rank }) => {
		const [, name] = rawNodes.nodes[id];
		const avgDistance = Number(rawNodes.nodes[id][4]);
		const counts = storyData.rankHopBands[id];
		const total = counts.reduce((s, v) => s + v, 0);
		const segments = counts.map((count, i) => ({
			color: HOP_RGB[i + 1],
			fraction: count / total
		}));
		return { id, rank, name, avgDistance, segments };
	});

	const legend = [
		{ color: HOP_RGB[1], label: "1 movie" },
		{ color: HOP_RGB[2], label: "2 movies" },
		{ color: HOP_RGB[3], label: "3 movies" },
		{ color: HOP_RGB[4], label: "4 movies" }
	];

	// pre-guess the list centers on Bacon (#175, the step copy's anchor) rather
	// than opening on #1 and spoiling the guess
	const focusId = $derived(
		reveal || story.rankGaveUp ? SLJ : (story.rankGuess ?? ANCHOR_ID)
	);

	// names stay hidden (bars/rank still shown) until the final reveal step
	// or giving up — a guess only reveals the guessed row (see focusId below),
	// not the whole list
	const namesRevealed = $derived(reveal || story.rankGaveUp);

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	let listHeight = $state(0);
	let scrolledByReader = false;
	// the very first row-position measurement can land a few px off if it
	// runs before the mono webfont has swapped in (font.css: font-display:
	// swap) — re-measuring once fonts settle catches that without treating
	// it as a reader-driven scroll (see the guard below)
	let fontsReady = $state(false);

	onMount(() => {
		if (!document.fonts) {
			fontsReady = true;
			return;
		}
		document.fonts.ready.then(() => {
			fontsReady = true;
		});
	});

	// keep the focused row centered: instant on first paint (no spoiler pan
	// from the top), smooth when a guess/reveal moves the focus
	$effect(() => {
		const id = focusId;
		const ready = fontsReady;
		if (!list || !listHeight || id == null) return;
		// clearing a guess ("guess again") reverts focus to Bacon, but the
		// reader deliberately scrolled to their pick — don't yank them back
		if (
			scrolledByReader &&
			story.rankGuess == null &&
			!reveal &&
			!story.rankGaveUp
		)
			return;
		const row = list.querySelector(`[data-id="${id}"]`);
		if (!(row instanceof HTMLElement)) return;
		const bar = row.querySelector(".bar");
		const behavior =
			scrolledByReader &&
			!window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "smooth"
				: "auto";
		// only count this as reader-driven once fonts have settled — the
		// fonts-ready re-run right after mount is a correction, not a move
		if (ready) scrolledByReader = true;
		const target =
			row.offsetTop -
			list.offsetTop -
			(list.clientHeight - row.offsetHeight) / 2;
		const clampedTop = Math.max(
			0,
			Math.min(target, list.scrollHeight - list.clientHeight)
		);
		list.scrollTo({ top: clampedTop, behavior });

		// canvas handoff: `list`'s offsetParent is the rank-bars-panel div, which
		// sits inside the same absolutely-positioned box as the canvas (see
		// Index.svelte/layouts/rank.js) — so this row's landing position, in that
		// shared coordinate space, is what Bacon's hop bar should tween to meet.
		// Target the `.bar` element itself, not the row's overall center — the
		// row also carries the label text above the bar, so centering on the
		// whole row overshoots upward past the bar's real position.
		const panel = list.offsetParent;
		if (panel instanceof HTMLElement && bar instanceof HTMLElement) {
			story.rankFocusY = Math.round(
				panel.offsetTop + bar.offsetTop - clampedTop + bar.offsetHeight / 2
			);
		}
	});
</script>

<div class="rank-bars">
	<ul class="rows" bind:this={list} bind:clientHeight={listHeight}>
		{#each rows as row (row.id)}
			<li data-id={row.id} class:focus={row.id === focusId}>
				<span class="label-row">
					<span class="label"
						>#{row.rank}
						{namesRevealed || row.id === focusId ? row.name : "???"}</span
					>
					{#if row.id === focusId}
						<span class="avg">{row.avgDistance.toFixed(2)}</span>
					{/if}
				</span>
				<span class="bar">
					{#each row.segments as segment}
						<span
							class="segment"
							style="width: calc({SEGMENT_MIN_PX}px + (100% - {SEGMENT_MIN_PX *
								row.segments
									.length}px) * {segment.fraction}); background: rgb({segment.color.join(
								','
							)})"
						></span>
					{/each}
				</span>
			</li>
		{/each}
		<p class="footnote">Only the top {RANK_TOP_N} actors shown</p>
	</ul>
	<ul class="legend">
		{#each legend as item}
			<li>
				<span class="swatch" style="background: rgb({item.color.join(',')})"
				></span>
				{item.label}
			</li>
		{/each}
	</ul>
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
		mask-image: linear-gradient(
			to bottom,
			transparent,
			black 1.5rem,
			black calc(100% - 1.5rem),
			transparent
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent,
			black 1.5rem,
			black calc(100% - 1.5rem),
			transparent
		);
	}

	.rows li {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.3rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
		opacity: 0.35;
		transition: opacity 0.25s ease;
		/* everyone but Bacon starts invisible and fades in slowly, after the
		   canvas bar has landed and the step text has had its moment (see
		   Index.svelte's rank-focus-text) — Bacon's own row is exempted below
		   so it's there from the start, matching the bar dissolving into it */
		animation: row-in 1.4s ease 1.6s both;
	}

	.rows li.focus {
		font-weight: bold;
		color: var(--color-gray-900);
		opacity: 1;
		animation: none;
	}

	@keyframes row-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rows li {
			animation: none;
		}
	}

	.label-row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.bar {
		display: flex;
		width: 100%;
		height: 6px;
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
		text-align: center;
	}
</style>

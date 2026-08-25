<script>
	// @ts-check
	import rawNodes from "$data/scrolly-nodes.json";
	import story from "$data/scrolly-story.json";
	import { CGM } from "./layout-shared.js";

	// The Future chapter's contender list: every Gen Z candidate the simulation
	// considers, ranked by the average distance they have TODAY. Plain HTML, not
	// canvas — a native scrollable list beats reinventing scroll on a canvas, the
	// same call RankBars.svelte makes for the rank chapter (see layouts/rank.js
	// for the canvas side of that one; this list has no canvas handoff).
	//
	// Where RankBars draws a hop-band waffle per row, each row here carries the
	// three numbers that put the actor in the pool: films, co-star quality, and
	// how long they have been working.

	// Stats come from the candidate records, not the node rows. mad/films/top50
	// are identical in both, but careerAge is not: the node's comes from
	// career-age-scatter.json (anchored to 2025) and disagrees with the
	// simulation's own filmography walk for 54 of the 99. winBars already quotes
	// the candidate value, so quoting it here keeps the chapter consistent.
	const rows = [...story.genz.candidates]
		.sort((a, b) => a.mad - b.mad)
		.map((c, i) => ({
			id: c.id,
			pos: i + 1,
			name: rawNodes.nodes[c.id][1],
			mad: c.mad,
			films: c.films,
			top50: c.top50,
			careerAge: c.careerAge
		}));

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	// no top fade while the list is at the top — nothing is cut off up there,
	// so the fade would just blur the first row for no reason
	let atTop = $state(true);
</script>

<div class="genz-list">
	<ul
		class="rows"
		class:at-top={atTop}
		bind:this={list}
		onscroll={() => (atTop = list.scrollTop <= 1)}
	>
		{#each rows as row (row.id)}
			<li class:focus={row.id === CGM}>
				<span class="label-row">
					<span class="label">#{row.pos} {row.name}</span>
					<span class="avg">{row.mad.toFixed(2)}</span>
				</span>
				<span class="stats">
					{row.films} films · top50 {row.top50.toFixed(2)} · {row.careerAge} yrs
				</span>
			</li>
		{/each}
		<p class="footnote">
			All {rows.length} contenders — born since 1997, 5+ corpus films
		</p>
	</ul>
</div>

<style>
	.genz-list {
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

	.rows {
		padding: 0.5rem 1rem;
		overflow-y: auto;
		flex: 1;
		--fade-top: 1.5rem;
		mask-image: linear-gradient(
			to bottom,
			transparent,
			black var(--fade-top),
			black calc(100% - 1.5rem),
			transparent
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent,
			black var(--fade-top),
			black calc(100% - 1.5rem),
			transparent
		);
	}

	.rows.at-top {
		--fade-top: 0px;
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
		/* the rows fade in after the panel has landed, so the list assembles
		   rather than appearing all at once — CGM's row is exempted below, the
		   same way RankBars exempts its focus row */
		animation: row-in 1.4s ease 0.5s both;
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

	/* the slot RankBars gives its waffle: the three numbers that qualify this
	   actor for the pool */
	.stats {
		font-size: 0.7rem;
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

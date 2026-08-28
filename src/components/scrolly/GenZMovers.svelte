<script>
	// @ts-check
	import rawNodes from "$data/scrolly-nodes.json";
	import story from "$data/scrolly-story.json";

	// The Future chapter's reshuffle: a dumbbell row per contender, showing where
	// the 10,000-sim Monte Carlo moved them. Two dots on one rank axis — where the
	// actor sits TODAY by average distance, and where they sit AFTER the
	// simulation by wins — joined by a bar whose length is the size of the move.
	//
	// Plain HTML over the canvas, not a canvas layout: a native scrollable list
	// beats reinventing scroll on a canvas, the same call RankBars.svelte and the
	// rest of this chapter's panels make. Rows carry no numbers — both ranks are
	// read off the axis, which the sticky header labels once for all 99 rows.
	//
	// Rows run in the simulation's order, so the filled dot marches steadily down
	// the axis while the hollow one scatters: the reshuffle is the shape of the
	// scattered column, not something the reader has to compute row by row.

	/**
	 * Competition ranking (equal value -> equal rank, the next rank skipping the
	 * tie). winPct is rounded to 4dp — one simulation of resolution at 10,000 runs
	 * — so 20 of the 99 values are tied, six of them on a flat zero. Ranking them
	 * by array position instead would invent movement out of tie-break order,
	 * which is the one thing this chart must not do.
	 * @param {"mad" | "winPct"} key
	 * @param {1 | -1} dir 1 = lower is better (avg distance), -1 = higher is better
	 * @returns {Map<number, number>} candidate id -> rank
	 */
	function rankBy(key, dir) {
		const order = [...story.genz.candidates].sort(
			(a, b) => dir * (a[key] - b[key])
		);
		const out = new Map();
		let rank = 1;
		order.forEach((c, i) => {
			if (i > 0 && c[key] !== order[i - 1][key]) rank = i + 1;
			out.set(c.id, rank);
		});
		return out;
	}

	const todayRank = rankBy("mad", 1);
	const simRank = rankBy("winPct", -1);
	const COUNT = story.genz.candidates.length;

	/** rank -> position along the track, rank 1 at the left edge */
	const pct = (rank) => ((rank - 1) / (COUNT - 1)) * 100;

	// sim rank first, today's rank as the tie-break: competition ranking leaves
	// ties on the same rank (six contenders never win a single simulation), and
	// without a second key their row order would be the candidate array's, which
	// is not something the reader can see
	const rows = [...story.genz.candidates]
		.sort(
			(a, b) =>
				simRank.get(a.id) - simRank.get(b.id) ||
				todayRank.get(a.id) - todayRank.get(b.id)
		)
		.map((c) => {
			const today = todayRank.get(c.id);
			const after = simRank.get(c.id);
			return {
				id: c.id,
				name: rawNodes.nodes[c.id][1],
				today,
				after,
				// toward rank 1 is a gain, away from it a loss, and a contender the
				// simulation left exactly where it found them gets neither colour
				dir: after < today ? "up" : after > today ? "down" : "flat",
				barLeft: pct(Math.min(today, after)),
				barWidth: pct(Math.max(today, after)) - pct(Math.min(today, after))
			};
		});

	/** the ticks that make the track readable without numbers on the rows */
	const TICKS = [1, 50, COUNT];

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	// no top fade while the list is at the top — nothing is cut off up there,
	// so the fade would just blur the first row for no reason
	let atTop = $state(true);
</script>

<div class="genz-movers">
	<div class="axis">
		<span class="axis-name"></span>
		<span class="axis-track">
			{#each TICKS as tick}
				<span class="tick" style="left: {pct(tick)}%">{tick}</span>
			{/each}
		</span>
	</div>
	<ul
		class="rows"
		class:at-top={atTop}
		bind:this={list}
		onscroll={() => (atTop = list.scrollTop <= 1)}
	>
		{#each rows as row (row.id)}
			<li class={row.dir}>
				<span class="name">#{row.after} {row.name}</span>
				<span class="track">
					<span class="bar" style="left: {row.barLeft}%; width: {row.barWidth}%"
					></span>
					<span class="dot today" style="left: {pct(row.today)}%"></span>
					<span class="dot after" style="left: {pct(row.after)}%"></span>
				</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.genz-movers {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--font-mono);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* the name column and the track share one grid across the header, the key and
	   every row, so the ticks sit over the dots they label */
	.axis,
	.rows li {
		display: grid;
		grid-template-columns: 45% 1fr;
		align-items: center;
		gap: 0.5rem;
	}

	.axis {
		padding: 2.25rem 1rem 0.75rem;
		font-size: 0.65rem;
		color: var(--color-fg-light);
	}

	.axis-track {
		position: relative;
		height: 1rem;
	}

	.tick {
		position: absolute;
		transform: translateX(-50%);
	}

	.rows {
		padding: 0 1rem 0.5rem;
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
		/* the move's direction drives every mark in the row, so the colour is set
		   once here — the same values layouts use for GREEN/RED on the canvas, so
		   the panel reads as part of the same chart */
		--move: var(--color-gray-400);
		padding: 0.25rem 0;
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
	}

	.rows li.up {
		--move: var(--category-green);
	}

	.rows li.down {
		--move: var(--category-red);
	}

	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.track {
		position: relative;
		height: 0.75rem;
	}

	.bar {
		position: absolute;
		top: 50%;
		height: 2px;
		transform: translateY(-50%);
		background: var(--move);
	}

	.dot {
		position: absolute;
		top: 50%;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		border: 1.5px solid var(--move);
		transform: translate(-50%, -50%);
	}

	/* hollow where the actor stands today, filled where the simulation leaves
	   them — the filled dot is the news, so it reads on top */
	.dot.today {
		background: var(--color-bg);
	}

	.dot.after {
		background: var(--move);
	}
</style>

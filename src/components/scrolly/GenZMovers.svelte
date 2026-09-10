<script>
	// @ts-check
	import { tick } from "svelte";
	import rawNodes from "$data/scrolly-nodes.json";
	import story from "$data/scrolly-story.json";
	import { deLogFilms } from "./layout-shared.js";

	// The Future chapter's reshuffle: a dumbbell row per contender, showing where
	// the 10,000-sim Monte Carlo moved them. Two dots on one rank axis — where the
	// actor sits TODAY by average distance, and where they sit AFTER the
	// simulation by wins — joined by a bar whose length is the size of the move.
	//
	// Plain HTML over the canvas, not a canvas layout: a native scrollable list
	// beats reinventing scroll on a canvas, the same call RankBars.svelte and the
	// rest of this chapter's panels make. Rows carry no numbers — both ranks are
	// read off the axis, which the sticky header labels once for all 99 rows —
	// a row unfolds its own numbers when the reader clicks it.
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
	 * @param {"mad" | "winPct" | "films" | "top50"} key
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
	// the two signals the Present chapter established, ranked across the field so
	// a breakdown can say where its actor stands on each — 36 films means nothing
	// on its own, "92nd percentile of the contenders" is the reading
	const filmsRank = rankBy("films", -1);
	const costarRank = rankBy("top50", -1);
	const COUNT = story.genz.candidates.length;

	/** share of the 99 contenders an actor is at or above on a metric, so the top
	 * of the field reads 100th and the bottom 1st */
	const percentile = (rank) => Math.round(((COUNT - rank + 1) / COUNT) * 100);

	/** @param {number} n */
	const ordinal = (n) => {
		const t = n % 100;
		const suffix =
			t >= 11 && t <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
		return `${n}${suffix}`;
	};

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
				barWidth: pct(Math.max(today, after)) - pct(Math.min(today, after)),
				// the breakdown's numbers, carried on the row so the template needs no
				// second lookup: the two dots and the bar spelled out (win share, where
				// they stand today, where the simulation projects them), then the three
				// levers the Present chapter established as what moves an actor. The
				// two the story calls its signals carry their percentile across the
				// field; career age is context for both, not a signal of its own, so it
				// comes last and carries none. The costar average is de-logged back out
				// of top50's build transform. The win COUNT is derived rather than
				// exported: winPct is rounded to 4dp and there are 10,000 runs, so
				// winPct × nSims recovers every contender's recorded count exactly — the raw log value means nothing here
				wins: Math.round(c.winPct * story.genz.nSims),
				winPct: c.winPct,
				mad: c.mad,
				projMedian: c.projMedian,
				films: c.films,
				filmsPct: percentile(filmsRank.get(c.id)),
				costarFilms: deLogFilms(c.top50),
				costarPct: percentile(costarRank.get(c.id)),
				careerAge: c.careerAge
			};
		});

	/** the ticks that make the track readable without numbers on the rows */
	const TICKS = [1, 50, COUNT];

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	// no top fade while the list is at the top — nothing is cut off up there,
	// so the fade would just blur the first row for no reason
	let atTop = $state(true);

	/** the row whose breakdown is unfolded, or null — one open at a time, so the
	 * list never becomes a wall of numbers */
	let openId = $state(null);

	/**
	 * @param {number} id
	 * @param {MouseEvent & { currentTarget: HTMLButtonElement }} e
	 */
	async function toggle(id, e) {
		const row = e.currentTarget.parentElement;
		openId = openId === id ? null : id;
		if (openId === null) return;
		// the breakdown doesn't exist until the render lands, and a row low in the
		// list unfolds below the fold without this. `nearest` so a row already
		// fully visible doesn't move at all
		await tick();
		row?.scrollIntoView({ block: "nearest" });
	}

	/** avg distances at 3dp, the precision the data itself carries */
	const dist = (v) => v.toFixed(3);
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
				<button
					class="row"
					type="button"
					aria-expanded={openId === row.id}
					onclick={(e) => toggle(row.id, e)}
				>
					<span class="name">#{row.after} {row.name}</span>
					<span class="track">
						<span
							class="bar"
							style="left: {row.barLeft}%; width: {row.barWidth}%"
						></span>
						<span class="dot today" style="left: {pct(row.today)}%"></span>
						<span class="dot after" style="left: {pct(row.after)}%"></span>
					</span>
				</button>
				{#if openId === row.id}
					<dl class="breakdown">
						<dt>Wins</dt>
						<dd>
							{row.wins.toLocaleString()}
							<span class="pct">({(row.winPct * 100).toFixed(1)}%)</span>
						</dd>
						<dt>Today</dt>
						<dd>{dist(row.mad)} · #{row.today} of {COUNT}</dd>
						<dt>Projected</dt>
						<dd>{dist(row.projMedian)}</dd>
						<dt>Films</dt>
						<dd>
							{row.films} <span class="pct">{ordinal(row.filmsPct)} pct</span>
						</dd>
						<dt>Costar film average</dt>
						<dd>
							{row.costarFilms}
							<span class="pct">{ordinal(row.costarPct)} pct</span>
						</dd>
						<dt>Career</dt>
						<dd>{row.careerAge} years</dd>
					</dl>
				{/if}
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

	/* the name column and the track share one grid across the header and every
	   row, so the ticks sit over the dots they label. On a row the grid is the
	   button, not the li — the li also holds the unfolded breakdown, which spans
	   the full width */
	/* The name column keeps a floor as well as a share: the left tap gutter
	   takes a sixth of this panel's width at phone size, and a flat 45% of what
	   is left clipped almost every name to four characters. 9rem is what the
	   longest names were getting before the gutters existed. On a wide viewport
	   45% is the larger value and nothing changes. */
	.axis,
	.rows .row {
		display: grid;
		grid-template-columns: max(45%, 9rem) 1fr;
		align-items: center;
		gap: 0.5rem;
	}

	/* Padding matched to .rows below so the axis ticks stay over the dumbbells.
	   The 2.25rem top already left room the progress bar now sits in. */
	.axis {
		padding: 2.25rem 1rem 0.75rem;
		padding-inline: var(--tap-gutter) 1rem;
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

	/* The one component that has to give the tap gutters real room rather than
	   just out-stacking them. .row is a full-width <button> on a 45% / 1fr
	   grid, so at phone width the left gutter would otherwise cover the entire
	   rank-and-name column of all 99 rows — and this panel is opaque, so there
	   is nothing to lift it above. (The rank ladder is deliberately NOT inset
	   the same way: its rows carry no buttons, and squeezing them would change
	   the four-band dot waffle the story is showing.) */
	/* The one component that has to give the tap gutters real room rather than
	   just out-stacking them: .row is a full-width <button> and this panel is
	   opaque, so there is nothing to lift it above. Asymmetric on purpose —
	   the left gutter would otherwise cover the rank and name, which is the
	   part of a row the reader aims at, while the right gutter only overlaps
	   the tail of the track, which invites no tap. Costs ~40px of track rather
	   than half of every name.

	   (The rank ladder is deliberately NOT inset the same way: its rows carry
	   no buttons, so only drag-scrolling is affected, and squeezing them would
	   change the four-band dot waffle the story is showing.) */
	.rows {
		padding: 0 1rem 0.5rem;
		padding-inline: var(--tap-gutter) 1rem;
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
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
	}

	/* the whole row is the hit target: a button so the pick is keyboard- and
	   screen-reader-reachable for free, the same call the canvas's own hits make */
	.row {
		appearance: none;
		width: 100%;
		padding: 0.25rem 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.row:hover .name {
		text-decoration: underline;
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

	/* the open row's numbers: the two dots and the bar spelled out, then the three
	   levers behind the move. Indented to the name column and hung off a rule in
	   the row's own move colour, so an open block still reads as that row's */
	.breakdown {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.75rem;
		margin: 0 0 0.5rem 0.5rem;
		padding: 0.35rem 0 0.35rem 0.65rem;
		border-left: 2px solid var(--move);
		font-size: 0.7rem;
		color: var(--color-fg-light);
	}

	.breakdown dt {
		white-space: nowrap;
	}

	.breakdown dd {
		margin: 0;
		color: var(--color-gray-700, #444);
	}

	/* where the actor stands on that signal across the 99 contenders — context
	   for the raw number beside it, so it reads a step back from it */
	.pct {
		color: var(--color-fg-light);
	}
</style>

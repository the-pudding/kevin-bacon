<script>
	// @ts-check
	// The chart inside the race chapter's takeover popover: what Freedomland (2006)
	// did to Samuel L. Jackson's network, one bar per hop band. A spark, not a
	// figure: the only furniture is the zero rule the bars hang off and the two
	// axis labels, and the panel's prose is what says whose network this is.
	//
	// Diverging around a shared zero line rather than four bars off a floor: the
	// story here is that a single film pulled 72 actors *in* from hop 3 while
	// adding to hops 1 and 2, and that sign belongs in the geometry where it reads
	// pre-attentively, not in a colour the reader has to decode.
	import { HOP_RGB } from "./layout-shared.js";

	// Hand-entered from the analysis repo's costar export, like the 2.14 average
	// and the film titles in the surrounding copy: scrolly-story.json carries no
	// takeover payload, and one film's before/after isn't worth a data pipeline.
	/** @type {{hop: number, delta: number}[]} */
	const DELTAS = [
		{ hop: 1, delta: 14 },
		{ hop: 2, delta: 63 },
		{ hop: 3, delta: -72 },
		{ hop: 4, delta: 0 }
	];

	// the longest bar, in px. Half-scale: the plot is a thumbnail beside the copy
	// rather than a figure the panel has to make room for.
	const SPAN = 28;

	// One scale across both directions off the largest swing in either — so -72
	// really is the longest bar and the reader can compare a rise to a fall by
	// length. Two independent scales would make +63 and -72 look the same size.
	const maxAbs = Math.max(...DELTAS.map((d) => Math.abs(d.delta)));
	const up = Math.max(0, ...DELTAS.map((d) => d.delta));
	const down = Math.max(0, ...DELTAS.map((d) => -d.delta));
	const upZone = Math.round((up / maxAbs) * SPAN);
	const downZone = Math.round((down / maxAbs) * SPAN);

	const bars = DELTAS.map(({ hop, delta }) => ({
		hop,
		down: delta < 0,
		// A band that didn't move is the one case with nothing to hang a value off:
		// its bar is only the hairline the stylesheet's min-height leaves on the
		// line, so up in the value row the 0 would float a whole zone clear of it
		// and read as belonging to no bar at all. It sits in the up zone instead,
		// right above the hairline (see .zone-flat).
		flat: delta === 0,
		len: Math.round((Math.abs(delta) / maxAbs) * SPAN),
		// a typographic minus, not a hyphen: it sits on the same optical axis as
		// the plus and matches the digits' width
		label: delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "0",
		rgb: HOP_RGB[hop].join(",")
	}));

	const spoken = DELTAS.map(({ hop, delta }) => {
		const band = `${hop} hop${hop === 1 ? "" : "s"} away`;
		if (delta === 0) return `no change ${band}`;
		return `${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} actors ${band}`;
	}).join(", ");
</script>

<div
	class="deltas"
	role="img"
	aria-label="Change in the size of each hop band after Freedomland: {spoken}."
>
	<div
		class="plot"
		style="--cols: {bars.length}; --up: {upZone}px; --down: {downZone}px"
	>
		<!-- out of flow, so the columns auto-place around it (see .zero) -->
		<span class="zero"></span>
		{#each bars as bar (bar.hop)}
			<span class="val val-up">{bar.down || bar.flat ? "" : bar.label}</span>
			<span class="zone zone-up" class:zone-flat={bar.flat}
				>{#if bar.flat}<span class="val val-flat">{bar.label}</span
					>{/if}{#if !bar.down}<span
						class="bar"
						style="height: {bar.len}px; --bar: rgb({bar.rgb})"
					></span>{/if}</span
			>
			<span class="zone zone-down"
				>{#if bar.down}<span
						class="bar"
						style="height: {bar.len}px; --bar: rgb({bar.rgb})"
					></span>{/if}</span
			>
			<span class="val val-down">{bar.down ? bar.label : ""}</span>
			<span class="hop">{bar.hop}</span>
		{/each}
	</div>
	<!-- the axis label, outside the grid rather than a sixth row spanning it: an
	     in-flow spanning item is one more obstacle for column auto-flow to route
	     around, and this needs no alignment to the bands -->
	<span class="axis">hops away</span>
</div>

<style>
	.deltas {
		font-family: var(--font-form);
		font-size: var(--12px, 12px);
		line-height: 1.25;
		/* the panel does not reset the global p margin, so the chart carries the
		   same rhythm as the paragraphs it sits between */
		margin: 16px 0;
	}

	.plot {
		/* one column per hop, five rows: value above, the two bar zones either
		   side of the line, value below, hop label. Column auto-flow lets each
		   band emit its five cells in order, so nothing needs positioning. */
		position: relative;
		display: grid;
		grid-auto-flow: column;
		/* the columns are explicit, not implicit, so the axis below can span them
		   with `1 / -1` — that resolves against the explicit grid only, and would
		   otherwise cover a single band */
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: auto var(--up) var(--down) auto auto;
		column-gap: 0.25rem;
		align-items: stretch;
		/* half the panel's text column, not all of it — at full width the halved
		   bars sit marooned in four wide lanes. Capped rather than fluid so the
		   full-bleed phone sheet gets the same thumbnail as the tethered card. */
		width: min(100%, 10rem);
		margin-inline: auto;
	}

	.axis {
		display: block;
		width: min(100%, 10rem);
		margin-inline: auto;
		color: var(--color-fg-light);
		text-align: center;
	}

	.zero {
		/* the axis, spanning every column. Absolute rather than an in-flow grid
		   item: a child spanning 1 / -1 in row 3 would be a definitely-placed
		   item that column auto-flow has to route the down-zone cells around,
		   which shunts them out of their columns. Out of flow it still takes its
		   containing block from the grid area it names, so it stays glued to the
		   top of the down zone without a computed offset. */
		position: absolute;
		grid-row: 3;
		grid-column: 1 / -1;
		top: 0;
		left: 0;
		right: 0;
		border-top: 1px solid var(--color-border);
	}

	.zone {
		/* bars grow away from the line: up-zone from its floor, down-zone from
		   its ceiling, both meeting at the rule between them */
		display: flex;
		justify-content: center;
		min-width: 0;
	}

	.zone-up {
		align-items: flex-end;
	}

	.zone-down {
		align-items: flex-start;
	}

	.zone-flat {
		/* stacked, so the value sits immediately above the hairline instead of a
		   zone away in the value row. Turning the main axis vertical flips what
		   .zone's justify/align mean, so both are restated. */
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
	}

	.val-flat {
		padding-bottom: 0.125rem;
	}

	.bar {
		/* capped rather than filling the column: at full width four bars butt
		   together into a step chart, and this is meant to read as a spark */
		width: min(100%, 1.125rem);
		/* a zero-change band still shows: a hairline sitting on the line */
		min-height: 1px;
		background: var(--bar);
	}

	.val {
		color: var(--color-fg);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.val-up {
		align-self: end;
		/* at half scale a value set flush against its bar reads as part of it */
		padding-bottom: 0.125rem;
	}

	.val-down {
		align-self: start;
		padding-top: 0.125rem;
	}

	.hop {
		padding-top: 0.125rem;
		color: var(--color-fg-light);
		text-align: center;
	}
</style>

<script>
	// @ts-check
	// Naming an actor, on the charts that can do something with one: the two films
	// scatters and the career chart mark the reader's own dot, and the cycling hop
	// chart takes the name as the actor its rows are drawn for. An EASTER EGG, not
	// an invitation — a magnifying glass at the right of the chart's own title,
	// and nothing else until the reader presses it. There is no sentence offering
	// the search and no call to action anywhere, because nothing later in the
	// story reads the answer out: a reader who never notices this has missed
	// nothing.
	//
	// It owns none of what a pick MEANS. The pool it offers, the id it shows as
	// picked and what a pick or a Clear writes are all the caller's (see the two
	// panel snippets in Index.svelte), because the two readings are genuinely
	// different: the scatters' pick is sticky across four steps and the hop
	// chart's is a cycle standing down. What is shared is the control — the glyph,
	// the box, the chip and its flight — and that is all this file is.
	//
	// It is an over-canvas panel rather than a step-card control, which is the
	// one place notes/design/interactions.md rule 1b now parts company with rule
	// 1. Three things follow from being out of the card, and all three are the
	// reason to be:
	//
	//   - Nothing over the canvas is measured. The card's height is what half the
	//     canvas's bottom clearances come off (`stepsHeight` → `overlayHeight`),
	//     so a card-hosted control that grows on a pick walks the prose and the
	//     x-axis title up the screen. This one cannot: it reserves no box, and
	//     opening the search or landing a pick moves nothing.
	//   - It can be LIFTED over the tap halves, so it needs none of the
	//     `--control-inset` a card control keeps to stay clear of the thumb, and
	//     none of the step card's own lift. A card cannot be lifted at all: the
	//     step wrapper's in:fly forms a stacking context its children cannot
	//     escape at any z-index, which is why the lift lives on .scrolly-steps.
	//   - The flier lives here too, so it is never portalled and never inside the
	//     step wrapper's in:fly transform — the two things flyToDot cannot survive.
	//
	// A pick runs the same three beats as the pair quiz, and off the same
	// functions (fly-to-dot.js): the picked name MARKS as a chip where the search
	// box was, then FLIES onto the plot, morphing into a dot and landing exactly
	// where that actor stands; the canvas's own mark fades in underneath it
	// before the chip goes. What is left on screen is a named dot — the answer is
	// a canvas label, drawn exactly as every other named dot in the story is, and
	// de-collided by the same label stacker.
	//
	// `moves` is for the one caller whose pick does not just mark a dot but MOVES
	// it: the hop chart re-anchors on the name, so whoever was standing at the top
	// of the stack leaves for a band. That pick is committed at the top of the
	// flight instead of at the end of it, and the chip aims at the seat being
	// vacated — which the new anchor holds invisibly until `onland` says the chip
	// has arrived with it. See `fly`.
	import { tick } from "svelte";
	import Search from "@lucide/svelte/icons/search";
	import Combobox from "$components/ui/Combobox.svelte";
	import { SEARCH_RGB, searchActors } from "./search.js";
	import { nodeName } from "./states.js";
	import {
		HOLD_MS,
		MARK_MS,
		flyToDot,
		prefersReducedMotion
	} from "./fly-to-dot.js";
	import { rgb } from "./palette.js";
	import { recordActorSearch } from "$utils/analytics.js";

	/** @type {{ visual: any, chart: string, pool: number[], picked: number | null,
	 *   moves?: boolean, onpick: (id: number) => void, onland?: (id: number) => void,
	 *   onclear: () => void }} */
	let {
		visual,
		chart,
		pool,
		picked,
		moves = false,
		onpick,
		onland,
		onclear
	} = $props();

	let query = $state("");
	/** bits-ui carries a string value; the pool is node ids */
	let value = $state("");
	/** whether the glyph has been pressed — the search box exists only while true */
	let open = $state(false);
	/** the id in flight, while its chip is travelling — null at rest */
	let flying = $state(/** @type {number | null} */ (null));
	/** @type {HTMLElement | undefined} */
	let chipEl = $state();
	/** @type {ReturnType<typeof setTimeout> | null} */
	let markTimer = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	let destroyed = false;

	$effect(() => () => {
		destroyed = true;
		if (markTimer) clearTimeout(markTimer);
		if (holdTimer) clearTimeout(holdTimer);
	});

	const matches = $derived(searchActors(query, { pool }));
	const items = $derived(
		matches.map(({ id, name }) => ({ value: String(id), label: name }))
	);

	function commit(id) {
		// The canvas mark first, the analytics write last: this is background
		// instrumentation reached from a click handler, and touching localStorage
		// throws outright where site data is blocked (see $utils/analytics.js), so
		// the other order would take the reader's pick down with it.
		onpick(id);
		recordActorSearch({ actorId: id, chart });
	}

	function finish() {
		holdTimer = null;
		if (destroyed) return;
		flying = null;
	}

	/**
	 * The dot the chip is aimed at, in viewport coordinates.
	 *
	 * A pick that MOVES its dot aims at where that dot is GOING rather than where
	 * it stands, because the pick has already been made and the dot has already
	 * left: on the hop chart it is holding the header row, invisible, waiting to
	 * be delivered. Its LIVE position is the row in the crowd it used to stand
	 * in, and a chip flown there would land in the middle of the bands.
	 */
	function flightTarget(id) {
		if (moves) return visual?.locateTarget?.(id);
		return visual?.locate?.(id);
	}

	/**
	 * The chip's travel, or nothing: there is no flight under reduced motion, or
	 * before the canvas can place the dot.
	 * @returns {Promise<boolean>} whether it flew
	 */
	async function flight(target) {
		if (prefersReducedMotion() || !target || !chipEl) return false;
		await flyToDot({
			el: chipEl,
			rect: chipEl.getBoundingClientRect(),
			target,
			fill: rgb(SEARCH_RGB)
		});
		return true;
	}

	async function fly(id) {
		if (destroyed) return;
		// A pick that MOVES its dot is committed BEFORE the flight rather than on
		// landing, so the seat is vacated under the chip: the actor at the top of
		// the hop chart leaves for a band, the rows re-proportion around the new
		// anchor, and the anchor itself holds its place up there invisible and
		// unnamed (`story.hops.arriving`) rather than climbing out of the crowd to
		// meet a name that is already on its way down the screen. What arrives at
		// the top is the chip. `onland` is the other half of that bargain — it
		// drops the flag, and the dot fades in underneath.
		//
		// `tick`, because the retarget the pick causes is applied in an effect: the
		// frame the canvas is heading for — which is what the chip aims at — does
		// not name the anchor slot until that has flushed.
		if (moves) {
			commit(id);
			await tick();
			if (destroyed) return;
		}
		const flown = await flight(flightTarget(id));
		if (destroyed) return;
		// Reveal the canvas mark (the param re-run fades it in) and hold the flown
		// chip over that fade, so the dot's own label replaces it rather than the
		// chip popping out over a bare dot. Both callers land a mark here; they
		// differ only in whether the pick itself has already been made.
		if (moves) onland?.(id);
		else commit(id);
		if (flown) holdTimer = setTimeout(finish, HOLD_MS);
		else flying = null;
	}

	async function pick(next) {
		const id = Number(next);
		if (!Number.isInteger(id) || flying != null) return;
		value = "";
		query = "";
		// The box closes on the pick and the chip takes its place: the reader has
		// answered the only question it asks, and what happens next is on the
		// canvas, which the box would otherwise be sitting over.
		open = false;
		// the chip has to exist before it can be measured, and it only renders
		// once `flying` is set
		flying = id;
		await tick();
		if (destroyed) return;
		// the chip is held still for a beat before it leaves, the same beat the
		// quiz holds its ✓/✗ for
		markTimer = setTimeout(() => {
			markTimer = null;
			fly(id);
		}, MARK_MS);
	}

	function clear() {
		onclear();
		open = false;
	}
</script>

<!-- The panel fills the canvas box and catches nothing: the glyph, the box and
     the chip each opt back into pointer events, so the tap halves keep every
     pixel none of them is standing on. Same idiom as .hits and .route. -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape" && open) open = false;
	}}
/>

<!-- Only once the visual is bound: the glyph lines up with the chart's right
     end, which the visual reports (`plotRightInset`), and the chip flies to a
     dot only the visual can locate. On a cold load the panel is created in the
     same flush as the canvas, before `bind:this` has handed it over. -->
{#if visual}
	<div class="search" style="--plot-margin: {visual.plotRightInset()}px">
		<!-- The way in. A bare glyph with an accessible name and nothing beside it —
		     a label, a tooltip that behaves like one or a pulse would each make it
		     the call to action this control is deliberately not. It sits at the right
		     of the title band, which is empty on every chart that offers this (the
		     titles are centred) and is the one strip of the box no layout plots
		     into. -->
		<button
			class="search__glyph"
			class:search__glyph--open={open}
			aria-expanded={open}
			aria-label={open ? "Close actor search" : "Search for an actor"}
			onclick={() => (open = !open)}
		>
			<Search />
		</button>

		{#if open}
			<div class="search__box">
				{#if picked != null}
					<!-- Only offered once there is something to clear. The row names the
					     current pick in its own colour so the reader can tell which dot on
					     the chart is about to go. -->
					<p class="search__current">
						<span class="search__dot" aria-hidden="true"></span>
						{nodeName(picked)}
						<button class="search__clear" onclick={clear}>Clear</button>
					</p>
				{/if}
				<Combobox
					bind:value
					{items}
					autofocus
					placeholder="Search for an actor…"
					emptyText={query.trim().length < 2 ? "Keep typing…" : "No matches"}
					onsearch={(text) => (query = text)}
					onValueChange={pick}
				/>
			</div>
		{/if}

		{#if flying != null}
			<!-- The flier, in the box's place. Thrown away on landing: it leaves as a
			     dot, and what the reader is left looking at is the dot's own label. -->
			<span class="search__chip" bind:this={chipEl}>{nodeName(flying)}</span>
		{/if}
	</div>
{/if}

<style>
	/* Fills the canvas box (the panel layer is statically positioned, so this
	   resolves against .scrolly-visual) and catches nothing itself.

	   The lift is HERE and not inherited from .panel-layer, which carries a
	   z-index of its own: that element is statically positioned, so its z-index
	   is inert and every panel that has to beat the tap halves lifts itself —
	   the same correction RaceScrubber's .control spells out ("needs position
	   for the z-index to apply"). Measured 2026-09-21: without this the half
	   swallows every press on the glyph and the reader steps forward instead.

	   Lifting a pointer-events:none box is free, because only the children that
	   opt back in take anything from the halves — same idiom as .hits and
	   .route. */
	.search {
		/* the top of the glyph's 1.75rem square: 4px above the title's line box,
		   which centres the two on each other. The box and the chip hang 2rem
		   below it. */
		--glyph-top: calc(var(--chart-title-top) - 4px);
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--z-tap-above);
	}

	/* On the chart title's line, at the opposite end of it. The title sits at
	   `--chart-title-top` inside this same box (.chart-title in ScrollyVisual), so the
	   glyph reads as the title's own furniture rather than as page chrome — the
	   26px band ABOVE this box belongs to the progress bar (--title-band offsets
	   .scrolly-visual down past it in Stage.svelte), and a glyph up there sits in
	   the navigation's row instead of the chart's.

	   The right-hand end of that line is the one strip no layout plots into: the
	   titles are centred, and on the two scatters — where the cloud does reach
	   the top-right of the PLOT — it starts well below this.

	   Inset by the PLOT's own right margin, not the canvas box's edge: a column
	   layout runs its marks from MARGIN to w - MARGIN (plot.js), so the box has
	   32px of blank either side that nothing is ever drawn in, and a glyph parked
	   in it sits visibly outboard of the chart. The number is read off the
	   visual (`plotRightInset`) rather than typed, so it cannot drift from the
	   plot it is lining up with — including the hop chart's, which ends at its
	   screen-wide span instead. */
	.search__glyph {
		position: absolute;
		top: calc(var(--glyph-top) + (1.75rem - var(--48px)) / 2);
		right: calc(var(--plot-margin) - (var(--48px) - 1.75rem) / 2);
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--48px);
		height: var(--48px);
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--prose-muted);
		cursor: pointer;
		pointer-events: auto;
	}

	/* reset.css paints every <button> with the filled primary style on hover, at
	   `button:hover` — restate the background or the glyph turns into a black
	   square the moment the pointer touches it. Same restatement ui.infoterm.css
	   makes for the same reason. Hover is a colour shift only: an easter egg that
	   grew, glowed or slid would be announcing itself. */
	.search__glyph:hover,
	.search__glyph:focus-visible,
	.search__glyph--open {
		background: none;
		color: var(--prose-fg);
	}

	.search__glyph :global(svg) {
		width: 1.125rem;
		height: 1.125rem;
	}

	/* Hangs off the glyph, opening leftward so it never leaves the canvas box.
	   Nothing below it is measured, so it is free to be whatever height it needs
	   — the reason this control stopped reserving a box when it left the card. */
	.search__box {
		position: absolute;
		top: calc(var(--glyph-top) + 2rem);
		right: var(--plot-margin);
		width: min(16rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem;
		border: 1px solid var(--surface-border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		box-shadow: 0 6px 24px var(--surface-shadow);
		pointer-events: auto;
		/* the canvas states carry a halo on their prose; a control is a solid
		   object and does not want one */
		text-shadow: none;
	}

	.search__current {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
		font-family: var(--type-chip-family);
		font-size: 0.8rem;
	}

	/* the reader's mark, in the colour the canvas draws their dot in (SEARCH_RGB
	   is palette.js's INK), so the row and the plot agree about which dot is
	   theirs */
	.search__dot {
		flex: none;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--mark-search);
	}

	.search__clear {
		margin-left: auto;
		min-width: var(--48px);
		min-height: var(--48px);
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--surface-border);
		border-radius: 2rem;
		background: none;
		color: var(--prose-muted);
		font-family: var(--type-chip-family);
		font-size: var(--16px);
		cursor: pointer;
	}

	/* Where the box was, so the pick leaves from the place the reader was just
	   looking. Absolute, but NOT fixed: flyToDot animates a transform off this
	   element's own resting box and a fixed element would resolve against a
	   transformed ancestor instead of the viewport (see fly-to-dot.js). */
	.search__chip {
		position: absolute;
		top: calc(var(--glyph-top) + 2rem);
		right: var(--plot-margin);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem 1rem;
		border: 1px solid var(--control-chip-border);
		border-radius: 2rem;
		background: var(--surface-raised);
		color: var(--prose-fg);
		font-family: var(--type-chip-family);
		font-size: 0.8rem;
		/* the WAAPI flight drives transform/colour; keep it compositor-friendly */
		will-change: transform;
	}
</style>

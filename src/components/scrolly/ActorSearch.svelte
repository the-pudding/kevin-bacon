<script>
	// @ts-check
	// The reader's own actor, on four charts and the twelve steps that draw them:
	// the hop bands, the two films scatters and the career chart. An EASTER EGG,
	// not an invitation — a
	// magnifying glass at the right of the chart's own title, and nothing else
	// until the reader presses it. There is no sentence offering the search and
	// no call to action anywhere, because nothing later in the story reads the
	// answer out: a reader who never notices this has missed nothing.
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
	//   - It can be LIFTED over the tap gutters, so it needs none of the
	//     `padding-inline: var(--tap-gutter)` inset a card control needs to stay
	//     tappable. A card cannot be lifted at all: the step wrapper's in:fly
	//     forms a stacking context its children cannot escape at any z-index.
	//   - The flier lives here too, so it is never portalled and never inside the
	//     step wrapper's in:fly transform — the two things flyToDot cannot survive.
	//
	// A pick runs the same three beats as the pair quiz, and off the same
	// functions (fly-to-dot.js): the picked name MARKS as a chip where the search
	// box was, then FLIES onto the plot, morphing into a dot and landing exactly
	// where that actor stands; the canvas's own mark fades in underneath it
	// before the chip goes. What is left on screen is a named purple dot — the
	// answer is a canvas label, drawn by withSearchLabel exactly as every other
	// named dot in the story is, and de-collided by the same label stacker.
	//
	// On the hop chart alone the distance is worth a sentence, so `showPath` adds
	// the caption step 1 uses for the same job: "<name>: two movies away from
	// Kevin Bacon", with the count an InfoTerm opening the films behind it.
	//
	// Unlike the quiz the pick is STICKY: `story.search.actorId` is never reset by
	// an arrival rule, so a reader who names somebody here finds them again on
	// the next three charts. That is the whole reading the control exists for —
	// one person carried through four different questions — which is also why
	// this component holds no picked state of its own and reads the store.
	import { tick } from "svelte";
	import Search from "@lucide/svelte/icons/search";
	import Combobox from "$components/ui/Combobox.svelte";
	import InfoTerm from "$components/ui/InfoTerm.svelte";
	import RouteFilms from "./RouteFilms.svelte";
	import { story } from "./story.svelte.js";
	import {
		SEARCH_POOL,
		SEARCH_RGB,
		pathToBacon,
		routeFilmsToBacon,
		searchActors
	} from "./search.js";
	import { movieCount } from "./intro-routes.js";
	import { MARGIN } from "./plot.js";
	import { nodeName } from "./states.js";
	import {
		HOLD_MS,
		MARK_MS,
		flyToDot,
		prefersReducedMotion,
		rgb
	} from "./fly-to-dot.js";
	import { recordActorSearch } from "$utils/analytics.js";

	/** @type {{ visual: any, chart: string, showPath?: boolean }} */
	let { visual, chart, showPath = false } = $props();

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

	const matches = $derived(searchActors(query, { pool: SEARCH_POOL }));
	const items = $derived(
		matches.map(({ id, name }) => ({ value: String(id), label: name }))
	);

	// The sticky pick. Reading the store rather than a local copy is what makes
	// the caption and the Clear row show the actor a reader named on an EARLIER
	// chart the moment this panel mounts.
	const picked = $derived(story.search.actorId);
	const hops = $derived(
		picked == null ? 0 : (pathToBacon(picked)?.length ?? 0)
	);

	function land(id) {
		// The canvas mark first, the analytics write last: this is background
		// instrumentation reached from a click handler, and touching localStorage
		// throws outright where site data is blocked (see $utils/analytics.js), so
		// the other order would take the reader's pick down with it.
		story.search.actorId = id;
		recordActorSearch({ actorId: id, chart });
	}

	function finish() {
		holdTimer = null;
		if (destroyed) return;
		flying = null;
	}

	async function fly(id) {
		if (destroyed) return;
		const target = visual?.locate?.(id);
		// no flight under reduced motion, or before the canvas can place the dot
		if (prefersReducedMotion() || !target || !chipEl) {
			land(id);
			flying = null;
			return;
		}
		await flyToDot({
			el: chipEl,
			rect: chipEl.getBoundingClientRect(),
			target,
			fill: rgb(SEARCH_RGB)
		});
		if (destroyed) return;
		// Reveal the canvas mark (the param re-run fades it in) and hold the flown
		// chip over that fade, so the dot's own label replaces it rather than the
		// chip popping out over a bare dot.
		land(id);
		holdTimer = setTimeout(finish, HOLD_MS);
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
		story.search.actorId = null;
		open = false;
	}

	/** @type {HTMLElement | undefined} */
	let rootEl = $state();
	/** the caption's own width, so it can be centred on the dot and then clamped */
	let captionWidth = $state(0);
	/** the canvas box, watched because a resize re-lays the crowd out under us */
	let boxWidth = $state(0);
	/** where the reader's dot is, in this panel's coordinates — null until placed */
	let dotAt = $state(/** @type {{ x: number, y: number } | null} */ (null));

	/** how far under the dot's centre the caption sits: past the dot itself and
	 * past the name the canvas already hangs below it (a below-dot label is
	 * placed at y + r + 4 and is one 11px/1.2 line tall — see ScrollyVisual's
	 * .node-label transform), so the two read as one stacked annotation */
	const CAPTION_DY = 26;

	$effect(() => {
		if (!rootEl) return;
		const ro = new ResizeObserver(([entry]) => {
			boxWidth = entry.contentRect.width;
		});
		ro.observe(rootEl);
		return () => ro.disconnect();
	});

	// The caption follows the dot rather than sitting in a fixed strip, so it
	// reads as that dot's own annotation. Re-read on the three things that move
	// it: a new pick, the arrival settling (the crowd is laid out then, and
	// `locate` before it answers for the previous frame's positions) and a
	// resize. Nothing else moves a dot on these charts once the step has landed.
	$effect(() => {
		const id = picked;
		story.settled;
		boxWidth;
		if (!showPath || id == null || !rootEl) {
			dotAt = null;
			return;
		}
		const target = visual?.locate?.(id);
		if (!target) {
			dotAt = null;
			return;
		}
		const box = rootEl.getBoundingClientRect();
		dotAt = { x: target.x - box.left, y: target.y - box.top };
	});

	/** centred on the dot, then held clear of both edges — the same clamp the
	 * canvas's own below-dot names take */
	const captionX = $derived(
		dotAt == null
			? 0
			: Math.min(
					Math.max(4, dotAt.x - captionWidth / 2),
					Math.max(4, boxWidth - captionWidth - 4)
				)
	);
</script>

<!-- The panel fills the canvas box and catches nothing: the glyph, the box, the
     chip and the caption each opt back into pointer events, so the tap gutters
     keep every pixel none of them is standing on. Same idiom as .hits and
     .route. -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape" && open) open = false;
	}}
/>

<div class="search" bind:this={rootEl} style="--plot-margin: {MARGIN}px">
	<!-- The way in. A bare glyph with an accessible name and nothing beside it —
	     a label, a tooltip that behaves like one or a pulse would each make it
	     the call to action this control is deliberately not. It sits at the right
	     of the title band, which is empty on all four charts (the titles are
	     centred) and is the one strip of the box no layout plots into. -->
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

	{#if showPath && picked != null && flying == null && dotAt}
		<!-- The hop chart's caption, off step 1's component: the distance in words,
		     opening onto the films behind it. It carries no name, because it hangs
		     directly under the one the canvas already draws below the dot — step
		     1's caption names its actor because nothing else on screen does, and
		     here the name would land twice in two stacked lines. The other three
		     charts get no caption at all: their axes are remoteness and costar
		     counts, and a distance in movies is not what they ask about. -->
		<p
			class="search__caption"
			bind:clientWidth={captionWidth}
			style="transform: translate({captionX}px, {dotAt.y + CAPTION_DY}px)"
		>
			{#if hops === 0}
				the man himself
			{:else}
				<InfoTerm title="{nodeName(picked)} → Kevin Bacon">
					{movieCount(hops)}
					{#snippet info()}
						<RouteFilms routes={routeFilmsToBacon(picked)} />
					{/snippet}
				</InfoTerm>
				away
			{/if}
		</p>
	{/if}
</div>

<style>
	/* Fills the canvas box (the panel layer is statically positioned, so this
	   resolves against .scrolly-visual) and catches nothing itself.

	   The lift is HERE and not inherited from .panel-layer, which carries a
	   z-index of its own: that element is statically positioned, so its z-index
	   is inert and every panel that has to beat the tap gutters lifts itself —
	   the same correction RaceScrubber's .control spells out ("needs position
	   for the z-index to apply"). Measured 2026-09-21: without this the gutter
	   swallows every press on the glyph and the reader steps forward instead.

	   Lifting a pointer-events:none box is free, because only the children that
	   opt back in take anything from the gutters — same idiom as .hits and
	   .route. */
	.search {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--z-tap-above);
	}

	/* On the chart title's line, at the opposite end of it. The title is centred
	   at `top: 4px` inside this same box (.chart-title in ScrollyVisual), so the
	   glyph reads as the title's own furniture rather than as page chrome — the
	   26px band ABOVE this box belongs to the dot bar (--title-band offsets
	   .scrolly-visual down past it in Stage.svelte), and a glyph up there sits in
	   the navigation's row instead of the chart's.

	   The right-hand end of that line is the one strip no layout plots into: the
	   titles are centred, and on the two scatters — where the cloud does reach
	   the top-right of the PLOT — it starts well below this.

	   Inset by the PLOT's own right margin, not the canvas box's edge: every
	   layout runs its marks from MARGIN to w - MARGIN (plot.js), so the box has
	   32px of blank either side that nothing is ever drawn in, and a glyph parked
	   in it sits visibly outboard of the chart. The number is imported rather
	   than typed so it cannot drift from the plots it is lining up with. */
	.search__glyph {
		position: absolute;
		top: 0;
		right: var(--plot-margin);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-fg-light);
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
		color: var(--color-fg);
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
		top: 2rem;
		right: var(--plot-margin);
		width: min(16rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		box-shadow: 0 6px 24px rgb(0 0 0 / 15%);
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
		font-family: var(--font-mono);
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
		background: var(--color-gray-900, #222);
	}

	.search__clear {
		margin-left: auto;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-gray-300, #ccc);
		border-radius: 2rem;
		background: none;
		color: var(--color-gray-500, #888);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		cursor: pointer;
	}

	/* Where the box was, so the pick leaves from the place the reader was just
	   looking. Absolute, but NOT fixed: flyToDot animates a transform off this
	   element's own resting box and a fixed element would resolve against a
	   transformed ancestor instead of the viewport (see fly-to-dot.js). */
	.search__chip {
		position: absolute;
		top: 2rem;
		right: var(--plot-margin);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem 1rem;
		border: 1px solid var(--color-gray-900, #222);
		border-radius: 2rem;
		background: var(--color-bg);
		color: var(--color-fg, #282828);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		/* the WAAPI flight drives transform/colour; keep it compositor-friendly */
		will-change: transform;
	}

	/* The reader's dot's own annotation, hung under the name the canvas already
	   draws below it, so the two stack as one block: the dot, who it is, and how
	   far away they are. Positioned by transform off the dot's live position
	   (`locate`) rather than parked in a fixed strip — the hop stack is 405px of
	   solid crowd at every width and there is no strip to park in: measured
	   2026-09-21 on step 6, the step card covers the last 34px of the chart at
	   320px and leaves 10.7px at 375px.

	   Typed like the names on the chart because it IS one of them, with the same
	   halo and then some: a caption sitting INSIDE the crowd has dots behind
	   every letter, where a name at the edge of a cloud mostly does not. Only the
	   term inside it is meant to catch a click. */
	.search__caption {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		max-width: 100%;
		margin: 0;
		text-align: center;
		color: var(--color-gray-900, #222);
		font-family: var(--font-mono);
		/* matches .node-label in ScrollyVisual */
		font-size: 11px;
		line-height: 1.2;
		/* heavier than .node-label's five stops: this one lands mid-crowd */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff),
			0 0 10px var(--color-bg, #fff),
			0 0 10px var(--color-bg, #fff),
			0 0 14px var(--color-bg, #fff),
			0 0 18px var(--color-bg, #fff);
	}

	/* The term inherits nothing useful: ui.infoterm.css restates `font` and
	   `color` on the trigger to strip reset.css's filled-button styling, and a
	   <button> does not carry the paragraph's halo through that. So the caption's
	   text-shadow is restated here, or the one part of the sentence sitting on a
	   dotted underline is also the one part with no halo under it — and the
	   underline is what most needs separating from the dots behind it. */
	.search__caption :global(.bits-infoterm) {
		pointer-events: auto;
		text-shadow: inherit;
	}
</style>

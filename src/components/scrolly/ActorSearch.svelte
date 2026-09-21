<script>
	// @ts-check
	// The reader's own actor, on four charts: the hop bands, the two films
	// scatters and the career chart. A step-card control, in the prose flow under
	// the sentence that offers it — not a panel, by the rule in
	// notes/design/interactions.md that a CONTROL is not a panel even when it
	// draws on the canvas.
	//
	// A pick runs the same three beats as the pair quiz, and off the same
	// functions (fly-to-dot.js): the picked name MARKS in the card as a chip,
	// then FLIES onto the plot, morphing into a dot and landing exactly where
	// that actor stands; the canvas's own mark fades in underneath it before the
	// chip goes. What is left behind is the readout — the actor's name, their
	// degree, and on the hop chart the route back to Bacon.
	//
	// Unlike the quiz the pick is STICKY: `story.search.actorId` is never reset by
	// an arrival rule, so a reader who names somebody here finds them again on
	// the next three charts. That is the whole reading the control exists for —
	// one person carried through four different questions — which is also why
	// this component holds no picked state of its own and reads the store.
	import { tick } from "svelte";
	import Combobox from "$components/ui/Combobox.svelte";
	import { story } from "./story.svelte.js";
	import {
		MAX_PATH_STEPS,
		SEARCH_POOL,
		SEARCH_RGB,
		pathToBacon,
		searchActors
	} from "./search.js";
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

	// What the readout is showing: the chip in flight while one is flying, else
	// the store's sticky pick. Reading the store rather than a local copy is what
	// makes the control show the actor a reader named on an EARLIER chart the
	// moment this step's card mounts.
	const shown = $derived(flying ?? story.search.actorId);
	const hops = $derived(shown == null ? 0 : (pathToBacon(shown)?.length ?? 0));

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
		// chip over that fade, so the readout replaces it rather than popping in.
		land(id);
		holdTimer = setTimeout(finish, HOLD_MS);
	}

	async function pick(next) {
		const id = Number(next);
		if (!Number.isInteger(id) || flying != null) return;
		value = "";
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
	}

	// How many lines of CONTENT the readout's box reserves for: the verdict, plus
	// one per step of the deepest route the pool holds. How many rendered lines
	// each of those takes is the CSS's job (--reserve-wrap), because it is the
	// only half of the sum that depends on the viewport.
	const reserveLines = $derived(showPath ? 1 + MAX_PATH_STEPS : 1);
</script>

<div class="actor-search" style="--reserve-lines: {reserveLines}">
	<Combobox
		bind:value
		{items}
		placeholder="Search for an actor…"
		emptyText={query.trim().length < 2 ? "Keep typing…" : "No matches"}
		onsearch={(text) => (query = text)}
		onValueChange={pick}
	/>
	<!-- The readout's box is reserved whether or not it is holding anything, and
	     its height is struck from MAX_PATH_STEPS rather than typed out. This is a
	     card-hosted control and the card's measured height is what half the
	     canvas's bottom clearances come off (`stepsHeight` → `overlayHeight`), so
	     a block that grew on a pick would walk the prose up the screen and take
	     the x-axis title with it — the rule PairQuiz's own chip box follows. -->
	<div class="actor-search__out">
		{#if shown != null}
			{#if flying != null}
				<!-- The flier. A chip rather than the readout itself because it is
				     thrown away on landing: it leaves as a dot, and what the reader
				     is left looking at is the sentence below, in the same box. -->
				<span class="actor-search__chip" bind:this={chipEl}>
					{nodeName(shown)}
				</span>
			{:else}
				<p class="actor-search__found">
					<span class="actor-search__dot" aria-hidden="true"></span>
					{nodeName(shown)} — {hops === 0
						? "the man himself"
						: `${hops} movie${hops > 1 ? "s" : ""} away`}
					<button class="actor-search__clear" onclick={clear}>Clear</button>
				</p>
				{#if showPath}
					<ol class="actor-search__path">
						{#each pathToBacon(shown) ?? [] as [name, film, year] (name + film)}
							<li>
								…was in <em>{film}</em>{year ? ` (${year})` : ""} with {name}
							</li>
						{/each}
					</ol>
				{/if}
			{/if}
		{/if}
	</div>
</div>

<style>
	/* Inset clear of the tap gutters, which run the full height of the layout and
	   would otherwise cover both ends of the input and the Clear button. Padding
	   rather than a z-index lift, for the reason GuessRank's own file gives: the
	   step card sits below the gutters and the step wrapper's fly transition
	   forms a stacking context, so a lift on this element cannot escape it at any
	   value. The popup has no such problem — it is portalled out of the card
	   entirely (see ui/Combobox.svelte). */
	.actor-search {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
		/* the same 16px every prose step leaves under its last line, for the
		   reason PairQuiz's own margin-bottom gives: a card-hosted control has no
		   paragraph margin of its own and would otherwise sit flush on the screen
		   edge, under a phone's home indicator */
		margin-bottom: 1rem;
		padding-inline: var(--tap-gutter);
		/* the prose column carries a halo for the full-bleed states (see
		   .scrolly-steps); a control is a solid object and does not want one */
		text-shadow: none;
	}

	/* The reservation: one line of content (see `reserveLines`) times how many
	   rendered lines one of those takes at this width.
	   
	   Measured 2026-09-21, picking the longest names in the pool on every hosting
	   step: at 375px and up each line of the readout wraps to at most two, and the
	   cards do not move at all. At 320px — the narrowest the checklist tests — a
	   name like "Samuel L. Jackson" takes the verdict to three, and so does a
	   route step, so the reservation is three there. Guessing one number for both
	   is what left the card growing 38px on a pick at 320.
	   
	   In em against the block's own line-height rather than `lh`, which is newer
	   than this piece needs to be. */
	.actor-search__out {
		--reserve-wrap: 2;
		min-height: calc(var(--reserve-lines) * var(--reserve-wrap) * 1.5em);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	@media (max-width: 374px) {
		.actor-search__out {
			--reserve-wrap: 3;
		}
	}

	.actor-search__found {
		margin: 0;
		font-family: var(--font-mono);
	}

	/* the reader's mark, in the colour the canvas draws their dot in, so the
	   sentence and the plot agree about which dot is theirs */
	.actor-search__dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		margin-right: 0.15rem;
		border-radius: 50%;
		background: var(--category-purple);
	}

	.actor-search__path {
		margin: 0;
		padding: 0;
		list-style: none;
		font-style: italic;
		color: var(--color-gray-500, #888);
	}

	.actor-search__chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem 1rem;
		border: 1px solid var(--category-purple);
		border-radius: 2rem;
		background: var(--color-bg);
		color: var(--color-fg, #282828);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		/* the WAAPI flight drives transform/colour; keep it compositor-friendly */
		will-change: transform;
	}

	.actor-search__clear {
		margin-left: 0.5rem;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-gray-300, #ccc);
		border-radius: 2rem;
		background: none;
		color: var(--color-gray-500, #888);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		cursor: pointer;
	}
</style>

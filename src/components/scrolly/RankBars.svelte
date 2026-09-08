<script>
	// @ts-check
	import { onMount } from "svelte";
	import rawNodes from "$data/scrolly-nodes.json";
	import { story } from "./story.svelte.js";
	import { ANCHOR_ID } from "./nodes.js";
	import {
		BY_RANK,
		HOP_RGB,
		SLJ,
		RANK_TOP_N,
		RANK_BAR_H,
		RANK_DOT_D,
		RANK_COLLAPSE_MS,
		hopDotSlots,
		hopFractions
	} from "./layout-shared.js";
	import {
		raceDotSpec,
		RACE_RECENT_VISIBLE,
		RACE_RECENT_LEAD
	} from "./layouts/race.js";

	// The rank chapter's "everyone else" list: plain HTML/SVG hop-band bars
	// (per-actor counts from scrolly-story.json's rankHopBands), not canvas — a
	// native scrollable list is simpler than reinventing scroll/virtualization on
	// a canvas (see rank.js for the canvas handoff). Each bar is a hop-bands
	// chart turned on its side, with the crowd drawn as individual dots rather
	// than a solid block, so the canvas waffle dissolves into like for like.
	//
	// `collapse` is the chapter handoff: every bar folds into a single node that
	// already IS its dot on the race chart (raceDotSpec — same radius, colour and
	// alpha, ink for the #1 the chart leads with), the labels go, and once that
	// has landed this overlay stands down
	// (story.rankCollapsed) and the canvas takes the very same nodes over and
	// flies them onto the chart. See ScrollyVisual's raceEntry branch.
	/** @type {{ reveal?: boolean, collapse?: boolean }} */
	let { reveal = false, collapse = false } = $props();

	// row-in's own timing (delay, then duration), shared with the CSS keyframe
	// via --row-in-delay/--row-in-ms below so the `entered` timer (see there)
	// can't drift out of step with the animation it's timing itself against.
	const ROW_IN_DELAY_MS = 1750;
	const ROW_IN_MS = 1400;

	// the reveal cascade: paced to feel like a fast countdown landing, not a
	// progress bar. Only the top of the list cascades one row at a time — the
	// list runs 250 rows deep and nobody is sitting through all of them
	// revealing individually, so the tail beyond REVEAL_BATCH appears at once
	// right after the cascade finishes.
	const REVEAL_SETTLE_MS = 500; // pause once the scroll-to-#1 has actually landed, before the cascade starts
	const REVEAL_BATCH = 25; // ranks that cascade in one at a time
	const REVEAL_STAGGER_MS = 100; // per-row delay inside the cascade
	// safety net for the scroll-landed wait below: a smooth scroll's own
	// duration isn't authored (the browser picks it, longer for a longer
	// distance), so this caps how long the cascade waits on a `scrollend` that
	// — on a browser without it, or a scroll too short to fire one at all —
	// might never come.
	const SCROLL_SETTLE_TIMEOUT_MS = 1200;

	const top = BY_RANK.slice(0, RANK_TOP_N);

	const rows = top.map(({ id, rank }) => ({
		id,
		rank,
		name: rawNodes.nodes[id][1],
		avgDistance: Number(rawNodes.nodes[id][4]),
		fractions: hopFractions(id),
		// null for a row the race chapter doesn't show — it has no dot to become,
		// so its bar just goes with the rest of the list. (Can't happen at the
		// reveal's own scroll position: every one of the top ~25 rows is a
		// raceRecent contender. Only reachable if the reader scrolled away.)
		dot: RACE_RECENT_VISIBLE.has(id)
			? raceDotSpec(id === RACE_RECENT_LEAD)
			: null
	}));

	// One <path> per hop over the band's shared dot lattice (hopDotSlots), each a
	// run of near-zero-length subpaths that stroke-linecap: round renders as dots
	// — four elements per row instead of one per dot, which is what makes 250
	// dotted rows affordable in the DOM.
	/**
	 * @param {number} id node id, so the jitter is stable per actor
	 * @param {number[]} fractions hop 1–4 shares
	 * @param {number} width px
	 */
	function barPaths(id, fractions, width) {
		return hopDotSlots(fractions, width, id).map((dots, band) => ({
			color: HOP_RGB[band + 1],
			d: dots.map((p) => `M${p.x.toFixed(2)} ${p.y.toFixed(2)}h0.01`).join("")
		}));
	}

	// every row is the same width, so the dot grid is measured once (and
	// recomputed on resize) rather than per row
	let barWidth = $state(0);
	const bars = $derived(
		barWidth > 0
			? rows.map((row) => barPaths(row.id, row.fractions, barWidth))
			: null
	);

	// pre-guess the list centers on Bacon (#175, the step copy's anchor) rather
	// than opening on #1 and spoiling the guess
	const guess = $derived(story.rankGuesses.at(-1) ?? null);
	const focusId = $derived(
		reveal || story.rankGaveUp ? SLJ : (guess ?? ANCHOR_ID)
	);

	// rows the reader already knows the identity of: Bacon (named by the step
	// copy) plus every actor they have guessed, including earlier guesses the
	// focus has since moved off. Those stay named and at full opacity — the fade
	// is there to hide who's who, and there's nothing left to hide on them.
	const known = $derived(new Set([ANCHOR_ID, ...story.rankGuesses]));

	// the rank the cascade below has revealed up to (0 = nothing beyond
	// `known`). `rows` is already in rank order, so "revealed up to rank N" and
	// "the first N rows" are the same thing — no per-id bookkeeping needed.
	// Giving up advances into rankReveal exactly like a correct guess does
	// (see GuessRank's giveUp), so it drives the very same cascade below —
	// there's no separate instant path for it.
	let revealUpTo = $state(0);
	const isKnown = (id, rank) => known.has(id) || rank <= revealUpTo;

	/** @type {HTMLUListElement | undefined} */
	let list = $state();
	let listHeight = $state(0);
	// no top fade while the list is at the top — nothing is cut off up there,
	// so the fade would just blur the first row for no reason
	let atTop = $state(true);
	let scrolledByReader = false;
	// the row the effect below last centered on, so it re-centers only when the
	// focus actually moves. Without it, every reader scroll re-runs the effect
	// (it republishes story.rankListRows, which it also reads) and snaps the
	// list straight back to the focus row — leaving the list unscrollable.
	let centeredId = null;
	// the very first row-position measurement can land a few px off if it
	// runs before the mono webfont has swapped in (font.css: font-display:
	// swap) — re-measuring once fonts settle catches that without treating
	// it as a reader-driven scroll (see the guard below)
	let fontsReady = $state(false);

	// Marks the staged entrance (`row-in`, below) as played out. A row's
	// `animation` property is `none` while `.known` and `row-in …` while not —
	// stepping rankReveal back to rankFocus drops `.known` from every row that
	// isn't Bacon or a guess, which flips that property from `none` back to
	// `row-in` and, per spec, restarts it: the whole list holds at opacity 0 for
	// the animation's 1.75s delay before fading back in, reading as the rank
	// list vanishing and reappearing. Once this is true the `:not(.entered)`
	// selector below no longer matches, so a later `known` change is the plain
	// opacity transition `.rows li` already carries, not a fresh animation.
	let entered = $state(false);

	// The collapse clock. This panel owns it — it is the one that knows when its
	// own transitions have finished — and publishes the single moment the canvas
	// waits for. Index.svelte unmounts the whole overlay off the same flag, so the
	// canvas can never take over while any of this is still on screen.
	//
	// Stepping back out of the collapse (Prev before it lands) clears the flag and
	// the class, so the bars simply expand again: this component outlives the step
	// change, so it has to be able to un-collapse.
	$effect(() => {
		if (!collapse) {
			story.rankCollapsed = false;
			return;
		}
		// don't leave a row mid-cascade once the bars start folding into the
		// race chart's dots — a fast clicker can reach this before the cascade
		// below has finished
		revealUpTo = rows.length;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			story.rankCollapsed = true;
			return;
		}
		const timer = setTimeout(() => {
			story.rankCollapsed = true;
		}, RANK_COLLAPSE_MS);
		return () => clearTimeout(timer);
	});

	onMount(() => {
		if (!document.fonts) {
			fontsReady = true;
			return;
		}
		document.fonts.ready.then(() => {
			fontsReady = true;
		});
	});

	// distinguishes a genuine forward arrival at the reveal from a cold mount
	// already past it (e.g. ?step=7, or a reload on raceRecent) — the cascade
	// effect's first run happens before this flips true, so that case reads as
	// "nothing to animate into" and reveals everything at once instead.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	// Cascades revealUpTo from 0 to rows.length in rank order once the reader
	// actually arrives at the reveal AND the scroll-to-#1 (the $effect.pre
	// below) has actually landed — waiting on a flat timer in parallel with
	// that scroll started the cascade mid-scroll, since a smooth scroll's
	// duration isn't authored (the browser picks it, longer the further #1
	// is from where the reader's guess had the list scrolled to). `scrollend`
	// is the browser's own signal that it's actually stopped moving the list;
	// SCROLL_SETTLE_TIMEOUT_MS is the fallback for a browser without it, or a
	// scroll too short to ever fire one. Stepping back to rankFocus resets
	// this, so stepping forward again replays the cascade.
	//
	// Deliberately NOT $state: this effect both reads it (the re-entry guard
	// below) and writes it, and a $state read+written inside the same effect
	// makes the write retrigger the effect on the next flush — which runs the
	// cleanup below and clears the very timers/listener this run just set up,
	// before they ever fire. Plain, like scrolledByReader/centeredId above,
	// for the same reason.
	let revealStarted = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let scrollFallbackTimer;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let cascadeSettleTimer;
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let cascadeInterval;
	$effect(() => {
		if (!reveal) {
			revealUpTo = 0;
			revealStarted = false;
			return;
		}
		if (revealStarted) return; // already ran (or running) for this arrival
		revealStarted = true;

		if (
			!mounted ||
			!list ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			revealUpTo = rows.length;
			return;
		}

		let landed = false;
		const onLanded = () => {
			if (landed) return;
			landed = true;
			clearTimeout(scrollFallbackTimer);
			list?.removeEventListener("scrollend", onLanded);
			cascadeSettleTimer = setTimeout(() => {
				let rank = 0;
				const target = Math.min(REVEAL_BATCH, rows.length);
				const cascade = setInterval(() => {
					rank += 1;
					revealUpTo = rank;
					if (rank >= target) {
						clearInterval(cascade);
						revealUpTo = rows.length; // the tail below the batch, all at once
					}
				}, REVEAL_STAGGER_MS);
				cascadeInterval = cascade;
			}, REVEAL_SETTLE_MS);
		};

		if ("onscrollend" in window) list.addEventListener("scrollend", onLanded);
		scrollFallbackTimer = setTimeout(onLanded, SCROLL_SETTLE_TIMEOUT_MS);

		return () => {
			list?.removeEventListener("scrollend", onLanded);
			clearTimeout(scrollFallbackTimer);
			clearTimeout(cascadeSettleTimer);
			clearInterval(cascadeInterval);
		};
	});

	onMount(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			entered = true;
			return;
		}
		const timer = setTimeout(
			() => (entered = true),
			ROW_IN_DELAY_MS + ROW_IN_MS
		);
		return () => clearTimeout(timer);
	});

	// keep the focused row centered: instant on first paint (no spoiler pan
	// from the top), smooth when a guess/reveal moves the focus.
	//
	// A pre-effect, so the box below is published before ScrollyVisual's layout
	// effect runs in the same flush: that's what lets the arrival be one authored
	// TWEEN_MS collapse onto this row, instead of a tween aimed at a fallback
	// spot and then retargeted (fast, PARAM_TWEEN_MS) once the measurement lands.
	$effect.pre(() => {
		const id = focusId;
		const ready = fontsReady;
		if (!list || !listHeight || id == null) return;
		// nothing may move once the bars are collapsing: the canvas has already
		// been aimed at these rows, and a re-centre here would scroll the list out
		// from under the nodes the reader is watching fold up
		if (collapse) return;
		// the reader owns the scroll position once they've moved it: only take it
		// back when the focus row itself changes (a new guess, or the reveal)
		if (scrolledByReader && id === centeredId) return;
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
		centeredId = id;

		// canvas handoff: `list`'s offsetParent is the rank-bars-panel div, which
		// sits inside the same absolutely-positioned box as the canvas (see
		// Index.svelte/layouts/rank.js) — so this row's landing position, in that
		// shared coordinate space, is what Bacon's hop bar should tween to meet.
		// Target the `.bar` element itself, not the row's overall center — the
		// row also carries the label text above the bar, so centering on the
		// whole row overshoots upward past the bar's real position.
		publishRows(clampedTop);

		const panel = list.offsetParent;
		if (panel instanceof HTMLElement && bar instanceof HTMLElement) {
			publish({
				x: panel.offsetLeft + bar.offsetLeft,
				w: bar.offsetWidth,
				y: Math.round(
					panel.offsetTop + bar.offsetTop - clampedTop + bar.offsetHeight / 2
				)
			});
		}
	});

	// The race chapter's arrival takes this list's collapsed nodes over on the
	// canvas (ScrollyVisual's raceEntry branch), so it needs the geometry of the
	// rows themselves, not just the focused one: `cx` is where a bar collapses to
	// — its own horizontal centre — and every row is the same height, so one row
	// centre plus the row pitch places any rank, including the ranks scrolled off
	// the bottom, which is where most of the race cast sits. Same coordinate
	// space as the focus box above.
	//
	// `bottom` is the last y this overlay covers — the panel's own opaque box, not
	// the scroller's content, which runs on for another 200-odd rows. The handoff
	// only works where the reader can't see the canvas underneath, so that edge is
	// where it stops: the arrival hides every node below it (see ScrollyVisual).
	//
	// Nothing reads this during the rank chapter (rank.js's params selector takes
	// only rankFocusBar), so unlike the focus box it is safe to republish as the
	// reader scrolls — which is what keeps it true to what they are looking at
	// when they step on.
	/** @param {number} scrollTop */
	function publishRows(scrollTop) {
		if (!list) return;
		const panel = list.offsetParent;
		const rowEls = list.querySelectorAll("li");
		const bar = rowEls[0]?.querySelector(".bar");
		if (
			!(panel instanceof HTMLElement) ||
			!(bar instanceof HTMLElement) ||
			rowEls.length < 2
		)
			return;
		const geom = {
			cx: panel.offsetLeft + bar.offsetLeft + bar.offsetWidth / 2,
			top: Math.round(
				panel.offsetTop + bar.offsetTop - scrollTop + bar.offsetHeight / 2
			),
			pitch: rowEls[1].offsetTop - rowEls[0].offsetTop,
			bottom: panel.offsetTop + panel.offsetHeight
		};
		const prev = story.rankListRows;
		if (
			prev &&
			prev.cx === geom.cx &&
			prev.top === geom.top &&
			prev.pitch === geom.pitch &&
			prev.bottom === geom.bottom
		)
			return;
		story.rankListRows = geom;
	}

	// Re-publishing the same box would re-run ScrollyVisual's layout effect with
	// an unchanged params key, which lands in its catch-all and snaps the arrival
	// tween this measurement exists to aim (see the note above `settle` there).
	// The fonts-ready re-run measures an identical box whenever the mono face was
	// already cached, so this guard is the difference between the crowd
	// collapsing into the bar and the bar simply appearing.
	/** @param {{x: number, y: number, w: number}} box */
	function publish(box) {
		const prev = story.rankFocusBar;
		if (prev && prev.x === box.x && prev.y === box.y && prev.w === box.w)
			return;
		story.rankFocusBar = box;
	}
</script>

<div
	class="rank-bars"
	class:collapsing={collapse}
	style="--collapse-ms: {RANK_COLLAPSE_MS}ms; --row-in-delay: {ROW_IN_DELAY_MS}ms; --row-in-ms: {ROW_IN_MS}ms"
>
	<ul
		class="rows"
		class:at-top={atTop}
		class:entered
		bind:this={list}
		bind:clientHeight={listHeight}
		onscroll={() => {
			atTop = list.scrollTop <= 1;
			publishRows(list.scrollTop);
		}}
	>
		<!-- zero-height gauge: the row width the dot grid is laid out against,
		     measured inside the scroller's padding so it needs no px assumptions -->
		<div class="gauge" bind:clientWidth={barWidth} aria-hidden="true"></div>
		{#each rows as row, i (row.id)}
			<li
				data-id={row.id}
				class:focus={row.id === focusId}
				class:known={isKnown(row.id, row.rank)}
			>
				<span class="label-row">
					<span class="label"
						>#{row.rank}
						{isKnown(row.id, row.rank) ? row.name : "???"}</span
					>
					<span class="avg">{row.avgDistance.toFixed(2)}</span>
				</span>
				<!-- the svg lives inside an HTML span: the focus-row handoff below
				     reads offsetTop/offsetHeight off `.bar`, which SVG elements
				     don't carry -->
				<span class="bar">
					<svg
						class="dots"
						width={barWidth}
						height={RANK_BAR_H}
						viewBox="0 0 {barWidth} {RANK_BAR_H}"
						aria-hidden="true"
					>
						{#each bars?.[i] ?? [] as band}
							<path
								d={band.d}
								stroke="rgb({band.color.join(',')})"
								stroke-width={RANK_DOT_D}
								stroke-linecap="round"
								fill="none"
							/>
						{/each}
					</svg>
					<!-- the actor's race-chart dot, waiting at the bar's centre for the
					     collapse to grow it in. Its radius/colour/alpha come from the
					     canvas's own definition (raceDotSpec), so when this overlay
					     stands down the canvas copy underneath is indistinguishable. -->
					{#if row.dot}
						<span
							class="node"
							style="width: {row.dot.r * 2}px; height: {row.dot.r *
								2}px; background: rgb({row.dot.rgb.join(',')}); opacity: {row
								.dot.alpha}"
							aria-hidden="true"
						></span>
					{/if}
				</span>
			</li>
		{/each}
		<p class="footnote">Only the top {RANK_TOP_N} actors shown</p>
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
	}

	/* everyone but Bacon starts invisible and fades in slowly, after the canvas
	   bar has landed and the step text has had its moment (see Index.svelte's
	   rank-focus-text) — known rows (Bacon's included) are exempted below so his
	   is there from the start, matching the bar dissolving into it.

	   Scoped to `.rows:not(.entered)` — once `entered` (set once, after the
	   animation's own delay + duration have genuinely elapsed; see the script)
	   this no longer matches any row. Without that gate this rule and `.known`
	   below fight over the `animation` property every time a row's `known`
	   class flips: `animation` reverting from `none` to `row-in …` restarts a
	   CSS animation, so stepping rankReveal back to rankFocus (which drops
	   `.known` from every row but Bacon's/a guess's) replayed the whole
	   1.75s-invisible-then-1.4s-fade entrance on rows already on screen — read
	   as the list vanishing and reappearing. */
	.rows:not(.entered) li {
		animation: row-in var(--row-in-ms) ease var(--row-in-delay) both;
	}

	/* the fade exists to hide who's who: once a row's name is out — Bacon, a row
	   the reader has guessed, or every row on the reveal step — there's nothing
	   left to hide, so it reads at full strength */
	.rows li.known {
		opacity: 1;
		animation: none;
	}

	.rows li.focus {
		font-weight: bold;
		color: var(--color-gray-900);
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

	.gauge {
		height: 0;
	}

	.bar {
		display: block;
		line-height: 0;
		position: relative;
	}

	/* sized by its width/height attributes (px, measured), so the dots keep
	   their aspect ratio instead of being scaled by the viewBox */
	.dots {
		display: block;
		transform-origin: 50% 50%;
		transition: transform var(--collapse-ms) ease;
	}

	/* the race-chart dot each bar folds into, pinned to the bar's centre */
	.node {
		position: absolute;
		left: 50%;
		top: 50%;
		border-radius: 50%;
		transform: translate(-50%, -50%) scale(0);
		transition: transform var(--collapse-ms) ease;
	}

	/* The chapter handoff, all in one beat: the crowd of dots in every bar
	   contracts to its centre while the node it becomes grows in there, and the
	   text that named the row goes. The list's edge mask goes at once rather than
	   fading — it would otherwise leave the top and bottom nodes dimmer than the
	   canvas copies waiting underneath them, and the swap would show. */
	.collapsing .dots {
		transform: scale(0);
	}

	.collapsing .node {
		transform: translate(-50%, -50%) scale(1);
	}

	.collapsing .rows {
		mask-image: none;
		-webkit-mask-image: none;
		pointer-events: none;
	}

	.collapsing .rows li {
		opacity: 1;
		animation: none;
	}

	.collapsing .label-row,
	.collapsing .footnote {
		opacity: 0;
	}

	.label-row,
	.footnote {
		transition: opacity 0.2s ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.dots,
		.node,
		.label-row,
		.footnote {
			transition: none;
		}
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

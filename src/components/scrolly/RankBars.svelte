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
		hopDotSlots,
		hopFractions
	} from "./layout-shared.js";

	// The rank chapter's "everyone else" list: plain HTML/SVG hop-band bars
	// (per-actor counts from scrolly-story.json's rankHopBands), not canvas — a
	// native scrollable list is simpler than reinventing scroll/virtualization on
	// a canvas (see rank.js for the canvas handoff). Each bar is a hop-bands
	// chart turned on its side, with the crowd drawn as individual dots rather
	// than a solid block, so the canvas waffle dissolves into like for like.
	/** @type {{ reveal?: boolean }} */
	let { reveal = false } = $props();

	const top = BY_RANK.slice(0, RANK_TOP_N);

	const rows = top.map(({ id, rank }) => ({
		id,
		rank,
		name: rawNodes.nodes[id][1],
		avgDistance: Number(rawNodes.nodes[id][4]),
		fractions: hopFractions(id)
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

	// names stay hidden (bars/rank still shown) until the final reveal step
	// or giving up — a guess only reveals the guessed row, not the whole list
	const namesRevealed = $derived(reveal || story.rankGaveUp);

	// rows the reader already knows the identity of: Bacon (named by the step
	// copy) plus every actor they have guessed, including earlier guesses the
	// focus has since moved off. Those stay named and at full opacity — the fade
	// is there to hide who's who, and there's nothing left to hide on them.
	// On the reveal step every name is out, so every row is known.
	const known = $derived(new Set([ANCHOR_ID, ...story.rankGuesses]));
	const isKnown = (id) => namesRevealed || known.has(id);

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

	// The race chapter's arrival flies its cast out of this list rather than
	// fading them up out of nothing (ScrollyVisual's raceEntry branch), so it
	// needs the geometry of the rows themselves, not just the focused one. Every
	// row is the same height, so one row centre plus the row pitch places any
	// rank — including the ranks scrolled off the bottom, which is where most of
	// the race cast sits. Same coordinate space as the focus box above.
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
			x: panel.offsetLeft + bar.offsetLeft,
			top: Math.round(
				panel.offsetTop + bar.offsetTop - scrollTop + bar.offsetHeight / 2
			),
			pitch: rowEls[1].offsetTop - rowEls[0].offsetTop
		};
		const prev = story.rankListRows;
		if (
			prev &&
			prev.x === geom.x &&
			prev.top === geom.top &&
			prev.pitch === geom.pitch
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

<div class="rank-bars">
	<ul
		class="rows"
		class:at-top={atTop}
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
				class:known={isKnown(row.id)}
			>
				<span class="label-row">
					<span class="label"
						>#{row.rank}
						{isKnown(row.id) ? row.name : "???"}</span
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
	   is there from the start, matching the bar dissolving into it */
	.rows li {
		animation: row-in 1.4s ease 1.75s both;
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
	}

	/* sized by its width/height attributes (px, measured), so the dots keep
	   their aspect ratio instead of being scaled by the viewBox */
	.dots {
		display: block;
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

<script>
	// @ts-check
	/**
	 * The story's stage: the canvas, everything laid over it (the rank ladder,
	 * the active step's panel, a chapter or title card, the dev tuners) and the
	 * prose column with its navigation. Index.svelte writes the story — the
	 * <Step>s and their prose — into `children`, which renders in the prose
	 * column with the stage's measurements (`layout`) for the pieces the prose
	 * hangs over the canvas. Architecture in notes/scrolly-framework.md.
	 */

	/**
	 * What the prose is handed: how much of the canvas's bottom edge the step
	 * card covers, the canvas box, and the visual itself (for the pair quiz's
	 * flights).
	 * @typedef {{ overlayHeight: number, width: number, height: number, visual: ScrollyVisual | undefined }} StageLayout
	 */

	/** @type {{ steps: ReturnType<typeof import("./step-registry.svelte.js").createStepRegistry>, dimensions: { width: number, height: number }, children: import("svelte").Snippet<[StageLayout]> }} */
	let { steps, dimensions, children } = $props();

	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { fade } from "svelte/transition";
	import { cubicInOut } from "svelte/easing";
	import ScrollyVisual from "./ScrollyVisual.svelte";
	import RankBars from "./RankBars.svelte";
	import StepProgress from "./StepProgress.svelte";
	import TapNav from "./TapNav.svelte";
	import { story } from "./story.svelte.js";
	import { isRankState } from "./states.js";
	import { TITLE_BAND } from "./plot.js";
	import {
		CHAPTER_IN_MS,
		CHAPTER_IN_DELAY_MS,
		CHAPTER_OUT_MS,
		PANEL_OUT_MS
	} from "./chapterFade.js";

	// Beside, rather than over. Below this width the prose is a card lying across
	// the bottom of the canvas; past it the two sit side by side and the charts
	// take back the 40% of the box they were keeping clear for it.
	//
	// Kept in step with the `@media` rule at the bottom of this file BY HAND: a
	// breakpoint cannot be read back out of CSS, and the render path needs the
	// boolean rather than the layout (see ScrollyVisual's `beside` prop, which is
	// what sets the plot's share of the column).
	const BESIDE_MIN_W = 1200;
	const beside = $derived(dimensions.width >= BESIDE_MIN_W);

	// ScrollyVisual instance, for the pair-quiz panel's locate() flight targets
	/** @type {ScrollyVisual | undefined} */
	let visual = $state();
	// measured height of the step card + nav overlaying the canvas bottom, so
	// panels sized against it (rank-bars) neither overlap it nor leave a gap
	let stepsHeight = $state(0);
	// the canvas box, measured here as well as inside ScrollyVisual, so step 1's
	// caption can be placed off the constellation's own geometry (see introBottom)
	let visualWidth = $state(0);
	let visualHeight = $state(0);

	// Which side the prose sits on: it swaps every chapter, so the reader crosses
	// the screen as the argument turns over. The ordinal is how many chapter cards
	// the reader has reached — a card announces the chapter it OPENS, so it counts
	// as part of the new one, which is what puts the swap ON the card.
	//
	// That placement is the whole trick and it is not a nicety. A card is
	// full-bleed and carries no prose, so at the instant the column changes sides
	// there is no chart boxed in it and no words in it to move: the sky is
	// authored about the middle of the SCREEN, which the swap does not move, and
	// the canvas compensates for the rest (see ScrollyVisual's bleed-only branch).
	// Swapping anywhere else would slide a chart across the viewport.
	const chapterOrdinal = $derived(
		steps.chapterStarts.filter((i) => i <= (steps.current ?? 0)).length
	);
	const flipped = $derived(beside && chapterOrdinal % 2 === 1);

	// How much of the canvas's bottom edge the step card actually covers. Stacked,
	// that is the card's own height and half a dozen things are measured off it —
	// the over-canvas panels, the tour caption's floor, the x-axis title. Beside
	// the prose it covers NONE of it: the card is in a column of its own, so every
	// one of those clearances gets the whole box back, and a chart that goes on
	// dodging a card that is not there leaves a band of empty canvas under it.
	const overlayHeight = $derived(beside ? 0 : stepsHeight);

	const currentState = $derived(steps.state);

	// The rank panel outlives the rank chapter by one step: raceRecent keeps it
	// mounted so its bars can collapse into the race chart's own dots (see
	// RankBars' `collapse`). Its box has to stop moving for that — the panel is
	// sized off `stepsHeight`, and raceRecent's prose is shorter than
	// rankReveal's, so without this every row would shift a few px away from what
	// the reader was looking at (and away from where the canvas has been aimed) at
	// the very moment it collapses. Hold the last height a rank step measured.
	//
	// It also has to stop moving DURING a prose swap. `.scrolly-steps` is one
	// grid cell holding both copies, so while they cross over it measures the
	// taller of the two and `overlayHeight` changes twice — once when the old
	// copy unmounts and once when the new one mounts. The panel is `overflow:
	// hidden`, so each change clipped whatever no longer fit, which is how rows
	// went missing mid-transition. So the height is only taken once the arriving
	// step has landed, and held until then; the first rank arrival seeds it
	// immediately, since there is nothing yet to hold.
	let rankStepsHeight = $state(0);
	$effect(() => {
		if (!isRankState(currentState) || !overlayHeight) return;
		if (!rankStepsHeight || story.settled === currentState)
			rankStepsHeight = overlayHeight;
	});
	const rankPanelBottom = $derived(rankStepsHeight + 12);
	// The panel's own fade-in used to run on a fixed delay timed to land after
	// the hopBands→rankFocus bar retarget; now it waits for that retarget to
	// actually settle instead. Once true it stays true: the panel outlives
	// rankFocus (see story.rank.handoff), and re-checking story.settled live
	// would hide it again the moment the reader reaches rankReveal, where settled
	// no longer reads "rankFocus".
	//
	// That wait is owed to one arrival only, though: the collapse the panel would
	// otherwise cover before the reader has seen it land. A panel that comes up on
	// rankReveal instead has no collapse underneath to wait for — it is either a
	// reload already past the guess (?step=7) or the reader stepping back into the
	// chapter out of the race, which takes the overlay down on arrival
	// (story.rank.collapsed) and so has to rebuild it. Neither will ever see
	// `story.settled` read "rankFocus" again, so the hold was permanent: the
	// ladder sat at opacity 0 for good, over a canvas carrying nothing but Bacon's
	// bar — which this panel is placed to cover (see layouts/rank.js).
	//
	// Both clauses ask `story.settled`, not the live step. Asking the live step
	// raised the ladder in the frame of the press, so stepping back out of the
	// race it faded up at full ink over a chart that had not begun to leave —
	// furniture arriving before the canvas it belongs to, which is the beat this
	// whole pass is about (motion.md rule 6). `settled` names the state whose
	// arrival has landed, so rankReveal still satisfies it on the reload and the
	// step-back this clause exists for; it just waits for the dots first.
	$effect(() => {
		if (story.settled === "rankFocus" || story.settled === "rankReveal")
			story.rank.revealed = true;
	});
	// the overlay is up through the rank chapter, and for the collapse that opens
	// raceRecent — until the nodes are the canvas's (see RankBars' `collapse`)
	const showRankPanel = $derived(
		isRankState(currentState) ||
			(currentState === "raceRecent" &&
				story.rank.handoff &&
				!story.rank.collapsed)
	);

	// The race chart's dev tuners (scrolly/dev). Pulled in dynamically rather
	// than imported at the top so a production build drops them entirely:
	// `import.meta.env.DEV` is substituted with `false`, the branch goes dead,
	// and nothing references the chunk. A static import survives tree-shaking
	// (the compiled block and its CSS still land in the bundle), which is why
	// this isn't just an {#if} in the markup.
	let devTuners = $state(null);
	onMount(async () => {
		if (!import.meta.env.DEV) return;
		devTuners = await import("./dev/Tuners.svelte");
	});

	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);

	// A chapter card's title, rendered from the registry rather than by <Chapter>
	// so it sits in a stable {#if} and can transition OUT as the reader moves on
	// (see Chapter.svelte). It fades in behind a beat, so the constellation
	// dissolving into the crowd underneath reads first, and leaves briskly — it
	// must be gone before the next step starts sorting the field into bands.
	const activeChapter = $derived(steps.config?.chapter);
	// the title card, rendered from the registry for exactly the reasons a
	// chapter's title is (see Splash.svelte) — and on the same fade, so opening
	// the story and opening a chapter are visibly the same move
	const activeSplash = $derived(steps.config?.splash);
	// cubicInOut is the same curve the dot tweener eases on (tween.js's
	// easeCubicInOut), so the title arrives on the motion the canvas is already
	// moving to
	const chapterIn = $derived(
		reducedMotion.current
			? { duration: 0 }
			: {
					duration: CHAPTER_IN_MS,
					delay: CHAPTER_IN_DELAY_MS,
					easing: cubicInOut
				}
	);
	const chapterOut = $derived(
		reducedMotion.current
			? { duration: 0 }
			: { duration: CHAPTER_OUT_MS, easing: cubicInOut }
	);
	// The step's own panel. `{#key}`ed on the snippet so two steps declaring
	// different panels back to back would swap rather than mutate; today the two
	// panel steps are never adjacent, so this only ever mounts and unmounts.
	const activePanel = $derived(steps.config?.panel);
	const panelOut = $derived(
		reducedMotion.current ? { duration: 0 } : { duration: PANEL_OUT_MS }
	);
	// centred on the whole visual box, because that is now the field's box too: a
	// chapter card drops the plot area and spreads its crowd over the entire
	// canvas (galaxyBox), so there is no empty ground below the universe for a
	// centred title to sit over. A chapter carries no prose, so nothing competes
	// for the lower half. Any state that still keeps to plotBottom is a chart, and
	// charts have no title card.
	const chapterHeight = $derived(visualHeight);

	/** what the prose is handed (StageLayout): getters, so a read tracks the measurement */
	const layout = {
		get overlayHeight() {
			return overlayHeight;
		},
		get width() {
			return visualWidth;
		},
		get height() {
			return visualHeight;
		},
		get visual() {
			return visual;
		}
	};
</script>

<section id="scrolly">
	<div
		class="scrolly-layout"
		class:exited={steps.exited}
		class:flipped
		style="--viewport-height: {dimensions.height
			? `${dimensions.height}px`
			: '100svh'}; --title-band: {TITLE_BAND}px"
	>
		<div
			class="scrolly-visual"
			class:exited={steps.exited}
			bind:clientWidth={visualWidth}
			bind:clientHeight={visualHeight}
		>
			<!-- Exiting to the credits changes nothing the canvas is showing:
			     the last step (outro) already rests on a full-bleed sky with a
			     flight of its own, and that flight simply carries on behind the
			     credits — see the .scrolly-visual.exited rule below, which is
			     the whole of what "exited" does to the visual.

			     It used to be handed `chapterCenters` here instead, from back
			     when the outro was a still frame and the card's field was the
			     only drifting one to borrow. Now it restarts the sky: a state
			     change abandons the running flight and tweens to the new
			     state's STATIC layout, and every galaxy layout is authored at
			     the flow's t = 0 (sky.js), so the crowd flew back to the start
			     of its trip and set off again the moment the reader stepped
			     off the story. -->
			<ScrollyVisual
				bind:this={visual}
				state={steps.state}
				step={steps.current ?? -1}
				params={steps.config?.params}
				coldStart={steps.coldStart}
				stepsHeight={overlayHeight}
				{beside}
			/>
			{#if !steps.exited}
				<!-- The rank ladder, mounted here rather than as a step's panel (the
			     way the dev tuners below are) because it has to OUTLIVE the step
			     change into raceRecent: that arrival is the handoff, where its bars
			     collapse into the race chart's own dots while the canvas underneath
			     is parked on a copy of them. A per-step panel is torn down and
			     rebuilt whenever the snippet changes, which remounted this whole
			     box on that very step — restarting its fade-in (700ms at opacity 0,
			     leaving the parked canvas bare) and mounting the bars already
			     collapsed, so the fold never played. `showRankPanel` is what stands
			     it down, once the canvas holds the nodes (story.rank.collapsed).

			     `reveal` stays on through the handoff step: it is what puts SLJ in
			     focus, so dropping it on raceRecent would send the focus row back to
			     the reader's guess and re-hide every other name at the exact moment
			     the bars collapse. -->
				{#if showRankPanel}
					<div
						class="rank-bars-panel"
						class:revealed={story.rank.revealed}
						style="bottom: {rankPanelBottom}px"
					>
						<RankBars
							reveal={currentState === "rankReveal" ||
								currentState === "raceRecent"}
							collapse={currentState === "raceRecent"}
						/>
					</div>
				{/if}
				<!-- The active step's over-canvas panel, if it declared one — the
			     markup lives next to the <Step> that owns it. After the ladder
			     above, so a step's own controls (raceRecent's Start button) sit
			     over it rather than under it.

			     Wrapped in a stable {#if} for the same reason the chapter card
			     below is, and the file already said why: a bare snippet render
			     cannot carry a transition, so the panel was cut in and out in the
			     frame of the press. The quiz painted its blurred question over a
			     scatter that had not begun to re-plot, and the race scrubber
			     mounted reading a year the chart would not reach for another nine
			     seconds. Gating on `steps.held` fixes both by asking the same
			     question everything else that arrives with a step now asks. -->
				{#key activePanel}
					{#if activePanel && !steps.held}
						<div class="panel-layer" out:fade={panelOut}>
							{@render activePanel()}
						</div>
					{/if}
				{/key}
				<!-- a chapter card's title. Rendered from the registry rather than by
			     <Chapter> itself so this {#if} is stable and Svelte can play the
			     out-transition; the panel render above cannot, which is the whole
			     reason chapters aren't just a panel. -->
				{#if activeChapter}
					<div
						class="chapter-card"
						style="height: {chapterHeight}px"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						<h2>{activeChapter.title}</h2>
					</div>
				{/if}
				<!-- the title card. Same stable-{#if} arrangement as the chapter
			     card above and for the same reason (see Splash.svelte); the
			     arrow cue is a sibling rather than part of the card because it
			     belongs to the right-hand tap gutter, not to the centred column
			     the title and its line sit in. -->
				{#if activeSplash}
					<div
						class="splash-card"
						style="height: {chapterHeight}px"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						<h1>{@render activeSplash.title()}</h1>
						<p class="splash-cta">{@render activeSplash.cta()}</p>
					</div>
					<div
						class="splash-cue"
						aria-hidden="true"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						→
					</div>
				{/if}
				<!-- dev-only race tuners. Mounted outside the step registry so they span
			     the whole race chapter and keep their values installed across step
			     changes; they render nothing until story.race.cam exists, i.e. off
			     the race chapter. -->
				{#if devTuners}
					<devTuners.default />
				{/if}
			{/if}
		</div>
		{#if !steps.exited}
			<div
				class="scrolly-steps"
				bind:clientHeight={stepsHeight}
				aria-live="polite"
			>
				{@render children(layout)}
			</div>
			<StepProgress />
			<TapNav />
		{/if}
	</div>
</section>

<style>
	/* The story is a wizard: one viewport, no scrolling, right up until the
	   credits — so the credits are what make the page scrollable, and on a
	   platform with classic (space-taking) scrollbars that is a bar appearing
	   mid-flight. It narrows the body, which moves the centred column, and a
	   column that moves under a running sky is a resize as far as
	   ScrollyVisual is concerned (fitBox's `dx !== 0 && choreo.active`): it
	   snaps the crowd instead of letting it drift on. Reserving the gutter for
	   the whole read means the column never moves. A no-op where scrollbars
	   are overlays, which is every phone and macOS by default. */
	:global(html) {
		scrollbar-gutter: stable;
	}

	/* --column / --column-gutter: the reading column's own geometry. Named
	   because the exited canvas has to reproduce it exactly (see
	   .scrolly-visual.exited) — two literals in two rules would drift apart. */
	#scrolly {
		--column: 700px;
		--column-gutter: 1rem;
		max-width: var(--column);
		margin: 0 auto;
		padding: 0 var(--column-gutter);
	}

	/* --tap-gutter: how wide the two tap regions at the far edges are. A
	   percentage, not vw: #scrolly is max-width 700px, so above that the layout
	   stops growing while vw does not. Every consumer's containing block is
	   this same box (.scrolly-visual and the panels are all inset:0
	   descendants), so the percentage resolves identically wherever it is used
	   — that is the fragile part worth knowing. Resolves to 56px below a 467px
	   viewport and 80px at 700px+.

	   --progress-band: the strip the dot bar occupies. The bar takes no pointer
	   events and the gutters run the full height beneath it, so a tap over a
	   dot steps the story like any other — the dots report position, they are
	   never a jump target.

	   The z ladder over this box, lowest first:
	     auto  canvas, rank/scrubber panels, chapter card, step card
	     5     the dev-only race tuners
	     20    --z-tap: the two tap gutters
	     21    --z-tap-above: what must stay reachable through them — .hits,
	           .quiz, .route, the scrubber's .control, .tick-1980, the dot bar
	     100+  InfoTerm's scrim and panel, untouched */
	.scrolly-layout {
		position: relative;
		height: var(--viewport-height);
		--tap-gutter: clamp(56px, 12%, 88px);
		--progress-band: 30px;
		/* --visual-l / --visual-r: how far the canvas box is inset from the
		   column's two edges. Zero here — the canvas has the whole column and
		   the prose lies over it — and one of them becomes the prose measure
		   once the two sit abreast (below), which side depending on the flip.
		   They are properties rather than three copies of `left`/`right`
		   because the credits backdrop has to reproduce this box against the
		   VIEWPORT (see .scrolly-visual.exited), and it can only do that from
		   numbers it can read. */
		--visual-l: 0px;
		--visual-r: 0px;
		/* --title-band — space for each chart's title, between the dot bar and the
		   canvas's own MARGIN-based top clearance — is set inline above, from
		   TITLE_BAND in plot.js: the render path needs the same number,
		   and canvas can't read CSS custom properties. */
	}

	/* Full-height, stable canvas: its size must NOT track the step text height,
	   or a step change resizes the canvas and ScrollyVisual jumps (instant, no
	   reveal) instead of tweening. Step text + nav overlay the bottom, where the
	   layouts already keep clear.

	   Top is offset by --title-band (rather than inset: 0) so each chart's
	   title has room to sit below the dot bar (StepProgress, absolute over the
	   same top edge) without overlapping either it or the chart's own content,
	   which starts MARGIN px below this box's top edge. */
	.scrolly-visual {
		position: absolute;
		top: var(--title-band);
		right: var(--visual-r);
		bottom: 0;
		left: var(--visual-l);
	}

	/* once the reader has left the wizard for the credits, the canvas is no
	   longer a step's chart confined to this one-viewport box — it becomes a
	   fixed backdrop behind the credits, drifting on regardless of where the
	   page is scrolled. .scrolly-layout collapses to no height alongside this
	   (below) so the credits section sits directly under #scrolly in flow.

	   The box keeps the same --title-band offset, the same height and the same
	   WIDTH it had docked — only its containing block changes. Anything else
	   moves the drawing origin: inset: 0 here would lift it by the band,
	   carrying every dot up with it on the step into the credits, and the 26px
	   of extra height would resize the canvas and snap the crowd there rather
	   than tween it. The band is still covered — the canvas element bleeds up
	   through it (see ScrollyVisual's canvas rule), which is the whole point of
	   the bleed.

	   The width is why the column's geometry is restated here. Fixed resolves
	   left/right against the viewport, not against #scrolly, so `left: 0;
	   right: 0` alone widened the box from the reading column to the whole
	   screen on the step into the credits — a resize, which ScrollyVisual
	   answers by snapping (see arrivalKind), and the sky is authored from that
	   width (galaxyBox), so every dot jumped to a new place instantly instead
	   of drifting on. Nothing about that snap is worth having: the canvas
	   ELEMENT is 100vw either way and the sky already reaches well past the
	   screen, so the backdrop is full-bleed at any box — the box is only the
	   coordinate frame the crowd was placed in, and changing it moves every
	   dot for no gain.

	   So the box is rebuilt here from the column's own numbers. `left` and
	   `right` carry the gutter and the prose inset — which is the whole of it
	   on a screen narrower than #scrolly's max-width, where the column is just
	   the body less its gutters. Past that the column stops growing and starts
	   centring instead, which is what `max-width` and the auto margins are for:
	   the box is over-constrained, so the margins split what is left equally
	   and land it on #scrolly's own edges.

	   Insets and a max-width rather than padding, deliberately: padding puts
	   the answer on the wrong side of `box-sizing`, and getting that backwards
	   is what left this box 114px in from the left at 1000px wide when the
	   docked one was 16px in at 796px. With no padding and no border on the
	   element there is no box model to get wrong — every number here is a
	   distance from a viewport edge. */
	.scrolly-visual.exited {
		position: fixed;
		top: var(--title-band);
		bottom: 0;
		left: calc(var(--column-gutter) + var(--visual-l));
		right: calc(var(--column-gutter) + var(--visual-r));
		max-width: calc(var(--column) - var(--visual-l) - var(--visual-r));
		margin: 0 auto;
		z-index: -1;
	}

	.scrolly-layout.exited {
		height: 0;
	}

	/* The step's panel, in a box of its own so it can carry an out-transition.
	   Static positioning, so it forms no containing block and the panels inside
	   still resolve against .scrolly-visual exactly as they did.

	   The z-lift is HERE rather than on the panels' own roots: an opacity
	   out-transition forms a stacking context that a child's lift cannot escape
	   at any value, and the quiz's cards and the year slider have to beat the tap
	   gutters for the whole of the fade. Same idiom as .quiz and .route. */
	.panel-layer {
		pointer-events: none;
		z-index: var(--z-tap-above);
	}

	/* the rank chapter's "everyone else" list: sits below the space where
	   Bacon's hop bar dissolves (see layouts/rank.js) and above the measured
	   step card (inline `bottom`). Its opaque background must not hide the
	   hopBands → rankFocus canvas collapse (the bar can only be aimed once
	   RankBars has measured its focus row), so the fade-in is held back — via
	   the `.revealed` class, driven by `story.rank.revealed`, which
	   only flips once `story.settled` confirms that retarget has actually
	   landed — until the frame it lands on is the one this list then draws,
	   dot for dot. */
	.rank-bars-panel {
		position: absolute;
		top: 84px;
		left: 0;
		right: 0;
		background: var(--color-bg);
		opacity: 0;
	}

	.rank-bars-panel.revealed {
		animation: panel-in 0.4s ease both;
	}

	@keyframes panel-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rank-bars-panel {
			opacity: 1;
		}

		.rank-bars-panel.revealed {
			animation: none;
		}
	}

	/* A chapter card's title, centred in the field's own box — which on a card is
	   the whole visual box, since the crowd spreads over the entire canvas (height
	   still set inline, see chapterHeight). It sits in the middle of the universe
	   drifting behind it. Note the title stays in the 700px column while the dots
	   run past it on both sides: the sky is full-bleed, the words are not.
	   Nothing here is interactive and the canvas underneath may carry a layout's
	   `hits`, so the whole layer stays out of the way of taps. */
	.chapter-card {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem;
		pointer-events: none;
	}

	/* Set in the piece's own serif rather than the sans: only three faces load
	   (Atlas Grotesk, Tiempos, Atlas Typewriter) and a neo-grotesque at this size
	   reads as a default rather than a decision. Tiempos regular, uppercase and
	   tracked out, is the editorial register a chapter break wants. Uppercasing
	   is presentational — the title string stays as written. */
	.chapter-card h2 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--28px, 28px);
		font-weight: 400;
		line-height: 1.06;
		/* uppercase serifs set tight look cramped; open them up a little */
		letter-spacing: 0.03em;
		text-transform: uppercase;
		text-align: center;
		text-wrap: balance;
		color: var(--color-fg);
		/* halo, not a plate: the title lies over the drifting crowd, and a solid
		   background would punch a rectangle out of the universe it is meant to be
		   inside. Sized up from .node-label's — display type over a dot field needs
		   a wider hold-out than an 11px name does. */
		text-shadow:
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 16px var(--color-bg, #fff),
			0 0 16px var(--color-bg, #fff),
			0 0 28px var(--color-bg, #fff),
			0 0 28px var(--color-bg, #fff);
	}

	/* The title card, in the same centred box as a chapter's — see .chapter-card
	   for why the layer takes no pointer events: the canvas underneath is the
	   tap gutters' ground, and the card's whole instruction is to use them. */
	.splash-card {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		/* The one card measured off the tap gutters rather than the reading
		   column: it is the only screen that MARKS them (.splash-cue), and a
		   title running under that mark would have the reader reading the
		   instruction through the word it is pointing at. The type wraps earlier
		   for it, which on a phone is what turns the name into a poster. */
		padding: 0 var(--tap-gutter);
		pointer-events: none;
	}

	/* The piece's name. Same face and treatment as a chapter title (see
	   .chapter-card h2 for why it is the serif, uppercased and tracked out) at
	   the one size in the story allowed to be display type — this is the only
	   heading that is not a break between two things the reader is reading.
	   Tracking comes back in a little from the chapter's 0.03em: uppercase
	   serifs need the air at 28px and start to fall apart at 64. */
	.splash-card h1 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: clamp(var(--32px, 2rem), 12vw, var(--64px, 4rem));
		font-weight: 400;
		line-height: 1.02;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		text-align: center;
		text-wrap: balance;
		color: var(--color-fg);
		/* the same halo the chapter title carries, opened up for the larger face */
		text-shadow:
			0 0 10px var(--color-bg, #fff),
			0 0 10px var(--color-bg, #fff),
			0 0 20px var(--color-bg, #fff),
			0 0 20px var(--color-bg, #fff),
			0 0 36px var(--color-bg, #fff),
			0 0 36px var(--color-bg, #fff);
	}

	/* The one line of instruction. Set in the mono at the names' size, like every
	   other piece of machine-voice in the story (the tour caption, the chart
	   labels) — it is the interface talking, not the author. */
	.splash-cta {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--14px, 0.875rem);
		line-height: 1.3;
		text-align: center;
		text-wrap: balance;
		color: var(--color-fg);
		opacity: 0.75;
		text-shadow:
			0 0 4px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
	}

	/* Where the tap goes. The sentence says "the right of the screen"; this is
	   that place, marked — the cue fills the right-hand gutter exactly (the same
	   --tap-gutter TapNav sizes its button from), so the reader is pointed at the
	   strip that actually answers. It is the only marking either gutter ever
	   carries, and it leaves with the card. */
	.splash-cue {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: var(--tap-gutter);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: var(--24px, 1.5rem);
		color: var(--color-fg);
		opacity: 0.5;
		/* over the gutter it points at, but never catching the press it is asking
		   for — the button underneath has to get it */
		pointer-events: none;
		z-index: var(--z-tap-above);
		text-shadow:
			0 0 6px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
		animation: splash-nudge 2.6s ease-in-out infinite;
	}

	/* a nudge, not a bounce: the arrow leans the way the story goes and settles
	   back, so it reads as a direction rather than as something demanding a tap */
	@keyframes splash-nudge {
		0%,
		100% {
			transform: translateX(0);
		}

		50% {
			transform: translateX(5px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.splash-cue {
			animation: none;
		}
	}

	.scrolly-steps {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		/* ONE CELL, not a stack. A step's prose fades out while the next one waits
		   out its delay (see Step.svelte), so for a couple of hundred ms the column
		   holds two copies. In normal flow that makes it as tall as both of them
		   together, and this box is measured (`stepsHeight` above) for every
		   clearance the canvas takes off it — the whole layout would lurch on each
		   step. Sharing one grid cell puts the height at the TALLER of the two
		   instead, which is never worse than the instant jump it replaces. Bottom
		   aligned because the column is pinned to the bottom edge here: that is the
		   edge the two copies have in common. */
		display: grid;
		align-items: end;
		/* halo, not a plate — the same reason .chapter-card h2 carries one. A
		   full-bleed state (hopSeed, the chapter cards) puts the crowd behind the
		   copy all the way to the bottom edge, and a background would be a
		   rectangle cut out of the sky. Sized from .node-label's rather than the
		   title's: body copy needs a tighter hold-out than display type. It costs
		   nothing on the boxed steps, where the field stops at plotBottom and the
		   text sits on plain white. */
		text-shadow:
			0 0 4px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
	}

	/* The tap gutters run the full height of the layout, so they lie over the
	   left and right edges of the step card too. Prose gives those edges up
	   (a tap there is a step, which is the point), but a control the reader has
	   to hit does not: an InfoTerm trigger sits inline and lands wherever the
	   line wraps puts it, including hard against an edge. GuessRank lifts its
	   own controls the same way, in its own file. */
	.scrolly-steps :global(.bits-infoterm) {
		position: relative;
		z-index: var(--z-tap-above);
	}

	/* BESIDE, RATHER THAN OVER (>= BESIDE_MIN_W — kept in step with the constant
	   in the script by hand). Up to here the prose is a card lying across the
	   bottom of the canvas, and every chart keeps the bottom 40% of the box clear
	   for it. Past here there is room for the two abreast, so the prose takes a
	   column of its own and the charts take that 40% back — which is the actual
	   win, because the visual column at this breakpoint is about as wide as the
	   700px measure was giving them anyway. The height is what the charts never
	   had. See PLOT_BOTTOM_BESIDE in plot.js for the other half of it.

	   The prose column is a FIXED measure, not a share of the layout, and it is
	   sized at what a phone gives the same words (a 390-430px viewport less the
	   1rem gutters, so 358-398px). Two reasons. The piece's prose was written and
	   read at that measure, so holding it means the desktop reader gets the
	   line-breaks the copy was tuned for instead of a longer line that only looks
	   like more; and everything the screen has beyond it then goes to the
	   visualisation, which is the only thing here that gets better with width.
	   A percentage split gives the charts a fixed fraction of every screen and
	   spends the rest widening a measure that was already right.

	   Holding it in one custom property is also what makes the full-bleed cards
	   trivial: a card has to reach back across exactly this much to sit on the
	   screen's middle, so its offset is the measure negated rather than a ratio
	   between two columns. */
	@media (min-width: 75rem) {
		#scrolly {
			--column: 1400px;
		}

		.scrolly-layout {
			--prose-w: 25rem;
			/* the prose takes a column of its own off the canvas's left edge —
			   stated as the inset rather than as `left` so the credits backdrop
			   can rebuild the same box (see .scrolly-visual.exited) */
			--visual-l: var(--prose-w);
		}

		/* no longer over the canvas, so it is centred in a column of its own
		   rather than pinned to the bottom of the layout */
		.scrolly-steps {
			top: 50%;
			right: auto;
			bottom: auto;
			width: var(--prose-w);
			transform: translateY(-50%);
			/* the column is centred in its own column now, so that is the edge the
			   two copies of a swap share (see the grid note above) */
			align-items: center;
		}

		/* A full-bleed state's title belongs to the SCREEN, not to the charts'
		   half of it: the sky behind these two runs edge to edge, so a title
		   centred in the visual column would sit off to one side of the very
		   picture it is meant to be in the middle of. Both layers are
		   pointer-events: none, so reaching back across the prose costs nothing. */
		.chapter-card,
		.splash-card {
			left: calc(-1 * var(--prose-w));
		}

		/* THE SWAP. Every chapter puts the prose on the other side, so the reader
		   crosses the screen as the argument turns over — right, centre, left and
		   back, with a full-bleed chapter card holding the middle beat each time.
		   The two insets swap rather than `left`/`right`, so the credits
		   backdrop keeps whichever side the last chapter left the canvas on —
		   the reader steps off the story into the same frame they were reading
		   in, and the crowd does not move to meet them. */
		.scrolly-layout.flipped {
			--visual-l: 0px;
			--visual-r: var(--prose-w);
		}

		.scrolly-layout.flipped .scrolly-steps {
			left: auto;
			right: 0;
		}

		.scrolly-layout.flipped .chapter-card,
		.scrolly-layout.flipped .splash-card {
			left: 0;
			right: calc(-1 * var(--prose-w));
		}
	}
</style>

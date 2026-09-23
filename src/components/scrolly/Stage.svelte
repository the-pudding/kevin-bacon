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
	import { createTap } from "./tap.js";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import PointerIcon from "./PointerIcon.svelte";
	import PuddingLogo from "./PuddingLogo.svelte";
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

	// ScrollyVisual instance, for the pair quiz's locate() flight targets
	/** @type {ScrollyVisual | undefined} */
	let visual = $state();
	// Live height of the step card overlaying the canvas bottom. RAW: it reads 0
	// for the whole of every step change, so nothing consumes it directly — see
	// `cardHeight` below, which is what everything sized against the card uses.
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

	// The card's height, HELD across a step change — the one measurement every
	// clearance is taken off, so it is held here rather than by each consumer.
	//
	// `.scrolly-steps` is a single grid cell holding both copies of a swap, and
	// for the whole of that swap it measures NOTHING. The outgoing copy is
	// pinned `position: fixed` the instant it starts leaving (Step.svelte's
	// proseLeave), so it is out of flow while still a child; the arriving copy
	// is not rendered at all until its step has landed (`steps.held`). Measured
	// through a real 24 → 25 press at 375x667 that is ~720ms of `stepsHeight`
	// reading 0 — long enough for the x-axis title to drop 36px, sit there, and
	// jump back, inside a single scene. That is the furniture walk motion.md
	// rule 7 forbids, and it was on EVERY step change, not just that one.
	//
	// So the measurement is only taken while the box is showing the step it is
	// meant to be showing, and the last one stands until then. `steps.held` is
	// the same question Step.svelte asks before it renders the prose at all,
	// which is what makes it safe to key a hold on: a hold that never released
	// would be a step whose words never arrived, and the story would already be
	// broken. It releases on every step — a gated one included (a gate is asked
	// before the reader LEAVES, never on arrival), a `skipback` one trivially
	// (the registry never lands on one), and a chapter or title card, which
	// renders no prose at all, so 0 is its true height and the hold hands that
	// straight over.
	let cardHeight = $state(0);
	$effect(() => {
		if (steps.held) return;
		cardHeight = stepsHeight;
	});

	// How much of the canvas's bottom edge the step card actually covers. Stacked,
	// that is the card's own height and half a dozen things are measured off it —
	// the over-canvas panels, the tour caption's floor, the x-axis title. Beside
	// the prose it covers NONE of it: the card is in a column of its own, so every
	// one of those clearances gets the whole box back, and a chart that goes on
	// dodging a card that is not there leaves a band of empty canvas under it.
	const overlayHeight = $derived(beside ? 0 : cardHeight);

	const currentState = $derived(steps.state);

	// The rank panel outlives the rank chapter by one step: raceRecent keeps it
	// mounted so its bars can collapse into the race chart's own dots (see
	// RankBars' `collapse`). Its box has to stop moving for that — the panel is
	// sized off the card, and raceRecent's card is 34px taller than rankReveal's
	// at 375x667, so without this every row would shift away from what the
	// reader was looking at (and away from where the canvas has been aimed) at
	// the very moment it collapses. Hold the last height a rank step measured.
	//
	// Surviving a prose swap is no longer part of its job: `cardHeight` above is
	// already held across one, for every consumer. What is left here is the
	// carry-over into raceRecent, which is a step CHANGE and so a height the
	// general hold is right to let go of and this one is not.
	//
	// AND TODAY IT INSURES A GAP THAT NOTHING ELSE PINS. Measured at 375x667,
	// the panel's last frame is at 559ms after the press and `cardHeight`
	// releases at 1275ms, so the general hold would in fact serve: the ladder is
	// already gone before the taller card can reach it. That 716ms is not two
	// clocks passing each other, though — it is one tween. `story.rank.collapsed`
	// does BOTH jobs: it drops `showRankPanel` below, and it opens the raceRecent
	// arrival's `hold.until` (layouts/race.js), which starts the arrival tween
	// whose completion callback calls land() — and land() is what releases
	// `cardHeight`. So the margin IS `TWEEN_MS`, 700ms, plus a frame.
	//
	// Which is why this stays rather than being deleted as redundant. It is
	// redundant only for as long as that arrival takes a tween to land: give
	// raceRecent an entry that lands on the frame the gate opens and the margin
	// is zero, the ladder takes the frame in which `stepsHeight` reads 0 (the
	// arriving card is measured a frame later), and every row jumps 205px in the
	// last frame the reader sees of it. Two lines to insure a number no test
	// holds is the cheaper side of that trade.
	//
	// What is held is the RAW card measurement, not `overlayHeight`. Whether any
	// of that card covers the canvas is a live question — `beside` answers it,
	// and the answer flips during the first frames of every cold load, before the
	// viewport has been measured. Holding the gated value froze the wrong side of
	// that flip: a page opened straight onto a rank step (?step=8, ?step=9) seeded
	// this from the stacked layout's ~800px, `overlayHeight` then went to 0 for
	// good on a desktop viewport, the `!overlayHeight` guard that used to stand
	// here early-returned on every run after, and the ladder was left with
	// `bottom: 812px` on a 774px canvas — no height at all, over a canvas carrying
	// nothing but Bacon's hop bar. Gating at the point of use instead leaves the
	// hold doing only the job it is for.
	let rankStepsHeight = $state(0);
	$effect(() => {
		if (isRankState(currentState)) rankStepsHeight = cardHeight;
	});
	const rankPanelBottom = $derived((beside ? 0 : rankStepsHeight) + 12);
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
	// reload already past the guess (?step=8) or the reader stepping back into the
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
	// The ladder lies over the tap halves rather than under them, or it could
	// not be scrolled: a scroll reaches only what is under the pointer and its
	// ancestors, and the halves are neither. A tap on it still steps the story,
	// by whichever half it landed over — the halves meet at the layout's middle.
	/** @type {HTMLDivElement | undefined} */
	let layoutBox;
	const rankTap = createTap(() => steps);
	/** @param {MouseEvent} e */
	function onRankTap(e) {
		const box = layoutBox.getBoundingClientRect();
		rankTap.tap(e, e.clientX < box.left + box.width / 2 ? "prev" : "next");
	}

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
		bind:this={layoutBox}
		class:exited={steps.exited}
		class:flipped
		style="--viewport-height: {dimensions.height
			? `${dimensions.height}px`
			: '100svh'}; --title-band: {TITLE_BAND}px"
	>
		<!-- The prose and the step controls come BEFORE the canvas in the
		     document, though they paint over it (the z ladder below, not source
		     order, decides that): a keyboard or screen-reader reader meets the
		     step's words, then Previous/Next, and only then the chart's own
		     controls — rather than tabbing through every actor target on the
		     constellation to reach the next step. The dot bar stays last so it
		     keeps painting over the panels it shares --z-tap-above with. -->
		{#if !steps.exited}
			<div
				class="scrolly-steps"
				bind:clientHeight={stepsHeight}
				aria-live="polite"
			>
				<!-- a chapter card's title is drawn over the canvas (below), outside
				     this live region, so a screen reader stepping onto one heard
				     nothing: it is said here instead, and the drawn one is hidden -->
				{#if activeChapter}
					<h2 class="sr-only">{activeChapter.title}</h2>
				{/if}
				{@render children(layout)}
			</div>
			<TapNav />
		{/if}
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
					<!-- the keyboard's own way on is the window's arrow keys (TapNav) -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						class="rank-bars-panel"
						class:revealed={story.rank.revealed}
						style="bottom: {rankPanelBottom}px"
						onpointerdown={rankTap.down}
						onclick={onRankTap}
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
						aria-hidden="true"
						style="height: {chapterHeight}px"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						<h2>{activeChapter.title}</h2>
					</div>
				{/if}
				<!-- the title card. Same stable-{#if} arrangement as the chapter
			     card above and for the same reason (see Splash.svelte); the
			     cue and the logo are siblings rather than part of the card
			     because they are pinned (to the corner, and to the top of the
			     screen) rather than centred with the title — the logo also
			     stays clear of the sky's busiest patch, where the opening
			     flight converges behind the centred card. -->
				{#if activeSplash}
					<div class="splash-logo" in:fade={chapterIn} out:fade={chapterOut}>
						<PuddingLogo />
					</div>
					<div
						class="splash-card"
						style="height: {chapterHeight}px"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						<h1>{@render activeSplash.title()}</h1>
						{#if activeSplash.byline}
							<p class="splash-byline">{@render activeSplash.byline()}</p>
						{/if}
					</div>
					<div
						class="splash-cue"
						aria-hidden="true"
						in:fade={chapterIn}
						out:fade={chapterOut}
					>
						<span class="splash-cue-row on-wide">
							<strong>Click to continue</strong>
							<span class="splash-cue-icon"><PointerIcon /></span>
						</span>
						<span class="splash-cue-row on-narrow">
							<strong>Tap to continue</strong>
							<span class="splash-cue-icon"><PointerIcon /></span>
						</span>
						<span class="splash-keys on-wide">
							Or use the keyboard
							<span class="key"><ChevronLeft /></span>
							<span class="key"><ChevronRight /></span>
						</span>
					</div>
					<p class="sr-only">
						<span class="on-narrow"
							>Tap anywhere on the screen to navigate through the story.</span
						>
						<span class="on-wide"
							>Click, or use the left and right arrow keys, to navigate through
							the story.</span
						>
					</p>
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
			<StepProgress />
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

	/* --control-inset: how far a card-hosted control is held off the layout's
	   two edges. Not a tap measurement any more — the tap halves cover the whole
	   box (TapNav) — but the edges are still where a thumb reaching for the next
	   step lands, so a chip or a button sitting in them would be pressed by
	   accident. A percentage, not vw: #scrolly is max-width 700px, so above that
	   the layout stops growing while vw does not. Every consumer's containing
	   block is this same box (.scrolly-visual and the panels are all inset:0
	   descendants), so the percentage resolves identically wherever it is used
	   — that is the fragile part worth knowing. Resolves to 56px below a 467px
	   viewport and 80px at 700px+.

	   --progress-band: the strip the dot bar occupies. The bar takes no pointer
	   events and the tap halves run the full height beneath it, so a tap over a
	   dot steps the story like any other — the dots report position, they are
	   never a jump target.

	   The z ladder over this box, lowest first:
	     auto  canvas, scrubber panel, chapter card
	     5     the dev-only race tuners
	     20    --z-tap: the two tap halves
	     21    --z-card: the step card, which lies over them for its whole width.
	           Pointer-transparent, so prose still gives its edges up to a tap;
	           the controls it hosts (.guess, .quiz, .start-button, the inline
	           InfoTerm triggers) opt back in.
	     22    --z-tap-above: what must beat BOTH — .hits, .route, the search,
	           the scrubber's .control, .tick-1980, the dot bar, the rank
	           ladder (which forwards its taps; see onRankTap)
	     100+  InfoTerm's scrim and panel, untouched */
	.scrolly-layout {
		position: relative;
		height: var(--viewport-height);
		--control-inset: clamp(56px, 12%, 88px);
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
	   halves for the whole of the fade. Same idiom as .quiz and .route. */
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
		z-index: var(--z-tap-above);
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
		   inside. */
		text-shadow: var(--text-halo);
	}

	/* The title card, in the same centred box as a chapter's — see .chapter-card
	   for why the layer takes no pointer events: the canvas underneath is the
	   tap halves' ground, and the card's whole instruction is to use them. */
	.splash-card {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		/* Wrapped narrower than the full column on purpose: the type wraps
		   earlier, which on a phone is what turns the name into a poster. */
		padding: 0 var(--control-inset);
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
		/* the same halo the chapter title carries */
		text-shadow: var(--text-halo);
	}

	/* The Pudding's wordmark, pinned to the top of the screen rather than
	   stacked into the centred card — same "pinned corner, not centred with
	   the title" reasoning as .splash-cue (see the comment above it), and it
	   keeps the mark clear of the sky's busiest patch, where the opening
	   flight converges behind the card. Wide (600x247) rather than the
	   compact mark, so it is sized by width with a cap for wide viewports
	   rather than a fixed height. pointer-events: none for the same reason
	   .splash-card is — it is decorative, not a control. */
	.splash-logo {
		position: absolute;
		top: max(1.5rem, 6%);
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
		/* two soft layers, not --text-halo: that halo is tuned for solid letters,
		   and on this wordmark's thin, close-set script strokes it just merges
		   into a visible white blob instead of a halo. */
		filter: drop-shadow(0 0 6px var(--color-bg, #fff))
			drop-shadow(0 0 6px var(--color-bg, #fff));
	}

	.splash-logo :global(svg) {
		width: 40vw;
		max-width: 11rem;
		height: auto;
	}

	/* "By Owen Lacey", under the title — sans, small and let breathe from the
	   display serif above it, same halo idiom as the h1 and the cue so it
	   stays legible over the moving sky. The link is the one live control this
	   otherwise inert card carries, so it alone gets pointer-events back — and,
	   like .splash-cue, --z-tap-above to actually beat the tap halves it sits
	   over rather than just being painted under them. */
	.splash-byline {
		margin: 0.5rem 0 0;
		font-family: var(--font-sans);
		font-size: var(--16px, 1rem);
		letter-spacing: 0.02em;
		color: var(--color-fg);
		text-shadow: var(--text-halo);
		z-index: var(--z-tap-above);
	}

	.splash-byline :global(a) {
		color: inherit;
		pointer-events: auto;
	}

	/* Where the tap goes — pinned to the corner rather than centred over the
	   half, so it never runs into the title above it, however many lines that
	   wraps to. A hand-cursor icon, "click"/"tap to continue" (ported
	   like-for-like from The Pudding's pop-love-songs Tap.svelte) and, past
	   40rem, the keyboard alternative spelled out as two key glyphs. The whole
	   screen answers a tap while this card is up (see TapNav's atStart
	   branch), so the cue does not have to sit over any one half of it. */
	.splash-cue {
		position: absolute;
		right: var(--column-gutter);
		bottom: max(1.5rem, 6%);
		width: max-content;
		max-width: 70%;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		font-family: var(--font-sans);
		font-weight: 700;
		text-align: right;
		color: var(--color-fg);
		/* over the half it points at, but never catching the press it is asking
		   for — the button underneath has to get it */
		pointer-events: none;
		z-index: var(--z-tap-above);
		text-shadow: var(--text-halo);
		animation: splash-nudge 2.6s ease-in-out infinite;
	}

	.splash-cue strong {
		font-size: var(--20px, 1.25rem);
		line-height: 1.1;
	}

	.splash-cue-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* :global(svg) resets app.css's `svg { width: 100% }` (sized for full-bleed
	   chart art), which otherwise stretches the inlined pointer icon to the
	   width of its flex item instead of its own size. Height stays auto so the
	   doodle keeps its own (taller than wide) proportions. */
	.splash-cue-icon :global(svg) {
		width: 1.25rem;
		height: auto;
	}

	/* the keyboard alternative: a bold sans label, like the "click to
	   continue" line above it, and two key glyphs */
	.splash-keys {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--14px, 0.875rem);
	}

	.splash-keys .key {
		display: flex;
		padding: 3px;
		border: 1px solid var(--color-gray-300);
		border-radius: 4px;
		background: var(--color-bg);
	}

	.splash-keys .key :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
	}

	/* Which copy the cue and the sr-only instruction give: width decides which
	   control is in reach, not pointer type — same rule the piece's title
	   card CTA used to switch on before the cue absorbed its job. display:none,
	   not opacity, so the unused copy never reaches the a11y tree. Below 40rem
	   the cue is just "tap to continue" — the whole screen already answers a
	   tap, so there is no keyboard alternative to spell out. */
	.on-wide {
		display: none;
	}

	@media (min-width: 40rem) {
		.on-narrow {
			display: none;
		}

		.on-wide {
			display: inline;
		}

		.splash-cue .on-wide {
			display: flex;
		}
	}

	/* a nudge, not a bounce: the row leans the way the story goes and settles
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
		   on its arrival (see Step.svelte), so the column can hold two copies at
		   once; in normal flow they would stack, and the words the reader is
		   leaving would slide up the screen to make room for the ones arriving.
		   One grid cell lays them over each other instead, bottom aligned — the
		   column is pinned to the bottom edge here, so that is the edge the two
		   have in common.

		   It does NOT keep the box measurable across the swap, and never did: the
		   departing copy pins itself `position: fixed` on its way out, so for the
		   whole of a step change this box measures 0 whether it holds one copy or
		   two. That is what `cardHeight` in the script holds against. */
		display: grid;
		align-items: end;
		/* OVER the tap halves, and transparent to them. The halves cover this
		   card's full width, and a control inside it cannot lift itself clear:
		   a step wrapper's in:fly (and .rank-focus-text's opacity animation)
		   forms a stacking context its children cannot escape at any z-index.
		   So the lift happens HERE, above the wrapper, and the card hands the
		   presses straight back — which is what the prose wanted anyway, a tap
		   on a word being a step. The controls opt back in one by one, in their
		   own files: .guess, .quiz, .start-button, .bits-infoterm below. */
		z-index: var(--z-card);
		pointer-events: none;
		/* halo, not a plate — the same reason .chapter-card h2 carries one. A
		   full-bleed state (hopSeed, the chapter cards) puts the crowd behind the
		   copy all the way to the bottom edge, and a background would be a
		   rectangle cut out of the sky. It costs
		   nothing on the boxed steps, where the field stops at plotBottom and the
		   text sits on plain white. */
		text-shadow: var(--text-halo);
	}

	/* An InfoTerm trigger sits inline and lands wherever the line wraps puts it,
	   so it cannot be kept clear of anything by geometry — it opts back into the
	   presses the card gives away above. The other card controls do the same in
	   their own files (.guess, .quiz, .start-button). */
	.scrolly-steps :global(.bits-infoterm) {
		pointer-events: auto;
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
			/* --prose-gutter: clear space BETWEEN the two columns, taken off the
			   charts rather than out of the measure. Without it the two boxes
			   shared an edge and the only clearance was whatever a line's wrap
			   happened to leave: at 1440 the prose ran within 8px of the
			   "Remoteness" axis title (step 15) and flush against the rank
			   ladder's rows (steps 7-8), whose own scrollbar lands on that edge
			   on a platform with classic bars.
			   --prose-col: the whole of what the canvas gives up. Named because
			   the full-bleed cards have to reach back across exactly this much
			   to sit on the screen's middle (below). */
			--prose-gutter: 1.5rem;
			--prose-col: calc(var(--prose-w) + var(--prose-gutter));
			/* the prose takes a column of its own off the canvas's left edge —
			   stated as the inset rather than as `left` so the credits backdrop
			   can rebuild the same box (see .scrolly-visual.exited) */
			--visual-l: var(--prose-col);
		}

		/* no longer over the canvas, so it is centred in a column of its own
		   rather than pinned to the bottom of the layout */
		.scrolly-steps {
			/* Full height and centred by the grid, NOT by `top: 50%` and a
			   translate. A transform makes its element the containing block for
			   `position: fixed` descendants, and the departing copy of a step's
			   prose is pinned that way while the column swaps sides beneath it (see
			   Step.svelte's proseLeave) — so the viewport coordinates it was pinned
			   at resolved against this box instead and dropped it ~400px down the
			   screen, to the bottom left corner. Nothing here is measured on this
			   breakpoint (`overlayHeight` is 0 beside the prose), so the taller box
			   costs nothing. */
			top: 0;
			right: auto;
			bottom: 0;
			width: var(--prose-w);
			/* the column is centred in its own column now, so that is the edge the
			   two copies of a swap share (see the grid note above) */
			align-items: center;
		}

		/* A full-bleed state's title belongs to the SCREEN, not to the charts'
		   half of it: the sky behind these two runs edge to edge, so a title
		   centred in the visual column would sit off to one side of the very
		   picture it is meant to be in the middle of. Both layers are
		   pointer-events: none, so reaching back across the prose costs nothing.
		   .splash-logo joins them for the same reason — it is centred on the
		   screen the sky fills, not on the visual column alone. */
		.chapter-card,
		.splash-card,
		.splash-logo {
			left: calc(-1 * var(--prose-col));
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
			--visual-r: var(--prose-col);
		}

		.scrolly-layout.flipped .scrolly-steps {
			left: auto;
			right: 0;
		}

		.scrolly-layout.flipped .chapter-card,
		.scrolly-layout.flipped .splash-card,
		.scrolly-layout.flipped .splash-logo {
			left: 0;
			right: calc(-1 * var(--prose-col));
		}
	}
</style>

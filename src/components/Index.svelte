<script>
	// @ts-check
	import { setContext, onMount, untrack } from "svelte";
	import ScrollyVisual from "$components/scrolly/ScrollyVisual.svelte";
	import Step from "$components/scrolly/Step.svelte";
	import Chapter from "$components/scrolly/Chapter.svelte";
	import TapNav from "$components/scrolly/TapNav.svelte";
	import StepProgress from "$components/scrolly/StepProgress.svelte";
	import GuessRank from "$components/scrolly/GuessRank.svelte";
	import RankBars from "$components/scrolly/RankBars.svelte";
	import RaceScrubber from "$components/scrolly/RaceScrubber.svelte";
	import SimRunner from "$components/scrolly/SimRunner.svelte";
	import GenZMovers from "$components/scrolly/GenZMovers.svelte";
	import RaceRewindStart from "$components/scrolly/RaceRewindStart.svelte";
	import PairQuiz from "$components/scrolly/PairQuiz.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
	import urlParams from "$utils/urlParams.js";
	import { story, resetSimRace } from "$components/scrolly/story.svelte.js";
	import { quizDone } from "$components/scrolly/states.js";
	import { routeSummary } from "$components/scrolly/intro-routes.js";
	import {
		CYCLE_ORDER,
		introBottom
	} from "$components/scrolly/layouts/intro.js";
	import RouteFilms from "$components/scrolly/RouteFilms.svelte";
	import InfoTerm from "$components/ui/InfoTerm.svelte";
	import { plotBottom } from "$components/scrolly/layout-shared.js";
	import { MediaQuery } from "svelte/reactivity";
	import { fade } from "svelte/transition";
	import { cubicInOut } from "svelte/easing";
	import {
		CHAPTER_IN_MS,
		CHAPTER_IN_DELAY_MS,
		CHAPTER_OUT_MS
	} from "$components/scrolly/chapterFade.js";

	const STEP_PARAM = "step";
	const isRankState = (s) => s === "rankFocus" || s === "rankReveal";
	const isQuizState = (s) => s === "scatterQuiz";

	// A gate that never opens: the step's own control is the only way forward,
	// so the reader's Next has nothing to do but wait for them to press it.
	const NEVER = () => false;

	// current step lives in the URL query (?step=N) so each tab keeps its own
	// place across refreshes independently — unlike localStorage, which is
	// shared across every tab on the origin
	function readStep() {
		if (typeof window === "undefined") return null;
		const n = parseInt(urlParams.get(STEP_PARAM), 10);
		return Number.isInteger(n) ? n : null;
	}

	// read synchronously (not in onMount) so it's already correct by the time
	// ScrollyVisual's first paint effect runs; onMount fires too late, after
	// that effect has already committed to the state `value` had at mount.
	// Every <Step> registers into stepConfigs during the initial render (its
	// registration is plain top-level script, not gated on being the active
	// step — see Step.svelte), so stepConfigs is already fully populated by
	// then too, and `value` starting at the restored index (rather than 0,
	// corrected later in onMount) is what lets ScrollyVisual's first paint
	// land directly on the right state instead of flashing `lone` and then
	// tweening from it once onMount catches up.
	const restoredStep = readStep();
	let value = $state(
		restoredStep !== null && restoredStep > 0 ? restoredStep : 0
	);
	// true only when a saved step from a prior visit exists, so this render
	// isn't the reader's first-ever view. ScrollyVisual uses this to skip the
	// `lone`-authored pop-in, which would otherwise replay (and be misread as
	// an empty chart) on every refresh regardless of which step it lands on
	let coldStart = $state(restoredStep !== null && restoredStep > 0);
	let dimensions = new useWindowDimensions();
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
	// how tall the caption ended up — one line on a wide viewport, two on a phone —
	// so the clamp that keeps it off the step card knows what it is clamping
	let routeHeight = $state(0);

	/**
	 * Filled by each <Step> / <Chapter> as it mounts, in document order — the
	 * single source of truth mapping step index → visual state (+ per-step
	 * params, plus an optional `panel` snippet rendered over the canvas while the
	 * step is active, the three gating fields documented on Step.svelte — `gate`
	 * (the reader's Next is refused while it returns false), `skipback` (a
	 * backward move passes through this step) and `advanceon` (the step carries
	 * the reader on itself) — or `chapter` for a chapter card's title).
	 * @typedef {{ state: import("$components/scrolly/states.js").VisualState, params?: Object, panel?: import("svelte").Snippet, gate?: () => boolean, skipback?: boolean, advanceon?: () => boolean, chapter?: { title: string } }} StepConfig
	 * @type {StepConfig[]}
	 */
	const stepConfigs = $state([]);

	// which step each chapter opens on, in order — [3, 12, 20] today. Derived
	// from the registry rather than written down, so inserting a step or a
	// chapter re-segments the progress bar with no edit anywhere else.
	const chapterStarts = $derived(
		stepConfigs.reduce((out, c, i) => (c.chapter ? [...out, i] : out), [])
	);

	// Which steps own a dot on the progress bar. A chapter card isn't a step the
	// bar claims a dot for, and neither is a gated interaction step: it and the
	// step that reads out its answer are one beat to the reader (they cannot
	// arrive at the second without passing the first, and stepping back skips
	// straight over it), so they share the successor's dot rather than making
	// the bar tick twice for one move. Derived, like chapterStarts — nothing
	// downstream counts steps by hand.
	const dotSteps = $derived(
		stepConfigs.reduce(
			(out, c, i) => (c.chapter || c.skipback ? out : [...out, i]),
			[]
		)
	);
	const dotStep = $derived(
		stepConfigs[value ?? 0]?.skipback ? (value ?? 0) + 1 : (value ?? 0)
	);

	/** @type {{ register: (config: StepConfig) => number, current: number|undefined, count: number, chapterStarts: number[], chapter: string|null, nextBlocked: boolean, dotSteps: number[], dotStep: number, advance: () => void, go: (to: number) => void, next: () => void, prev: () => void }} */
	const scrollySteps = {
		// one object rather than positional args: a step now has six optional
		// kinds of registration and `register(s, undefined, undefined, c)` is a
		// call nobody can read
		register: (config) => stepConfigs.push(config) - 1,
		get current() {
			return value;
		},
		get count() {
			return stepConfigs.length;
		},
		get chapterStarts() {
			return chapterStarts;
		},
		get chapter() {
			return stepConfigs[value ?? 0]?.chapter?.title ?? null;
		},
		// the active step's gate is shut, so the reader's Next has nothing to do —
		// TapNav reads this to disable the right-hand gutter, so a held step reads
		// as held rather than as a dead tap
		get nextBlocked() {
			const gate = stepConfigs[value ?? 0]?.gate;
			return !!gate && !gate();
		},
		get dotSteps() {
			return dotSteps;
		},
		get dotStep() {
			return dotStep;
		},
		// Deliberately NOT routed through go() below: this is the in-chapter
		// nudge a step's own control gives itself once its interaction is done
		// (GuessRank on a correct guess or a give-up, RaceRewindStart's button,
		// and the effect watching a gated step's `advanceon`). Every one of them
		// moves within a chapter, so none crosses a transition navigate() cares
		// about — and sending them through go() would put them straight into the
		// gate their own press exists to answer.
		advance: () => {
			if (value < stepConfigs.length - 1) value += 1;
		},
		/**
		 * The reader's own navigation — the tap gutters and the arrow keys both
		 * land here, so the gate and everything navigate() prepares happen for a
		 * tap exactly as they do for a key.
		 *
		 * Two things sit between the press and the move, in this order:
		 *
		 * - `skipback` resolves the real destination first. A backward move that
		 *   would land on a gated interaction step passes through it instead, so
		 *   the reader never arrives back on the controls behind their own answer.
		 * - the departing step's `gate` then gets the last word on a FORWARD move.
		 *   While it is shut the press does nothing at all: the step's own control
		 *   is the only way on, and it goes through advance() above.
		 *
		 * navigate() runs with the resolved destination *before* `value` changes,
		 * so it can compare against the current `value` to know the direction and
		 * prepare state the destination step reads on its first render (a
		 * post-render $effect is too late for anything that mounts with the step).
		 */
		go(to) {
			if (to < 0 || to > stepConfigs.length - 1) return;
			const back = to < value;
			let dest = to;
			if (back) while (dest > 0 && stepConfigs[dest].skipback) dest -= 1;
			const gate = stepConfigs[value]?.gate;
			if (!back && gate && !gate()) return;
			navigate(dest);
			value = dest;
		},
		next: () => scrollySteps.go(value + 1),
		prev: () => scrollySteps.go(value - 1)
	};
	setContext("scrolly-steps", scrollySteps);

	const currentState = $derived(stepConfigs[value ?? 0]?.state);

	// The rank panel outlives the rank chapter by one step: raceRecent keeps it
	// mounted so its bars can collapse into the race chart's own dots (see
	// RankBars' `collapse`). Its box has to stop moving for that — the panel is
	// sized off `stepsHeight`, and raceRecent's prose is shorter than
	// rankReveal's, so without this every row would shift a few px away from what
	// the reader was looking at (and away from where the canvas has been aimed) at
	// the very moment it collapses. Hold the last height a rank step measured.
	// set by navigate(): true from the forward step out of the rank chapter into
	// raceRecent — the one arrival the collapse belongs to — and held for as long
	// as the reader stays on raceRecent
	let rankHandoff = $state(false);
	let rankStepsHeight = $state(0);
	$effect(() => {
		if (isRankState(currentState) && stepsHeight) rankStepsHeight = stepsHeight;
	});
	const rankPanelBottom = $derived(
		(isRankState(currentState) ? stepsHeight : rankStepsHeight) + 12
	);
	// the overlay is up through the rank chapter, and for the collapse that opens
	// raceRecent — until the nodes are the canvas's (see RankBars' `collapse`)
	const showRankPanel = $derived(
		isRankState(currentState) ||
			(currentState === "raceRecent" && rankHandoff && !story.rankCollapsed)
	);

	// safety net for a stale/malformed URL (?step past the end of the story):
	// value already starts at restoredStep, so this only ever corrects it back
	// into range once stepConfigs.length is known
	onMount(() => {
		if (value >= stepConfigs.length) value = 0;
	});

	// The race chart's y-band tuner. Pulled in dynamically rather than imported at
	// the top so a production build drops it entirely: `import.meta.env.DEV` is
	// substituted with `false`, the branch goes dead, and nothing references the
	// chunk. A static import survives tree-shaking (the compiled block and its CSS
	// still land in the bundle), which is why this isn't just an {#if} in the markup.
	let raceYBandDev = $state(null);
	onMount(async () => {
		if (!import.meta.env.DEV) return;
		raceYBandDev = await import("$components/scrolly/RaceYBandDev.svelte");
	});

	// The race chart's x-axis density tuner. Same dynamic-import rationale as
	// raceYBandDev above.
	let racePxPerYearDev = $state(null);
	onMount(async () => {
		if (!import.meta.env.DEV) return;
		racePxPerYearDev =
			await import("$components/scrolly/RacePxPerYearDev.svelte");
	});

	// The race chart's animation speed tuner. Same dynamic-import rationale as
	// raceYBandDev above.
	let raceSpeedDev = $state(null);
	onMount(async () => {
		if (!import.meta.env.DEV) return;
		raceSpeedDev = await import("$components/scrolly/RaceSpeedDev.svelte");
	});

	$effect(() => {
		urlParams.set(STEP_PARAM, value);
	});

	// --- a step that carries the reader on itself ---
	// A gated step's own control is the only way past it, and one of them isn't a
	// button press but the thing the press starts: the simulation's 10,000 runs
	// ARE the payoff, and the next step names the winner, so the story waits for
	// the race and then moves on by itself. The step declares when that has
	// happened as `advanceon`, and this watches whichever step is active — so a
	// reader who steps away mid-run disarms it by leaving, with no flag to clear.
	//
	// advance() is untracked because it writes the `value` this effect reads:
	// without it the write re-runs the effect against the step it just left.
	$effect(() => {
		if (stepConfigs[value]?.advanceon?.())
			untrack(() => scrollySteps.advance());
	});

	// Prepares an arrival. Runs before `value` changes, so state the destination
	// step's own components read at mount is already correct — PairQuiz decides
	// whether to ask from story.quizRevealed as it mounts, and a post-render
	// $effect would leave it painting the blurred question for a frame before
	// being told not to. It is handed the destination the registry's `go` has
	// already resolved, so `to < value` is still the reader's direction of travel.
	function navigate(to) {
		// arriving at the quiz backwards means the reader has already been through
		// it, so reveal every pair instead of re-asking (see story.svelte.js).
		// Arriving forwards re-arms the question — and with it the step's gate.
		if (isQuizState(stepConfigs[to]?.state)) story.quizRevealed = to < value;
		// the simulation rests at zero runs until the reader presses Start, so a
		// reader who walked back out of the chapter and in again gets the race to
		// watch rather than the finished chart under a dead Start button. Forward
		// arrivals from OUTSIDE the state only: the steps inside it that read the
		// result out must keep the settled chart they describe.
		if (
			to > value &&
			stepConfigs[to]?.state === "simRace" &&
			currentState !== "simRace"
		)
			resetSimRace();
		// the rank panel only carries over into raceRecent when the reader actually
		// walks there out of the rank chapter — that is the one arrival whose bars
		// collapse into the chart's dots. Reloading straight onto raceRecent, or
		// stepping back to it from raceFull, must not flash the list up over a
		// chart that is already drawn.
		//
		// It then STAYS up for as long as the reader is on raceRecent (both its
		// steps): the collapse is a 500ms clock the canvas is waiting on, and a step
		// taken inside that window used to pull the overlay out from over a canvas
		// parked on the collapsed frame — leaving the bare nodes on screen with the
		// chart never drawn. Only leaving the state hands it back.
		rankHandoff =
			stepConfigs[to]?.state === "raceRecent" &&
			(isRankState(currentState) || rankHandoff);
	}

	// --- step 1's tour of the network ---
	// The step demonstrates the game rather than waiting to be asked: it picks each
	// actor out in turn and the card reads their distance to Bacon, so a reader who
	// never taps still sees what "two movies away" means. A tap takes it over
	// (story.introPinned, set by the state's `pick` — see layouts/intro.js).
	const TOUR_MS = 3400; // ~3s to read, on top of the 450ms highlight tween
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);

	// A chapter card's title, rendered from the registry rather than by <Chapter>
	// so it sits in a stable {#if} and can transition OUT as the reader moves on
	// (see Chapter.svelte). It fades in behind a beat, so the constellation
	// dissolving into the crowd underneath reads first, and leaves briskly — it
	// must be gone before the next step starts sorting the field into bands.
	const activeChapter = $derived(stepConfigs[value ?? 0]?.chapter);
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
	// centred on the FIELD's box, not the canvas's: the crowd occupies the plot
	// area above the step card (plotBottom), so a canvas-centred title would sit
	// half over empty ground below the universe it is meant to be inside
	const chapterHeight = $derived(visualHeight ? plotBottom(visualHeight) : 0);

	const introRoute = $derived(
		story.introFocus == null ? null : routeSummary(story.introFocus)
	);
	// The caption hangs a short gap under the constellation's lowest name, then is
	// clamped off the step card — which only binds on a viewport short enough that
	// the two would otherwise meet.
	const ROUTE_GAP = 12;
	const routeTop = $derived.by(() => {
		if (!visualWidth || !visualHeight) return 0;
		const floor = visualHeight - stepsHeight - routeHeight - ROUTE_GAP;
		return Math.min(introBottom(visualWidth, visualHeight) + ROUTE_GAP, floor);
	});
	// gated on `settled` for the same reason the caption always was: the network
	// finishes growing on the previous step, and nothing should point at an actor
	// whose arrival hasn't landed
	const touring = $derived(
		currentState === "networkIntro" &&
			story.settled === "networkIntro" &&
			!story.introPinned
	);
	// Where the tour has got to. A plain `let`, not $state: the tour effect reads
	// it when it (re)starts and must not re-run because of it. Kept outside the
	// effect so releasing a pick carries on from the actor the reader was looking
	// at instead of snapping back to the top of the order.
	// Index of the actor the tour will show next. A plain `let`, not $state: the
	// tour effect reads it when it (re)starts and must not re-run because of it.
	let tourNext = 0;
	const showNext = () => {
		story.introFocus = CYCLE_ORDER[tourNext];
		tourNext = (tourNext + 1) % CYCLE_ORDER.length;
	};
	// Whoever is highlighted — by the tour or by the reader — is where the tour
	// carries on from, so it never snaps back to the top of the order.
	$effect(() => {
		const i =
			story.introFocus == null ? -1 : CYCLE_ORDER.indexOf(story.introFocus);
		if (i >= 0) tourNext = (i + 1) % CYCLE_ORDER.length;
	});
	let seenReleases = 0;
	$effect(() => {
		// Read so a tap that clears the highlight restarts this effect, and with it
		// the clock — `touring` alone doesn't change when the reader dismisses an
		// actor the tour was showing, so without this the next one would arrive on
		// the remainder of a turn they never saw start.
		//
		// This effect must NEVER read `story.introFocus`, which showNext writes: a
		// tick would then invalidate the effect, re-run it, fire a second showNext
		// and restart the interval — the tour would skip an actor on every tap.
		const releases = story.introReleases;
		const released = releases !== seenReleases;
		seenReleases = releases;
		if (!touring) return;
		// A tap that cleared the highlight means the reader wants it cleared: leave
		// the constellation neutral and let the tour pick up on its next beat,
		// rather than reselecting an actor out from under them.
		if (!released) showNext();
		// text that changes on its own is motion the reader didn't ask for: under
		// reduced motion the step rests where it is and waits for a tap
		if (reducedMotion.current) return;
		const timer = setInterval(showNext, TOUR_MS);
		return () => clearInterval(timer);
	});

	let prevValue = 0;
	$effect(() => {
		const state = stepConfigs[value]?.state;
		const prevState = stepConfigs[prevValue]?.state;
		// stepping back out of the rank chapter resets the guess, so returning
		// to it later starts the guessing game fresh instead of picking up
		// where the reader left off (guessed, or already seeing the reveal)
		if (value < prevValue && isRankState(prevState) && !isRankState(state)) {
			story.rankGuesses = [];
			story.rankGaveUp = false;
		}
		prevValue = value;
	});
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<section id="scrolly">
		<div
			class="scrolly-layout"
			style="--viewport-height: {dimensions.height
				? `${dimensions.height}px`
				: '100svh'}"
		>
			<div
				class="scrolly-visual"
				bind:clientWidth={visualWidth}
				bind:clientHeight={visualHeight}
			>
				<ScrollyVisual
					bind:this={visual}
					state={stepConfigs[value ?? 0]?.state}
					params={stepConfigs[value ?? 0]?.params}
					{coldStart}
					{stepsHeight}
				/>
				<!-- The rank ladder, mounted here rather than as a step's panel (the
				     way the dev tuners below are) because it has to OUTLIVE the step
				     change into raceRecent: that arrival is the handoff, where its bars
				     collapse into the race chart's own dots while the canvas underneath
				     is parked on a copy of them. A per-step panel is torn down and
				     rebuilt whenever the snippet changes, which remounted this whole
				     box on that very step — restarting its fade-in (700ms at opacity 0,
				     leaving the parked canvas bare) and mounting the bars already
				     collapsed, so the fold never played. `showRankPanel` is what stands
				     it down, once the canvas holds the nodes (story.rankCollapsed).

				     `reveal` stays on through the handoff step: it is what puts SLJ in
				     focus, so dropping it on raceRecent would send the focus row back to
				     the reader's guess and re-hide every other name at the exact moment
				     the bars collapse. -->
				{#if showRankPanel}
					<div class="rank-bars-panel" style="bottom: {rankPanelBottom}px">
						<RankBars
							reveal={currentState === "rankReveal" ||
								currentState === "raceRecent"}
							collapse={currentState === "raceRecent"}
						/>
					</div>
				{/if}
				<!-- the active step's over-canvas panel, if it declared one — the
				     markup lives next to the <Step> that owns it. After the ladder
				     above, so a step's own controls (raceRecent's Start button) sit
				     over it rather than under it -->
				{@render stepConfigs[value ?? 0]?.panel?.()}
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
				<!-- dev-only y-band tuner. Mounted outside stepConfigs so it spans the
				     whole race chapter and keeps its table installed across step
				     changes; it renders nothing until story.raceCam exists, i.e. off
				     the race chapter. -->
				{#if raceYBandDev}
					<raceYBandDev.default />
				{/if}
				{#if racePxPerYearDev}
					<racePxPerYearDev.default />
				{/if}
				{#if raceSpeedDev}
					<raceSpeedDev.default />
				{/if}
			</div>
			<div
				class="scrolly-steps"
				bind:clientHeight={stepsHeight}
				aria-live="polite"
			>
				<!-- shared over-canvas panels live here, beside the <Step>s rather
				     than inside one — a snippet declared directly inside a
				     component's tags becomes a prop of that component (that's how
				     single-step panels nest inside <Step> directly). The rank ladder
				     is NOT one of them: it spans the step change into raceRecent, so
				     it is mounted up beside the canvas instead (see the note
				     there). -->
				<!-- raceRecent's opening step: the Start button that asks for the
				     backwards rewind - consent for the "remove information" move, same
				     reasoning as simPanel below. Only that one step gets it; raceRecent's
				     second step is already rewinding by then — the button advances as it
				     asks, and it is the only way past that step. -->
				{#snippet raceStartPanel()}
					<div class="race-scrubber-panel" style="bottom: {stepsHeight + 12}px">
						<RaceRewindStart />
					</div>
				{/snippet}
				<!-- raceFull pan control: drag surface + year slider over the plot. Only
				     raceFull gets it — the raceRecent steps are carried by their own
				     camera choreography, so they need no control of their own, and
				     raceFuture is a fixed camera by design (its copy asks the reader to
				     look at the empty future, not to go rummaging in the past; it also
				     reports its camera as fixed, so this would render nothing there
				     anyway). Renders nothing on a viewport wide enough to show the
				     whole range. -->
				<!-- the pair quiz renders as a blurred overlay over the scatter; the
				     step below it just sets up the question -->
				{#snippet quizPanel()}
					<PairQuiz {visual} />
				{/snippet}
				{#snippet racePanel()}
					<div class="race-scrubber-panel" style="bottom: {stepsHeight + 12}px">
						<RaceScrubber />
					</div>
				{/snippet}
				<!-- simulation race: the Start button over the plot. Keep this step's
				     card unconditional — its height is what the panel's `bottom` is
				     measured from, so anything that unmounts mid-run would move the
				     button under the reader's finger. The chart rests at zero runs
				     until Start, which is the only way past this step; the run then
				     carries the reader on itself (the step's `advanceon`). -->
				{#snippet simPanel()}
					<div class="race-scrubber-panel" style="bottom: {stepsHeight + 12}px">
						<SimRunner />
					</div>
				{/snippet}
				<!-- the Monte Carlo reshuffle: a dumbbell row per contender, opaque over
				     the simulation race it reads out. The whole close sits on that one
				     chart, so this panel is the only thing that changes for its step. -->
				{#snippet moversPanel()}
					<div class="movers-panel" style="bottom: {stepsHeight + 12}px">
						<GenZMovers />
					</div>
				{/snippet}
				<!-- PRESENT -->
				<Step state="lone">
					<p>
						The "Six Degrees of Kevin Bacon" is a game where players try to
						connect an actor to Kevin Bacon via movies they've starred in with
						other Hollywood actors, aiming to reach him in six movies or fewer.
					</p>
				</Step>
				<Step state="networkIntro">
					<!-- The tour's caption, over the canvas rather than in the card: it is
						     naming a dot, so it sits with the constellation and is typed like
						     the names on it. Whoever the tour (or the reader's tap) has picked
						     out is named here, and the chart labels the same actors, so
						     sentence and constellation always agree.

						     One line by design. The films behind each hop go in the panel
						     behind "two movies" instead of into the card, because as prose
						     they ran to several sentences — and a step card that grows covers
						     the very dots it is inviting taps on at 360×640 (see
						     notes/scrolly-framework.md). The network finishes growing back on
						     the `lone` step, so actors are already tappable here.

						     Placed off the constellation's own lowest name (introBottom), not a
						     fraction of the canvas: the intro fit is width-limited on a tall
						     phone, so the graph stops well short of its band and any fixed
						     fraction leaves a hole under it. -->
					{#snippet panel()}
						{#if story.settled === "networkIntro" && introRoute}
							<p
								class="route"
								bind:clientHeight={routeHeight}
								style="top: {routeTop}px"
							>
								<strong>{introRoute.name}</strong>:
								<InfoTerm
									title="{introRoute.name} → {introRoute.anchor}"
									onclick={() => (story.introPinned = true)}
								>
									{introRoute.count}
									{#snippet info()}
										<RouteFilms id={story.introFocus} />
									{/snippet}
								</InfoTerm>
								away from {introRoute.anchor}.
							</p>
						{/if}
					{/snippet}
					<p>
						The intuition is that Kevin Bacon is so prolific and well-known that
						the game is a lot easier than if it were called the "Six Degrees of
						John Doe", implying he's some sort of all-encompassing center of
						Hollywood.
					</p>
				</Step>
				<Step state="hopSeed">
					<!-- The copy lands over the constellation pulling back: the network
						     Bacon is in the middle of shrinks to a small thing as the line
						     says he isn't the centre of Hollywood (see layouts/hop-bands.js).
						     The bands' crowd is already parked behind it, invisible. -->
					<p>
						However, Kevin Bacon is <b>not</b> the center of Hollywood. Not only
						that, he <b>never has been</b>, and almost certainly
						<b>never will be</b>.
					</p>
				</Step>

				<!-- CHAPTER: THE CENTERS OF HOLLYWOOD -->
				<!-- The card opens on hopSeed's own closing frame — the crowd is
					     already spread across the plot, so nothing in the field moves and
					     the picture simply holds while the title lands. Only the intro
					     fifteen travel, dissolving out of the constellation into the crowd,
					     which is the line the reader has just read. It rests there
					     drifting (the framework's one ambient loop) until they step on,
					     and the field then sorts itself into the hop bands. -->
				<Chapter state="chapterCenters" title="The centers of Hollywood" />

				<Step state="hopBands">
					<p>
						No doubt, he's well connected. With
						<InfoTerm>
							our dataset
							{#snippet info()}
								<p>
									The corpus is the IMDb top 10,000 English-language feature
									films by user vote count.
								</p>
								<p>
									We then enrich the data with cast information from the TMDB
									API so we can build the graph network. In total, there are
									just over 169,000 actors in the dataset.
								</p>
								<p>The data for this was taken in ~March 2026.</p>
								<p>
									Massive tangent: this dataset even includes <a
										href="https://www.imdb.com/name/nm8509587/">my bestie</a
									>, who got a role in the 2018 film Tolkien, putting him two
									movies away from Kevin Bacon!
								</p>
							{/snippet}
						</InfoTerm>, you can get from any Hollywood actor to Kevin Bacon in
						four movies or fewer, a.k.a. the <i>four</i> degrees of Kevin Bacon.
					</p>
					<p>
						The reality is that Kevin Bacon isn't special in this respect; there
						are 16,429 actors who can be reached by everyone within 4 movies,
						and no one can be reached by everyone within 3.
					</p>
				</Step>
				<Step state="hopBands">
					<p>
						We need a better way to measure the connectivity of actors in this
						highly congested network. For this, we use how many movies on
						average it takes to get to them from all other actors. In graph
						theory, this is often referred to as <i>remoteness</i>.
					</p>
					<p>
						For example, Kevin Bacon's remoteness is 2.28: an actor is 2.28
						movies away on average. Smaller is better: the less remote you are,
						the more likely you are to be the center of Hollywood.
					</p>
				</Step>
				<!-- guessing #1 or giving up is the only way on: GuessRank calls the
				     registry's advance() itself, and stepping back off the reveal
				     skips this step so its search box isn't left sitting under the
				     answer (see `gate` / `skipback` in Step.svelte) -->
				<Step state="rankFocus" gate={NEVER} skipback>
					<div class="rank-focus-text">
						<p>
							As mentioned earlier, Kevin Bacon is not the center of Hollywood.
							His remoteness of 2.28 puts him at #175 of all Hollywood actors.
							Can you guess who #1 is?
						</p>
						<GuessRank />
					</div>
				</Step>
				<Step state="rankReveal">
					<p>
						Yes, Samuel L. Jackson is the <i>center of Hollywood</i>, with a
						remoteness of just 2.09. Willem Dafoe is second with 2.13, Robert De
						Niro third with 2.14.
					</p>
					<p>
						Female actors are under-represented here, taking only 16 of the top
						100 places. Nicole Kidman is the first female in at #21 with 2.19.
					</p>
				</Step>

				<!-- Start is the only way on, and it advances as it asks for the pan
				     (RaceRewindStart) — the rewind is choreographed to play ACROSS
				     the step change onto the view the next step describes -->
				<Step state="raceRecent" panel={raceStartPanel} gate={NEVER} skipback>
					<p>
						We can repeat the process for calculating all actors' remoteness and
						go backwards to create a time machine of centers. By using completed
						calendar years, our time machine starts at the end of 2025.
					</p>
					<p>Remember, lower remoteness is better. Press 'Start' to begin.</p>
				</Step>
				<Step state="raceRecent">
					<p>
						Let's go back to where Samuel L. Jackson took the crown in 2006.
						Interestingly, this was before any MCU movie took place, which only
						made matters worse for his competitors.
					</p>
				</Step>
				<Step state="raceFull" panel={racePanel}>
					<p>
						We can then view all centers of Hollywood since 1980. Use the slider
						or drag to take a look around, or go next.
					</p>
				</Step>

				<Step state="raceFuture">
					<p>
						Now imagine us taking this into the future. How might we predict who
						will take the crown from Samuel L. Jackson?
					</p>

					<p>
						To do that, we need to find what moves an actor towards the center.
					</p>
				</Step>
				<Chapter
					state="chapterCenters"
					title="The makings of a center of Hollywood"
				/>
				<Step state="scatterCenters" params={{ showFilms: true }}>
					<p>
						The obvious one is film count. More films mean closer to the center.
						Indeed, Samuel L. Jackson has been in far more films than anyone
						else, 20 more than Nicolas Cage, who's next closest.
					</p>
				</Step>
				<Step state="scatterCenters" params={{ showPair: true }}>
					<p>
						The relationship between film count and remoteness is strong, but it
						doesn't explain it fully. Two actors can have the same film counts
						but very different average distances. For example, Natalie Portman
						and Anna Kendrick are shown here at the two extremes of the data.
					</p>
				</Step>
				<Step state="scatterCenters" params={{ showPair: true }}>
					<p>
						So what's different about them? Put simply: better costars. Natalie
						Portman stars with more "big dogs" than Anna Kendrick. They say in
						Hollywood "It's not what you know, it's who you know", and it seems
						this is also true when explaining an actor's remoteness.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showPair: true, showCostars: true }}
				>
					<p>
						For example, of the 250 most-connected actors from earlier, Natalie
						Portman has worked with almost three times as many.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showPair: true, showCostars: true }}
				>
					<p>
						It would be too circular to use costars with low remoteness as our
						measure. That's like saying "We think the most expensive houses will
						be the ones with the highest price".
					</p>
				</Step>
				<Step state="degScatter">
					<p>
						Instead we use the costar film count as a sort of proxy. Concretely,
						this is an actor's 50 most prolific costars by number of films,
						taken as an average. If you work with more "big dog" actors compared
						to someone with the same film count, you'll almost certainly be
						closer to the center of Hollywood than them.
					</p>
				</Step>
				<!-- the one gate the reader's own Next walks through once it opens:
				     the quiz has no single completing press, so finishing the last
				     pair is what unblocks it. Stepping back to 18 stays open, and
				     `quizDone` is the same predicate PairQuiz seeds itself from, so
				     the gate can never hold a panel with nothing left to ask -->
				<Step
					state="scatterQuiz"
					panel={quizPanel}
					gate={() => quizDone(story)}
				>
					<p>
						Let's test our knowledge with a few more examples. For these actors
						with similar film counts, who do you think works with more "big
						dogs" and is therefore closer to the center?
					</p>
				</Step>
				<Chapter
					state="chapterCenters"
					title="Predicting the next center of Hollywood"
				/>
				<Step state="scatterGenZ">
					<p>
						We now have everything we need to predict Gen Z's Kevin Bacon using
						film count and costar data. Our contenders are actors born since
						1997 who have been in at least 5 films.
					</p>
				</Step>
				<Step state="scatterGenZ">
					<p>
						To predict future remoteness we need to model their trajectory by
						stating what we think their film count and costar data will look
						like at a certain point in time. To do this, we look at what has
						happened to actors with similar stats in the past.
					</p>
				</Step>
				<Step state="careerTrio">
					<p>
						Films first. Take Sydney Sweeney: she's been in 16 films since her
						debut 15 years ago. At the same point in their career, Robert De
						Niro had also racked up 16 films — and went on to have a brilliant
						career totalling 87. By contrast, Chevy Chase reached the same
						milestone at the same point — but only ever appeared in 27.
					</p>
				</Step>
				<Step state="careerMany">
					<p>
						This means that whatever actor we use to model a Gen Z actor's film
						trajectory can massively impact the results. For each actor, we
						consider similar actors based on proximity to them, and randomly
						select one weighted by how close they are.
					</p>
					<p>
						By applying the same approach for costar film counts, we can start
						predicting.
					</p>
				</Step>
				<!-- Start is the only way on, and the run itself carries the reader
				     over once it lands: the 10,000 runs are the payoff and the next
				     step names the winner -->
				<Step
					state="simRace"
					panel={simPanel}
					gate={NEVER}
					skipback
					advanceon={() => story.simRuns > 0 && !story.simRunning}
				>
					<p>
						To achieve a stable result, we'll run the simulation 10,000 times
						and see who comes out on top. Press start to find out who wins.
					</p>
				</Step>
				<!-- 
          1. GCM is the winner
          2. A typical sim doesn't get her close, only an over-performing sim gets her close
          3. The sim doesn't just confirm today's leaderboard, it reshuffles it
           -->
				<Step state="simRace">
					<p>
						Chloë Grace Moretz is the most likely to be Gen Z's Kevin Bacon,
						winning just over 10% of the simulations. It's by no means a
						landslide: her median remoteness is 2.19 with a median projected
						film count of 66, quite far away from Samuel L. Jackson's
						stratospheric numbers.
					</p>
				</Step>
				<Step state="simRace">
					<p>
						From our historical analysis, you'll recall lines dropping off as
						actors stop appearing in so many films. We're counting on this
						happening to Samuel L. Jackson, or a Marvel-sized cinematic universe
						being spawned again.
					</p>
				</Step>
				<!-- the list is a reading of the race chart it covers: the canvas does
					     not change for this step, the panel simply fades over it and back
					     off again. simRace's replay is not re-armed by arriving here — it
					     only ever runs off SimRunner's nonce. -->
				<Step state="simRace" panel={moversPanel}>
					<p>
						Here are the full results, including how much they've moved their
						current position by remoteness.
					</p>
					<p>Click on an actor to see their breakdown.</p>
				</Step>
				<!-- closes on an empty canvas: the chart dissolves where it stands
					     and the last words are left on their own. -->
				<Step state="outro">
					<p>
						What is far more certain is that the first female center of
						Hollywood is on the horizon, with 65% of the wins going to women —
						though perhaps not for a few years yet.
					</p>
				</Step>
			</div>
			<StepProgress />
			<TapNav />
		</div>
	</section>
</svelte:boundary>

<style>
	#scrolly {
		max-width: 700px;
		margin: 0 auto;
		padding: 0 1rem;
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
	     auto  canvas, rank/movers/scrubber panels, chapter card, step card
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
		/* space for each chart's title, between the dot bar and the canvas's own
		   MARGIN-based top clearance (see layout-shared.js) */
		--title-band: 26px;
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
		right: 0;
		bottom: 0;
		left: 0;
	}

	/* the rank chapter's "everyone else" list: sits below the space where
	   Bacon's hop bar dissolves (see layouts/rank.js) and above the measured
	   step card (inline `bottom`). The delayed fade-in keeps the panel's opaque
	   background from hiding the hopBands → rankFocus canvas collapse. That
	   collapse runs on the param tween (the bar can only be aimed once RankBars
	   has measured its focus row), so it lands well inside TWEEN_MS — and the
	   frame it lands on is the one this list then draws, dot for dot. */
	.rank-bars-panel {
		position: absolute;
		top: 84px;
		left: 0;
		right: 0;
		background: var(--color-bg);
		animation: panel-in 0.4s ease 0.7s both;
	}

	@keyframes panel-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* the Monte Carlo movers list: opaque over the race chart, so the dumbbell
	   rows are the only chart on screen for their step. Unlike the rank panel it
	   starts at the very top of the canvas — it replaces the chart outright
	   rather than sitting under something, so any gap would leak the axis ticks
	   of the chart underneath. No delay on the fade, unlike the rank panel: that
	   one waits for a canvas collapse to finish underneath it, and this step's
	   canvas never changes (every step around it is simRace too), so a delay here
	   would just be dead time on arrival. */
	.movers-panel {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		background: var(--color-bg);
		animation: panel-in 0.3s ease both;
	}

	/* raceFull scrubber: spans the plot region above the step card (inline
	   `bottom`). Transparent — the drag surface sits over the live canvas; only
	   the slider control at its bottom edge is opaque. */
	.race-scrubber-panel {
		position: absolute;
		top: 84px;
		left: 0;
		right: 0;
	}

	/* rankFocus' own staged reveal: Bacon's bar/row lands first (panel-in,
	   above), then this text fades in once that's had time to read, so the
	   reader meets Bacon before the question — see RankBars.svelte's row-in
	   for the next stage (everyone else fading in after this). */
	.rank-focus-text {
		animation: panel-in 0.5s ease 1.25s both;
	}

	@media (prefers-reduced-motion: reduce) {
		.rank-bars-panel,
		.movers-panel,
		.rank-focus-text {
			animation: none;
		}
	}

	/* step-1's tour caption, floated over the canvas just under the constellation
	   (`top` is set inline — see the step). Appears with the interaction, so it
	   never points at an actor the reveal hasn't armed. Set in the same mono at the
	   same size as the names on the chart, because it is one of them, read out in a
	   sentence. Not keyed on the focused actor: the sentence swaps in place as the
	   tour moves on, and re-running this animation every few seconds would flash. */
	.route {
		position: absolute;
		left: 0;
		right: 0;
		margin: 0;
		padding: 0 1rem;
		text-align: center;
		color: var(--color-fg);
		font-family: var(--font-mono);
		/* matches .node-label in ScrollyVisual */
		font-size: 11px;
		line-height: 1.2;
		/* the caption lies over the layout's tap regions; only the term inside it
		   is meant to catch a click */
		pointer-events: none;
		/* a pointer-events:none overlay whose children opt in can be lifted over
		   the tap gutters for free — same idiom as .hits and .quiz */
		z-index: var(--z-tap-above);
		animation: panel-in 0.4s ease both;
	}

	.route :global(.bits-infoterm) {
		pointer-events: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.route {
			animation: none;
		}
	}

	/* A chapter card's title, centred in the field's own box (height set inline
	   off plotBottom) rather than the canvas's, so it sits inside the universe
	   drifting behind it rather than half below it. Nothing here is interactive
	   and the canvas underneath may carry a layout's `hits`, so the whole layer
	   stays out of the way of taps. */
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

	.scrolly-steps {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
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
</style>

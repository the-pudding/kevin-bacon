<script>
	// @ts-check
	import { setContext, onMount } from "svelte";
	import Wizard from "$components/helpers/Wizard.svelte";
	import ScrollyVisual from "$components/scrolly/ScrollyVisual.svelte";
	import Step from "$components/scrolly/Step.svelte";
	import GuessRank from "$components/scrolly/GuessRank.svelte";
	import RankBars from "$components/scrolly/RankBars.svelte";
	import RaceScrubber from "$components/scrolly/RaceScrubber.svelte";
	import SimRunner from "$components/scrolly/SimRunner.svelte";
	import GenZMovers from "$components/scrolly/GenZMovers.svelte";
	import PairQuiz from "$components/scrolly/PairQuiz.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
	import urlParams from "$utils/urlParams.js";
	import { story } from "$components/scrolly/story.svelte.js";
	import { routesTo, routeSummary } from "$components/scrolly/intro-routes.js";

	const STEP_PARAM = "step";
	const isRankState = (s) => s === "rankFocus" || s === "rankReveal";
	const isQuizState = (s) => s === "scatterQuiz";

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

	/**
	 * Filled by each <Step> as it mounts, in document order — the single source
	 * of truth mapping step index → visual state (+ per-step params, plus an
	 * optional `panel` snippet rendered over the canvas while the step is
	 * active).
	 * @type {{ state: import("$components/scrolly/states.js").VisualState, params?: Object, panel?: import("svelte").Snippet }[]}
	 */
	const stepConfigs = $state([]);

	/** @type {{ register: (state: import("$components/scrolly/states.js").VisualState, params?: Object, panel?: import("svelte").Snippet) => number, current: number|undefined, advance: () => void }} */
	const scrollySteps = {
		register: (state, params, panel) =>
			stepConfigs.push({ state, params, panel }) - 1,
		get current() {
			return value;
		},
		advance: () => {
			if (value < stepConfigs.length - 1) value += 1;
		}
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
	// set by navigate(): true only for the forward step out of the rank chapter
	// into raceRecent, the one arrival the collapse belongs to
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

	$effect(() => {
		urlParams.set(STEP_PARAM, value);
	});

	// Runs before `value` changes, so state the destination step's own components
	// read at mount is already correct — PairQuiz decides whether to ask from
	// story.quizRevealed as it mounts, and a post-render $effect would leave it
	// painting the blurred question for a frame before being told not to.
	function navigate(to) {
		// arriving at the quiz backwards means the reader has already been through
		// it, so reveal every pair instead of re-asking (whether they answered or
		// skipped — see story.svelte.js). Arriving forwards re-arms the question.
		if (isQuizState(stepConfigs[to]?.state)) story.quizRevealed = to < value;
		// the rank panel only carries over into raceRecent when the reader actually
		// walks there out of the rank chapter — that is the one arrival whose bars
		// collapse into the chart's dots. Reloading straight onto raceRecent, or
		// stepping back to it from raceTrades, must not flash the list up over a
		// chart that is already drawn.
		rankHandoff =
			stepConfigs[to]?.state === "raceRecent" && isRankState(currentState);
	}

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
			<div class="scrolly-visual">
				<ScrollyVisual
					bind:this={visual}
					state={stepConfigs[value ?? 0]?.state}
					params={stepConfigs[value ?? 0]?.params}
					{coldStart}
					{stepsHeight}
				/>
				<!-- the active step's over-canvas panel, if it declared one — the
				     markup lives next to the <Step> that owns it -->
				{@render stepConfigs[value ?? 0]?.panel?.()}
				<!-- dev-only y-band tuner. Mounted outside stepConfigs so it spans the
				     whole race chapter (raceTrades declares no panel of its own) and
				     keeps its table installed across step changes; it renders nothing
				     until story.raceCam exists, i.e. off the race chapter. -->
				{#if raceYBandDev}
					<raceYBandDev.default />
				{/if}
			</div>
			<div class="scrolly-steps" bind:clientHeight={stepsHeight}>
				<!-- shared over-canvas panels live here, NOT inside <Wizard> — a
				     snippet declared directly inside a component's tags becomes a
				     prop of that component (that's how single-step panels nest
				     inside <Step> directly). Both rank steps AND raceRecent reference
				     this one snippet so RankBars survives the step change without
				     remounting — raceRecent is where its bars collapse into the race
				     chart's own dots, and it stands the whole overlay down (background
				     included) the moment the canvas has them (story.rankCollapsed). -->
				{#snippet rankPanel()}
					{#if showRankPanel}
						<!-- `reveal` stays on through the handoff step: it is what puts SLJ
						     in focus, so dropping it on raceRecent would send the focus row
						     back to the reader's guess and re-hide every other name at the
						     exact moment the bars collapse -->
						<div class="rank-bars-panel" style="bottom: {rankPanelBottom}px">
							<RankBars
								reveal={currentState === "rankReveal" ||
									currentState === "raceRecent"}
								collapse={currentState === "raceRecent"}
							/>
						</div>
					{/if}
				{/snippet}
				<!-- raceFull pan control: drag surface + year slider over the plot. Only
				     raceFull gets it — the first two race steps are carried by their own
				     camera choreography, so they need no control of their own. Renders
				     nothing on a viewport wide enough to show the whole range. -->
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
				<!-- simulation race: the Start/Replay button over the plot. Keep this
				     step's card unconditional — its height is what the panel's `bottom`
				     is measured from, so anything that unmounts mid-run would move the
				     button under the reader's finger. The chart rests at zero runs
				     until Start; nothing here gates Next. -->
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
				<Wizard bind:value count={stepConfigs.length} onnavigate={navigate}>
					<!-- PRESENT -->
					<Step state="lone">
						<p>
							The "Six Degrees of Kevin Bacon" is a game where players try to
							connect an actor to Kevin Bacon via movies they've starred in with
							other Hollywood actors, aiming to reach him in six movies or less.
						</p>
					</Step>
					<Step state="networkIntro">
						<!-- The tap affordance, and the picked actor's route once there is
						     one: one slot, directly under the graph it belongs to and above
						     the narrative. The network itself finishes growing back on the
						     `lone` step, so actors are already tappable as soon as this step
						     is reached (see layouts/intro.js).

						     The route reads as prose in the card rather than as a caption on
						     the canvas: it runs to several sentences for an actor with more
						     than one route, and a canvas note can't know how tall this card
						     is, so on a short viewport it landed on top of this text. Here it
						     just makes the card taller, which the fixed-height canvas doesn't
						     feel. -->
						{#if story.settled === "networkIntro"}
							{#if story.introFocus == null}
								<p class="hint">Tap any actor to trace their route to Bacon.</p>
							{:else}
								{@const route = routeSummary(
									story.introFocus,
									routesTo(story.introFocus)
								)}
								<p class="route">
									<strong>{route.headline}.</strong>
									{route.detail}
								</p>
							{/if}
						{/if}
						<p>
							The intuition is that Kevin Bacon is so prolific and well-known
							that the game is a lot easier than if it were called the "Six
							Degrees of John Doe", implying he's some sort of all-encompassing
							center of Hollywood.
						</p>
					</Step>
					<Step state="hopSeed">
						<!-- The copy lands over the constellation pulling back: the network
						     Bacon is in the middle of shrinks to a small thing as the line
						     says he isn't the centre of Hollywood (see layouts/hop-bands.js).
						     The bands' crowd is already parked behind it, invisible. -->
						<p>
							However, Kevin Bacon is <b>not</b> the center of Hollywood. Not
							only that, he <b>never has been</b>, and almost certainly
							<b>never will</b>.
						</p>
					</Step>
					<Step state="hopBands">
						<p>
							No doubt, he's well connected. You can get from any Hollywood
							actor to Kevin Bacon in four movies or less.
						</p>
						<p>
							The reality is that Kevin Bacon isn't special in this respect;
							there are 16,429 actors who can be reached by everyone within 4
							movies. A more meaningful measure of Hollywood connectivity is how
							many movies on average it takes to get to them i.e. <i
								>average distance</i
							>.
						</p>
					</Step>
					<Step state="rankFocus" panel={rankPanel}>
						<div class="rank-focus-text">
							<p>
								As of 2026, I can tell you that Kevin Bacon ranks #175 of all
								Hollywood actors based on average distance. Can you guess who #1
								is?
							</p>
							<GuessRank />
						</div>
					</Step>
					<Step state="rankReveal" panel={rankPanel}>
						<p>
							Yes, Samuel L. Jackson is the <i>center of Hollywood</i>. You can
							get to him in an average distance of just 2.09. Willem Dafoe is
							second, Robert De Niro third. Female actors are under-represented
							here, occupying only 16 of the top 100 most connected actors.
							Nicole Kidman is the first female in at #21.
						</p>
					</Step>

					<!-- PAST -->
					<!-- keeps the rank panel mounted for one more step: its bars collapse
					     into this chart's dots, then hand them to the canvas -->
					<Step state="raceRecent" panel={rankPanel}>
						<p>
							Samuel L. Jackson has been the center of Hollywood since 2006,
							taking over from Gene Hackman.
						</p>
					</Step>
					<Step state="raceTrades">
						<p>
							Before then, the crown changed heads frequently, with Frank
							Welker, Robert De Niro and Gene Hackman fighting over top spot for
							the previous decade.
						</p>
					</Step>
					<Step state="raceFull" panel={racePanel}>
						<p>
							Repeating this all the way back gives us a timeline of every
							center since 1970. Note that no female actor has ever been the
							center; the closest we've ever come was Susan Sarandon in at #9 in
							2012.
						</p>
					</Step>

					<!-- FUTURE -->
					<Step state="raceFull" panel={racePanel}>
						<p>
							Now imagine us taking this into the future. How might we predict
							who will take the crown from Samuel L. Jackson?
						</p>

						<p>
							To do that, we need to find what moves an actor towards the
							center.
						</p>
					</Step>
					<Step state="scatterCenters" params={{ showFilms: true }}>
						<p>
							The obvious one is film count. More films means closer to the
							center. Indeed, Samuel L. Jackson has been in far more films than
							anyone else, 20 more than Nicolas Cage who's next closest.
						</p>
					</Step>
					<Step state="scatterCenters" params={{ showPair: true }}>
						<p>
							The relationship between film count and average distance is
							strong, but it doesn't explain it fully. Two actors can have the
							same film counts but very different average distances. For
							example, Natalie Portman and Anna Kendrick are shown here at the
							two extremes of the data.
						</p>
					</Step>
					<Step state="scatterCenters" params={{ showPair: true }}>
						<p>
							So what's different about them? Put simply: better costars.
							Natalie Portman stars with more "big dogs" than Anna Kendrick.
							They say in Hollywood "It's not what you know, it's who you know",
							and it seems this is also true when explaining an actor's average
							distance.
						</p>
					</Step>
					<Step
						state="scatterCenters"
						params={{ showPair: true, showCostars: true }}
					>
						<p>
							For example, of the 250 most-connected actors from earlier,
							Natalie Portman has worked almost three times as many.
						</p>
					</Step>
					<Step
						state="scatterCenters"
						params={{ showPair: true, showCostars: true }}
					>
						<p>
							It would be too circular to use costars with low average distance
							as our measure. That's like saying "We think the most expensive
							houses will be the ones with the highest price".
						</p>
					</Step>
					<Step state="degScatter">
						<p>
							Instead we use the costar film count as a sort of proxy.
							Concretely, this is an actor's 50 most prolific costars by number
							of films, taken as an average. If you work with more "big dog"
							actors compared to someone with the same film count, you'll almost
							definitely be closer to the center of Hollywood than them.
						</p>
					</Step>
					<Step state="scatterQuiz" panel={quizPanel}>
						<p>
							Now we've got our two signals, we can test our knowledge with a
							few more examples. For these actors with very similar film counts,
							who do you think works with more "big dogs" and is therefore
							closer to the center?
						</p>
					</Step>
					<Step state="scatterGenZ">
						<p>
							We now have everything we need to predict Gen Z's Kevin Bacon
							using film count and costar data. Our contenders are actors born
							since 1997 that have been in at least 5 films.
						</p>
					</Step>
					<Step state="scatterGenZ">
						<p>
							To predict future average distance we need to model their
							trajectory by stating what we think their film count and costar
							data will look like at a certain point in time. To do this, we
							look at what has happened to actors with similar stats in the
							past.
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
							This means that whatever actor we use to model a Gen Z's film
							trajectory can massively impact the results. For each actor, we
							consider similar actors based on proximity to them, and randomly
							select one weighted by how close they are.
						</p>
					</Step>
					<Step state="careerMany">
						<p>
							Costar data is a lot simpler, since it stabilises for actors once
							they reach career age ~10. For this, we add an adjustment so that
							well-connected Gen Z actors continue being relatively
							well-connected when modelled into the future.
						</p>
					</Step>
					<Step state="simRace" panel={simPanel}>
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
							landslide: her median average distance is 2.19 with a median
							projected film count of 66, quite far away from Samuel L.
							Jackson's stratospheric numbers.
						</p>
					</Step>
					<Step state="simRace">
						<p>
							From our historical analysis you'll recall lines dropping off as
							actors stop appearing in so many films. We're counting on this
							happening to Samuel L. Jackson, or a Marvel-sized cinematic
							universe being spawned again.
						</p>
					</Step>
					<!-- the list is a reading of the race chart it covers: the canvas does
					     not change for this step, the panel simply fades over it and back
					     off again. simRace's replay is not re-armed by arriving here — it
					     only ever runs off SimRunner's nonce. -->
					<Step state="simRace" panel={moversPanel}>
						<p>
							Here are the full results, including how much they've moved their
							current position by average distance.
						</p>
						<p>Click on an actor to see their breakdown.</p>
					</Step>
					<!-- closes on an empty canvas: the chart dissolves where it stands
					     and the last words are left on their own. -->
					<Step state="outro">
						<p>
							What is far more certain is that the first female center of
							Hollywood is on the horizon, with 65% of the wins going to women,
							perhaps not for a few years yet though.
						</p>
					</Step>
				</Wizard>
			</div>
		</div>
	</section>
</svelte:boundary>

<style>
	#scrolly {
		max-width: 700px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.scrolly-layout {
		position: relative;
		height: var(--viewport-height);
	}

	/* Full-height, stable canvas: its size must NOT track the step text height,
	   or a step change resizes the canvas and ScrollyVisual jumps (instant, no
	   reveal) instead of tweening. Step text + nav overlay the bottom, where the
	   layouts already keep clear. */
	.scrolly-visual {
		position: absolute;
		inset: 0;
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

	/* step-1 tap affordance, and the route it describes once one is picked: both
	   appear with the interaction, so neither invites a tap the reveal hasn't
	   armed yet. Mono, like the names on the chart it is reading out, so it reads
	   as part of the graph rather than as narrative prose. */
	.hint,
	.route {
		font-family: var(--font-mono);
		font-size: var(--14px, 14px);
		animation: panel-in 0.4s ease both;
	}

	.hint {
		color: var(--color-fg-light);
	}

	.route {
		color: var(--color-fg);
	}

	@media (prefers-reduced-motion: reduce) {
		.hint,
		.route {
			animation: none;
		}
	}

	.scrolly-steps {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
	}
</style>

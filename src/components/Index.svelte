<script>
	// @ts-check
	import { setContext, onMount } from "svelte";
	import Wizard from "$components/helpers/Wizard.svelte";
	import ScrollyVisual from "$components/scrolly/ScrollyVisual.svelte";
	import Step from "$components/scrolly/Step.svelte";
	import GuessRank from "$components/scrolly/GuessRank.svelte";
	import RankBars from "$components/scrolly/RankBars.svelte";
	import RaceScrubber from "$components/scrolly/RaceScrubber.svelte";
	import PairQuiz from "$components/scrolly/PairQuiz.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
	import urlParams from "$utils/urlParams.js";
	import { story } from "$components/scrolly/story.svelte.js";

	const STEP_PARAM = "step";
	const isRankState = (s) => s === "rankFocus" || s === "rankReveal";

	// current step lives in the URL query (?step=N) so each tab keeps its own
	// place across refreshes independently — unlike localStorage, which is
	// shared across every tab on the origin
	function readStep() {
		if (typeof window === "undefined") return null;
		const n = parseInt(urlParams.get(STEP_PARAM), 10);
		return Number.isInteger(n) ? n : null;
	}

	let value = $state(0);
	// true only when a saved step from a prior visit exists, so this render
	// isn't the reader's first-ever view — read synchronously (not in onMount)
	// so it's already correct by the time ScrollyVisual's first paint effect
	// runs; onMount fires too late, after that effect has already committed to
	// the `lone`-authored pop-in. ScrollyVisual uses this to skip that pop-in,
	// which would otherwise replay (and be misread as an empty chart) on every
	// refresh regardless of which step it lands on
	const restoredStep = readStep();
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

	onMount(() => {
		if (
			restoredStep !== null &&
			restoredStep > 0 &&
			restoredStep < stepConfigs.length
		) {
			value = restoredStep;
		}
	});

	$effect(() => {
		urlParams.set(STEP_PARAM, value);
	});

	let prevValue = 0;
	$effect(() => {
		const state = stepConfigs[value]?.state;
		const prevState = stepConfigs[prevValue]?.state;
		// stepping back out of the rank chapter resets the guess, so returning
		// to it later starts the guessing game fresh instead of picking up
		// where the reader left off (guessed, or already seeing the reveal)
		if (value < prevValue && isRankState(prevState) && !isRankState(state)) {
			story.rankGuess = null;
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
			</div>
			<div class="scrolly-steps" bind:clientHeight={stepsHeight}>
				<!-- shared over-canvas panels live here, NOT inside <Wizard> — a
				     snippet declared directly inside a component's tags becomes a
				     prop of that component (that's how single-step panels nest
				     inside <Step> directly). Both rank steps reference this one
				     snippet so RankBars survives the step change without remounting. -->
				{#snippet rankPanel()}
					<div class="rank-bars-panel" style="bottom: {stepsHeight + 12}px">
						<RankBars reveal={currentState === "rankReveal"} />
					</div>
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
				<Wizard bind:value count={stepConfigs.length}>
					<!-- PRESENT -->
					<Step state="lone">
						<p>
							The "Six Degrees of Kevin Bacon" is a game where players try to
							connect an actor to Kevin Bacon via movies they've starred in with
							other Hollywood actors, aiming to reach him in six movies or less.
						</p>
					</Step>
					<Step state="networkIntro">
						<p>
							The intuition is that Kevin Bacon is so prolific and well-known
							that the game is a lot easier than if it were called the "Six
							Degrees of John Doe". This idea implies that Kevin Bacon is this
							all-encompassing center of Hollywood.
						</p>
					</Step>
					<Step state="hopSeed">
						<p>
							However, Kevin Bacon is <b>not</b> the center of hollywood. Not
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
					<Step state="raceRecent">
						<p>
							Samuel L. Jackson has been the center of hollywood since 2006,
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
							who will take the crown from Samuel L. Jackson? To do that, we
							need to find what moves an actor towards the center.
						</p>
					</Step>
					<Step state="scatterCenters">
						<p>
							The obvious one is film count. More films means closer to the
							center. Indeed, Samuel L. Jackson has been in far more films than
							anyone else, 20 more than Nicolas Cage who's next closest.
						</p>
					</Step>
					<Step state="scatterCenters">
						<p>
							The relationship between film count and average distance is
							strong, but it doesn't explain it fully. Two actors can have the
							same film counts but very different average distances. For
							example, Natalie Portman and Anna Kendrick are shown here at the
							two extremes of the data.
						</p>
					</Step>
					<Step state="scatterCenters">
						<p>
							So what's different about them? Put simply: better costars.
							Natalie Portman stars with more "big dogs" than Anna Kendrick.
							They say in hollywood "It's not what you know, it's who you know",
							and it seems that is also true of explaining an actor's average
							distance.
						</p>
					</Step>
					<Step state="scatterCenters">
						<p>
							Using our most central actors from earlier, we can see that
							Natalie Portman has worked with almost three times more of them
							than Anna Kendrick.
						</p>
					</Step>
					<Step state="degScatter">
						<p>
							It would be too circular to use costars with low average distance
							as our measure. That's like saying "We think the most expensive
							houses will be the ones with the highest price". Instead we use
							the costar film count as a sort of proxy. Concretely, this is an
							actor's 50 most prolific costars by number of films, taken as an
							average. If you work with more "big dog" actors compared to
							someone with the same film count, you'll almost definitely be
							closer to the center of hollywood than them.
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
							We now have everything we need to predict an actor's current
							average distance using film count and costar data. To predict
							future average distance we need to model their trajectory by
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
							career totalling 87. Conversely, Chevy Chase reached the same
							milestone at the same point — and only ever appeared in 27.
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
					<Step state="winBars">
						<p>
							To achieve a stable result, we'll run the simulation 10,000 times
							and see who comes out on top.
						</p>
					</Step>
					<Step state="sljFan">
						<p>
							Here's what we think will happen to each Gen Z actor's average
							distance. You'll notice that none of them overtake Samuel L.
							Jackson. From our historical analysis you'll recall lines dropping
							off as actors stop appearing in so many films. We're counting on
							this happening to Samuel L. Jackson, or a Marvel-sized cinematic
							universe being spawned again.
						</p>
					</Step>
					<Step state="sljFan">
						<p>
							What I can tell you is that our first female center of hollywood
							is very likely to happen next, with 65% of the wins going to
							women, perhaps not for a few years yet though.
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
	   background from hiding the hopBands → rankFocus canvas tween — the
	   dissolve gets ~TWEEN_MS to read before the list covers that area. */
	.rank-bars-panel {
		position: absolute;
		top: 84px;
		left: 0;
		right: 0;
		background: var(--color-bg);
		animation: panel-in 0.4s ease 0.55s both;
	}

	@keyframes panel-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
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
		animation: panel-in 0.5s ease 1.1s both;
	}

	@media (prefers-reduced-motion: reduce) {
		.rank-bars-panel,
		.rank-focus-text {
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

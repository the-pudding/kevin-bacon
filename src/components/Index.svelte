<script>
	// @ts-check
	import { setContext, onMount } from "svelte";
	import Wizard from "$components/helpers/Wizard.svelte";
	import ScrollyVisual from "$components/scrolly/ScrollyVisual.svelte";
	import Step from "$components/scrolly/Step.svelte";
	import GuessRank from "$components/scrolly/GuessRank.svelte";
	import PairQuiz from "$components/scrolly/PairQuiz.svelte";
	import PredictToggles from "$components/scrolly/PredictToggles.svelte";
	import BarPicker from "$components/scrolly/BarPicker.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
	import localStorage from "$utils/localStorage.js";

	const STEP_STORAGE_KEY = "kb-step";

	let value = $state(0);
	let dimensions = new useWindowDimensions();

	/**
	 * Filled by each <Step> as it mounts, in document order — the single source
	 * of truth mapping step index → visual state (+ future per-step params).
	 * `ready === false` marks a step whose visual isn't finished: in a
	 * production build its ScrollyVisual is swapped for a "visuals tbd"
	 * placeholder (dev always shows the real visual).
	 * @type {{ state: import("$components/scrolly/states.js").VisualState, params?: Object, ready?: boolean }[]}
	 */
	const stepConfigs = $state([]);

	/** @type {{ register: (state: import("$components/scrolly/states.js").VisualState, params?: Object, ready?: boolean) => number, current: number|undefined, mode: string }} */
	const scrollySteps = {
		register: (state, params, ready) =>
			stepConfigs.push({ state, params, ready }) - 1,
		get current() {
			return value;
		},
		mode: "wizard"
	};
	setContext("scrolly-steps", scrollySteps);

	// unfinished visuals show a placeholder in the deployed build only; local
	// dev keeps rendering the real ScrollyVisual so they stay editable
	const showTbd = $derived(
		!import.meta.env.DEV && stepConfigs[value ?? 0]?.ready === false
	);

	onMount(() => {
		const saved = localStorage.get(STEP_STORAGE_KEY);
		if (typeof saved === "number" && saved > 0 && saved < stepConfigs.length) {
			value = saved;
		}
	});

	$effect(() => {
		localStorage.set(STEP_STORAGE_KEY, value);
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
					state={stepConfigs[value ?? 0]?.state}
					params={stepConfigs[value ?? 0]?.params}
				/>
				{#if showTbd}
					<div class="visual-tbd">
						<p>visuals tbd</p>
					</div>
				{/if}
			</div>
			<div class="scrolly-steps">
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
							The intuition is that Kevin Bacon is so prolific, genre-spanning,
							and timeless that the game is a lot easier than if it were called
							the "Six Degrees of John Doe". This idea implies that Kevin Bacon
							is this all-encompassing center of Hollywood.
						</p>
					</Step>
					<Step state="hopSeed">
						<p>
							However, Kevin Bacon is <b>not</b> the center of hollywood. Not
							only that, he <b>never has been</b>, and almost certainly
							<b>never will</b>.
						</p>
					</Step>
					<Step state="hopBands" ready={false}>
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
					<Step state="rankFocus" ready={false}>
						<p>
							As of 2026, I can tell you that Kevin Bacon ranks #175 of all
							Hollywood actors based on average distance. Can you guess who #1
							is?
						</p>
						<GuessRank />
					</Step>
					<Step state="rankReveal" ready={false}>
						<p>
							Yes, Samuel L. Jackson is the <i>center of Hollywood</i>. You can
							get to him in an average distance of just 2.09. Willem Dafoe is
							second, Robert De Niro third.
						</p>
					</Step>

					<!-- PAST -->
					<Step state="raceRecent" ready={false}>
						<p>
							Samuel L. Jackson has been the center of hollywood since 2006,
							taking over from Gene Hackman.
						</p>
					</Step>
					<Step state="raceTrades" ready={false}>
						<p>
							Before then, the crown changed hands frequently. Gene Hackman and
							Robert De Niro fighting over top spot for half a decade.
						</p>
					</Step>
					<Step state="raceFull" ready={false}>
						<p>
							Repeating this process, we can go all the way back to 1970 to
							create a timeline of centers from when we started recording this
							data.
						</p>
					</Step>

					<Step state="scatterCenters" ready={false}>
						<p>
							As you just learned, Samuel L. Jackson has been dominating
							Hollywood by his sheer prolificacy since 2006. His reign has
							lasted 5 times longer than anyone else. But what makes an anchor
							the center? You can see from the results that Samuel L. Jackson
							has been in by far the most films, 20 more than Nicholas Cage
							who's next closest. Indeed, film count correlates heavily with
							average distance. Is film count the only signal though? What else
							could we use to accurately predict an actor's average distance?
						</p>
					</Step>
					<Step state="scatterCenters" ready={false}>
						<p>
							Just because you're in loads of films doesn't necessarily mean
							you've got a lot of connections in the graph. And just because
							you've got a lot of connections in the graph, doesn't mean you've
							got the <i>right</i> connections to make you the center of Hollywood.
						</p>
					</Step>
					<Step state="scatterWalters" ready={false}>
						<p>
							Dame Julie Walters under-performs drastically on average distance.
							In this respect, she's got two things going against her:
							<br />
							1. She's <i>franchise-heavy</i>: Harry Potter, Paddington, Mamma
							Mia to name a few. This means she works with the same actors
							repeatedly. In fact, almost half of the films she's in are part of
							a franchise.
							<br />
							2. She works in <i>largely British ensembles</i>, containing
							less-connected actors from a pure Hollywood perspective. She needs
							to rely on well-connected costars like Gary Oldman (#18th), Nicole
							Kidman (#21st) and Meryl Streep (#27th) to bring that average
							distance down for her.
						</p>
					</Step>
					<Step state="scatterQuiz" ready={false}>
						<p>
							Let's generalise this idea into two hypotheses:
							<br />
							1. Starring with the <i>same</i> people.
							<br />
							2. Starring with the <i>right</i> people.
							<br />
							Consider these actors. Intuitively, who in each pair do you think has
							the lower average distance?
						</p>
						<PairQuiz />
					</Step>
					<Step state="scatterQuiz" ready={false}>
						<p>
							Seth Rogen and Charlize Theron are in similar numbers of films -
							they even costarred in "Long Shot". However, Charlize Theron tends
							to work with actors she's not worked with before. Conversely, Seth
							Rogen repeatedly works with the same actors. For example, Jonah
							Hill is in 8 of his films.
						</p>
					</Step>
					<Step state="concurrenceScatter" ready={false}>
						<p>
							<i>Concurrency</i> is a measure of how frequently you work with the
							same actors. Seth Rogen having a concurrency of 0.28 means that for
							each of his films, he would have worked with 28% of the cast before.
						</p>
					</Step>
					<Step state="concurrenceScatter" ready={false}>
						<p>
							If your concurrency is low, you work for the first time with
							actors more often. This means you create more connections in the
							graph and it will take you fewer films to get your average
							distance down.
						</p>
					</Step>
					<Step state="concurrenceScatter" ready={false}>
						<p>
							If you starred in one film with Samuel L Jackson and him alone,
							you would immediately have an average distance of 3.08, putting
							you in the top 75% of hollywood.
						</p>
					</Step>
					<Step state="concurrenceScatter" ready={false}>
						<p>
							Due to its circular nature, we can't use "low costar average
							distance" as a signal for explaining someone's average distance.
							We can however use how many connections their costars have in the
							graph i.e their costars' <i>degree</i>.
						</p>
					</Step>
					<Step state="degScatter" ready={false}>
						<p>
							Here's the same graph, but measuring the average degree of their
							top 50 costars.
						</p>
					</Step>

					<!-- FUTURE -->
					<Step state="predictionScatter" ready={false}>
						<p>
							So both of our hypotheses hold up against our example pairs. These
							two new pieces of information can be used to explain why two
							actors with similar numbers of films can have such different
							average distances. Combining all three pieces of information
							allows us to predict an actor's mean average distance much more
							accurately.
						</p>
						<PredictToggles />
					</Step>
					<Step state="scatterGenZ" ready={false}>
						<p>
							Now, Samuel L. Jackson can't be the center forever. At some point,
							someone must overtake him. Which Gen Z actor do we think is going
							to do that? The Gen Z actor with the current lowest average
							distance is Chloë Grace Moretz. However, we know that's not all we
							need to have confidence in simply saying she's Gen Z's Kevin
							Bacon.
						</p>
					</Step>
					<Step state="scatterGenZ" ready={false}>
						<p>
							Using all the data we have, we can model an actor's career by
							looking at what has happened to actors with similar stats in the
							past.
						</p>
					</Step>
					<Step state="careerTrio" ready={false}>
						<p>
							Take Sydney Sweeney. She's been in 16 films since her debut 15
							years ago. At the same point in their career, Robert De Niro had
							also racked up 16 films — and went on to a brilliant career
							totalling 87. Conversely, Chevy Chase reached the same milestone
							in the same time — and only ever appeared in 27.
						</p>
					</Step>
					<Step state="careerMany" ready={false}>
						<p>
							This means that whatever actor we use to model a Gen Z's career
							trajectory can massively impact the results. For each actor, we
							consider similar actors based on proximity to them, and randomly
							select one weighted by how close they are. To minimize the noise,
							we'll run this simulation 10,000 times and see who comes out on
							top.
						</p>
					</Step>
					<Step state="winBars" ready={false}>
						<p>
							Indeed, Chloë Grace Moretz wins in a quarter of simulations. She
							doesn't exactly have a clear majority, despite already being
							well-clear of these people from an average distance perspective.
						</p>
						<BarPicker />
					</Step>
					<Step state="sljFan" ready={false}>
						<p>
							On average, the winning score is 2.33, nowhere near SLJ's current
							average distance. We're counting on SLJ's average distance getting
							worse as he stops appearing in movies, or a Marvel-sized cinematic
							universe being spawned again.
						</p>
					</Step>
					<Step state="sljFan" ready={false}>
						<p>
							What I can tell you is that our first female center of hollywood
							is very likely to happen next, with 77% of the wins going to
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

	/* covers the in-progress ScrollyVisual for steps flagged not-ready in a
	   production build (see showTbd) */
	.visual-tbd {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
	}

	.visual-tbd p {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--color-gray-500, #888);
	}

	.scrolly-steps {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
	}
</style>

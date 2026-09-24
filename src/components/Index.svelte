<script>
	// @ts-check
	import { setContext } from "svelte";
	import Stage from "$components/scrolly/Stage.svelte";
	import Step from "$components/scrolly/Step.svelte";
	import Chapter from "$components/scrolly/Chapter.svelte";
	import Splash from "$components/scrolly/Splash.svelte";
	import GuessRank, { skipGuess } from "$components/scrolly/GuessRank.svelte";
	import RaceScrubber from "$components/scrolly/RaceScrubber.svelte";
	import StartButton from "$components/scrolly/StartButton.svelte";
	import PairQuiz from "$components/scrolly/PairQuiz.svelte";
	import ActorSearch from "$components/scrolly/ActorSearch.svelte";
	import QuizResults from "$components/results/QuizResults.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
	import { story, request } from "$components/scrolly/story.svelte.js";
	import { quizDone } from "$components/scrolly/states.js";
	import { createStepRegistry } from "$components/scrolly/step-registry.svelte.js";
	import { prepareArrival } from "$components/scrolly/arrivals.js";
	import { resetHopAnchor } from "$components/scrolly/story.svelte.js";
	import { routeSummary } from "$components/scrolly/intro-routes.js";
	import { SEARCH_POOL } from "$components/scrolly/search.js";
	import { HOP_CYCLE_IDS } from "$components/scrolly/cast.js";
	import {
		CYCLE_ORDER,
		introBottom
	} from "$components/scrolly/layouts/intro.js";
	import RouteFilms from "$components/scrolly/RouteFilms.svelte";
	import InfoTerm from "$components/ui/InfoTerm.svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { fly } from "svelte/transition";
	import { linear } from "svelte/easing";

	// A gate that never opens: the step's own control is the way forward, and
	// the reader's Next presses it for them (the step's `onnext`).
	const NEVER = () => false;

	// Which chart the reader's named actor is being asked about, for the search's
	// analytics (`recordActorSearch`). Keyed by CHART rather than by state, which
	// is why three states share "career" and two share "remoteness": the question
	// the reader is answering is "where am I on this chart", and `careerTrio`,
	// `careerBacon` and `careerMany` are one scene drawing one chart (see
	// layouts/career.js), as are `scatterCenters` and `scatterQuiz` — both titled
	// "Films vs. remoteness". Splitting them would make the numbers say the
	// reader searched four different things when they searched one.
	//
	// Read off the active state rather than passed per mount, so every step can
	// share ONE panel snippet — which is what keeps the control mounted across
	// the runs of adjacent steps (15 → 19 is five of them).
	const SEARCH_CHARTS = {
		hopAnchor: "hops",
		scatterCenters: "remoteness",
		scatterQuiz: "remoteness",
		degScatter: "costars",
		careerTrio: "career",
		careerBacon: "career",
		careerMany: "career"
	};

	/**
	 * A pick on the hop chart: the named actor takes the top of the stack, and
	 * the chip the control is flying is what ARRIVES there — so the dot leaves
	 * the crowd unseen (`conceal`) and holds the seat invisible until the chip
	 * lands on it. Skipped when the reader names the actor already standing at
	 * the top: that dot is already in the seat, so there is nothing to cross the
	 * canvas and concealing it would be a big black dot popping out of a chart
	 * that is otherwise not changing.
	 */
	function anchorPick(visual, id) {
		if (id !== story.hops.anchorId) visual?.conceal?.(id);
		story.hops.anchorId = id;
		story.hops.pinned = true;
		story.hops.arriving = true;
	}

	// The step registry (the wizard) and the arrival rules that prepare the
	// story for each destination step. Created here so it is the one instance
	// every <Step>, TapNav and StepProgress reads from the context.
	const steps = createStepRegistry({ navigate: prepareArrival });
	setContext("scrolly-steps", steps);

	// What each Start press does — the button's, and the reader's Next on the
	// same step (its `onnext`), which is the same press made for them. The
	// rewind brings the step that reads it out forward with it; the other two
	// carry the reader on when they land (`advanceon`).
	const rewind = () => {
		request("rewind");
		steps.advance();
	};
	const drawGenz = () => request("genzLines");
	const runSim = () => request("run");
	let dimensions = new useWindowDimensions();

	// --- the constellation's tour of the network ---
	// The step demonstrates the game rather than waiting to be asked: it picks each
	// actor out in turn and the caption reads their distance to Bacon, so a reader
	// who never taps still sees what "two movies away" means. A tap takes it over
	// (story.intro.pinned, set by the state's `pick` — see layouts/intro.js).
	//
	// It is the last beat of step 0 — the two layers finish growing, the
	// constellation rests for INTRO_DWELL_MS, and then the first route lights —
	// and it simply carries on across the step change into step 1, which is the
	// same state with different words.
	//
	// TOUR_MS is step 6's beat as well: both are one line of chart to read. Step
	// 6 answers a store write with the 450ms param tween (PARAM_TWEEN_MS in
	// ScrollyVisual); here the old route fades for 400ms, the bare network
	// holds for 350ms and the new one walks in to Bacon at 700ms a movie
	// (routeWalk in layouts/intro.js), so a two-movie route takes 2.15s of it.
	const TOUR_MS = 3400; // ~1.25-1.95s to read, after the route has walked in
	// The beat the whole constellation gets before anything is picked out of it.
	// The network has just finished drawing itself and the step's paragraph has
	// just landed; lighting a route straight away asks the reader to follow a
	// third thing before they have read either. Shorter than a turn, because this
	// is a pause in one step rather than a turn showing nobody.
	const INTRO_DWELL_MS = 2000;
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false
	);

	const introRoute = $derived(
		story.intro.focus == null ? null : routeSummary(story.intro.focus)
	);
	// how tall the caption ended up — one line on a wide viewport, two on a phone —
	// so the clamp that keeps it off the step card knows what it is clamping
	let routeHeight = $state(0);
	// The caption hangs a short gap under the constellation's lowest name, then is
	// clamped off the step card — which only binds on a viewport short enough that
	// the two would otherwise meet.
	const ROUTE_GAP = 12;
	/** @param {{ width: number, height: number, overlayHeight: number }} layout the stage's measurements */
	function routeTop({ width, height, overlayHeight }) {
		if (!width || !height) return 0;
		const floor = height - overlayHeight - routeHeight - ROUTE_GAP;
		return Math.min(introBottom(width, height) + ROUTE_GAP, floor);
	}
	// Gated on `settled`, which for this state means the walk is over: it is
	// written by ScrollyVisual's settle() at the END of the pop-in, i.e. the
	// instant the second layer of lines lands. Nothing should point at an actor
	// whose dot has not arrived. Because both steps share the state, it is still
	// true on the second one and the tour never pauses at the join.
	const touring = $derived(
		steps.state === "networkIntro" &&
			story.settled === "networkIntro" &&
			!story.intro.pinned
	);
	// Where the tour has got to. A plain `let`, not $state: the tour effect reads
	// it when it (re)starts and must not re-run because of it. Kept outside the
	// effect so releasing a pick carries on from the actor the reader was looking
	// at instead of snapping back to the top of the order.
	// Index of the actor the tour will show next. A plain `let`, not $state: the
	// tour effect reads it when it (re)starts and must not re-run because of it.
	let tourNext = 0;
	const showNext = () => {
		story.intro.focus = CYCLE_ORDER[tourNext];
		tourNext = (tourNext + 1) % CYCLE_ORDER.length;
	};
	// Whoever is highlighted — by the tour or by the reader — is where the tour
	// carries on from, so it never snaps back to the top of the order.
	$effect(() => {
		const i =
			story.intro.focus == null ? -1 : CYCLE_ORDER.indexOf(story.intro.focus);
		if (i >= 0) tourNext = (i + 1) % CYCLE_ORDER.length;
	});
	let seenReleases = 0;
	$effect(() => {
		// Read so a tap that clears the highlight restarts this effect, and with it
		// the clock — `touring` alone doesn't change when the reader dismisses an
		// actor the tour was showing, so without this the next one would arrive on
		// the remainder of a turn they never saw start.
		//
		// This effect must NEVER read `story.intro.focus`, which showNext writes: a
		// tick would then invalidate the effect, re-run it, fire a second showNext
		// and restart the interval — the tour would skip an actor on every tap.
		const releases = story.intro.releases;
		const released = releases !== seenReleases;
		seenReleases = releases;
		if (!touring) return;
		// text that changes on its own is motion the reader didn't ask for: under
		// reduced motion the step rests where it is and waits for a tap
		if (reducedMotion.current) return;
		// Nobody is picked out straight away. On an arrival that is the dwell above
		// — the constellation has just finished drawing itself and has earned a
		// beat of being looked at whole. A tap that CLEARED the highlight means the
		// reader wants it cleared, so that gets a full turn of the neutral
		// constellation rather than an actor reselected out from under them.
		let turns;
		const first = setTimeout(
			() => {
				showNext();
				turns = setInterval(showNext, TOUR_MS);
			},
			released ? TOUR_MS : INTRO_DWELL_MS
		);
		return () => {
			clearTimeout(first);
			clearInterval(turns);
		};
	});

	// --- step 6's cycle of anchors ---
	// The same idea one chapter on, and deliberately the same shape: the step says
	// Kevin Bacon is not special in this respect, so the chart stops being about
	// him — the dot at the top and the rows under it are redrawn for one actor
	// after another, and "not special" is something the reader watches instead of
	// something they are told. The search takes it over (story.hops.pinned).
	//
	// Simpler than the tour in the two places the tour is complicated: there is no
	// tap surface on this chart, so nothing can release a pick out from under the
	// clock, and the arrival rule puts the cycle back to the top of the list every
	// time the reader walks in (resetHopAnchor), so it has no position to resume
	// from. What it keeps is the trap the tour documents at length: this effect
	// must never read the field showNextAnchor writes, or the write would
	// invalidate the effect, re-run it and skip an actor on every turn.
	// `steps.held` rather than `story.settled`: the rows sorting themselves into
	// the arriving actor's proportions is the thing the step is about, and the
	// cycle must not start over the top of that arrival.
	const cycling = $derived(
		steps.state === "hopAnchor" && !steps.held && !story.hops.pinned
	);
	// Written then advanced, the way the tour's showNext is: the step rests on
	// Bacon, who is not in the list, so the FIRST turn has to show the list's
	// first actor rather than its second.
	let anchorNext = 0;
	const showNextAnchor = () => {
		story.hops.anchorId = HOP_CYCLE_IDS[anchorNext];
		anchorNext = (anchorNext + 1) % HOP_CYCLE_IDS.length;
	};
	$effect(() => {
		if (!cycling) {
			anchorNext = 0;
			return;
		}
		// text and rows that change on their own are motion the reader didn't ask
		// for: under reduced motion the chart rests on Bacon and waits to be asked
		if (reducedMotion.current) return;
		// The first turn is not held for a beat. The step arrives on the chart the
		// step before it rests on — identical to the byte — so a held first turn is
		// three seconds of a picture the reader has just finished reading, and the
		// thing the step is actually for does not start until then. The tour holds
		// its own first turn for the opposite reason: its step arrives on something
		// the reader has not seen.
		showNextAnchor();
		const timer = setInterval(showNextAnchor, TOUR_MS);
		return () => clearInterval(timer);
	});
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<Stage {steps} {dimensions}>
		{#snippet children(layout)}
			<!-- shared over-canvas panels live here, beside the <Step>s rather
		     than inside one — a snippet declared directly inside a
		     component's tags becomes a prop of that component (that's how
		     single-step panels nest inside <Step> directly). The rank ladder
		     is NOT one of them: it spans the step change into raceRecent, so
		     Stage.svelte mounts it beside the canvas instead. -->
			<!-- raceFull pan control: drag surface + year slider over the plot. Only
		     raceFull gets it — the raceRecent steps are carried by their own
		     camera choreography, so they need no pan control of their own, and
		     raceFuture is a fixed camera by design (its copy asks the reader to
		     look at the empty future, not to go rummaging in the past; it also
		     reports its camera as fixed, so this would render nothing there
		     anyway). Renders nothing on a viewport wide enough to show the
		     whole range. -->
			<!-- The reader's own actor, on the three charts that can place one and on
		     every step that draws them (15-21, 25-27 — ten in all, which is every
		     step of the three charts bar none). Mounting it on the whole run
		     rather than on one step each means a reader who notices the glyph
		     late can still use it, and one who never does is never nagged. A panel
		     rather than a card control, which is the one place rule 1b parts
		     company with rule 1 — see ActorSearch.svelte for why being out of
		     the card is the point rather than a cost. Not gated and never
		     announced: the search is an easter egg, it holds nobody, and a
		     reader who never presses the glyph has missed nothing. The pick is
		     sticky, so the later charts find it already made (see
		     story.svelte.js's `search`). -->
			{#snippet searchPanel()}
				<ActorSearch
					visual={layout.visual}
					chart={SEARCH_CHARTS[steps.state]}
					pool={SEARCH_POOL}
					picked={story.search.actorId}
					onpick={(id) => (story.search.actorId = id)}
					onclear={() => (story.search.actorId = null)}
				/>
			{/snippet}
			<!-- The same control on step 6, asking a different question: who the hop
		     chart is drawn FOR. So the pool is the same SEARCH_POOL the other three
		     searches use — narrowed at build time to actors with an exported hop
		     breakdown (see search.js) — and a pick pins the cycle rather than
		     marking a dot in a crowd.
		     `picked` is null until they pin, so the Clear row appears only once
		     there is a decision of theirs to undo; while the cycle is running the
		     name under the reader's nose is the one on the canvas, and offering
		     to clear it would be offering to clear the step. Clearing puts the
		     chart back on Bacon with the cycle live, which is where the arrival
		     leaves it (resetHopAnchor). Deliberately NOT the sticky pick: this is
		     a different pool answering a different question, and a name chosen
		     here has nothing to say on the scatters.

		     `moves`, because a pick here MOVES the dot it names instead of
		     marking it where it stands. The pick lands as the chip leaves: the
		     actor at the top of the stack tweens down into a band and the rows
		     re-proportion, while the seat itself is held empty (`arriving`) for
		     the chip to arrive in. `onland` gives it up when the chip touches
		     down, and the new anchor's dot and name fade in under it. -->
			{#snippet anchorPanel()}
				<ActorSearch
					visual={layout.visual}
					chart={SEARCH_CHARTS[steps.state]}
					pool={SEARCH_POOL}
					picked={story.hops.pinned ? story.hops.anchorId : null}
					moves
					onpick={(id) => anchorPick(layout.visual, id)}
					onland={() => (story.hops.arriving = false)}
					onclear={resetHopAnchor}
				/>
			{/snippet}
			{#snippet racePanel()}
				<div
					class="race-scrubber-panel"
					style="bottom: {layout.overlayHeight + 12}px"
				>
					<RaceScrubber />
				</div>
			{/snippet}
			<!-- The tour's caption, over the canvas rather than in the card: it is
			     naming a dot, so it sits with the constellation and is typed like
			     the names on it. Whoever the tour (or the reader's tap) has picked
			     out is named here, and the chart labels the same actors, so
			     sentence and constellation always agree.

			     Declared out here rather than inside a <Step>, and passed to BOTH
			     constellation steps by the same reference, so it survives the step
			     change between them without remounting — the cycle runs across the
			     two, and a caption that unmounted would blink at the join.

			     One line by design. The films behind each hop go in the panel
			     behind "two movies" instead of into the card, because as prose
			     they ran to several sentences — and a step card that grows covers
			     the very dots it is inviting taps on at 360×640 (see
			     notes/scrolly-framework.md).

			     Placed off the constellation's own lowest name (introBottom), not a
			     fraction of the canvas: the intro fit is width-limited on a tall
			     phone, so the graph stops well short of its band and any fixed
			     fraction leaves a hole under it. -->
			{#snippet routePanel()}
				{#if story.settled === "networkIntro" && introRoute}
					<p
						class="route"
						bind:clientHeight={routeHeight}
						style="top: {routeTop(layout)}px"
					>
						<strong>{introRoute.name}</strong>:
						<InfoTerm
							title="{introRoute.name} → {introRoute.anchor}"
							onclick={() => (story.intro.pinned = true)}
						>
							{introRoute.count}
							{#snippet info()}
								<RouteFilms routes={introRoute.routes} />
							{/snippet}
						</InfoTerm>
						away from {introRoute.anchor}.
					</p>
				{/if}
			{/snippet}
			<!-- THE OPENING -->
			<!-- The story opens here, on the constellation, with no title card
			     before it: a first load grows it from nothing (the walk, as the
			     state's pop-in). These three steps and the title card after them sit
			     outside every <Chapter>, so the progress bar claims no line for
			     them and stays down until the first chapter begins.

			     Both constellation steps rest on one state, so the step between
			     them moves not a dot and the tour carries straight across it. This
			     one grows the constellation and then demonstrates the game on it;
			     the next one only changes the words. Step 0 is also where the reader
			     is taught how to move (Stage.svelte's cue). -->
			<!-- `alt`: what the canvas shows, for a screen reader (see Step.svelte).
			     PLACEHOLDERS — bare descriptions for Owen to reword. -->
			<Step
				state="networkIntro"
				panel={routePanel}
				alt="A network diagram with Kevin Bacon in the middle, joined by lines to actors he has made films with, and on to actors they have made films with."
			>
				<p>
					The “Six Degrees of Kevin Bacon” is a game where players try to
					connect actors to one another, using films in which they both
					appeared, aiming to reach him in six movies or fewer.
				</p>
			</Step>
			<Step state="networkIntro" panel={routePanel}>
				<p>
					The intuition is that Kevin Bacon is so prolific and well-known that
					the game is a lot easier than if it were called the “Six Degrees of
					John Doe,” implying he's some sort of all-encompassing center of
					Hollywood.
				</p>
			</Step>
			<Step
				state="hopSeed"
				alt="The network shrinks away into a field of dots."
			>
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
			<!-- TITLE CARD -->
			<!-- Step 3: the piece's name over the sky hopSeed has just pulled
			     back into — the same flight, carried on rather than restarted
			     (`carryFrom` in layouts/intro.js), with the highlight beat picking
			     actors out of it. hopBands sorts its crowd out of this sky. -->
			<Splash state="titleGalaxy">
				{#snippet title()}
					The real Kevin Bacon
				{/snippet}
				{#snippet subtitle()}
					A journey through the past, present and future centers of Hollywood.
				{/snippet}
				{#snippet byline()}
					By <a href="https://pudding.cool/author/owen-lacey/" target="_blank"
						>Owen Lacey</a
					>
				{/snippet}
			</Splash>

			<Chapter title="The RKBs">
				<!-- The prose waits for the bands to actually land rather than mounting
		     the moment the step becomes active — the crowd sorting into rows is
		     the point of the step, and the reader should see that finish before
		     being told what it means. Held per STEP, so it holds again on each of
		     the three below rather than only on the first arrival at the chart.
		     The middle one is the cycling chart (`hopAnchor`); the two either
		     side of it are about Bacon's own number and rest on him
		     (`hopBands`) — see layouts/hop-bands.js. -->
				<Step
					state="hopBands"
					alt="Chart: the four degrees of Kevin Bacon. Kevin Bacon's dot sits above four rows of dots, one for the actors 1, 2, 3 and 4 movies away from him, each labelled with its share of actors. The 2-movie row is by far the largest."
				>
					<p>
						No doubt, he's well connected. With
						<InfoTerm>
							our dataset of 169,000 actors
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
						four movies or fewer, a.k.a. the <b>four</b> degrees of Kevin Bacon.
					</p>
				</Step>
				<Step
					state="hopAnchor"
					panel={anchorPanel}
					alt="The same chart, redrawn for other actors in turn. Every one of them has a small 4-movie row."
				>
					<p>
						Morgan Freeman, Meryl Streep and Scarlett Johansson are also four
						degrees from every actor in Hollywood. In fact, 10% of actors in the
						dataset are four degrees away from everyone else. <b
							>No one can reach everyone within 3.</b
						>
					</p>
					<p>
						We need a more granular way to measure the connectivity of actors:
						the average number of movies it takes to get to every actor in
						Hollywood. In mathematics, this is referred to as <b>remoteness</b>.
					</p>
				</Step>
				<!-- guessing #1 or skipping is the only way on: GuessRank calls the
		     registry's advance() itself, the reader's Next skips the
		     question for them (`onnext`), and stepping back off the reveal
		     skips this step so its search box isn't left sitting under the
		     answer (see `gate` / `skipback` in Step.svelte) -->
				<Step
					state="rankFocus"
					gate={NEVER}
					onnext={() => skipGuess(steps)}
					skipback
					alt="A ranked list of the top 250 actors by remoteness. Every name is hidden except Kevin Bacon's, at #175."
				>
					<div class="rank-focus-text">
						<p>
							For example, Kevin Bacon's remoteness is 2.28: so an actor is, on
							average, 2.28 degrees from Kevin Bacon. But 2.28 degrees is not
							the best remoteness score: Kevin Bacon ranks 175th place of all
							Hollywood actors. Can you guess who #1 is?
						</p>
						<GuessRank />
					</div>
				</Step>
				<Step state="rankReveal" alt="The list's names are revealed.">
					<p>
						Samuel L. Jackson is the <b>center of Hollywood</b>, with a
						remoteness of just 2.09. Willem Dafoe is second with 2.13, Robert De
						Niro third with 2.14.
					</p>
					<p>
						Women are under-represented here, taking only 16 of the top 100
						places. Nicole Kidman is the first woman in at #21 with 2.19.
					</p>
				</Step>

				<!-- Start is the way on — pressed, or made by the reader's Next — and it
		     advances as it asks for the pan: the rewind is choreographed to play
		     ACROSS the step change onto the view the next step describes -->
				<Step
					state="raceRecent"
					gate={NEVER}
					onnext={rewind}
					skipback
					alt="Chart: the center of Hollywood, over time. A line per actor traces their remoteness year by year, lower being better, up to 2025."
				>
					<p>
						We can repeat the process for calculating all actors' remoteness and
						go backwards to create a time machine of centers. By using completed
						calendar years, our time machine starts at the end of 2025.
					</p>
					<StartButton kind="rewind" label="Go back in time" onpress={rewind} />
				</Step>
				<Step
					state="raceRecent"
					alt="The chart rewinds to 2006, where Samuel L. Jackson's line overtakes Gene Hackman's."
				>
					<p>
						Let's go back to where Samuel L. Jackson took the crown in 2006.
						Interestingly, this was before the Marvel Cinematic Universe era
						kicked off, which only made strengthened his position.
					</p>
					<p>
						Conversely, Kevin Bacon's highest ever ranking was #108 in 1996 with
						his role in Sleepers.
					</p>
				</Step>
				<Step
					state="raceFull"
					panel={racePanel}
					alt="The same chart, now reaching back to 1980. A year slider moves it through time."
				>
					<p>
						We can then view all centers of Hollywood since 1980. Use the slider
						to take a look around.
					</p>
				</Step>
			</Chapter>
			<Chapter title="The makings of a RKB">
				<Step
					state="raceFuture"
					alt="The chart runs on past 2025 into an empty shaded block labelled the future."
				>
					<p>
						Now apply this to the future. How might we predict who will take the
						crown from Samuel L. Jackson?
					</p>

					<p>
						To do that, we need to find what moves an actor towards the center.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showFilms: true }}
					panel={searchPanel}
					alt="Chart: films vs. remoteness. A dot per actor, with film count across on a log scale and remoteness up. Actors with more films sit lower on remoteness. Samuel L. Jackson and Nicolas Cage are labelled with their film counts."
				>
					<p>
						The obvious one is film count. A higher count moves an actor closer
						to the center. Indeed, Samuel L. Jackson has been in far more films
						than anyone else among our 169,000 actors, 20 more than Nicolas
						Cage, who's the next closest.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showPair: true }}
					panel={searchPanel}
					alt="Natalie Portman and Anna Kendrick are labelled with their remoteness: similar film counts, far apart on remoteness."
				>
					<p>
						But though the relationship between film count and remoteness is
						strong, it doesn't fully explain how an actor become a center. Two
						actors can have the same film counts but very different remoteness.
						Natalie Portman and Anna Kendrick are shown here with different
						remoteness scores, despite starring in the same number of films.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showPair: true, showCostars: true }}
					panel={searchPanel}
					alt="Natalie Portman's label now reads 97 of the top 250, and Anna Kendrick's 35 of the top 250."
				>
					<p>
						Natalie Portman is cast in films with more prolific actors than Anna
						Kendrick. Of the 250 most-connected actors from earlier, Natalie
						Portman has worked with almost three times as many as Anna Kendrick
						has. They say that in Hollywood "It's not what you know, it's who
						you know," and it seems this is also true here.
					</p>
				</Step>
				<Step
					state="scatterCenters"
					params={{ showPair: true, showCostars: true }}
					panel={searchPanel}
				>
					<p>
						It would be too circular to use costars with low remoteness as our
						measure. That's like saying “We think the most expensive houses will
						be the ones with the highest price.”
					</p>
				</Step>
				<Step
					state="degScatter"
					panel={searchPanel}
					alt="Chart: films vs. costar film count. A dot per actor, with film count across and their costars' average film count up, both on log scales."
				>
					<p>
						Instead, we use the costar film count as a sort of proxy.
						Concretely, this is an actor's 50 most prolific costars by number of
						films, taken as an average. If you work with more “big dog” actors
						compared to someone with the same film count, you'll almost
						certainly be closer to the center of Hollywood than them.
					</p>
				</Step>
				<!-- the one gate the reader's own Next walks through once it opens:
		     the quiz has no single completing press, so finishing the last
		     pair is what unblocks it — or the quiz's Skip, which leaves it
		     through the registry's skip() at any pair, and which the reader's
		     Next presses for them while the gate is shut (`onnext`). Stepping back to 20
		     stays open, and `quizDone` is the same predicate PairQuiz seeds
		     itself from, so
		     the gate can never hold the reader on a quiz with nothing left
		     to ask. PairQuiz sits in the card, under the sentence putting the
		     question — see its own file for why it stopped being a panel -->
				<Step
					state="scatterQuiz"
					gate={() => quizDone(story)}
					onnext={steps.skip}
					panel={searchPanel}
				>
					<p>
						Let's test our knowledge with a few more examples. For these actors
						with similar film counts, who do you think works with more “big
						dogs” and is therefore closer to the center?
					</p>
					<PairQuiz visual={layout.visual} />
				</Step>
			</Chapter>
			<Chapter title="Predicting the next RKB">
				<!-- The race chart comes back for one beat, and the camera pans down
		     off the crown onto the stretch of remoteness the contenders
		     actually live on — Samuel L. Jackson leaves through the top of the
		     plot, which is the distance the rest of the chapter is about.
		     "Show Gen Z actors" is the way on (the reader's Next presses it for
		     them) and the draw-on carries them to the next step when it lands,
		     so the step and its payoff read as one move. -->
				<Step
					state="raceGenz"
					gate={NEVER}
					onnext={drawGenz}
					skipback
					alt="The center of Hollywood chart returns, panned down below Samuel L. Jackson to the remoteness where younger actors sit."
					advanceon={() =>
						story.race.genzLinesShown && story.running !== "genzLines"}
				>
					<p>
						We now have everything we need to predict Gen Z's Kevin Bacon using
						film count and costar data. Our contenders are the 99 of our 169,000
						actors born since 1997 who have been in at least 5 films.
					</p>
					<StartButton
						kind="genzLines"
						label="Show Gen Z actors"
						onpress={drawGenz}
					/>
				</Step>
				<Step
					state="raceGenz"
					alt="Lines for the Gen Z contenders are drawn onto the chart."
				>
					<p>
						To predict future remoteness we need to model their trajectory by
						stating what we think their film count and costar data will look
						like at a certain point in time. To do this, we look at what has
						happened to actors with similar stats in the past.
					</p>
				</Step>
				<Step
					state="careerTrio"
					panel={searchPanel}
					alt="Chart: film count by career age. Sydney Sweeney's line reaches 16 films at 15 years, where Robert De Niro's and Chevy Chase's lines meet it; De Niro's goes on to 87 films and Chase's to 27."
				>
					<p>
						Films first. Take Sydney Sweeney: she's been in 16 films since her
						debut 15 years ago. By the same point in his career, Robert De Niro
						had also racked up 16 films, and went on to have a brilliant career
						totalling 87. By contrast, Chevy Chase reached the same milestone at
						the same point, but only ever appeared in 27.
					</p>
				</Step>
				<Step
					state="careerBacon"
					panel={searchPanel}
					alt="Kevin Bacon's line, alongside Helen Mirren's and Gene Hackman's."
				>
					<p>
						Conversely, after 47 years making Hollywood films, Kevin Bacon has a
						similar output to Helen Mirren and Gene Hackman at this stage.
					</p>
					<p>
						You'll remember Gene Hackman from the time machine; turns out Kevin
						Bacon could have been the center of Hollywood if he were born 20
						years earlier.
					</p>
				</Step>
				<Step
					state="careerMany"
					panel={searchPanel}
					alt="Back on Sydney Sweeney's line, with many other careers fanning out from the same point."
				>
					<p>
						Back to Sydney Sweeney. We can now see that whatever actor we use to
						model a Gen Z actor's film trajectory can massively impact the
						results. For each actor, we consider similar ones based on film
						count and career age, and randomly select one weighted by how close
						they are.
					</p>
					<p>
						By applying the same approach for costar film counts, we can start
						predicting.
					</p>
				</Step>
				<!-- Start is the way on — pressed, or made by the reader's Next — and
		     the run itself carries the reader over once it lands: the 10,000
		     runs are the payoff and the next step names the winner -->
				<Step
					state="simRace"
					gate={NEVER}
					onnext={runSim}
					skipback
					alt="Chart: wins after 10,000 simulations, counting each Gen Z actor's wins as the simulations run."
					advanceon={() => story.sim.runs > 0 && story.running !== "run"}
				>
					<p>
						To achieve a stable result, we'll run the simulation 10,000 times
						and see who comes out on top. Press start to find out who wins.
					</p>
					<StartButton kind="run" label="Start" onpress={runSim} />
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
				<!-- the story's closing chart (PRD P-27-1): the race chart's future
		     view returns, SLJ's line falls away across the block, and the
		     contenders the reader just watched win 10,000 simulations land on
		     their simulated medians above him. His 2030 landing is AUTHORED,
		     not modelled — the simulation projects the 99 contenders and
		     nobody else. See RACE_CLOSE_SLJ_END in layouts/race.js. -->
				<Step
					state="raceClose"
					alt="The future view of the center of Hollywood chart returns. Samuel L. Jackson's line falls away and the contenders land on their simulated medians above him."
				>
					<p>
						As time goes on, Samuel L. Jackson will eventually stop appearing in
						movies. As a result, he'll be connected to an increasingly smaller
						proportion of actors and he'll fall away from the center.
					</p>
					<p>
						Meanwhile, these Gen Z actors are the most likely to continue
						starring in films and overtake him. What we don't know is exactly
						how long that will take.
					</p>
				</Step>
				<Step state="outro" hideBar>
					<p>
						What is far more certain is that the first woman to be the center of
						Hollywood is on the horizon, with 65% of the wins going to women.
					</p>
					<p>
						We can also be pretty sure of the fact that it's not going to be
						Kevin Bacon.
					</p>
				</Step>
			</Chapter>
		{/snippet}
	</Stage>
	{#if steps.exited}
		<!-- a slow, steady rise rather than an easing-driven "arrival" — the
		     constant speed (linear, no in/out) is what reads as a film's credits
		     rolling rather than a UI panel animating in. Offset by the full
		     viewport height (rather than a fixed px guess) so it genuinely starts
		     below the screen on any device, not just partway up it. -->
		<section
			id="credits"
			in:fly={{
				y: (dimensions.height || 800) + 100,
				duration: reducedMotion.current ? 0 : 4000,
				easing: linear
			}}
		>
			<div class="credits-content">
				<div class="credits-block">
					<h2>Credits</h2>
					<p class="credits-row">
						<span class="role">Author</span>
						<span class="name"
							><a href="https://pudding.cool/author/owen-lacey/" target="_blank"
								>Owen Lacey</a
							></span
						>
					</p>
				</div>
				<!-- renders nothing at all without a Supabase project, without
				     enough finished quiz-takers to compare against, or without a
				     result of this reader's own — heading included, which is why
				     the whole block lives inside the component -->
				<QuizResults />
				<div class="credits-block">
					<h2>Author notes</h2>
					<p>
						The corpus is the IMDb top 10,000 English-language feature films by
						user vote count. I then enriched the data with cast information from
						the TMDB API so we can build the graph network. In total, there are
						just over 169,000 actors in the dataset.
					</p>
					<p>The data for this was taken in ~March 2026.</p>
					<p>
						I got so carried away with this project I made <a
							href="https://hollywood.six-degrees.app/"
							target="_blank">a website</a
						> focussed on Hollywood connection trivia.
					</p>
				</div>
			</div>
		</section>
	{/if}
</svelte:boundary>

<style>
	/* raceFull scrubber: spans the plot region above the step card (inline
	   `bottom`). Transparent — the drag surface sits over the live canvas; only
	   the slider control at its bottom edge is opaque. */
	.race-scrubber-panel {
		position: absolute;
		top: 84px;
		left: 0;
		right: 0;
	}

	/* the same fade the stage's panels use (Stage.svelte); keyframes are scoped
	   per component, so the prose's own animations carry their own copy */
	@keyframes panel-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* rankFocus' own staged reveal: Bacon's bar/row lands first (panel-in,
	   above; both now held on the step landing (`steps.held`) —
	   see the step's `hold`), then this text fades in a beat later so the reader
	   meets Bacon before the question — see RankBars.svelte's row-in for the
	   next stage (everyone else fading in after this). The 0.55s delay is
	   relative to this element's own mount, not a fixed point after the step
	   became active, since it no longer mounts until the bar has landed — which
	   is also why it outlasts the step's own prose fade (Step.svelte) rather
	   than duplicating it: that one is over before this one starts. */
	.rank-focus-text {
		animation: panel-in 0.5s ease 0.55s both;
	}

	@media (prefers-reduced-motion: reduce) {
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
		letter-spacing: var(--tracking-mono);
		/* matches .node-label in ScrollyVisual */
		font-size: var(--12px, 12px);
		line-height: 1.2;
		/* the caption lies over the layout's tap halves; only the term inside it
		   is meant to catch a click */
		pointer-events: none;
		/* a pointer-events:none overlay whose children opt in can be lifted over
		   the tap halves for free — same idiom as .hits and .quiz */
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

	/* the credits: plain document flow below #scrolly, over the fixed
	   .scrolly-visual.exited backdrop drifting behind it (z-index: -1 there
	   is what leaves this in front with no z-index of its own needed) */
	#credits {
		max-width: 700px;
		margin: 0 auto;
		padding: 4rem 1rem 8rem;
	}

	.credits-content {
		display: flex;
		flex-direction: column;
		gap: 4rem;
	}

	/* :global because one of these blocks is QuizResults' own markup, and a
	   scoped rule stops at the component boundary. Prefixed with #credits — the
	   same escape hatch as .bits-infoterm above — so the blast radius is this
	   section rather than the document. */
	#credits :global(.credits-block) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
	}

	/* same halo as Stage's .splash-card h1 — this text also sits over the drifting
	   dot field rather than a plain background */
	#credits :global(.credits-block h2) {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--28px, 28px);
		font-weight: 400;
		line-height: 1.06;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--color-fg);
		text-shadow: var(--text-halo);
	}

	#credits :global(.credits-block p) {
		margin: 0;
		color: var(--color-fg);
		text-shadow: var(--text-halo);
	}

	/* a film credit's line: role on the left, name on the right, same halo as
	   the rest of the credits text over the drifting field */
	.credits-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		width: 100%;
		max-width: 320px;
		gap: 1rem;
	}

	.credits-row .role {
		text-transform: uppercase;
		letter-spacing: 0.03em;
		opacity: 0.7;
	}
</style>

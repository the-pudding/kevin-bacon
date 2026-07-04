<script>
	import Scrolly from "$components/helpers/Scrolly.svelte";
	import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";

	let value = $state();
	let dimensions = new useWindowDimensions();
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<section id="scrolly">
		<div
			class="scrolly-layout"
			style="--viewport-height: {dimensions.height}px"
		>
			<div class="scrolly-visual" style:height="{dimensions.height}px">
				<p>Step {value ?? "–"}</p>
			</div>
			<div class="scrolly-steps" style:margin-top="{-dimensions.height}px">
				<Scrolly bind:value>
					<div class="step" class:active={value === 0}>
						<p>
							The "Six Degrees of Kevin Bacon" is a game where players try to
							connect an actor to Kevin Bacon via movies they've starred in with
							other Hollywood actors, aiming to reach him in six movies or less.
							<!-- TODO: sorta use the graph component, but start from the source actor and make a path to kevin bacon. DW about that path being optimal either -->
						</p>
					</div>
					<div class="step" class:active={value === 1}>
						<p>
							The intuition is that Kevin Bacon is so prolific, genre-spanning,
							and timeless that the game is a lot easier than if it were called
							the "Six Degrees of John Doe". This idea implies that Kevin Bacon
							is this all-encompassing center of Hollywood.
						</p>
					</div>
					<div class="step" class:active={value === 2}>
						<p>
							However, Kevin Bacon is <b>not</b> the center of hollywood. Not
							only that, he <b>never has been</b>, and almost certainly
							<b>never will</b>.
						</p>
					</div>
					<!-- TODO: chapters! At this point, full screen "present" -->
					<div class="step" class:active={value === 3}>
						<p>
							No doubt, he's well connected. You can get from any Hollywood
							actor to Kevin Bacon in four movies or less. The reality is that
							Kevin Bacon isn't special in this respect; there are 16,429 actors
							who can be reached by everyone within 4 movies.
						</p>
					</div>
					<div class="step" class:active={value === 4}>
						<p>
							A more meaningful measure of Hollywood connectivity is <i
								>average distance</i
							>. Another way to think of this is how easy the game would be to
							play with that actor instead of Kevin Bacon.
						</p>
					</div>
					<div class="step" class:active={value === 5}>
						<p>
							As of 2026, I can tell you that Kevin Bacon ranks #175 of all
							Hollywood actors based on average distance. Can you guess who #1
							is?
						</p>
					</div>
					<div class="step" class:active={value === 6}>
						<p>
							Yes, Samuel L. Jackson is the <i>center of Hollywood</i>. We've
							gone from the "Six Degrees of Kevin Bacon" to the "Four Degrees of
							Samuel L. Jackson". You can get to him in an average distance of
							just 2.09.
						</p>
					</div>
					<div class="step" class:active={value === 7}>
						<p>
							Samuel L. Jackson has been the center of hollywood since 2006,
							taking over from Gene Hackman.
						</p>
					</div>
					<div class="step" class:active={value === 8}>
						<p>
							Before then, the crown changed hands frequently. Gene Hackman and
							Robert De Niro fighting over top spot for half a decade.
						</p>
					</div>
					<div class="step" class:active={value === 9}>
						<p>
							Repeating this process, we can go all the way back to 1970 to
							create a timeline of centers from when we started recording this
							data.
							<!-- TODO show the current as the timeline goes back -->
						</p>
					</div>
					<div class="step" class:active={value === 10}>
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
					</div>
					<div class="step" class:active={value === 11}>
						<p>
							Just because you're in loads of films doesn't necessarily mean
							you've got a lot of connections in the graph. And just because
							you've got a lot of connections in the graph, doesn't mean you've
							got the <i>right</i> connections to make you the center of Hollywood.
						</p>
					</div>
					<div class="step" class:active={value === 12}>
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
					</div>
					<div class="step" class:active={value === 13}>
						<p>
							Let's generalise this idea into two hypotheses:
							<br />
							1. Starring with the <i>same</i> people.
							<br />
							2. Starring with the <i>right</i> people.
							<br />
							Consider these actors. Intuitively, who do you think has the lowest
							average distance?
						</p>
					</div>
					<div class="step" class:active={value === 14}>
						<p>
							Seth Rogen and Charlize Theron are in similar numbers of films -
							they even costarred in "Long Shot". However, Charlize Theron tends
							to work with actors she's not worked with before. Conversely, Seth
							Rogen repeatedly works with the same actors. For example, Jonah
							Hill is in 8 of his films.
						</p>
					</div>
					<div class="step" class:active={value === 15}>
						<p>
							<i>Concurrency</i> is a measure of how frequently you work with the
							same actors. Seth Rogen having a concurrency of 0.2 means that for each
							of his films, he would have worked with 28% of them before.
						</p>
					</div>
					<div class="step" class:active={value === 16}>
						<p>
							If your concurrency is low, you work for the first time with
							actors more often. This means you create more connections in the
							graph and and it will take you fewer films to get your average
							distance down.
						</p>
					</div>

					<div class="step" class:active={value === 17}>
						<p>
							If you starred in one film with Samuel L Jackson and him alone,
							you would immediately have an average distance of 3.08, putting
							you in the top 75% of hollywood.
						</p>
					</div>
					<div class="step" class:active={value === 18}>
						<p>
							Due to its circular nature, we can't use "low costar average
							distance" as a signal for explaining someone's average distance.
							We can however use their <i>degree</i>; how many connections they
							have in the graph.
						</p>
					</div>
					<div class="step" class:active={value === 19}>
						<p>
							Here's the same graph, but measuring the average degree of their
							top 50 costars.
						</p>
					</div>

					<!-- TODO: round off? -->

					<!-- TODO: FUTURE! -->
					<div class="step" class:active={value === 20}>
						<p>
							So both of our hypotheses hold up against our example pairs. These
							two new pieces of information can be used to explain why two
							actors with similar numbers of films can have such different
							average distances. Combining all three pieces of information
							allows us to predict an actor's mean average distance much more
							accurately.
						</p>
					</div>

					<div class="step" class:active={value === 21}>
						<p>
							Now, Samuel L. Jackson can't be the center forever. At some point,
							someone must overtake him. Which Gen Z actor do we think is going
							to do that? The Gen Z actor with the current lowest average
							distance is Chloë Grace Moretz. However, we know that's not all we
							need to have confidence in simply saying she's Gen Z's Kevin
							Bacon.
						</p>
					</div>

					<div class="step" class:active={value === 22}>
						<p>
							Using all the data we have, we can model an actor's career by
							looking at what has happened to actors with similar stats in the
							past.
						</p>
					</div>

					<div class="step" class:active={value === 23}>
						<p>
							Take Sydney Sweeney. She's been in 16 films since her debut 15
							years ago. At the same point in their career, Robert De Niro had
							also racked up 16 films — and went on to a brilliant career
							totalling 72. Conversely, Chevy Chase reached the same milestone
							in the same time — and only ever appeared in 26.
						</p>
					</div>

					<div class="step" class:active={value === 24}>
						<p>
							This means that whatever actor we use to model a Gen Z's career
							trajectory can massively impact the results. For each actor, we
							consider similar actors based on proximity to them, and randomly
							select one weighted by how close they are. To minimize the noise,
							we'll run this simulation 10,000 times and see who comes out on
							top.
						</p>
						<!-- TODO: run the actual simulation??? -->
					</div>

					<div class="step" class:active={value === 25}>
						<p>
							Indeed, Chloe Grace Moretz wins in a quarter of simulations. She
							doesn't exactly have a clear majority, despite already being
							well-clear of these people from an average distance perspective.
						</p>
					</div>

					<!-- TODO these should probably be tooltips rather than part of the story -->
					<div class="step" class:active={value === 26}>
						<p>
							Ariana Greenblatt: 13 corpus films in 8 years (76th pct),
							concurrence 0.016 (bottom quarter — almost every co-star is new),
							top-50 log-degree 7.47 (89th pct). Her avg_distance of 2.57 is
							middling now, but the three features that drive low avg_distance
							are already in place — and she's 14.
						</p>
					</div>

					<div class="step" class:active={value === 27}>
						<p>
							Elle Fanning: 37 films at career-age 24 (97th pct), top-50
							log-degree 7.63 (97th pct), avg_distance already 2.35 — top 3% of
							the entire cohort, before she's 30. SLJ at her age had 40 films.
							She's not projected to grow; she's projected to keep what she has.
						</p>
					</div>

					<div class="step" class:active={value === 28}>
						<p>
							On average, the winning score is 2.24, nowhere near SLJ's current
							average distance. We're counting on SLJ's average distance getting
							worse as he stops appearing in movies, or a Marvel-sized cinematic
							universe being spawned again.
						</p>
					</div>

					<div class="step" class:active={value === 29}>
						<p>
							What I can tell you is that our first female center of hollywood
							is very likely to happen next, with 77% of the wins going to
							women, perhaps not for a few years yet though
						</p>
					</div>
				</Scrolly>
			</div>
		</div>
	</section>
</svelte:boundary>

<style>
	#scrolly {
		max-width: 700px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.scrolly-layout {
		display: flex;
		flex-direction: column;
	}

	.scrolly-visual {
		position: sticky;
		top: 0;
		background: var(--color-bg-secondary, #eee);
	}

	.scrolly-steps {
		z-index: 1;
		position: relative;
	}

	.step {
		min-height: calc(var(--viewport-height) * 0.6);
		display: flex;
		align-items: center;
		padding: 1rem;
		opacity: 0.3;
		transition: opacity 0.2s ease;
	}

	.step p {
		background: var(--color-bg);
		padding: 1.5rem;
	}

	.step.active {
		opacity: 1;
	}
</style>

<script>
	import Scrolly from "$components/helpers/Scrolly.svelte";
	import ScrollyVisual from "$components/scrolly/ScrollyVisual.svelte";
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
				<ScrollyVisual step={value ?? 0} />
			</div>
			<div class="scrolly-steps" style:margin-top="{-dimensions.height}px">
				<Scrolly bind:value>
					<div class="step" class:active={value === 0}>
						<p>
							The "Six Degrees of Kevin Bacon" is a game where players try to
							connect an actor to Kevin Bacon via movies they've starred in with
							other Hollywood actors, aiming to reach him in six movies or less.
						</p>
						<!--
              KB appears alone. Establish a subtle animation we'll use going forward to highlight someone as the center actor.
							
							Code reference: references/pudding-post/design/stories/components/network-graph.js
						-->
					</div>
					<div class="step" class:active={value === 1}>
						<p>
							The intuition is that Kevin Bacon is so prolific, genre-spanning,
							and timeless that the game is a lot easier than if it were called
							the "Six Degrees of John Doe". This idea implies that Kevin Bacon
							is this all-encompassing center of Hollywood.
						</p>
						<!--
              New nodes appear far away from KB, and paths towards KB animate into view.
              Eventually, a graph of a couple of dozen nodes is visible.
						-->
					</div>
					<div class="step" class:active={value === 2}>
						<p>
							However, Kevin Bacon is <b>not</b> the center of hollywood. Not
							only that, he <b>never has been</b>, and almost certainly
							<b>never will</b>.
						</p>
						<!--
              Graph fades into the background
						-->
					</div>
					<!-- TODO: chapters! At this point, full screen "present" -->
					<div class="step" class:active={value === 3}>
						<p>
							No doubt, he's well connected. You can get from any Hollywood
							actor to Kevin Bacon in four movies or less.
						</p>
						<!--
							Storyboard visual: network graph changes to a row-based vertical
							layout: 1. Top row is KB, 2. First row is people one hop away,
							3. Two away, 4. And so on. The rest of the graph is populated,
							showing no one is 5 steps away.
							Code reference: references/pudding-post/design/stories/components/hop-graph.js
						-->
					</div>
					<div class="step" class:active={value === 4}>
						<p>
							The reality is that Kevin Bacon isn't special in this respect;
							there are 16,429 actors who can be reached by everyone within 4
							movies. A more meaningful measure of Hollywood connectivity how
							many movies on average is takes to get to them - we'll call this <i
								>average distance</i
							>.
						</p>
						<!--
							Numbers appear for each row, showing how we would calculate KB's average
							distance based on his hop graph, showing his average distance is
							2.2823.
						-->
					</div>
					<div class="step" class:active={value === 5}>
						<p>
							As of 2026, I can tell you that Kevin Bacon ranks #175 of all
							Hollywood actors based on average distance. Can you guess who #1
							is?
						</p>
						<!--
							Storyboard visual: hop graph changes to a single vertical line of
							dots — …◌ #173 ◌ #174 ◌ #175 - Kevin Bacon (2.2823) ◌ #176 ◌
							#177… — user can guess who they think is #1, and we scroll up/
							down to that guess. User can continue and we scroll up to #1 and
							show SLJ. The row-based graph becomes left-to-right layout as like a stacked horizontal bar for each actor. That way, we can see the proportion of distance-3 actors getting smaller as you scroll up.
              We have a 'guess' functionality, with a 'guess again' functionality, eventually with a 'give up'.
							Code reference: references/pudding-post/design/stories/components/rank-ladder.js
						-->
					</div>
					<div class="step" class:active={value === 6}>
						<p>
							Yes, Samuel L. Jackson is the <i>center of Hollywood</i>. You can
							get to him in an average distance of just 2.09.
						</p>
						<!--
							Storyboard visual: user can see the full results by names appearing and explore —
							they'll see that Willem Dafoe is 2nd, and Robert De Niro is 3rd,
							etc.
						-->
					</div>
					<!-- TODO: chapter - PAST -->
					<div class="step" class:active={value === 7}>
						<p>
							Samuel L. Jackson has been the center of hollywood since 2006,
							taking over from Gene Hackman.
						</p>
						<!--
							Storyboard visual: line chart race where y axis (flipped) is
							avg_distance, and x is the year. Initially, all dots are in a
							vertical line, representing 2026. Zoom in on SLJ, and the x axis
							grows to the left to the point of this handover. A detailed breakdown of what happened appears
							Code reference: references/pudding-post/design/stories/components/race-chart.js
						-->
					</div>
					<div class="step" class:active={value === 8}>
						<p>
							Before then, the crown changed hands frequently. Gene Hackman and
							Robert De Niro fighting over top spot for half a decade.
						</p>
						<!--
							Storyboard visual: we move left in the graph, showing lines
							overtaking each other at that point. Each handover is made obvious to the user to opt-in to a similar breakdown from the previous
						-->
					</div>
					<div class="step" class:active={value === 9}>
						<p>
							Repeating this process, we can go all the way back to 1970 to
							create a timeline of centers from when we started recording this
							data.
						</p>
						<!--
							Storyboard visual: the full timeline appears, annotated by center
							handovers. When the user selects a point in the timeline, details
							on who the anchor is (avg_distance) appear. Each
							annotation performs a similar deep dive. User can then go 'next' once they've finished exploring.
						-->
					</div>
					<!-- TODO: next chapter - future! -->
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
						<!-- TODO: There's not much connection from the PAST to the rest of the story -->
						<!--
							Storyboard visual: scatter plot of log(films) and average
							distance. Highlight the notable actors.
							Code reference: references/pudding-post/design/stories/components/distance-films-scatter.js
						-->
					</div>
					<div class="step" class:active={value === 11}>
						<p>
							Just because you're in loads of films doesn't necessarily mean
							you've got a lot of connections in the graph. And just because
							you've got a lot of connections in the graph, doesn't mean you've
							got the <i>right</i> connections to make you the center of Hollywood.
						</p>
						<!--
              No change
						-->
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
						<!--
							Storyboard visual: show Julie Walters on the scatter.
							Code reference: references/pudding-post/design/stories/components/distance-films-scatter.js
							("JulieWalters" story)
						-->
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
						<!--
							Storyboard visual: user is asked to choose which of these pairs
							they think has the lower avg_distance: Charlize Theron and Seth
							Rogen / Natalie Portman and Anna Kendrick / Margot Robbie and Dave
							Franco. After each choice, they're highlighted on the plot.
							Code reference: references/pudding-post/design/stories/components/distance-films-scatter.js
							+ distance-films-quiz.js
						-->
					</div>
					<div class="step" class:active={value === 14}>
						<p>
							Seth Rogen and Charlize Theron are in similar numbers of films -
							they even costarred in "Long Shot". However, Charlize Theron tends
							to work with actors she's not worked with before. Conversely, Seth
							Rogen repeatedly works with the same actors. For example, Jonah
							Hill is in 8 of his films.
						</p>
						<!--
              No change
						-->
					</div>
					<div class="step" class:active={value === 15}>
						<p>
							<i>Concurrency</i> is a measure of how frequently you work with the
							same actors. Seth Rogen having a concurrency of 0.2 means that for each
							of his films, he would have worked with 28% of them before.
						</p>
						<!--
							Storyboard visual: show a scatter plot of log(film_count) on the
							X, but concurrency on the Y. User views that actors with lower
							avg_distance (Natalie Portman/Charlize Theron/Margot Robbie) have
							lower concurrency.
							Code reference: references/pudding-post/design/stories/components/concurrence-films-scatter.js
							FLAG: this is the best-guess landing point for the visual — see
							ambiguity note on step 14.
						-->
					</div>
					<div class="step" class:active={value === 16}>
						<p>
							If your concurrency is low, you work for the first time with
							actors more often. This means you create more connections in the
							graph and and it will take you fewer films to get your average
							distance down.
						</p>
						<!--
              No change
						-->
					</div>

					<div class="step" class:active={value === 17}>
						<p>
							If you starred in one film with Samuel L Jackson and him alone,
							you would immediately have an average distance of 3.08, putting
							you in the top 75% of hollywood.
						</p>
						<!--
              TODO: needed?
						-->
					</div>
					<div class="step" class:active={value === 18}>
						<p>
							Due to its circular nature, we can't use "low costar average
							distance" as a signal for explaining someone's average distance.
							We can however use how many connections their costars have in the
							graph i.e their costars' <i>degree</i>.
						</p>
						<!--
            No change
						-->
					</div>
					<div class="step" class:active={value === 19}>
						<p>
							Here's the same graph, but measuring the average degree of their
							top 50 costars.
						</p>
						<!--
							Storyboard visual (introduces the top-50-costar-degree scatter):
							show a scatter plot of log(film_count) on the X, but
							log(top50_costar_degree) on the Y. User views that actors with
							lower avg_distance (Natalie Portman/Charlize Theron/Margot
							Robbie) have high degrees of costars.
							Code reference: references/pudding-post/design/stories/components/top50-degree-films-scatter.js
						-->
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
						<!--
							Storyboard visual: scatter plot of avg_distance vs predicted,
							based initially on film count, with the correlation shown
							initially at 82. User can click 'include concurrency' and
							'include costar degree', and the dots travel closer to/away from
							the diagonal when ticked/unticked.
							Code reference: references/pudding-post/design/stories/components/prediction-scatter.js
						-->
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
						<!--
							Storyboard visual: back to the avg_dist vs film count graph. Show
							Chloe Grace Moretz in the graph.
							Code reference: references/pudding-post/design/stories/components/distance-films-scatter.js
						-->
					</div>

					<div class="step" class:active={value === 22}>
						<p>
							Using all the data we have, we can model an actor's career by
							looking at what has happened to actors with similar stats in the
							past.
						</p>
						<!--
              NO CHANGE
            -->
					</div>

					<div class="step" class:active={value === 23}>
						<p>
							Take Sydney Sweeney. She's been in 16 films since her debut 15
							years ago. At the same point in their career, Robert De Niro had
							also racked up 16 films — and went on to a brilliant career
							totalling 72. Conversely, Chevy Chase reached the same milestone
							in the same time — and only ever appeared in 26.
						</p>
						<!--
							Storyboard visual: line graph where X is career age, and Y is #
							films. Show the two contrasting situations (De Niro's continued
							climb vs Chevy Chase's plateau).
							Code reference: references/pudding-post/design/stories/components/career-age-scatter.js
						-->
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
						<!--
							Storyboard visual: add more lines to the line chart (from step 23).
							Code reference: references/pudding-post/design/stories/components/career-age-scatter.js
						-->
					</div>

					<div class="step" class:active={value === 25}>
						<p>
							Indeed, Chloe Grace Moretz wins in a quarter of simulations. She
							doesn't exactly have a clear majority, despite already being
							well-clear of these people from an average distance perspective.
						</p>
						<!--
							Storyboard visual: bar chart of win count — Chloe Grace Moretz @
							25%, Ariana Greenblatt @ 10%, Elle Fanning @ 10%. Graph shows
							bars side by side and highlights the actor being discussed.
							Code reference: none — "no matching component in submodule yet"
							per storyboard.
              
              User can click on each bar with a bit of an explanation i.e

							Ariana Greenblatt: 13 corpus films in 8 years (76th pct),
							concurrence 0.016 (bottom quarter — almost every co-star is new),
							top-50 log-degree 7.47 (89th pct). Her avg_distance of 2.57 is
							middling now, but the three features that drive low avg_distance
							are already in place — and she's 14.

							Elle Fanning: 37 films at career-age 24 (97th pct), top-50
							log-degree 7.63 (97th pct), avg_distance already 2.35 — top 3% of
							the entire cohort, before she's 30. SLJ at her age had 40 films.
							She's not projected to grow; she's projected to keep what she has.
						-->
					</div>

					<div class="step" class:active={value === 26}>
						<p>
							On average, the winning score is 2.24, nowhere near SLJ's current
							average distance. We're counting on SLJ's average distance getting
							worse as he stops appearing in movies, or a Marvel-sized cinematic
							universe being spawned again.
						</p>
						<!--
							Storyboard visual: line graph showing SLJ's average distance
							trajectory based on career age, and then the 10k simulation
							lines.
						-->
					</div>

					<div class="step" class:active={value === 27}>
						<p>
							What I can tell you is that our first female center of hollywood
							is very likely to happen next, with 77% of the wins going to
							women, perhaps not for a few years yet though.
						</p>
						<!--
							No visual noted in storyboard for this closing beat.
						-->
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
	}

	.scrolly-steps {
		z-index: 1;
		position: relative;
	}

	.step {
		min-height: calc(var(--viewport-height));
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

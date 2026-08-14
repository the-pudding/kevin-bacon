<script>
	import Page from "$routes/+page.svelte";
</script>

<svelte:head>
	<title>Storyboard — Gen Z's Kevin Bacon</title>
</svelte:head>

<section id="storyboard">
	<h1>Storyboard: Gen Z's Kevin Bacon</h1>
	<p class="intro">
		A text-only outline of the story: each step's visualization described in
		brief, followed by its copy as it appears in the built piece.
	</p>

	<h2>Present</h2>

	<section class="step">
		<p class="visual">
			A node labelled "Kevin Bacon" appears alone. A network graph grows around
			him.
		</p>
		<p>
			The "Six Degrees of Kevin Bacon" is a game where players try to connect an
			actor to Kevin Bacon via movies they've starred in with other Hollywood
			actors, aiming to reach him in six movies or less.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			Edges are highlighted as we cycle through the actors. Edge labels appear
			stating what film they have in common.
		</p>
		<p>
			The intuition is that Kevin Bacon is so prolific and well-known that the
			game is a lot easier than if it were called the "Six Degrees of John Doe".
			This idea implies that Kevin Bacon is this all-encompassing center of
			Hollywood.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			Zoom out. Edges and labels fade as more nodes appear. KB becomes styled
			like the rest of them
		</p>
		<p>
			However, Kevin Bacon is <b>not</b> the center of hollywood. Not only that,
			he <b>never has been</b>, and almost certainly
			<b>never will</b>.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The network graph reorganizes into rows by hop-distance from Kevin Bacon.
		</p>
		<p>
			No doubt, he's well connected. You can get from any Hollywood actor to
			Kevin Bacon in four movies or less.
		</p>
		<p>
			The reality is that Kevin Bacon isn't special in this respect; there are
			16,429 actors who can be reached by everyone within 4 movies. A more
			meaningful measure of Hollywood connectivity is how many movies on average
			it takes to get to them i.e. <i>average distance</i>.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A vertical rank ladder centers on Kevin Bacon at #175; the reader guesses
			who's #1.
		</p>
		<p>
			As of 2026, I can tell you that Kevin Bacon ranks #175 of all Hollywood
			actors based on average distance. Can you guess who #1 is?
		</p>
	</section>

	<section class="step">
		<p class="visual">The rank ladder reveals #1.</p>
		<p>
			Yes, Samuel L. Jackson is the <i>center of Hollywood</i>. You can get to
			him in an average distance of just 2.09. Willem Dafoe is second, Robert De
			Niro third. Female actors are under-represented here, occupying only 16 of
			the top 100 most connected actors. Nicole Kidman is the first female in at
			#21.
		</p>
	</section>

	<h2>Past</h2>

	<section class="step">
		<p class="visual">
			A line-chart race zooms in on Samuel L. Jackson's 2006 takeover.
		</p>
		<p>
			Samuel L. Jackson has been the center of hollywood since 2006, taking over
			from Gene Hackman.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The race chart pans back, showing the lead changing hands repeatedly over
			the prior decade.
		</p>
		<p>
			Before then, the crown changed heads frequently, with Frank Welker, Robert
			De Niro and Gene Hackman fighting over top spot for the previous decade.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The full race timeline plays out from 1970 to the present.
		</p>
		<p>
			Repeating this all the way back gives us a timeline of every center since
			1980. Note that no female actor has ever been the center; the we've ever
			come was Susan Sarandon in at #9 in 2012.
		</p>
	</section>

	<h2>Future</h2>

	<section class="step">
		<p class="visual">Dunno - dotted random race chart into future?</p>
		<p>
			Now imagine us taking this into the future. How might we predict who will
			take the crown from Samuel L. Jackson? To do that, we need to find what
			moves an actor towards the center.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A scatter plot of film count vs. average distance, Samuel L. Jackson
			highlighted.
		</p>
		<p>
			The obvious one is film count. More films means closer to the center.
			Indeed, Samuel L. Jackson has been in far more films than anyone else, 20
			more than Nicholas Cage who's next closest.
		</p>
	</section>

	<section class="step">
		<p class="visual">NP and AK highlighted on the graph</p>
		<p>
			The relationship between film count and average distance is strong, but it
			doesn't explain it fully. Two actors can have the same film counts but
			very different average distances. For example, Natalie Portman and Anna
			Kendrick are shown here at the two extremes of the data.
		</p>
	</section>

	<section class="step">
		<p class="visual">XXX</p>
		<p>
			So what's different about them? Put simply: better costars. Natalie
			Portman stars with more "big dogs" than Anna Kendrick. They say in
			hollywood "It's not what you know, it's who you know", and it seems that
			is also true of explaining an actor's average distance.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			Show the top 250 actors again, denoted by AK/NP having worked with then
			before.
		</p>
		<p>
			Using our most central actors from earlier, we can see that Natalie
			Portman has worked with almost three times more of them than Anna
			Kendrick.
		</p>
	</section>

	<section class="step">
		<p class="visual">top50 scatter</p>
		<p>
			It would be too circular to use costars with low average distance as our
			measure. That's like saying "We think the most expensive houses will be
			the ones with the highest price". Instead we use the costar film count as
			a sort of proxy. Concretely, this is an actor's 50 most prolific costars
			by number of films, taken as an average. If you work with more "big dog"
			actors compared to someone with the same film count, you almost definitely
			be closer to the center of hollywood than them.
		</p>
	</section>

	<section class="step">
		<p class="visual">Quiz</p>
		<p>
			Now we've got our two signals, we can test our knowledge with a few more
			examples. For these actors with very similar film counts, who do you think
			works with more "big dogs" and is therefore closer to the center?
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The scatter plot highlights Gen Z actors, led by Chloë Grace Moretz.
		</p>
		<p>
			We now have everything we need to predict an actor's current average
			distance using film count and costar data. To predict future average
			distance we need to model their trajectory by stating what we think their
			film count and costar data will look like at a certain point in time. To
			do this, we look at what has happened to actors with similar stats in the
			past.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A line graph of career age vs. film count, contrasting Robert De Niro and
			Chevy Chase's trajectories against Sydney Sweeney's.
		</p>
		<p>
			Films first. Take Sydney Sweeney: she's been in 16 films since her debut
			15 years ago. At the same point in their career, Robert De Niro had also
			racked up 16 films — and went on to have a brilliant career totalling 87.
			Conversely, Chevy Chase reached the same milestone at the same point — and
			only ever appeared in 27.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same graph gains many simulated career trajectory lines.
		</p>
		<p>
			This means that whatever actor we use to model a Gen Z's film trajectory
			can massively impact the results. For each actor, we consider similar
			actors based on proximity to them, and randomly select one weighted by how
			close they are.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			Line graph where x axis is career age, and y axis is top50
		</p>
		<p>
			Costar data is a lot simpler, since it stabilises for actors once they
			reach career age ~10. For this, we add an adjustment so that
			well-connected Gen Z actors continue being relatively well-connected when
			modelled into the future.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A horizontal bar chart of simulation win counts by actor. User can press
			play to start the simulation.
		</p>
		<p>
			To achieve a stable result, we'll run the simulation 10,000 times and see
			who comes out on top.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			Line chart, but the Gen Z actors move towards their projected position.
			Unsure if I should add a toggle for costar. Add a toggle for "current
			average distance" / "predicted average distance"
			<!-- finding #25 -->
		</p>
		<p>
			Here's what we think will happen to each Gen Z actor's average distance.
			You'll notice that none of them overtake Samuel L. Jackson. From our
			historical analysis you'll recall lines dropping off as actors stop
			appearing in so many films. We're counting on this happening to Samuel L.
			Jackson, or a Marvel-sized cinematic universe being spawned again.
		</p>
	</section>

	<section class="step">
		<p class="visual">The same fan chart, framing the conclusion.</p>
		<p>
			What I can tell you is that our first female center of hollywood is very
			likely to happen next, with 65% of the wins going to women, perhaps not
			for a few years yet though.
		</p>
	</section>
</section>

<style>
	#storyboard {
		max-width: 700px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}

	.intro {
		font-style: italic;
	}

	.step {
		margin-block: 2rem;
	}

	.visual {
		font-style: italic;
		opacity: 0.65;
	}
</style>

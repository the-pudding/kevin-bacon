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
		<p class="visual">A node labelled "Kevin Bacon" appears alone.</p>
		<p>
			The "Six Degrees of Kevin Bacon" is a game where players try to connect an
			actor to Kevin Bacon via movies they've starred in with other Hollywood
			actors, aiming to reach him in six movies or less.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A network graph grows around Kevin Bacon as each example is mentioned.
		</p>
		<p>
			The intuition is that Kevin Bacon is so prolific, genre-spanning, and
			timeless that the game is a lot easier than if it were called the "Six
			Degrees of John Doe". This idea implies that Kevin Bacon is this
			all-encompassing center of Hollywood.
		</p>
	</section>

	<section class="step">
		<p class="visual">The network graph holds, setting up the reveal.</p>
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
			Niro third.
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
			Before then, the crown changed hands frequently, with Frank Welker, Robert
			De Niro and Gene Hackman fighting over top spot for the previous decade.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The full race timeline plays out from 1970 to the present.
		</p>
		<p>
			Repeating this all the way back gives us a timeline of every center since
			we started tracking this in 1970. data.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A scatter plot of film count vs. average distance, Samuel L. Jackson
			highlighted.
		</p>
		<p>
			As you just learned, Samuel L. Jackson has been dominating Hollywood by
			his sheer prolificacy since 2006. His reign has lasted 5 times longer than
			anyone else. But what makes an anchor the center? You can see from the
			results that Samuel L. Jackson has been in by far the most films, 20 more
			than Nicholas Cage who's next closest. Indeed, film count correlates
			heavily with average distance.
		</p>
	</section>

	<h2>Future</h2>

	<section class="step">
		<p class="visual">
			The scatter plot highlights Gen Z actors, led by Chloë Grace Moretz.
		</p>
		<p>
			Now, Samuel L. Jackson can't be the center forever. At some point, someone
			must overtake him. Which Gen Z actor do we think is going to do that? The
			Gen Z actor with the current lowest average distance is Chloë Grace
			Moretz.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same scatter plot, introducing the idea of drawing on similar past
			actors' careers.
		</p>
		<p>
			Using all the data we have, we can model an actor's career by looking at
			what has happened to actors with similar stats in the past.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A line graph of career age vs. film count, contrasting Robert De Niro and
			Chevy Chase's trajectories against Sydney Sweeney's.
		</p>
		<p>
			Take Sydney Sweeney. She's been in 16 films since her debut 15 years ago.
			At the same point in their career, Robert De Niro had also racked up 16
			films — and went on to a brilliant career totalling 87. Conversely, Chevy
			Chase reached the same milestone in the same time — and only ever appeared
			in 27.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same graph gains many simulated career trajectory lines.
		</p>
		<p>
			This means that whatever actor we use to model a Gen Z's career trajectory
			can massively impact the results. For each actor, we consider similar
			actors based on proximity to them, and randomly select one weighted by how
			close they are. To minimize the noise, we'll run this simulation 10,000
			times and see who comes out on top.
		</p>
	</section>

	<section class="step">
		<p class="visual">A bar chart of simulation win counts by actor.</p>
		<p>
			Indeed, Chloë Grace Moretz wins in a quarter of simulations. She doesn't
			exactly have a clear majority, despite already being well-clear of these
			people from an average distance perspective. Tap a bar to see how that
			contender's stats compare.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A fan chart of Samuel L. Jackson's projected average distance against the
			simulated winners.
		</p>
		<p>
			On average, the winning score is 2.33, nowhere near SLJ's current average
			distance. We're counting on SLJ's average distance getting worse as he
			stops appearing in movies, or a Marvel-sized cinematic universe being
			spawned again.
		</p>
	</section>

	<section class="step">
		<p class="visual">The same fan chart, framing the conclusion.</p>
		<p>
			What I can tell you is that our first female center of hollywood is very
			likely to happen next, with 77% of the wins going to women, perhaps not
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

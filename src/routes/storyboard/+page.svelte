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
			heavily with average distance. Is film count the only signal though? What
			else could we use to accurately predict an actor's average distance?
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same scatter plot, framing the question of what else besides film
			count matters.
		</p>
		<p>
			Just because you're in loads of films doesn't necessarily mean you've got
			a lot of connections in the graph. And just because you've got a lot of
			connections in the graph, doesn't mean you've got the <i>right</i> connections
			to make you the center of Hollywood.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same scatter plot, Julie Walters highlighted as an under-performer.
		</p>
		<p>
			Dame Julie Walters under-performs drastically on average distance. In this
			respect, she's got two things going against her:
			<br />
			1. She's <i>franchise-heavy</i>: Harry Potter, Paddington, Mamma Mia to
			name a few. This means she works with the same actors repeatedly. In fact,
			almost half of the films she's in are part of a franchise.
			<br />
			2. She works in <i>largely British ensembles</i>, containing
			less-connected actors from a pure Hollywood perspective. She needs to rely
			on well-connected costars like Gary Oldman (#18th), Nicole Kidman (#21st)
			and Meryl Streep (#27th) to bring that average distance down for her.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The scatter plot pairs up actors; the reader guesses which of each pair
			has the lower average distance.
		</p>
		<p>
			Let's generalise this idea into two hypotheses:
			<br />
			1. Starring with the <i>same</i> people.
			<br />
			2. Starring with the <i>right</i> people.
			<br />
			Consider these actors. Intuitively, who in each pair do you think has the lower
			average distance?
		</p>
	</section>

	<section class="step">
		<p class="visual">The quiz answer is revealed on the scatter plot.</p>
		<p>
			Seth Rogen and Charlize Theron are in similar numbers of films - they even
			costarred in "Long Shot". However, Charlize Theron tends to work with
			actors she's not worked with before. Conversely, Seth Rogen repeatedly
			works with the same actors. For example, Jonah Hill is in 8 of his films.
		</p>
	</section>

	<section class="step">
		<p class="visual">A scatter plot of film count vs. concurrency.</p>
		<p>
			<i>Concurrency</i> is a measure of how frequently you work with the same actors.
			Seth Rogen having a concurrency of 0.28 means that for each of his films, he
			would have worked with 28% of the cast before.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same concurrency scatter plot, explaining what low concurrency means
			for average distance.
		</p>
		<p>
			If your concurrency is low, you work for the first time with actors more
			often. This means you create more connections in the graph and it will
			take you fewer films to get your average distance down.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same concurrency scatter plot, illustrating a hypothetical single-film
			case with Samuel L. Jackson.
		</p>
		<p>
			If you starred in one film with Samuel L Jackson and him alone, you would
			immediately have an average distance of 3.08, putting you in the top 75%
			of hollywood.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The same concurrency scatter plot, pivoting toward costar degree as the
			next signal.
		</p>
		<p>
			Due to its circular nature, we can't use "low costar average distance" as
			a signal for explaining someone's average distance. We can however use how
			many connections their costars have in the graph i.e their costars' <i
				>degree</i
			>.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			A scatter plot of film count vs. costars' average degree.
		</p>
		<p>
			Here's the same graph, but measuring the average degree of their top 50
			costars.
		</p>
	</section>

	<h2>Future</h2>

	<section class="step">
		<p class="visual">
			A scatter plot of predicted vs. actual average distance, with toggleable
			features that pull dots toward the diagonal.
		</p>
		<p>
			So both of our hypotheses hold up against our example pairs. These two new
			pieces of information can be used to explain why two actors with similar
			numbers of films can have such different average distances. Combining all
			three pieces of information allows us to predict an actor's mean average
			distance much more accurately.
		</p>
	</section>

	<section class="step">
		<p class="visual">
			The scatter plot highlights Gen Z actors, led by Chloë Grace Moretz.
		</p>
		<p>
			Now, Samuel L. Jackson can't be the center forever. At some point, someone
			must overtake him. Which Gen Z actor do we think is going to do that? The
			Gen Z actor with the current lowest average distance is Chloë Grace
			Moretz. However, we know that's not all we need to have confidence in
			simply saying she's Gen Z's Kevin Bacon.
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

<script>
	// @ts-check
	// The body of a route panel: every shortest route an actor has to Bacon, and
	// every film behind each hop of it. The chart draws the routes and names no
	// films; this is where they are named.
	//
	// A pure renderer, and strictly one — it is handed resolved routes rather than
	// an id because its two callers read different graphs. Step 1's tour walks the
	// 18 curated intro edges (intro-routes.js `routeSummary`); the actor search
	// walks the corpus path the build exports for its 1,449-actor pool (search.js
	// `routeFilmsToBacon`). Neither graph can answer for the other's actors, so
	// the shape is the only thing this can depend on.

	/** @typedef {{ to: string, films: { title: string, year: number|null }[] }} Hop */
	/** @type {{ routes: { hops: Hop[] }[] }} */
	let { routes } = $props();
</script>

{#if routes.length}
	<!-- no preamble: the heading names both ends and the term the reader opened
	     already said how far apart they are. Alternative routes are just the next
	     block down, divided by a rule. -->
	<ol class="routes">
		{#each routes as route, i (i)}
			<li>
				<ol class="hops">
					{#each route.hops as hop, h (h)}
						<li>
							<!-- the films of one hop, comma-joined: a hop is one link however
							     many films made it, so they belong on one line. The separator's
								     space is an entity: Svelte drops a literal trailing space at
								     the end of an element -->
							<p class="films">
								{#each hop.films as film, f (film.title)}{#if f}<span
											class="sep">,&#32;</span
										>{/if}<cite>{film.title}</cite>{#if film.year}<span
											class="year">&nbsp;({film.year})</span
										>{/if}{/each}
							</p>
							<!-- the actor this hop hands off to, so a route reads top to
							     bottom: film, who it reaches, film, who it reaches -->
							<p class="to">{hop.to}</p>
						</li>
					{/each}
				</ol>
			</li>
		{/each}
	</ol>
{/if}

<style>
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.routes > li + li {
		margin-top: 0.625rem;
		padding-top: 0.625rem;
		border-top: 1px solid var(--color-border);
	}

	.hops > li {
		/* the rail reads as the route running down toward Bacon */
		padding-left: 0.625rem;
		border-left: 2px solid var(--color-border);
	}

	p {
		margin: 0;
	}

	.to {
		color: var(--color-fg-light);
		font-size: var(--12px, 12px);
	}

	.to::before {
		content: "↳ ";
	}

	.year,
	.sep {
		color: var(--color-fg-light);
	}
</style>

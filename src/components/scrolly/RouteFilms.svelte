<script>
	// @ts-check
	// The body of step 1's route panel: every shortest route the focused actor has
	// to Bacon through the network on screen, and every corpus film behind each hop
	// of it. The chart draws the routes and names no films; this is where they are
	// named. A pure renderer — routeSummary resolves the ids to names.
	import { routeSummary } from "./intro-routes.js";

	/** @type {{ id: number }} */
	let { id } = $props();

	const summary = $derived(routeSummary(id));
</script>

{#if summary}
	<!-- no preamble: the heading names both ends and the term the reader opened
	     already said how far apart they are. Alternative routes are just the next
	     block down, divided by a rule. -->
	<ol class="routes">
		{#each summary.routes as route, i (i)}
			<li>
				<ol class="hops">
					{#each route.hops as hop, h (h)}
						<li>
							<!-- the films of one hop, comma-joined: a hop is one link however
							     many films made it, so they belong on one line -->
							<p class="films">
								{#each hop.films as film, f (film.title)}{#if f}<span
											class="sep">{", "}</span
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

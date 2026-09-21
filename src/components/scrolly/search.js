// @ts-check
// The reader's own actor: the pool the search control offers, the substring
// match behind it, and the route home it prints.
//
// Split out of states.js on 2026-09-21, when the rank guess stopped being the
// only place in the story that asks the reader to name somebody. states.js is
// the STATE registry; this is a data index, and four layouts now want the
// highlight rule without wanting the registry.
import rawNodes from "$data/scrolly-nodes.json";
import { BY_RANK, RANK_TOP_N } from "./cast.js";
import { INK } from "./palette.js";

/** @typedef {[name: string, film: string, year: number | null]} PathStep */

/** name lookup over the node tuples — the same column states.js reads. The
 * tuples type as a union of their columns, so the cast is what says which. */
const nameOf = (id) => /** @type {string} */ (rawNodes.nodes[id][1]);

/**
 * The actors the search offers, in closeness-rank order
 * (tasks/build-scrolly-nodes.js): everyone sdokb scores as recognisable, plus
 * everyone this story names or draws, minus anyone the four charts cannot place.
 *
 * Fame has to come from outside the corpus. Closeness rank, film count and
 * costar degree all measure how much an actor has WORKED, and this story is
 * largely about young actors who have not worked much — the first cut of this
 * pool was the top thousand by rank, and it had Tom Hollander at 835 but not Tom
 * Holland at 1255, nor Zendaya at 3911, nor Sydney Sweeney at 4875, who is the
 * career chart's own hero line. The story's cast is unioned in rather than
 * filtered by fame for the mirror reason: Recognizability is PRESENT fame, and
 * Gene Hackman scores 2.
 *
 * Built by the task rather than sliced here so the pool, the routes home and the
 * guard that every member plots on all four charts are one decision in one
 * place — a pool that drifted from `searchPaths` would be a result with no route
 * to print.
 * @type {number[]}
 */
export const SEARCH_POOL = /** @type {number[]} */ (rawNodes.searchPool);

/**
 * The rank ladder's own, narrower pool. Scoped to the top-N RankBars actually
 * renders, so every result there has a visible row to scroll to and highlight —
 * a constraint the four-chart search does not have and must not inherit.
 * @type {number[]}
 */
export const RANK_POOL = BY_RANK.slice(0, RANK_TOP_N).map((n) => n.id);

/**
 * Case-insensitive substring search over one pool, in the pool's own order.
 *
 * Substring rather than fuzzy on purpose: the pool is names the reader arrives
 * with in mind, so they type the one they want, and a fuzzy rank would put a
 * near-miss above an exact prefix. Two characters is the floor because one
 * matches hundreds.
 *
 * @param {string} query
 * @param {{ pool: number[], limit?: number }} options
 * @returns {{ id: number, name: string }[]}
 */
export function searchActors(query, { pool, limit = 8 }) {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	const results = [];
	for (const id of pool) {
		if (!nameOf(id).toLowerCase().includes(q)) continue;
		results.push({ id, name: nameOf(id) });
		if (results.length >= limit) break;
	}
	return results;
}

/**
 * One actor's shortest route back to Bacon: `[costar, film, year]` per hop,
 * walking toward him and ending on him. Empty for Bacon himself.
 *
 * Its length is the actor's `hop` — asserted at build time, because the band a
 * dot sits in and the sentence printed beside it would otherwise be free to
 * disagree with nothing on screen to say so.
 *
 * @param {number} id
 * @returns {PathStep[] | null} null for an actor outside the pool
 */
export function pathToBacon(id) {
	return (
		/** @type {PathStep[] | undefined} */ (rawNodes.searchPaths[id]) ?? null
	);
}

/**
 * The route home in the shape RouteFilms renders, so the searched actor's
 * chain of films is drawn by the same component that draws step 1's.
 *
 * The two routes come from different graphs and cannot share a source: step 1
 * walks the 18 curated intro edges (intro-routes.js), which reach fifteen
 * actors, while this reads the corpus path the build exports for all 1,449. The
 * SHAPE is what they share. A pool route is a single chain carrying one film per
 * hop, so it is one route of one film each — RouteFilms's multi-route, multi-film
 * markup covers that without knowing which caller it is drawing.
 *
 * @param {number} id
 * @returns {{ hops: { to: string, films: { title: string, year: number|null }[] }[] }[]}
 */
export function routeFilmsToBacon(id) {
	const path = pathToBacon(id);
	// Bacon himself has an empty path and nobody outside the pool has one at
	// all; neither has a chain to draw, and the caption says so in words instead
	if (!path?.length) return [];
	return [
		{
			hops: path.map(([name, film, year]) => ({
				to: name,
				films: [{ title: film, year }]
			}))
		}
	];
}

/**
 * The reader's mark. Ink — the same black the story marks its own subjects in.
 * It was purple for half a day, on the reasoning that purple is the one
 * category colour no chart spends and that ink would read as Bacon's; in
 * practice neither worried the eye. Nothing is ambiguous about it: a marked dot
 * is the only ink in a band of red/blue/cyan/grey, it is nowhere near Bacon's
 * dot at the top of the stack, and it is the only dot on any of the four charts
 * carrying a name the reader chose.
 */
export const SEARCH_RGB = INK;

/** the radius a searched dot takes on the three films scatters — the same one
 * the quiz and the costar chart already give a singled-out dot, so the reader's
 * actor reads as the same kind of mark rather than a louder one */
export const SEARCH_DOT_R = 5.5;

/**
 * The searched actor a layout should mark, or null. The one place the param
 * name is spelled, so a layout can never read a field the selector doesn't set.
 * @param {{ searchId?: number | null } | null | undefined} params
 */
export const searchedId = (params) => params?.searchId ?? null;

/**
 * A state's label list with the searched actor added. Deduplicated because the
 * reader is free to search for somebody the step already names, and a doubled
 * id would render two elements onto one dot.
 * @param {number[]} ids
 * @param {{ searchId?: number | null } | null | undefined} params
 */
export function withSearchLabel(ids, params) {
	const id = searchedId(params);
	return id == null ? ids : [...new Set([...ids, id])];
}

/**
 * A state's `params` selector, wrapped so it also carries the searched actor.
 * Every searchable state reads the field the same way and none of them wants a
 * say in it, so this is the whole of what they declare.
 * @param {(story: any, stepParams: any) => Object} [selector]
 */
export const withSearchParams = (selector) => (s, stepParams) => ({
	...(selector ? selector(s, stepParams) : stepParams),
	searchId: s.search.actorId
});

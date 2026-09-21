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
import { PURPLE } from "./palette.js";

/** @typedef {[name: string, film: string, year: number | null]} PathStep */

/** name lookup over the node tuples — the same column states.js reads. The
 * tuples type as a union of their columns, so the cast is what says which. */
const nameOf = (id) => /** @type {string} */ (rawNodes.nodes[id][1]);

/**
 * The thousand actors the search offers, in closeness-rank order
 * (tasks/build-scrolly-nodes.js). Built there rather than sliced from BY_RANK
 * here so that the pool, the routes home and the guards that every member plots
 * on all four charts are one decision made in one place — a pool that drifted
 * from `searchPaths` would be a search result with no route to print.
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
 * Substring rather than fuzzy on purpose: the pool is a thousand names the
 * reader arrives with in mind, so they type the one they want, and a fuzzy rank
 * would put a near-miss above an exact prefix. Two characters is the floor
 * because one matches hundreds.
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

/** the deepest route the pool holds — what a card must reserve room for */
export const MAX_PATH_STEPS = Math.max(
	...SEARCH_POOL.map((id) => pathToBacon(id)?.length ?? 0)
);

/**
 * The reader's mark. Purple because it is the one category colour no chart
 * spends: the hop bands own red/blue/cyan/grey, the quiz owns green and red,
 * and ink is how the story marks its OWN subject — a searched actor drawn in
 * ink on the hop chart would be indistinguishable from Bacon, who is ink by
 * being hop 0.
 */
export const SEARCH_RGB = PURPLE;

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

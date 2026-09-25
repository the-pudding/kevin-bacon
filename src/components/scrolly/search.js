// @ts-check
// The reader's own actor: the pools the search control offers and the substring
// match behind them.
//
// Split out of states.js on 2026-09-21, when the rank guess stopped being the
// only place in the story that asks the reader to name somebody. states.js is
// the STATE registry; this is a data index, and three layouts now want the
// highlight rule without wanting the registry.
import rawNodes from "$data/scrolly-nodes.json";
import { BY_RANK, RANK_TOP_N } from "./cast.js";
import { SEARCH } from "./palette.js";

/** name lookup over the node tuples — the same column states.js reads. The
 * tuples type as a union of their columns, so the cast is what says which. */
const nameOf = (id) => /** @type {string} */ (rawNodes.nodes[id][1]);

/**
 * The one pool all four searchable steps offer, in closeness-rank order
 * (tasks/build-scrolly-nodes.js): everyone sdokb scores as recognisable, plus
 * everyone this story names or draws, minus anyone the charts cannot place —
 * narrowed to whoever also has an honest hop 1-4 breakdown
 * (`story.rankHopBands`), since the hop chart's anchor search draws from this
 * same pool and an anchor with no row has no breakdown to draw. That costs a
 * couple of story-labelled dots their search entry (Chevy Chase, Jacob
 * Elordi) — Owen's call, made once the alternative (searchable everywhere but
 * step 6) turned out to be the same silent "nothing found" failure this pool
 * exists to avoid.
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
 * Built by the task rather than sliced here so the pool and the guard that every
 * member plots on the charts that offer it are one decision in one place.
 * @type {number[]}
 */
export const SEARCH_POOL = /** @type {number[]} */ (rawNodes.searchPool);

/**
 * The ranked top 250. The rank guess's own, narrower pool: every result needs
 * a visible RankBars row to scroll to, and RankBars only renders this many.
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
 * The reader's mark. Ink — the same black the story marks its own subjects in.
 * It was purple for half a day, on the reasoning that purple is the one
 * category colour no chart spends and that ink would read as Bacon's; in
 * practice neither worried the eye. Nothing is ambiguous about it: a marked dot
 * is the only ink in a cloud of category colour, and it is the only dot on any
 * of the three charts carrying a name the reader chose.
 */
export const SEARCH_RGB = SEARCH;

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

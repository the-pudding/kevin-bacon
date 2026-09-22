// The actor search's two pools and the match behind them. Named assertions
// rather than hashes, for the reason scatter-quiz.spec.js gives: a golden is
// keyed on the params JSON, so it cannot catch a pool that silently changed
// membership.
import { describe, expect, test } from "vitest";
import {
	RANK_POOL,
	SEARCH_POOL,
	searchActors,
	searchedId,
	withSearchLabel
} from "../search.js";
import { ANCHOR_ID, makeNodes } from "../nodes.js";
import { HOP_CYCLE_IDS, RANK_TOP_N } from "../cast.js";
import story from "$data/scrolly-story.json";

const { nodes } = makeNodes();
const nameOf = (id) => nodes[id].name;

describe("the search pool", () => {
	test("is what the build script published, in rank order", () => {
		expect(SEARCH_POOL.length).toBeGreaterThan(1000);
		const ranks = SEARCH_POOL.map((id) => nodes[id].rank);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	// The reason the pool is not just the top N by closeness: every measure this
	// corpus has is a measure of how much an actor has WORKED, and the story is
	// largely about actors who have not worked much yet. These are the names that
	// were missing when it was, and the ones a reader is likeliest to try.
	test("holds the young actors the story is about", () => {
		const named = new Set(SEARCH_POOL.map((id) => nodes[id].name));
		for (const name of [
			"Tom Holland",
			"Zendaya",
			"Sydney Sweeney",
			"Timothée Chalamet",
			"Florence Pugh",
			"Anya Taylor-Joy",
			"Austin Butler",
			"Millie Bobby Brown"
		]) {
			expect(named, name).toContain(name);
		}
	});

	// Owen's call: an actor whose corpus reach only settles at hop 5+ has no
	// honest hop 1-4 breakdown, so they are dropped from every search rather
	// than being searchable everywhere except the hop chart. This costs two
	// names the story itself labels on other charts (career, Gen-Z race) their
	// search entry — a deliberate, known gap, not a bug.
	test("drops actors with no honest hop 1-4 breakdown, even ones the story labels", () => {
		const named = new Set(SEARCH_POOL.map((id) => nodes[id].name));
		for (const name of ["Chevy Chase", "Jacob Elordi"]) {
			expect(named, name).not.toContain(name);
		}
	});

	// …and the mirror: Recognizability is PRESENT fame, so the story's own cast
	// is unioned in rather than filtered by it.
	test("holds the story's own cast however famous they are now", () => {
		const named = new Set(SEARCH_POOL.map((id) => nodes[id].name));
		for (const name of ["Gene Hackman", "Jack Nicholson", "Kevin Bacon"]) {
			expect(named, name).toContain(name);
		}
	});

	test("holds Bacon himself", () => {
		// he is rank 175, so he is in it whether or not anybody meant him to be —
		// and searching for the anchor has to work rather than return nothing
		expect(SEARCH_POOL).toContain(ANCHOR_ID);
	});

	// what makes "every result plots on all three charts" true, and so what lets
	// the control have no per-chart "not shown here" state
	test("every member plots on all three charts", () => {
		for (const id of SEARCH_POOL) {
			const n = nodes[id];
			expect(n.films, n.name).toBeGreaterThanOrEqual(5);
			expect(n.top50, n.name).not.toBeNull();
			expect(n.careerAge, n.name).not.toBeNull();
		}
	});

	test("the ranked 250 are their own, narrower pool", () => {
		// scoped to what RankBars renders, so every result there has a visible row
		expect(RANK_POOL).toHaveLength(RANK_TOP_N);
	});
});

// The two ways step 6's hop chart picks up an anchor: its own cycle, and
// SEARCH_POOL, the one pool every searchable step now offers. Both are
// bounded by the same thing — an anchor needs a `story.rankHopBands` row
// (from data/top-250-hop-bands-with-hop-counts.csv) or it has no rows to
// draw. `hopFractions` would reduce over `undefined` and the chart would come
// apart on a timer, several seconds after anything a test could point at. The
// build script's own search-pool filter is what makes the first test here
// tautological rather than incidental — see tasks/build-scrolly-nodes.js.
describe("the hop chart's anchors", () => {
	const hasBreakdown = (id) => Array.isArray(story.rankHopBands[id]);

	test("every actor the search can anchor on has a breakdown", () => {
		for (const id of SEARCH_POOL)
			expect(hasBreakdown(id), nameOf(id)).toBe(true);
	});

	test("every actor the cycle visits has one too", () => {
		expect(HOP_CYCLE_IDS.length).toBeGreaterThan(1);
		for (const id of HOP_CYCLE_IDS)
			expect(hasBreakdown(id), nameOf(id)).toBe(true);
	});

	// The step rests on Bacon, so the cycle must not open on him: its first turn
	// would move nothing and the chart would look frozen for a beat. Nor may it
	// name anyone twice, for the same reason one turn on.
	test("the cycle leaves Bacon behind and names nobody twice", () => {
		expect(HOP_CYCLE_IDS).not.toContain(ANCHOR_ID);
		expect(new Set(HOP_CYCLE_IDS).size).toBe(HOP_CYCLE_IDS.length);
	});
});

describe("searchActors", () => {
	test("needs two characters", () => {
		expect(searchActors("", { pool: SEARCH_POOL })).toEqual([]);
		expect(searchActors("s", { pool: SEARCH_POOL })).toEqual([]);
		expect(searchActors("sa", { pool: SEARCH_POOL }).length).toBeGreaterThan(0);
	});

	test("ignores case and surrounding space", () => {
		const name = nameOf(SEARCH_POOL[0]);
		const hit = (q) => searchActors(q, { pool: SEARCH_POOL, limit: 50 });
		expect(hit(name.toUpperCase()).map((r) => r.id)).toContain(SEARCH_POOL[0]);
		expect(hit(`  ${name.toLowerCase()}  `).map((r) => r.id)).toContain(
			SEARCH_POOL[0]
		);
	});

	test("matches anywhere in the name, not just the start", () => {
		const name = nameOf(SEARCH_POOL[0]);
		const tail = name.slice(-4);
		expect(
			searchActors(tail, { pool: SEARCH_POOL, limit: 50 }).map((r) => r.id)
		).toContain(SEARCH_POOL[0]);
	});

	test("caps at the limit and returns names with ids", () => {
		const results = searchActors("a", { pool: SEARCH_POOL }); // too short
		expect(results).toEqual([]);
		const many = searchActors("an", { pool: SEARCH_POOL, limit: 3 });
		expect(many).toHaveLength(3);
		for (const r of many) expect(r.name).toBe(nameOf(r.id));
	});

	test("is scoped to the pool it is given", () => {
		// an actor in the search pool but outside the top 250 must not be offered as
		// a rank guess, or the ladder has no row to scroll to
		const outside = SEARCH_POOL.find((id) => !RANK_POOL.includes(id));
		const q = nameOf(outside);
		expect(
			searchActors(q, { pool: SEARCH_POOL, limit: 50 }).map((r) => r.id)
		).toContain(outside);
		expect(
			searchActors(q, { pool: RANK_POOL, limit: 50 }).map((r) => r.id)
		).not.toContain(outside);
	});
});

describe("the layout helpers", () => {
	test("searchedId reads the one param name, and tolerates no params", () => {
		expect(searchedId(null)).toBeNull();
		expect(searchedId(undefined)).toBeNull();
		expect(searchedId({})).toBeNull();
		expect(searchedId({ searchId: 7 })).toBe(7);
	});

	test("withSearchLabel adds the searched actor without doubling one", () => {
		expect(withSearchLabel([1, 2], null)).toEqual([1, 2]);
		expect(withSearchLabel([1, 2], { searchId: 3 })).toEqual([1, 2, 3]);
		// a reader is free to search for somebody the step already names, and two
		// label elements on one dot would overprint
		expect(withSearchLabel([1, 2], { searchId: 2 })).toEqual([1, 2]);
	});
});

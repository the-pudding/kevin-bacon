// The actor search's index and the route home it prints. Named assertions
// rather than hashes, for the reason scatter-quiz.spec.js gives: a golden is
// keyed on the params JSON, so it cannot catch a pool that silently changed
// membership or a chain that stopped agreeing with its own hop count.
import { describe, expect, test } from "vitest";
import {
	MAX_PATH_STEPS,
	RANK_POOL,
	SEARCH_POOL,
	pathToBacon,
	searchActors,
	searchedId,
	withSearchLabel
} from "../search.js";
import { ANCHOR_ID, makeNodes } from "../nodes.js";
import { RANK_TOP_N } from "../cast.js";

const { nodes } = makeNodes();
const nameOf = (id) => nodes[id].name;

describe("the search pool", () => {
	test("is the thousand the build script published, in rank order", () => {
		expect(SEARCH_POOL).toHaveLength(1000);
		const ranks = SEARCH_POOL.map((id) => nodes[id].rank);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	test("holds Bacon himself", () => {
		// he is rank 175, so he is in it whether or not anybody meant him to be —
		// and searching for the anchor has to work rather than return nothing
		expect(SEARCH_POOL).toContain(ANCHOR_ID);
	});

	// what makes "every result plots on all four charts" true, and so what lets
	// the control have no per-chart "not shown here" state
	test("every member plots on all four charts", () => {
		for (const id of SEARCH_POOL) {
			const n = nodes[id];
			expect(n.films, n.name).toBeGreaterThanOrEqual(5);
			expect(n.top50, n.name).not.toBeNull();
			expect(n.careerAge, n.name).not.toBeNull();
		}
	});

	test("the rank ladder keeps its own, narrower pool", () => {
		// scoped to what RankBars renders, so every result there has a visible row
		expect(RANK_POOL).toHaveLength(RANK_TOP_N);
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
		// an actor in the thousand but outside the top 250 must not be offered as
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

describe("pathToBacon", () => {
	test("is as long as the actor's hop, and ends on Bacon", () => {
		for (const id of SEARCH_POOL) {
			const chain = pathToBacon(id);
			expect(chain, nameOf(id)).not.toBeNull();
			// the guard the whole export exists for: the band a dot sits in and the
			// sentence printed beside it must count the same number of steps
			expect(chain.length, nameOf(id)).toBe(nodes[id].hop);
			if (chain.length === 0) continue;
			expect(chain.at(-1)[0], nameOf(id)).toBe("Kevin Bacon");
		}
	});

	test("every step names a co-star and a film", () => {
		for (const id of SEARCH_POOL) {
			for (const [name, film] of pathToBacon(id)) {
				expect(typeof name, nameOf(id)).toBe("string");
				expect(name.length, nameOf(id)).toBeGreaterThan(0);
				expect(typeof film, nameOf(id)).toBe("string");
				expect(film.length, nameOf(id)).toBeGreaterThan(0);
			}
		}
	});

	test("Bacon's own route is empty", () => {
		expect(pathToBacon(ANCHOR_ID)).toEqual([]);
	});

	test("an actor outside the pool has none", () => {
		const outside = nodes.findIndex((n) => !SEARCH_POOL.includes(n.id));
		expect(pathToBacon(outside)).toBeNull();
	});

	test("MAX_PATH_STEPS is what the readout must reserve room for", () => {
		const longest = Math.max(
			...SEARCH_POOL.map((id) => pathToBacon(id).length)
		);
		expect(MAX_PATH_STEPS).toBe(longest);
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

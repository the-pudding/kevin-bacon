import data from "$data/scrolly-nodes.json";
import { ANCHOR_ID } from "./nodes.js";

// Shortest routes to the anchor through the curated intro network (the 18 edges
// in scrolly-nodes.json — every one a real co-star link carrying every corpus
// film that made it). Step 1's "how far is this actor from Kevin Bacon?"
// interaction reads these; the layout stays a renderer. See layouts/intro.js.

/** @typedef {{ title: string, year: number|null }} Film */
/** @typedef {{ edge: number, from: number, to: number, films: Film[] }} Segment */

const EDGES = data.edges.map(([source, target, films], edge) => ({
	edge,
	source,
	target,
	films: films.map(([title, year]) => ({ title, year }))
}));

// id → [{ edge, other }], in file order so route enumeration is deterministic
const ADJACENCY = new Map();
for (const { edge, source, target } of EDGES) {
	for (const [a, b] of [
		[source, target],
		[target, source]
	]) {
		if (!ADJACENCY.has(a)) ADJACENCY.set(a, []);
		ADJACENCY.get(a).push({ edge, other: b });
	}
}

// hops from the anchor, by BFS over the intro edges alone. Deliberately not the
// corpus `hop` on each node: a route can only be drawn along edges the reader
// can see, so the distance shown has to be the one this graph supports.
const DIST = new Map([[ANCHOR_ID, 0]]);
const queue = [ANCHOR_ID];
while (queue.length) {
	const id = queue.shift();
	for (const { other } of ADJACENCY.get(id) ?? []) {
		if (DIST.has(other)) continue;
		DIST.set(other, DIST.get(id) + 1);
		queue.push(other);
	}
}

const NAMES = data.nodes.map((n) => n[1]);
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

/** hops from the anchor along intro edges (0 for the anchor itself) */
export const introDistance = (id) => DIST.get(id) ?? null;

/**
 * Every shortest route from `id` to the anchor, each as segments ordered
 * outward-in — from `id` toward Bacon, the direction the sentence reads.
 * Walks only the edges that step one hop closer, so all ties are returned:
 * Austin Butler and Saoirse Ronan have two routes, Margot Robbie three.
 * @returns {Segment[][]}
 */
export function routesTo(id) {
	const dist = DIST.get(id);
	if (dist == null || dist === 0) return [];
	/** @type {Segment[][]} */
	const routes = [];
	const walk = (at, sofar) => {
		if (at === ANCHOR_ID) {
			routes.push(sofar);
			return;
		}
		for (const { edge, other } of ADJACENCY.get(at) ?? []) {
			if (DIST.get(other) !== DIST.get(at) - 1) continue;
			const { films } = EDGES[edge];
			walk(other, [...sofar, { edge, from: at, to: other, films }]);
		}
	};
	walk(id, []);
	return routes;
}

/** every actor on any shortest route from `id` to the anchor, including both ends */
export function routeActors(id) {
	const ids = new Set([ANCHOR_ID, id]);
	for (const seg of routesTo(id).flat()) {
		ids.add(seg.from);
		ids.add(seg.to);
	}
	return ids;
}

/**
 * A focused actor's distance to the anchor, broken into the pieces the step card
 * and the route panel render. The card states the distance — `count` is the term
 * the reader opens for the detail — and the panel walks `routes`, which names
 * every actor and every film the highlight is drawn from. Names are resolved here
 * so both consumers stay pure renderers.
 * @typedef {{ from: string, to: string, films: Film[] }} Hop
 * @typedef {{ hops: Hop[] }} Route
 * @param {number} id
 * @returns {{ name: string, anchor: string, count: string, routes: Route[] } | null}
 */
export function routeSummary(id) {
	const routes = routesTo(id);
	// the anchor has no route to itself, and nothing else in the network is
	// unreachable — the step never focuses either, so there is nothing to caption
	if (!routes.length) return null;
	const hops = routes[0].length;
	return {
		name: NAMES[id],
		anchor: NAMES[ANCHOR_ID],
		count: `${COUNT_WORDS[hops]} movie${hops === 1 ? "" : "s"}`,
		routes: routes.map((route) => ({
			hops: route.map((seg) => ({
				from: NAMES[seg.from],
				to: NAMES[seg.to],
				films: seg.films
			}))
		}))
	};
}

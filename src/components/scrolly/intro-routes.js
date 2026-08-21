import data from "$data/scrolly-nodes.json";
import { ANCHOR_ID } from "./nodes.js";

// Shortest routes to the anchor through the curated intro network (the 18 edges
// in scrolly-nodes.json — every one a real co-star link carrying the corpus film
// that made it). Step 1's "how far is this actor from Kevin Bacon?" interaction
// reads these; the layout stays a renderer. See layouts/intro.js.

/** @typedef {{ edge: number, from: number, to: number, film: string, year: number|null }} Segment */

const EDGES = data.edges.map(([source, target, film, year], edge) => ({
	edge,
	source,
	target,
	film,
	year
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
			const { film, year } = EDGES[edge];
			walk(other, [...sofar, { edge, from: at, to: other, film, year }]);
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
 * The headline over a focused actor's routes. Says only the distance: every route
 * is drawn and every film on it named, so the chart already shows how many there
 * are — counting them in words as well is just noise over the top of it.
 */
export function routeHeadline(id, routes) {
	const name = NAMES[id];
	if (!routes.length) return `${name} — the center of this game`;
	const hops = routes[0].length;
	return `${name} is ${COUNT_WORDS[hops]} movie${hops === 1 ? "" : "s"} away`;
}

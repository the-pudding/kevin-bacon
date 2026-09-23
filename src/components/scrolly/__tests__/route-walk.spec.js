import { describe, expect, test } from "vitest";
import { NODE_COUNT, INTRO_IDS, ANCHOR_ID } from "../nodes.js";
import { STRIDE, edgeIndex } from "../attr-buffer.js";
import { introDistance, routesTo, routeActors } from "../intro-routes.js";
import { BOXES, buildLayout, nodes } from "./helpers.js";

// networkIntro's route walk: every route clears, the bare network holds, then
// the new route travels from the actor in to Bacon, a leg per movie. Named
// rather than left to the goldens, because a golden only says the walk
// changed, not what it now does.
const idOf = (name) => nodes.find((n) => n.name === name).id;
const walkFor = (focus) => {
	const { attrs, paramWalk } = buildLayout("networkIntro", BOXES[0], { focus });
	return { attrs, ...paramWalk };
};
/** a slot's window, in ms of the walk */
const windowOf = ({ ms, windows }, slot) => [
	Math.round(windows[slot * 2] * ms),
	Math.round(windows[slot * 2 + 1] * ms)
];
const edgeWindow = (walk, edge) => windowOf(walk, NODE_COUNT + edge);
const oneMovie = () => INTRO_IDS.find((id) => introDistance(id) === 1);

describe("routeWalk", () => {
	test("the cleared frame lights no route, even one the new route shares", () => {
		const margot = idOf("Margot Robbie");
		const { clear, attrs } = walkFor(margot);
		for (const { edge } of routesTo(margot).flat()) {
			expect(attrs[edgeIndex(edge) + 2]).toBe(1);
			expect(clear[edgeIndex(edge) + 2]).toBe(0);
		}
		for (const id of routeActors(margot)) {
			if (id === ANCHOR_ID || id === margot) continue;
			// dimmed with the crowd, where the landed frame has them at full
			expect(clear[id * STRIDE + 6]).toBeLessThan(attrs[id * STRIDE + 6]);
		}
	});

	test("the actor takes their landed look during the fade, as their name appears", () => {
		const margot = idOf("Margot Robbie");
		const { clear, attrs, labelAt } = walkFor(margot);
		const dot = (buf) =>
			Array.from(buf.slice(margot * STRIDE, (margot + 1) * STRIDE));
		expect(dot(clear)).toEqual(dot(attrs));
		expect(labelAt.map(([id]) => id)).not.toContain(margot);
	});

	test("a co-star's name waits for the line reaching them", () => {
		const margot = idOf("Margot Robbie");
		const walk = walkFor(margot);
		const [out] = routesTo(margot)[0];
		const [, arrives] = edgeWindow(walk, out.edge);
		const costars = [...routeActors(margot)].filter(
			(id) => id !== ANCHOR_ID && id !== margot
		);
		expect(new Map(walk.labelAt)).toEqual(
			new Map(costars.map((id) => [id, walk.fadeMs + arrives]))
		);
	});

	test("a one-movie actor's line draws after a gap on the bare network", () => {
		const actor = oneMovie();
		const walk = walkFor(actor);
		const [[segment]] = routesTo(actor);
		const [gap, end] = edgeWindow(walk, segment.edge);
		expect(gap).toBeGreaterThan(0);
		expect(end).toBe(walk.ms);
	});

	test("a two-movie actor's lines to every co-star go first, theirs on to Bacon straight after", () => {
		const margot = idOf("Margot Robbie");
		const routes = routesTo(margot);
		expect(routes.length).toBe(3);
		const walk = walkFor(margot);
		for (const [out, home] of routes) {
			const [, handOver] = edgeWindow(walk, out.edge);
			expect(edgeWindow(walk, home.edge)).toEqual([handOver, walk.ms]);
		}
	});

	test("each movie takes as long, so a second one adds exactly one leg", () => {
		const one = walkFor(oneMovie());
		const two = walkFor(idOf("Margot Robbie"));
		const [gap, end] = edgeWindow(one, routesTo(oneMovie())[0][0].edge);
		expect(two.ms - one.ms).toBe(end - gap);
	});

	test("the co-stars ink up on the first leg, with the lines reaching them", () => {
		const margot = idOf("Margot Robbie");
		const walk = walkFor(margot);
		const [out] = routesTo(margot)[0];
		for (const id of routeActors(margot)) {
			if (id === ANCHOR_ID || id === margot) continue;
			expect(windowOf(walk, id), `node ${id}`).toEqual(
				edgeWindow(walk, out.edge)
			);
		}
	});
});

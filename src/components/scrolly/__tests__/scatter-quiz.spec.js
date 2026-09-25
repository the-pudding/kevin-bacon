// The pair quiz's answer and its verdict colours.
//
// Not covered by the goldens, and deliberately its own file after finding out
// why: a golden is keyed on the params JSON, so the change that introduced
// `revealAll` renamed every scatterQuiz key and vitest WROTE the new hashes as
// new snapshots rather than comparing them. Six goldens went obsolete, nothing
// failed, and a layout change that recoloured five dots passed the net in
// silence. Hashes can only catch a change to something already named; these
// assertions name the rule instead.
//
// The rule: height says who is closer (closer = higher, the y metric is
// remoteness), and colour says which of the two the READER named and how it
// went. A dot the reader passed over stays crowd grey whether or not it was the
// right answer — that is the ✓ on the chip's job (PairQuiz.svelte).
import { describe, expect, test } from "vitest";
import { nodes, BOXES, buildLayout } from "./helpers.js";
import { STRIDE } from "../attr-buffer.js";
import { STATE_LABELS } from "../states.js";
import { QUIZ_PAIRS, quizWinner } from "../layouts/scatters.js";
import { CROWD, QUIZ_RIGHT, QUIZ_WRONG } from "../palette.js";

const rgbAt = (attrs, id) => [...attrs.slice(id * STRIDE + 3, id * STRIDE + 6)];
const rAt = (attrs, id) => attrs[id * STRIDE + 2];
const build = (params) => buildLayout("scatterQuiz", BOXES[0], params).attrs;

/** the pair's two ids and which CHOICE index is the closer of them */
function pairAt(index) {
	const pair = QUIZ_PAIRS[index];
	const ids = [pair.a, pair.b];
	return { pair, ids, right: quizWinner(pair) === pair.a ? 0 : 1 };
}

test("quizWinner is the actor the chart plots higher, on every pair", () => {
	for (const pair of QUIZ_PAIRS) {
		const won = quizWinner(pair);
		const lost = won === pair.a ? pair.b : pair.a;
		// the y metric the dots are placed on…
		expect(nodes[won].avgDistance).toBeLessThan(nodes[lost].avgDistance);
		// …and the rank quizWinner actually reads, which must agree with it or
		// the ✓ would contradict the dot heights the reader reads it off
		expect(nodes[won].rank).toBeLessThan(nodes[lost].rank);
	}
});

describe("verdict colours", () => {
	test("a right pick greens the reader's dot and leaves the other grey", () => {
		const { ids, right } = pairAt(0);
		const attrs = build({ picks: { 0: right }, revealAll: false });
		expect(rgbAt(attrs, ids[right])).toEqual(QUIZ_RIGHT);
		expect(rgbAt(attrs, ids[1 - right])).toEqual(CROWD);
		// both come up to the answered mark — height is still the answer
		expect(rAt(attrs, ids[right])).toBe(5.5);
		expect(rAt(attrs, ids[1 - right])).toBe(5.5);
	});

	test("a wrong pick reds the reader's dot and leaves the closer one grey", () => {
		const { ids, right } = pairAt(0);
		const attrs = build({ picks: { 0: 1 - right }, revealAll: false });
		expect(rgbAt(attrs, ids[1 - right])).toEqual(QUIZ_WRONG);
		expect(rgbAt(attrs, ids[right])).toEqual(CROWD);
	});

	test("an unanswered pair is not on the chart at all", () => {
		const { ids } = pairAt(3);
		const attrs = build({ picks: { 0: 0 }, revealAll: false });
		expect(rAt(attrs, ids[0])).toBe(2); // crowd radius
		expect(rAt(attrs, ids[1])).toBe(2);
	});
});

describe("revealAll — the reader stepping back into the step", () => {
	test("shows every pair, neutrally, including ones never answered", () => {
		const { ids } = pairAt(3);
		const attrs = build({ picks: {}, revealAll: true });
		expect(rAt(attrs, ids[0])).toBe(5.5);
		expect(rgbAt(attrs, ids[0])).toEqual(CROWD);
		expect(rgbAt(attrs, ids[1])).toEqual(CROWD);
	});

	// what the old ALL_PICKED shape could not do: it fabricated a pick per pair,
	// which threw away WHICH option the reader had chosen — so stepping back
	// erased their own answers from the chart
	test("keeps the verdict on the pairs the reader did answer", () => {
		const { ids, right } = pairAt(0);
		const attrs = build({ picks: { 0: right }, revealAll: true });
		expect(rgbAt(attrs, ids[right])).toEqual(QUIZ_RIGHT);
		expect(rgbAt(attrs, ids[1 - right])).toEqual(CROWD);
	});
});

test("labels name exactly the pairs the dots show", () => {
	const labels = STATE_LABELS.scatterQuiz;
	expect(labels({ picks: {}, revealAll: false })).toEqual([]);
	expect(labels({ picks: { 0: 0 }, revealAll: false })).toEqual([
		QUIZ_PAIRS[0].a,
		QUIZ_PAIRS[0].b
	]);
	expect(labels({ picks: {}, revealAll: true })).toHaveLength(
		QUIZ_PAIRS.length * 2
	);
});

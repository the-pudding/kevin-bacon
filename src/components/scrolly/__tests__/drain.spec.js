// The curved state tween's bows (drain.js, motion.md rule 15): what every
// drain does on synthetic buffers, and every curved arrival the registry
// declares, built on the real pair of layouts it curves between.
import { describe, expect, test } from "vitest";
import { BOW_SIZE, STRIDE } from "../attr-buffer.js";
import { NODE_COUNT } from "../nodes.js";
import {
	LEAN_CAP,
	LEAN_SHARE,
	LEFT,
	RIGHT,
	bowsInto,
	drain
} from "../drain.js";
import { STATE_CURVE } from "../states.js";
import { BOXES, buildLayout } from "./helpers.js";

const box = BOXES[0];
const cap = LEAN_CAP * Math.min(box.w, box.h);

/** buffers with one dot, `id`, travelling from `from` to `to` */
function pair(id, from, to) {
	const live = new Float32Array(BOW_SIZE * STRIDE);
	const target = new Float64Array(BOW_SIZE * STRIDE);
	[live[id * STRIDE], live[id * STRIDE + 1]] = from;
	[target[id * STRIDE], target[id * STRIDE + 1]] = to;
	return { live, target };
}

describe("bowsInto", () => {
	test("a dot falling down the screen bows to its right, screen-left, by the lean", () => {
		const { live, target } = pair(7, [100, 0], [100, 300]);
		const bows = drain(RIGHT)(live, target, box.w, box.h);
		expect(bows.length).toBe(BOW_SIZE);
		expect(bows[14]).toBeCloseTo(-Math.min(cap, 300 * LEAN_SHARE), 9);
		expect(bows[15]).toBeCloseTo(0, 9);
	});

	test("a left hand is the same bow on the other side of the heading", () => {
		const { live, target } = pair(7, [100, 0], [100, 300]);
		const bows = drain(LEFT)(live, target, box.w, box.h);
		expect(bows[14]).toBeCloseTo(Math.min(cap, 300 * LEAN_SHARE), 9);
		expect(bows[15]).toBeCloseTo(0, 9);
	});

	test("a short chord takes its share of the travel; a long one is held to the cap", () => {
		const short = pair(1, [0, 0], [0, 40]);
		const long = pair(2, [0, 0], [0, 4000]);
		const right = drain(RIGHT);
		expect(
			Math.hypot(...right(short.live, short.target, box.w, box.h).slice(2, 4))
		).toBeCloseTo(40 * LEAN_SHARE, 9);
		expect(
			Math.hypot(...right(long.live, long.target, box.w, box.h).slice(4, 6))
		).toBeCloseTo(cap, 9);
	});

	test("a dot that does not travel gets no bow, and the edge groups none", () => {
		const { live, target } = pair(3, [50, 50], [50.5, 50]);
		const bows = drain(RIGHT)(live, target, box.w, box.h);
		expect(bows.every((v) => v === 0)).toBe(true);
	});

	test("sizeOf scales the lean and is handed the dot's spot and right-hand normal", () => {
		const { live, target } = pair(5, [20, 30], [220, 30]);
		const seen = [];
		const bows = bowsInto(live, target, box.w, box.h, (x, y, nx, ny) => {
			seen.push([x, y, nx, ny]);
			return 0.25;
		});
		expect(seen).toEqual([[20, 30, -0, 1]]);
		expect(bows[10]).toBeCloseTo(0, 9);
		expect(bows[11]).toBeCloseTo(0.25 * Math.min(cap, 200 * LEAN_SHARE), 9);
	});
});

describe("every curved arrival", () => {
	for (const [state, curve] of Object.entries(STATE_CURVE)) {
		for (const from of curve.from) {
			for (const b of BOXES) {
				test(`${from} → ${state}, ${b.name}: bows across the chord, one hand throughout, within the lean`, () => {
					const live = Float32Array.from(buildLayout(from, b).attrs);
					const target = buildLayout(state, b).attrs;
					const bows = curve.bows(live, target, b.w, b.h, b.bleed);
					const top = LEAN_CAP * Math.min(b.w, b.h);
					let bowed = 0;
					const hands = new Set();
					for (let id = 0; id < NODE_COUNT; id++) {
						const i = id * STRIDE;
						const dx = target[i] - live[i];
						const dy = target[i + 1] - live[i + 1];
						const len = Math.hypot(dx, dy);
						const [bx, by] = [bows[id * 2], bows[id * 2 + 1]];
						if (len < 1) {
							expect(bx).toBe(0);
							expect(by).toBe(0);
							continue;
						}
						expect(Math.abs(bx * dx + by * dy) / len).toBeLessThan(1e-6);
						// signed along the right-hand normal: one sign per arrival
						const size = (bx * -dy + by * dx) / len;
						expect(Math.abs(size)).toBeLessThanOrEqual(
							Math.min(top, len * LEAN_SHARE) + 1e-9
						);
						if (Math.abs(size) > 1) {
							bowed++;
							hands.add(Math.sign(size));
						}
					}
					expect(hands.size, "one handedness").toBe(1);
					expect(bowed, "some dot bows by more than a pixel").toBeGreaterThan(
						0
					);
					for (let k = NODE_COUNT * 2; k < BOW_SIZE; k++)
						expect(bows[k]).toBe(0);
				});
			}
		}
	}
});

import { describe, expect, test } from "vitest";
import { createCircleSet } from "../circle-set.js";

describe("createCircleSet", () => {
	test("refuses only an exact repeat in the same bucket", () => {
		const circles = createCircleSet(8);
		expect(circles.add(0, 1.5, 2.5, 3)).toBe(true);
		expect(circles.add(0, 1.5, 2.5, 3)).toBe(false);
		expect(circles.add(1, 1.5, 2.5, 3)).toBe(true);
		expect(circles.add(0, 1.5, 2.5, 3.0001)).toBe(true);
		expect(circles.add(0, 2.5, 1.5, 3)).toBe(true);
	});

	test("forgets everything on clear", () => {
		const circles = createCircleSet(8);
		circles.add(0, 1, 2, 3);
		circles.clear();
		expect(circles.add(0, 1, 2, 3)).toBe(true);
	});

	test("holds its whole capacity of distinct circles, colliding or not", () => {
		const n = 22530;
		const circles = createCircleSet(n);
		for (let k = 0; k < n; k++) {
			expect(circles.add(k % 7, k % 150, Math.floor(k / 150), 2)).toBe(true);
		}
		for (let k = 0; k < n; k++) {
			expect(circles.add(k % 7, k % 150, Math.floor(k / 150), 2)).toBe(false);
		}
	});
});

import { describe, expect, test, vi } from "vitest";
import { STRIDE, ATTR_SIZE, set, setEdge } from "../attr-buffer.js";
import {
	TRAIL_SIZE,
	TRAIL_META,
	setTrailPoints,
	setTrailHighlight
} from "../trails.js";
import { drawDots, drawEdges, drawTrails } from "../render.js";

// A 2D context that records what is drawn, and a Path2D that records its arcs
class FakePath {
	constructor() {
		this.arcs = [];
	}
	moveTo() {}
	arc(x, y, r) {
		this.arcs.push([x, y, r]);
	}
}
vi.stubGlobal("Path2D", FakePath);

function fakeContext() {
	const calls = [];
	const ctx = {
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		beginPath: () => calls.push(["beginPath"]),
		moveTo: (x, y) => calls.push(["moveTo", x, y]),
		lineTo: (x, y) => calls.push(["lineTo", x, y]),
		stroke: () => calls.push(["stroke", ctx.strokeStyle, ctx.lineWidth]),
		fill: (path) => calls.push(["fill", ctx.fillStyle, path.arcs])
	};
	return { ctx, calls };
}

describe("drawDots", () => {
	test("skips hidden and culled dots and batches the rest by colour", () => {
		const attrs = new Float64Array(ATTR_SIZE);
		set(attrs, 0, 10, 10, 3, [255, 0, 0], 1);
		set(attrs, 1, 20, 20, 3, [255, 0, 0], 1);
		set(attrs, 2, 30, 30, 3, [0, 0, 255], 1);
		set(attrs, 3, 40, 40, 3, [0, 0, 255], 0); // hidden
		set(attrs, 4, 50, 50, 3, [0, 0, 255], 1); // culled below
		const { ctx, calls } = fakeContext();
		drawDots(ctx, attrs, (i) => i / STRIDE === 4);
		const fills = calls.filter(([op]) => op === "fill");
		expect(fills.length).toBe(2);
		const drawn = fills.flatMap(([, , arcs]) => arcs.map(([x]) => x)).sort();
		expect(drawn).toEqual([10, 20, 30]);
	});
});

describe("drawEdges", () => {
	const attrs = new Float64Array(ATTR_SIZE);
	set(attrs, 0, 0, 0, 2, [0, 0, 0], 1);
	set(attrs, 1, 50, 0, 2, [0, 0, 0], 1); // live position of the far end
	const target = Float64Array.from(attrs);
	set(target, 1, 100, 0, 2, [0, 0, 0], 1); // where it is going
	setEdge(target, 0, 1, 1);
	// the frame the tween eased from: both ends further left than the live frame
	const start = Float32Array.from(attrs);
	set(start, 0, -20, 0, 2, [0, 0, 0], 1);
	set(start, 1, 30, 0, 2, [0, 0, 0], 1);

	test("a live edge points at its far end's TARGET, drawn by its progress", () => {
		const frame = Float64Array.from(attrs);
		setEdge(frame, 0, 0.5, 1);
		const { ctx, calls } = fakeContext();
		drawEdges(ctx, frame, target, start, [[0, 1]], false);
		expect(calls.find(([op]) => op === "lineTo")).toEqual(["lineTo", 50, 0]);
	});

	test("while a choreography owns the frame, every edge tracks live dots", () => {
		const frame = Float64Array.from(attrs);
		setEdge(frame, 0, 1, 1);
		const { ctx, calls } = fakeContext();
		drawEdges(ctx, frame, target, start, [[0, 1]], true);
		expect(calls.find(([op]) => op === "lineTo")).toEqual(["lineTo", 50, 0]);
	});

	test("a dying edge holds still: both ends read off the frame it left", () => {
		// alpha 0 in the target is what makes it dying; it is still visible now
		const dyingTarget = Float64Array.from(target);
		setEdge(dyingTarget, 0, 1, 0);
		const frame = Float64Array.from(attrs);
		setEdge(frame, 0, 1, 1);
		const { ctx, calls } = fakeContext();
		drawEdges(ctx, frame, dyingTarget, start, [[0, 1]], false);
		// neither the live frame (0 → 50) nor the target (0 → 100): the start
		expect(calls.find(([op]) => op === "moveTo")).toEqual(["moveTo", -20, 0]);
		expect(calls.find(([op]) => op === "lineTo")).toEqual(["lineTo", 30, 0]);
	});

	test("an edge at alpha 0 or progress 0 is not drawn", () => {
		const frame = Float64Array.from(attrs);
		setEdge(frame, 0, 0, 1);
		const { ctx, calls } = fakeContext();
		drawEdges(ctx, frame, target, start, [[0, 1]], false);
		expect(calls).toEqual([]);
	});
});

describe("drawTrails", () => {
	test("plain lines first, inked lines on top, hidden lines skipped", () => {
		const trails = new Float64Array(TRAIL_SIZE);
		const points = [
			[0, 0],
			[10, 10]
		];
		setTrailPoints(trails, 0, points, 0.5); // plain
		setTrailPoints(trails, 1, points, 0.5); // inked below
		setTrailHighlight(trails, 1, 1);
		setTrailPoints(trails, 2, points, 0); // hidden
		const { ctx, calls } = fakeContext();
		drawTrails(ctx, trails);
		const strokes = calls.filter(([op]) => op === "stroke");
		expect(strokes.length).toBe(2);
		// the plain line first at its own width, the inked one last, thickened
		expect(strokes[0][2]).toBe(TRAIL_META[0].width);
		expect(strokes[1][2]).toBe(TRAIL_META[1].width + 0.5);
	});
});

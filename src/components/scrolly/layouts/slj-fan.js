import story from "$data/scrolly-story.json";
import { hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	CROWD,
	PURPLE,
	RED,
	GREEN,
	SLJ,
	CGM,
	TRAIL_META,
	RACE_SLOT,
	setTrail,
	collapseTrail
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// SLJ trajectory + simulation outcomes (Future chapter close).
// ---------------------------------------------------------------------------

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutSljFan(nodes, w, h) {
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	const HORIZON = 40;
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const [, v] of story.slj) {
		vMin = Math.min(vMin, v);
		vMax = Math.max(vMax, v);
	}
	for (const c of story.genz.candidates) {
		vMin = Math.min(vMin, c.projP10);
		vMax = Math.max(vMax, c.projP90);
	}
	const ageMax = Math.max(HORIZON, story.slj.at(-1)[0]);
	const top = MARGIN + 10;
	const bottom = plotBottom(h);
	const xS = (a) => lin(a, 0, ageMax, MARGIN + 14, w - MARGIN - 6);
	const yS = (v) => lin(v, vMin, vMax, top, bottom); // lower distance = up
	const candidateIds = new Set(story.genz.candidates.map((c) => c.id));
	for (const n of nodes) {
		if (n.id === SLJ) {
			const [age, v] = story.slj.at(-1);
			set(attrs, n.id, xS(age), yS(v), 6, PURPLE, 1);
			continue;
		}
		if (candidateIds.has(n.id)) {
			const c = story.genz.candidates.find((c) => c.id === n.id);
			set(
				attrs,
				n.id,
				xS(HORIZON) + (hash01(n.id, 8) - 0.5) * 28,
				yS(c.projMedian),
				n.id === CGM ? 5.5 : 3,
				n.id === CGM ? RED : GREEN,
				n.id === CGM ? 1 : 0.7
			);
			continue;
		}
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	TRAIL_META.forEach((meta, t) => {
		if (meta.id === SLJ && RACE_SLOT.get(SLJ) === t) {
			setTrail(trails, t, story.slj, xS, yS, 0.85);
		} else {
			collapseTrail(trails, t, xS(0), yS(vMax), 0);
		}
	});
	const notes = [
		{
			x: xS(story.slj.at(-1)[0]) - 10,
			y: yS(story.slj.at(-1)[1]) + 12,
			align: /** @type {const} */ ("right"),
			text: `SLJ today: ${story.slj.at(-1)[1]}`
		},
		{
			x: xS(HORIZON) - 24,
			y: yS(story.genz.avgWinningMad),
			align: /** @type {const} */ ("right"),
			strong: true,
			text: `typical winning score ≈ ${story.genz.avgWinningMad}`
		}
	];
	return {
		attrs,
		trails,
		notes,
		axes: {
			x: [0, 10, 20, 30, 40].map((a) => ({ pos: xS(a), label: String(a) })),
			xBase: bottom + 10,
			y: [vMin, vMax].map((v) => ({ pos: yS(v), label: v.toFixed(2) }))
		}
	};
}

export const states = {
	sljFan: {
		layout: layoutSljFan,
		labels: [CGM],
		pulse: SLJ,
		overlay: {
			caption: "Can anyone catch Samuel L. Jackson?",
			xLabel: "Career age (years)",
			yLabel: "Avg distance"
		}
	}
};

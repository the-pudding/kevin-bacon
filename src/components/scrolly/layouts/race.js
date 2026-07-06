import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import {
	STRIDE,
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	CROWD,
	SLJ,
	HACKMAN,
	DENIRO,
	WELKER,
	set,
	scatterPosition,
	raceRGB,
	RACE_IDS,
	TRAIL_META,
	RACE_SLOT,
	setTrail,
	collapseTrail,
	clipSeries
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per era anchor,
// windowed per step. Dots ride the right-hand end of their line; the era
// timeline annotates handovers.
// ---------------------------------------------------------------------------

function raceLayout(windowYears, tickStep, minEraYears, yCap = Infinity) {
	/** @type {import("../layout-shared.js").LayoutFn} */
	return function layoutRace(nodes, w, h) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const [year0, year1] = windowYears;
		const clipped = new Map();
		let vMin = Infinity;
		let vMax = -Infinity;
		for (const id of RACE_IDS) {
			const c = clipSeries(story.raceSeries[id], year0, year1);
			if (!c) continue;
			// zoomed steps only follow the contenders — actors who never get
			// near the lead in this window stay hidden
			if (Math.min(...c.map(([, v]) => v)) > yCap) continue;
			clipped.set(id, c);
			for (const [, v] of c) {
				vMin = Math.min(vMin, v);
				vMax = Math.max(vMax, v);
			}
		}
		const top = MARGIN + 10;
		const bottom = plotBottom(h);
		const xS = (yr) => lin(yr, year0, year1, MARGIN + 14, w - MARGIN - 6);
		// lower average distance = better = higher up the chart
		const yS = (v) => lin(v, vMin, vMax, top, bottom);
		const raceSet = new Set(clipped.keys());
		for (const n of nodes) {
			if (!raceSet.has(n.id)) {
				const [x, y] = scatterPosition(n, w, h);
				set(attrs, n.id, x, y, 2, CROWD, 0);
				continue;
			}
			const series = clipped.get(n.id);
			const [xe, ve] = series.at(-1);
			const major = raceRGB(n.id) !== CROWD;
			set(
				attrs,
				n.id,
				xS(xe),
				yS(ve),
				major ? 5 : 3,
				raceRGB(n.id),
				major ? 1 : 0.55
			);
		}
		TRAIL_META.forEach((meta, t) => {
			if (
				meta.id !== null &&
				clipped.has(meta.id) &&
				RACE_SLOT.get(meta.id) === t
			) {
				setTrail(
					trails,
					t,
					clipped.get(meta.id),
					xS,
					yS,
					meta.rgb === CROWD ? 0.35 : 0.8
				);
				trailDelays[t] = 250; // dots land first, lines unspool after
			} else {
				const id = meta.id;
				const [x, y] =
					id !== null && clipped.has(id)
						? [attrs[id * STRIDE], attrs[id * STRIDE + 1]]
						: [w / 2, bottom];
				collapseTrail(trails, t, x, y, 0);
			}
		});
		// era handovers long enough to read at this zoom level; alternate the
		// callout height so neighbouring handovers don't collide (narrow
		// screens get only the longest reigns)
		const notes = [];
		const minEra = minEraYears * (w < 480 ? 2.5 : 1);
		for (const era of story.eras) {
			const start = yearOf(era.start);
			const end = era.end ? yearOf(era.end) : year1;
			if (end - start < minEra || start < year0 || start > year1) continue;
			const node = rawNodes.nodes[era.id];
			const series = clipped.get(era.id);
			if (!series) continue;
			const vAt = valueAt(series, Math.max(start, year0));
			notes.push({
				x: xS(Math.max(start, year0)),
				y: yS(vAt) - (notes.length % 2 === 0 ? 24 : 42),
				align: /** @type {const} */ ("center"),
				text: `${node[1]} · ${Math.round(start)}`
			});
		}
		const ticks = [];
		for (
			let yr = Math.ceil(year0 / tickStep) * tickStep;
			yr <= year1;
			yr += tickStep
		) {
			ticks.push({ pos: xS(yr), label: String(yr) });
		}
		const yTicks = [vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: yS(v),
			label: v.toFixed(2)
		}));
		return {
			attrs,
			trails,
			trailDelays,
			notes,
			axes: { x: ticks, xBase: bottom + 10, y: yTicks }
		};
	};
}

const yearOf = (iso) => {
	const [y, m, d] = iso.split("-").map(Number);
	return y + (m - 1) / 12 + (d - 1) / 365;
};
const valueAt = (series, x) => {
	let j = 1;
	while (j < series.length - 1 && series[j][0] < x) j++;
	const [x0, v0] = series[j - 1];
	const [x1, v1] = series[j];
	return x1 === x0 ? v0 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
};

const OVERLAY = {
	xLabel: "Year",
	yLabel: "Avg distance"
};

export const states = {
	raceRecent: {
		layout: raceLayout([2004, 2026.2], 5, 3, 2.3),
		labels: [SLJ],
		overlay: { caption: "Center of Hollywood over time", ...OVERLAY }
	},
	raceTrades: {
		layout: raceLayout([1998.5, 2007], 2, 0.4, 2.25),
		labels: [SLJ, HACKMAN, DENIRO, WELKER],
		overlay: { caption: "Center of Hollywood over time", ...OVERLAY }
	},
	raceFull: {
		layout: raceLayout([1970, 2026.2], 10, 4),
		labels: [HACKMAN],
		overlay: { caption: "Center of Hollywood, 1970–2026", ...OVERLAY }
	}
};

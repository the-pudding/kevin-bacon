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
	sampleTrail,
	collapseTrail,
	clipSeries,
	monotoneSegments,
	curveYAt,
	curveYRange
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Race chart (Past chapter): avg distance by year, one line per era anchor,
// windowed per step. Dots ride the right-hand end of their line; the era
// timeline annotates handovers.
// ---------------------------------------------------------------------------

// full-series monotone-cubic segments per race actor, built once (the data is
// static). Shared by the static layout and the per-frame sweep so both read the
// same curve — window-edge tangents never come from a clipped subset.
const RACE_SEGS = new Map(
	RACE_IDS.map((id) => [id, monotoneSegments(story.raceSeries[id])])
);
// [firstYear, lastYear] per actor, so the sweep can clamp a trail to the actor's
// real data extent rather than drawing flat stubs where it has no points
const RACE_RANGE = new Map(
	RACE_IDS.map((id) => {
		const s = story.raceSeries[id];
		return [id, [s[0][0], s.at(-1)[0]]];
	})
);

// [earliest, latest] year across all race actors — the scrub slider's min/max
// playhead bounds (Stage 5)
export const RACE_SCRUB_BOUNDS = [
	Math.min(...[...RACE_RANGE.values()].map(([s]) => s)),
	Math.max(...[...RACE_RANGE.values()].map(([, e]) => e))
];

// padded y-extent over [year0, year1] read off the curves (6% headroom so dots
// riding near the extremes don't touch the plot edge — matches the reference)
function raceYFit(segsList, year0, year1) {
	const [lo, hi] = curveYRange(segsList, year0, year1) ?? [0, 1];
	const pad = (hi - lo) * 0.06 || 0.05;
	return [lo - pad, hi + pad, lo, hi];
}

// the x/y pixel scales for one frame. `domain` drives x; `[vMin,vMax]` (padded)
// drives y. Lower average distance = better = higher up the chart.
// The plot spans only the left 2/3 of the inner width — the right third is a
// gutter reserved for the actor name labels (which sit beside the right-edge
// dots), so names never clip off the canvas.
function raceScales(w, h, dom0, dom1, vMin, vMax) {
	const top = MARGIN + 10;
	const bottom = plotBottom(h);
	const left = MARGIN + 14;
	const right = left + ((w - MARGIN - 6 - left) * 2) / 3;
	return {
		top,
		bottom,
		xS: (yr) => lin(yr, dom0, dom1, left, right),
		yS: (v) => lin(v, vMin, vMax, top, bottom)
	};
}

/**
 * Writes ONLY the ~15 race dot slots + 15 race trail slots for one sweep frame,
 * directly into the live Float32 tweener buffers (no allocation, crowd/other
 * trails left untouched). All actors stay visible and ride their curves; a dot
 * whose window edge runs past its data clamps to the curve endpoint.
 * @param {Float32Array|Float64Array} attrsBuf live dot buffer (or a scratch clone)
 * @param {Float32Array|Float64Array} trailBuf live trail buffer (or a scratch clone)
 * @param {{year0:number,year1:number,dom0:number,dom1:number}} frame
 * @param {number} [yCap] matches the target static state's yCap: the y-fit only
 * considers actors that would still qualify as a "contender" over [dom0,dom1] —
 * the fixed target window, NOT the momentarily-revealed [year0,year1] clip —
 * so membership stays constant for the whole sweep (a clip window that grows
 * frame-to-frame would otherwise flip actors in/out of the fit as their history
 * comes into view, snapping the y-scale mid-animation). The last frame's
 * [year0,year1] == [dom0,dom1], so this still lands on the exact same vMin/vMax
 * as raceLayout.
 */
export function writeRaceSweepFrame(
	attrsBuf,
	trailBuf,
	w,
	h,
	frame,
	yCap = Infinity
) {
	const { year0, year1, dom0, dom1 } = frame;
	const segsList = [];
	for (const id of RACE_IDS) {
		const c = clipSeries(story.raceSeries[id], dom0, dom1);
		if (!c) continue;
		if (Math.min(...c.map(([, v]) => v)) > yCap) continue;
		segsList.push(RACE_SEGS.get(id));
	}
	const [vMin, vMax] = raceYFit(segsList, year0, year1);
	const { xS, yS } = raceScales(w, h, dom0, dom1, vMin, vMax);
	for (const id of RACE_IDS) {
		const rgb = raceRGB(id);
		const major = rgb !== CROWD;
		const segs = RACE_SEGS.get(id);
		const slot = RACE_SLOT.get(id);
		const [ds, de] = RACE_RANGE.get(id);
		const sx0 = Math.max(year0, ds);
		const sx1 = Math.min(year1, de);
		// the dot rides the RIGHT END OF THE VISIBLE LINE, not the raw playhead:
		// when the playhead is within the actor's data the two coincide (dot pinned
		// centre), but once the playhead runs past the data the dot stays glued to
		// the curve's endpoint (clamp to curve ends) instead of floating ahead of a
		// shorter line. Matches the static layout's dot = xS(clipped.at(-1)).
		const dotYr = Math.min(Math.max(year1, ds), de);
		const dx = xS(dotYr);
		const dy = yS(curveYAt(segs, dotYr));
		set(attrsBuf, id, dx, dy, major ? 5 : 3, rgb, major ? 1 : 0.55);
		if (sx1 > sx0) {
			sampleTrail(trailBuf, slot, segs, sx0, sx1, xS, yS, major ? 0.8 : 0.35);
		} else {
			// window sits entirely outside this actor's data → no line, park on dot
			collapseTrail(trailBuf, slot, dx, dy, major ? 0.8 : 0.35);
		}
	}
}

function raceLayout(
	windowYears,
	minEraYears,
	yCap = Infinity,
	showEraNotes = true
) {
	/** @type {import("../layout-shared.js").LayoutFn} */
	return function layoutRace(nodes, w, h, _edges, params) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		// window clips the data; domain defines the x-scale. They coincide for
		// the static states, but the Stage 3 path animator pans them separately
		// (drawLine grows the clip window; rewind pans the domain).
		const [year0, year1] = params?.window ?? windowYears;
		const [dom0, dom1] = params?.domain ?? params?.window ?? windowYears;
		const clipped = new Map();
		for (const id of RACE_IDS) {
			const c = clipSeries(story.raceSeries[id], year0, year1);
			if (!c) continue;
			// zoomed steps only follow the contenders — actors who never get
			// near the lead in this window stay hidden
			if (Math.min(...c.map(([, v]) => v)) > yCap) continue;
			clipped.set(id, c);
		}
		// y-fit off the (full-series) curves of the visible actors: vMin/vMax are
		// padded (scale domain), vLo/vHi the raw data extent (for tick labels)
		const segsList = [...clipped.keys()].map((id) => RACE_SEGS.get(id));
		const [vMin, vMax, vLo, vHi] = raceYFit(segsList, year0, year1);
		const { bottom, xS, yS } = raceScales(w, h, dom0, dom1, vMin, vMax);
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
				// sample the FULL-series curve over the clipped extent (correct
				// tangents at the window edges; pixel-identical to a sweep frame)
				const c = clipped.get(meta.id);
				sampleTrail(
					trails,
					t,
					RACE_SEGS.get(meta.id),
					c[0][0],
					c.at(-1)[0],
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
		if (showEraNotes) {
			for (const era of story.eras) {
				const start = yearOf(era.start);
				const end = era.end ? yearOf(era.end) : year1;
				if (end - start < minEra || start < year0 || start > year1) continue;
				const node = rawNodes.nodes[era.id];
				const series = clipped.get(era.id);
				if (!series) continue;
				const vAt = valueAt(series, Math.max(start, year0));
				const nx = xS(Math.max(start, year0));
				const text = `${node[1]} · ${Math.round(start)}`;
				// centre-anchored notes clip when their anchor sits within half a label
				// width of a plot edge (e.g. the SLJ·2006 handover near the left edge), so
				// clamp the centre inward to keep the whole label inside the plot.
				const hw = text.length * 3.4;
				const cx = Math.min(Math.max(nx, xS(dom0) + hw), xS(dom1) - hw);
				notes.push({
					x: cx,
					y: yS(vAt) - (notes.length % 2 === 0 ? 24 : 42),
					align: /** @type {const} */ ("center"),
					text
				});
			}
		}
		// horizontal 4-digit year labels at the densest legible step that fits the
		// plot width (~40px per label incl. gap): every year where it fits, coarser
		// on wide spans. (Showing *every* year on the full span needs a wider-than-
		// screen scrollable axis — deferred; the scrubber explores the full range.)
		const plotW = xS(dom1) - xS(dom0);
		const maxLabels = Math.max(2, Math.floor(plotW / 32));
		const span = dom1 - dom0;
		const step =
			[1, 2, 5, 10, 25, 50].find((s) => span / s + 1 <= maxLabels) ?? 100;
		const ticks = [];
		for (let yr = Math.ceil(dom0 / step) * step; yr <= dom1; yr += step) {
			ticks.push({ pos: xS(yr), label: String(yr) });
		}
		// ticks label the raw data extent (not the padded scale domain) so the
		// numbers read as real values and sit just inside the plot
		const yTicks = Array.from({ length: 5 }, (_, i) => {
			const v = vLo + ((vHi - vLo) * i) / 4;
			return { pos: yS(v), label: v.toFixed(2) };
		});
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

// optional runtime override of the windowed frame; null while idle, so normal
// stepping keeps its baked window and stays on the stateChange (reveal) path
const params = (s) => s.raceView;

// the raceRecent window, exported so the entry animator (ScrollyVisual) lands
// its draw-on sweep on a frame byte-identical to this static layout
export const RACE_ENTRY_WINDOW = [2004, 2026.2];

// per-state yCap, re-exported alongside each layout (as STATE_YCAP in states.js)
// so the ScrollyVisual sweep/scrub animators can fit their y-scale the same way
// the static layout does — see writeRaceSweepFrame's yCap param.
const RACE_RECENT_YCAP = 2.3;
const RACE_TRADES_YCAP = 2.25;

export const states = {
	raceRecent: {
		// no era-handover note here: SLJ is already named beside its dot (labels
		// below), so a "Samuel L. Jackson · 2006" callout would just repeat it
		layout: raceLayout(RACE_ENTRY_WINDOW, 3, RACE_RECENT_YCAP, false),
		yCap: RACE_RECENT_YCAP,
		labels: [SLJ],
		// names sit in the reserved right gutter, beside the right-edge dots
		labelDirs: { [SLJ]: "right" },
		overlay: OVERLAY,
		params,
		// entry choreography: draw the lines on when arriving from the rank chapter
		revealFrom: ["rankReveal"]
	},
	raceTrades: {
		layout: raceLayout([1998.5, 2007], 0.4, RACE_TRADES_YCAP),
		yCap: RACE_TRADES_YCAP,
		labels: [SLJ, HACKMAN, DENIRO, WELKER],
		// Hackman + Welker end coincident at the right edge; keep Hackman beside its
		// dot and let Welker fall to the default below-dot spot so the two names
		// don't stack on top of each other
		labelDirs: {
			[SLJ]: "right",
			[HACKMAN]: "right",
			[DENIRO]: "right"
		},
		overlay: OVERLAY,
		params
	},
	raceFull: {
		layout: raceLayout([1970, 2026.2], 4),
		labels: [HACKMAN],
		labelDirs: { [HACKMAN]: "right" },
		overlay: OVERLAY,
		params
	}
};

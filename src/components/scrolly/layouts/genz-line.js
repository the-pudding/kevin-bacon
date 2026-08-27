import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	parkHidden,
	RED,
	GREEN,
	PURPLE,
	SLJ,
	CGM,
	RULE_SLOT,
	setTrailPoints
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// The Future chapter's close: a vertical number line of average distance.
//
// The step asks a one-dimensional question — does any Gen Z actor end up closer
// to the middle of Hollywood than Samuel L. Jackson? — so it gets a
// one-dimensional chart. SLJ's 2.09 today beats every projected Gen Z score, so
// a plain lower-is-up scale puts him alone at the top with the gap the prose is
// about, and the whole 99-strong field reads as one column below him.
// ---------------------------------------------------------------------------

/** SLJ's average distance today — the last point of his trajectory */
const SLJ_NOW = story.slj.at(-1)[1];
/** the likeliest winner's record — the only Gen Z number named on the chart */
const CGM_CANDIDATE = story.genz.candidates.find((c) => c.id === CGM);
/**
 * Which simulated outcome places a contender: the median run, or the best tenth
 * of their runs. The reader toggles between them (see GenZOutlook.svelte) —
 * `p10` is the optimistic read, and the step's point is that even it leaves
 * everyone short of SLJ.
 */
const VALUE_OF = {
	p50: (c) => c.projMedian,
	p10: (c) => c.projP10
};

/** how far off the line the field starts, and the step between its columns */
const DOT_GAP = 10;
const COL_PITCH = 9;
/** two dots this close vertically count as the same row */
const ROW_GAP = 7;

/** round ticks every 0.1 inside the domain, so the line reads as a scale */
function ticksFor(vMin, vMax) {
	const out = [];
	for (let t = Math.ceil(vMin * 10); t <= Math.floor(vMax * 10); t++) {
		out.push(t / 10);
	}
	return out;
}

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutGenzLine(nodes, w, h, _edges, params) {
	const valueOf = VALUE_OF[params?.percentile ?? "p50"];
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	// the domain spans SLJ and the WIDEST percentile, never the selected one, so
	// toggling slides the field up and down a fixed scale instead of rescaling it
	// under the reader
	let lo = SLJ_NOW;
	let hi = SLJ_NOW;
	for (const c of story.genz.candidates) {
		lo = Math.min(lo, c.projP10);
		hi = Math.max(hi, c.projMedian);
	}
	const pad = (hi - lo) * 0.04;
	const vMin = lo - pad;
	const vMax = hi + pad;
	const top = MARGIN + 10;
	const bottom = plotBottom(h);
	const yS = (v) => lin(v, vMin, vMax, top, bottom); // lower distance = up
	// the line hugs the left gutter, where ScrollyVisual pins the y ticks
	// (.tick-y sits at a fixed 1.1rem), so the numbers read as its scale; the
	// field spreads right off the line, and the names right off the field
	const axisX = MARGIN + 48;

	// Deterministic dot plot: a contender takes the first column whose nearest
	// occupant is more than a dot away, so ties on projMedian fan out to the
	// right of the line instead of stacking into one invisible mark.
	/** @type {{ y: number, col: number }[]} */
	const placed = [];
	const place = (v) => {
		const y = yS(v);
		let col = 0;
		while (placed.some((p) => p.col === col && Math.abs(p.y - y) < ROW_GAP))
			col++;
		placed.push({ y, col });
		return [axisX + DOT_GAP + col * COL_PITCH, y];
	};
	// the named contender settles last, so it lands outboard of its row and its
	// label clears the cloud
	const byValue = [...story.genz.candidates].sort(
		(a, b) => valueOf(a) - valueOf(b)
	);
	const order = [
		...byValue.filter((c) => c.id !== CGM),
		...byValue.filter((c) => c.id === CGM)
	];
	/** @type {Map<number, number[]>} */
	const spots = new Map(order.map((c) => [c.id, place(valueOf(c))]));

	for (const n of nodes) {
		if (n.id === SLJ) {
			set(attrs, n.id, axisX, yS(SLJ_NOW), 6, PURPLE, 1);
			continue;
		}
		const spot = spots.get(n.id);
		if (!spot) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const [x, y] = spot;
		if (n.id === CGM) set(attrs, n.id, x, y, 5.5, RED, 1);
		else set(attrs, n.id, x, y, 3, GREEN, 0.7);
	}

	// the line itself: the one trail this state owns, so the sim race's 99
	// contender lines fade out where they lie rather than retracting
	setTrailPoints(
		trails,
		RULE_SLOT,
		[
			[axisX, top],
			[axisX, bottom]
		],
		0.5
	);

	return {
		attrs,
		trails,
		trailSlots: new Set([RULE_SLOT]),
		axes: {
			y: ticksFor(vMin, vMax).map((v) => ({
				pos: yS(v),
				label: v.toFixed(1)
			}))
		}
	};
}

export const states = {
	genzLine: {
		layout: layoutGenzLine,
		params: (s) => ({ percentile: s.genzPercentile }),
		labels: [SLJ, CGM],
		// a column of dots leaves no room underneath: names sit beside their mark
		labelDirs: { [SLJ]: "right", [CGM]: "right" },
		labelText: (nodes, params) => ({
			[SLJ]: `${nodes[SLJ].name} · ${SLJ_NOW.toFixed(2)} today`,
			[CGM]: `${nodes[CGM].name} · ${VALUE_OF[params?.percentile ?? "p50"](
				CGM_CANDIDATE
			).toFixed(2)}`
		}),
		pulse: SLJ,
		overlay: { yLabel: "Avg distance" }
	}
};

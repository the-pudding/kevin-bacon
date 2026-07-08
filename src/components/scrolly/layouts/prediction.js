import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	CROWD,
	BLUE,
	TRAIL_META,
	DIAG_SLOT,
	setTrail,
	collapseTrail
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Prediction scatter: predicted (x) vs actual (y); toggles swap the predictor.
// ---------------------------------------------------------------------------

const PRED_FIELDS = {
	film: "predFilm",
	filmConc: "predFilmConc",
	filmDeg: "predFilmDeg",
	all: "predAll"
};

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutPredScatter(nodes, w, h, _edges, params) {
	const mode = params?.mode ?? "film";
	const field = PRED_FIELDS[mode];
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		if (n.predFilm == null) continue;
		vMin = Math.min(vMin, n.avgDistance, n[field]);
		vMax = Math.max(vMax, n.avgDistance, n[field]);
	}
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	const xS = (v) => lin(v, vMin, vMax, MARGIN + 14, w - MARGIN);
	const yS = (v) => lin(v, vMin, vMax, bottom, top);
	for (const n of nodes) {
		if (n.predFilm == null) {
			const [x, y] = scatterPosition(n, w, h);
			set(attrs, n.id, x, y, 2, CROWD, 0);
			continue;
		}
		set(attrs, n.id, xS(n[field]), yS(n.avgDistance), 2.2, BLUE, 0.35);
	}
	TRAIL_META.forEach((_meta, t) => {
		if (t === DIAG_SLOT) {
			setTrail(
				trails,
				t,
				[
					[vMin, vMin],
					[vMax, vMax]
				],
				xS,
				yS,
				0.6
			);
		} else {
			collapseTrail(trails, t, w / 2, bottom, 0);
		}
	});
	const r = story.corr[mode];
	const ticks = (S) =>
		[vMin, (vMin + vMax) / 2, vMax].map((v) => ({
			pos: S(v),
			label: v.toFixed(2)
		}));
	return {
		attrs,
		trails,
		notes: [
			{
				x: MARGIN + 20,
				y: top + 4,
				strong: true,
				text: `correlation: ${Math.round(r * 100)}`
			},
			{
				x: xS(vMax) - 8,
				y: yS(vMax) + 14,
				align: "right",
				text: "perfect prediction"
			}
		],
		axes: { x: ticks(xS), xBase: bottom + 10, y: ticks(yS) }
	};
}

export const states = {
	predictionScatter: {
		layout: layoutPredScatter,
		params: (s) => ({
			mode:
				s.predictConcurrence && s.predictDegree
					? "all"
					: s.predictConcurrence
						? "filmConc"
						: s.predictDegree
							? "filmDeg"
							: "film"
		}),
		overlay: {
			xLabel: "Predicted",
			yLabel: "Actual"
		}
	}
};

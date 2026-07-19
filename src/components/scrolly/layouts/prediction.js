import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	CROWD,
	RED,
	BLUE,
	SLJ,
	WALTERS,
	TRAIL_META,
	DIAG_SLOT,
	setTrail,
	collapseTrail
} from "../layout-shared.js";
import { QUIZ_IDS } from "./scatters.js";

// ---------------------------------------------------------------------------
// Prediction scatter (the finale): X = the actor's ACTUAL average distance
// (fixed), Y = that distance PREDICTED by the model. One binary toggle swaps
// the predictor between film count alone and the full model, so every dot
// slides vertically and the cloud travels onto the y = x diagonal — the
// perfect-prediction line. No correlation number is shown; the convergence on
// the diagonal is the message (prototype: prediction-scatter.js).
//
// Both axes carry the SAME distance scale over a fixed domain (spanning every
// actual + predicted value in both modes) and the plot is square, so the
// diagonal is a true 45° line that never moves as the toggle changes. Both
// axes run high → low: the largest distance sits at the bottom-left origin and
// distance decreases toward the top-right, matching the distance scatters
// where "closer to the centre" is the leading edge.
// ---------------------------------------------------------------------------

const PRED_FIELDS = {
	film: "predFilm",
	all: "predAll"
};

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutPredScatter(nodes, w, h, _edges, params) {
	const mode = params?.mode ?? "film";
	const field = PRED_FIELDS[mode];
	const attrs = new Float64Array(ATTR_SIZE);
	const trails = new Float64Array(TRAIL_SIZE);
	// fixed shared domain: every actual value plus BOTH modes' predictions, so
	// axes + diagonal stay put while the toggle slides the dots
	let vMin = Infinity;
	let vMax = -Infinity;
	for (const n of nodes) {
		if (n.predFilm == null) continue;
		vMin = Math.min(vMin, n.avgDistance, n.predFilm, n.predAll);
		vMax = Math.max(vMax, n.avgDistance, n.predFilm, n.predAll);
	}
	const pad = (vMax - vMin) * 0.04;
	const d0 = vMin - pad;
	const d1 = vMax + pad;
	// square plot, equal px-per-unit on both axes → true 45° diagonal
	const top = MARGIN + 8;
	const left = MARGIN + 14;
	const side = Math.min(w - left - MARGIN, plotBottom(h) - top);
	const xS = (v) => lin(v, d0, d1, left + side, left); // low distance → right
	const yS = (v) => lin(v, d0, d1, top, top + side); // low distance → top
	const marks = new Set([...QUIZ_IDS, WALTERS]);
	for (const n of nodes) {
		if (n.predFilm == null) {
			const [x, y] = scatterPosition(n, w, h);
			set(attrs, n.id, x, y, 2, CROWD, 0);
			continue;
		}
		const x = xS(n.avgDistance);
		const y = yS(n[field]);
		if (n.id === SLJ) set(attrs, n.id, x, y, 6, RED, 1);
		else if (marks.has(n.id)) set(attrs, n.id, x, y, 4.5, BLUE, 1);
		else set(attrs, n.id, x, y, 2.2, CROWD, 0.35);
	}
	TRAIL_META.forEach((_meta, t) => {
		if (t === DIAG_SLOT) {
			setTrail(
				trails,
				t,
				[
					[d0, d0],
					[d1, d1]
				],
				xS,
				yS,
				0.6
			);
		} else {
			collapseTrail(trails, t, w / 2, top + side, 0);
		}
	});
	// same 0.5-distance steps on both axes to underline the shared scale
	const ticks = (S) => {
		const out = [];
		for (let t = Math.ceil(vMin * 2) / 2; t <= vMax; t += 0.5) {
			out.push({ pos: S(t), label: t.toFixed(1) });
		}
		return out;
	};
	return {
		attrs,
		trails,
		axes: { x: ticks(xS), xBase: top + side + 10, y: ticks(yS) }
	};
}

export const states = {
	predictionScatter: {
		layout: layoutPredScatter,
		labels: [SLJ, ...QUIZ_IDS, WALTERS],
		pulse: SLJ,
		params: (s) => ({ mode: s.predictInsights ? "all" : "film" }),
		overlay: {
			xLabel: "Actual distance",
			yLabel: "Predicted distance"
		}
	}
};

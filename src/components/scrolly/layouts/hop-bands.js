import { ANCHOR_ID, hash01 } from "../nodes.js";
import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	MARGIN,
	plotBottom,
	HOP_RGB,
	NETWORK_HOP_DELAY_MS,
	set,
	parkHidden
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Hop bands (Present chapter): row per degree of separation. Band thickness
// follows the on-screen sample; the notes cite the TRUE corpus bucket totals
// (sample proportions would misstate them — see notes/scrolly-framework.md).
// ---------------------------------------------------------------------------

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutHopBands(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) if (n.hop >= 0) counts[n.hop]++;
	const top = MARGIN + 12;
	const innerH = plotBottom(h) - top;
	const visible = counts.reduce((s, v) => s + v, 0);
	const bandTops = [];
	let y = top;
	for (const count of counts) {
		bandTops.push(y);
		y += Math.max(0.08, count / visible) * innerH;
	}
	bandTops.push(plotBottom(h));
	for (const n of nodes) {
		if (n.hop < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const pad = 10;
		const bandH = bandTops[n.hop + 1] - bandTops[n.hop] - pad;
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			anchor ? w / 2 : MARGIN + hash01(n.id, 3) * (w - MARGIN * 2),
			bandTops[n.hop] +
				(anchor ? bandH / 2 : pad / 2 + hash01(n.id, 4) * bandH),
			anchor ? 10 : 3,
			HOP_RGB[n.hop],
			anchor ? 1 : 0.75
		);
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS;
	}
	// annotate each band: real corpus counts (and the weighted calc when asked)
	const calc = params?.calc;
	const notes = story.bacon.buckets.map((total, i) => {
		const hop = i + 1;
		const mid = (bandTops[hop] + bandTops[hop + 1]) / 2;
		const count = total.toLocaleString("en-US");
		return {
			x: w - MARGIN,
			y: mid - 8,
			align: /** @type {const} */ ("right"),
			text: calc
				? `${count} × ${hop} movie${hop > 1 ? "s" : ""}`
				: `${count} actor${total === 1 ? "" : "s"} — ${hop} movie${hop > 1 ? "s" : ""} away`
		};
	});
	if (calc) {
		notes.push({
			x: w / 2,
			y: plotBottom(h) + 14,
			align: "center",
			strong: true,
			text: `÷ ${story.bacon.reachable.toLocaleString("en-US")} actors = ${story.bacon.avgDistance} movies on average`
		});
	}
	return { attrs, delays, notes };
}

export const states = {
	hopBands: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, {}),
		labels: [ANCHOR_ID],
		overlay: { caption: "Actors by degrees of separation from Bacon" }
	},
	hopCalc: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, { calc: true }),
		labels: [ANCHOR_ID],
		overlay: { caption: "Kevin Bacon's average distance" }
	}
};

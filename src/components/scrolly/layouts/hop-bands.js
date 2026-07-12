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
	const seed = params?.seed;
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) if (n.hop >= 0) counts[n.hop]++;
	const top = MARGIN + 12;
	// fixed header band for the anchor (Bacon) + its label, so the label clears
	// the top edge and the first hop band
	const HEADER_H = 60;
	const bandsTop = top + HEADER_H;
	const innerH = plotBottom(h) - bandsTop;
	// hops 1–4 are sized purely by their sample share so dot density matches
	// across bands (no floor — the sparse hop-1/hop-4 bands stay thin)
	const dataTotal = counts[1] + counts[2] + counts[3] + counts[4];
	const bandTops = [top, bandsTop];
	let y = bandsTop;
	for (let hop = 1; hop <= 4; hop++) {
		y += (counts[hop] / dataTotal) * innerH;
		bandTops.push(y);
	}
	bandTops[5] = plotBottom(h);
	for (const n of nodes) {
		if (n.hop < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const pad = 4;
		const bandH = Math.max(bandTops[n.hop + 1] - bandTops[n.hop] - pad, 4);
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			anchor ? w / 2 : MARGIN + hash01(n.id, 3) * (w - MARGIN * 2),
			bandTops[n.hop] +
				(anchor ? bandH / 2 : pad / 2 + hash01(n.id, 4) * bandH),
			anchor ? 10 : 3,
			HOP_RGB[n.hop],
			// `seed` parks every node at its band position but invisible — the
			// predecessor step's empty canvas — so hopBands always fades in from
			// the same frame regardless of how you arrived (see revealFrom).
			seed ? 0 : anchor ? 1 : 0.5
		);
		// bands still cascade 1→4, but each node jitters within its hop so dots
		// stagger in rather than snapping on together
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS + hash01(n.id, 5) * 400;
	}
	// seed carries no reveal choreography or annotations — it only pre-positions
	if (seed) return { attrs };
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
	// empty-canvas beat before the bands: pre-seeds every node at its hopBands
	// position (invisible) so the hopBands reveal is a pure, consistent fade-in.
	// `seed` marks it for the fade-out-then-reposition entry (see STATE_SEED).
	hopSeed: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, { seed: true }),
		seed: true
	},
	hopBands: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, {}),
		labels: [ANCHOR_ID],
		// the cascade fade-in is authored for arrival from the seed; any other
		// direction (backward from hopCalc) is one plain tween
		revealFrom: ["hopSeed"]
	},
	hopCalc: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, { calc: true }),
		labels: [ANCHOR_ID]
	}
};

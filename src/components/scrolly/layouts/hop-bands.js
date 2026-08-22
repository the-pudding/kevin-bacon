import { ANCHOR_ID, hash01 } from "../nodes.js";
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
import { writeNetwork } from "./intro.js";

// ---------------------------------------------------------------------------
// Hop bands (Present chapter): row per degree of separation. Band thickness
// follows the on-screen sample.
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
			// `seed` parks every node at its band position but invisible — what
			// sits behind hopSeed's zoomed-out network — so hopBands always fades
			// in from the same frame regardless of how you arrived (see revealFrom).
			seed ? 0 : anchor ? 1 : 0.5
		);
		// bands still cascade 1→4, but each node jitters within its hop so dots
		// stagger in rather than snapping on together
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS + hash01(n.id, 5) * 400;
	}
	// the seed frame carries no reveal choreography or legend — it only
	// pre-positions the crowd behind hopSeed's network
	if (seed) return { attrs };
	const legend = [1, 2, 3, 4].map((hop) => ({
		color: HOP_RGB[hop],
		label: `${hop} movie${hop > 1 ? "s" : ""}${hop === 1 ? " away" : ""}`
	}));
	return { attrs, delays, legend, legendY: plotBottom(h) + 14 };
}

// ---------------------------------------------------------------------------
// hopSeed: the "not the centre" beat. The intro constellation stays on screen
// and the camera slowly pulls back from it, so the network Bacon sits in the
// middle of visibly becomes a small thing just as the copy says he isn't the
// centre of Hollywood. The links go out with the names on arrival, so what pulls
// back is the cast rather than the diagram of who-knows-who — which is the
// crowd the bands are about to sort. Behind it, every node is already parked
// (invisible) at its hopBands position, so the bands still cascade in from one
// consistent frame — only the 15 named actors have any distance left to travel.
// ---------------------------------------------------------------------------

const HOP_SEED_ZOOM = 0.45; // how far the camera pulls back
const HOP_SEED_ZOOM_MS = 2400; // "slowly" — the whole pull-back is one long leg
// the links are gone for the whole step: they fade out over the arrival tween,
// in step with the names the state stops labelling
const HOP_SEED_EDGE_FADE = 0;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutHopSeed(nodes, w, h, edges) {
	const { attrs } = layoutHopBands(nodes, w, h, edges, { seed: true });
	// no focus: whatever route the reader lit up on networkIntro releases as the
	// camera pulls back, because the step is about the network as a whole again
	writeNetwork(attrs, nodes, w, h, null, HOP_SEED_ZOOM, HOP_SEED_EDGE_FADE);
	// an all-zero clock, opting out of the default edge lag: that lag is for links
	// fading IN behind travelling dots, and these are fading OUT over a frame
	// where nothing moves — so they go with the names, not half a beat later. It
	// also keeps the pull-back starting the moment the fade lands.
	return { attrs, delays: new Float64Array(DELAY_SIZE) };
}

/**
 * hopSeed's pull-back: one leg re-deriving the constellation from a lerped
 * scale, so it glides out from full size instead of being tweened there in
 * TWEEN_MS. Frame 0 holds networkIntro's geometry with the links already at
 * alpha 0, so the arrival tween that precedes the leg fades them out (with the
 * names) while nothing moves; frame 1 reproduces layoutHopSeed call for call, so
 * playEntry's settle is a zero-duration retarget. Only the intro slots are
 * touched: the crowd's invisible band parks come from the static layout.
 */
function zoomOutFrames(nodes, w, h) {
	return (attrs, _trails, _phase, e) => {
		writeNetwork(
			attrs,
			nodes,
			w,
			h,
			null,
			1 + (HOP_SEED_ZOOM - 1) * e,
			HOP_SEED_EDGE_FADE
		);
	};
}

export const states = {
	hopSeed: {
		layout: layoutHopSeed,
		// no names at all, Bacon's included: every one of them fades out with the
		// links on arrival, so the pull-back is of an unlabelled crowd. They also
		// wouldn't survive a cluster this small — 15 names in that space collide.
		// hopBands names Bacon again once he has landed at the top.
		// the pull-back is authored for the forward arrival out of networkIntro;
		// stepping back in from hopBands is one plain tween
		revealFrom: ["networkIntro"],
		entry: { phases: [HOP_SEED_ZOOM_MS], frames: zoomOutFrames }
	},
	hopBands: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, {}),
		labels: [ANCHOR_ID],
		// the cascade fade-in is authored for arrival from the seed frame behind
		// hopSeed's network; any other direction is one plain tween
		revealFrom: ["hopSeed"]
	}
};

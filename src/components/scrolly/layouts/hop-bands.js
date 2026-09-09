import { ANCHOR_ID, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	MARGIN,
	plotBottom,
	HOP_RGB,
	HOP_DOT_ALPHA,
	NETWORK_HOP_DELAY_MS,
	PULLBACK_ZOOM,
	writeFieldCrowd,
	fieldSpot,
	hopFractions,
	hopShareLabels,
	set,
	parkHidden
} from "../layout-shared.js";
import { writeNetwork } from "./intro.js";

// ---------------------------------------------------------------------------
// Hop bands (Present chapter): row per degree of separation. Band thickness
// follows the on-screen sample.
// ---------------------------------------------------------------------------

// Whitespace between adjacent rows. Without it the bands tile edge to edge and
// neighbouring degrees read as one gradient rather than four rows — hop 2's
// blue and hop 3's cyan are the pair that blend.
const BAND_GAP = 12;
// hop 4 is a handful of pixels at every viewport; this is what keeps it drawn
const MIN_BAND_H = 4;

// Each degree's share of the corpus, for the band labels. Deliberately NOT the
// on-screen `counts` the bands are sized by: those oversample hop 1 and hop 4
// so the sparse rows stay legible. So thickness follows the sample while the
// number cites the corpus — the same split the right-edge notes used to make.
const HOP_SHARE = hopShareLabels(hopFractions(ANCHOR_ID));

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
	// across bands, out of whatever the three gaps between them leave behind.
	// The gap is reserved BEFORE the shares are struck rather than taken back
	// out of each band, so it is real whitespace and every band still gets its
	// honest share of what's left.
	const dataTotal = counts[1] + counts[2] + counts[3] + counts[4];
	const bandsH = innerH - BAND_GAP * 3;
	const bandTop = [top];
	const bandH = [HEADER_H];
	let y = bandsTop;
	for (let hop = 1; hop <= 4; hop++) {
		const share = (counts[hop] / dataTotal) * bandsH;
		bandTop[hop] = y;
		bandH[hop] = Math.max(share, MIN_BAND_H);
		y += share + BAND_GAP;
	}
	for (const n of nodes) {
		if (n.hop < 0) {
			parkHidden(attrs, n, w, h);
			continue;
		}
		const anchor = n.hop === 0;
		set(
			attrs,
			n.id,
			// Each dot keeps the COLUMN it stands in on the chapter card — the band
			// only decides its row. Both are a uniform scatter across the same span,
			// so the chart is unchanged from any other arrival; what changes is the
			// arrival from the card, where an independent x would send twelve
			// thousand dots off on twelve thousand unrelated diagonals and read as
			// static. Sharing the x makes it fall: the universe rains straight down
			// into rows, which is the only reading of this transition that says
			// "sorted".
			anchor ? w / 2 : fieldSpot(n.id, w, h)[0],
			bandTop[n.hop] + (anchor ? bandH[0] / 2 : hash01(n.id, 4) * bandH[n.hop]),
			anchor ? 10 : 3,
			HOP_RGB[n.hop],
			// `seed` parks every node at its band position but invisible — what
			// sits behind hopSeed's zoomed-out network, so the fifteen the network
			// draws are the only actors with any distance left to travel there.
			seed ? 0 : anchor ? 1 : HOP_DOT_ALPHA
		);
		// bands cascade 1→4, and each node jitters within its hop so the row fills
		// in rather than snapping on all at once. Arriving from the chapter card
		// this clock staggers TRAVEL, not a fade: the crowd is already on screen,
		// spread across the plot, and falls into its rows a degree at a time.
		delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS + hash01(n.id, 5) * 400;
	}
	// the seed frame carries no reveal choreography or legend — it only
	// pre-positions the crowd behind hopSeed's network
	if (seed) return { attrs };
	const legend = [1, 2, 3, 4].map((hop) => ({
		color: HOP_RGB[hop],
		label: `${hop} movie${hop > 1 ? "s" : ""} away — ${HOP_SHARE[hop - 1]} of actors`,
		x: MARGIN,
		y: bandTop[hop] + bandH[hop] / 2
	}));
	return { attrs, delays, legend };
}

// ---------------------------------------------------------------------------
// hopSeed: the "not the centre" beat. The intro constellation stays on screen
// and the camera slowly pulls back from it, so the network Bacon sits in the
// middle of visibly becomes a small thing just as the copy says he isn't the
// centre of Hollywood. The links go out with the names on arrival, so what pulls
// back is the cast rather than the diagram of who-knows-who — which is the
// crowd the bands are about to sort. Behind it, every node is already parked
// (invisible) at its hopBands position, so only the 15 named actors have any
// distance left to travel here.
//
// This step no longer hands straight to hopBands: the chapter card sits between
// them and opens on this exact closing frame (see layouts/chapters.js).
// ---------------------------------------------------------------------------

// "slowly" — the whole pull-back is one long leg, long enough that the reader
// reads the line while the camera is still moving
const PULLBACK_ZOOM_MS = 4000;
// the links are gone for the whole step: they fade out over the arrival tween,
// in step with the names the state stops labelling
const HOP_SEED_EDGE_FADE = 0;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutHopSeed(nodes, w, h, edges) {
	const { attrs } = layoutHopBands(nodes, w, h, edges, { seed: true });
	// no focus: whatever route the reader lit up on networkIntro releases as the
	// camera pulls back, because the step is about the network as a whole again
	writeNetwork(attrs, nodes, w, h, null, PULLBACK_ZOOM, HOP_SEED_EDGE_FADE);
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM);
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
		const scale = 1 + (PULLBACK_ZOOM - 1) * e;
		writeNetwork(attrs, nodes, w, h, null, scale, HOP_SEED_EDGE_FADE);
		writeFieldCrowd(attrs, w, h, scale);
	};
}

export const states = {
	hopSeed: {
		layout: layoutHopSeed,
		// no names at all, Bacon's included: every one of them fades out with the
		// links on arrival, so the pull-back is of an unlabelled crowd. They also
		// wouldn't survive a cluster this small — 15 names in that space collide.
		// hopBands names Bacon again once he has landed at the top.
		//
		// the pull-back is authored for the forward arrival out of networkIntro;
		// stepping back in from hopBands is one plain tween
		revealFrom: ["networkIntro"],
		entry: { phases: [PULLBACK_ZOOM_MS], frames: zoomOutFrames }
	},
	hopBands: {
		layout: (n, w, h, e) => layoutHopBands(n, w, h, e, {}),
		labels: [ANCHOR_ID],
		// The cascade is authored for the forward arrival off the chapter card,
		// where the crowd is spread across the plot and sorts itself into rows;
		// any other direction (a step back from rankFocus) is one plain tween.
		// It used to reveal from hopSeed's invisible seed park, before the card
		// was inserted between them — see layouts/chapters.js.
		revealFrom: ["chapterCenters"]
	}
};

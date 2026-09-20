import { ANCHOR_ID, INTRO_IDS, hash01 } from "../nodes.js";
import { ATTR_SIZE, DELAY_SIZE, set } from "../attr-buffer.js";
import { SKY_IDS, isIntroActor } from "../cast.js";
import {
	NETWORK_HOP_DELAY_MS,
	NETWORK_INTRO_RADIUS,
	PULLBACK_ZOOM,
	introPosition
} from "../intro-geometry.js";
import { CROWD, HOP_RGB, HOP_DOT_ALPHA } from "../palette.js";
import { MARGIN, plotBottom, NO_BLEED } from "../plot.js";
import { hopFractions, hopShareLabels } from "../rank-geometry.js";
import {
	writeFieldCrowd,
	makeFlight,
	onSkyClock,
	galaxyBox,
	cardSpot,
	flowSpot,
	restingSkyDot,
	skyFlight,
	skyToColumn
} from "../sky.js";
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

/**
 * The column one dot sets off from when it leaves the chapter card.
 *
 * Each dot keeps the COLUMN it stands in on the card — the band only decides its
 * row. The crowd's columns are a uniform scatter across the plot and the intro
 * fifteen's are their places in the pulled-back constellation, so the chart is
 * indistinguishable from any other arrival; what changes is the arrival from the
 * card, where an independent x would send twelve thousand dots off on twelve
 * thousand unrelated diagonals and read as static. Sharing the x makes it fall:
 * the universe rains straight down into rows, which is the only reading of this
 * transition that says "sorted".
 *
 * The column the dot is standing in NOW, not the one it rests in, because the
 * sky never stops: it streams outward from the vanishing point the whole time
 * the reader is on the card, so a dot can be most of the way across the screen
 * from where the static layout has it. Taking the resting column would put the
 * sort's whole first frame somewhere other than the crowd the reader is looking
 * at. At the flow's t = 0 this is exactly the resting column — which is what a
 * cold load and a reduced-motion read both get.
 *
 * The live sky position is contracted about the shared centre, the same
 * contraction the resting position gets, and because the flow's magnification is
 * about that centre too the two commute: this is exactly where the dot would be
 * if the whole flow had been authored in the column. The intro fifteen are
 * outside the flow (see `cardSpot`) and simply keep their column.
 * (`fieldSpot`'s keep-out dots, the handful nudged off Bacon, are the one place
 * the contraction is approximate, as it always has been.)
 *
 * A flowing sky has no outer edge the way a flat one did — a dot is carried out
 * by up to SKY_FAR / SKY_NEAR as it comes forward, so about a third of the crowd
 * is further out than the plot is wide, and no single contraction can hold all
 * of it. Every one of those is off the canvas, which is what makes the rule
 * simple: a dot the reader can SEE falls straight down from where they see it,
 * and a dot they cannot takes a column of its own. The crowd that does land in
 * the plot fills it evenly, so a flat hash for the rest keeps the bands even —
 * the same reasoning the scatters' own park spot uses for a dot they do not
 * plot.
 */
function departureColumn(id, w, h, skyBox, contraction) {
	if (isIntroActor(id)) return cardSpot(id, w, h)[0];
	// contract about the SKY's centre, land on the COLUMN's. The two are the same
	// point while the prose sits over the canvas and differ once it sits beside
	// it; the flow commutes with either, see skyToColumn.
	const cx = (skyBox[0] + skyBox[1]) / 2;
	const col =
		w / 2 + (flowSpot(id, w, h, skyBox, skyFlight.t)[0] - cx) * contraction;
	if (Math.abs(col - w / 2) <= w / 2 - MARGIN) return col;
	return MARGIN + hash01(id, 22) * (w - MARGIN * 2);
}

// fixed header band for the anchor (Bacon) + its label, so the label clears
// the top edge and the first hop band
const HEADER_H = 60;

/**
 * The rows: the header band for Bacon, then hops 1–4 sized purely by their
 * sample share so dot density matches across bands, out of whatever the three
 * gaps between them leave behind. The gap is reserved BEFORE the shares are
 * struck rather than taken back out of each band, so it is real whitespace and
 * every band still gets its honest share of what's left.
 * @param {number[]} counts actors per hop, index = hop
 * @returns {{ bandTop: number[], bandH: number[] }} per hop, index = hop
 */
function bandGeometry(counts, h) {
	const top = MARGIN + 12;
	const bandsTop = top + HEADER_H;
	const dataTotal = counts[1] + counts[2] + counts[3] + counts[4];
	const bandsH = plotBottom(h) - bandsTop - BAND_GAP * 3;
	const bandTop = [top];
	const bandH = [HEADER_H];
	let y = bandsTop;
	for (let hop = 1; hop <= 4; hop++) {
		const share = (counts[hop] / dataTotal) * bandsH;
		bandTop[hop] = y;
		bandH[hop] = Math.max(share, MIN_BAND_H);
		y += share + BAND_GAP;
	}
	return { bandTop, bandH };
}

/**
 * One actor's dot in its hop band: the anchor big and centred in the header
 * row, everyone else jittered within their hop's band.
 * @param {{ w: number, h: number, skyBox: number[], contraction: number,
 *   bandTop: number[], bandH: number[], seed: boolean }} f the frame
 */
function placeInBand(attrs, n, f) {
	if (n.hop === 0) {
		const y = f.bandTop[0] + f.bandH[0] / 2;
		set(attrs, n.id, f.w / 2, y, 10, HOP_RGB[0], f.seed ? 0 : 1);
		return;
	}
	set(
		attrs,
		n.id,
		// the column the dot leaves the chapter card in, parallax and all
		departureColumn(n.id, f.w, f.h, f.skyBox, f.contraction),
		f.bandTop[n.hop] + hash01(n.id, 4) * f.bandH[n.hop],
		3,
		HOP_RGB[n.hop],
		// `seed` parks every node at its band position but invisible — what
		// sits behind hopSeed's zoomed-out network, so the fifteen the network
		// draws are the only actors with any distance left to travel there.
		f.seed ? 0 : HOP_DOT_ALPHA
	);
}

/** @type {import("../layout-types.js").LayoutFn} */
function layoutHopBands(nodes, w, h, _edges, params, bleed = NO_BLEED) {
	const seed = Boolean(params?.seed);
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) counts[n.hop]++;
	// the sky the crowd arrives from, and how far one of its pixels travels as it
	// funnels back into the reading column. Struck once, outside the loop
	const frame = {
		w,
		h,
		skyBox: galaxyBox(w, h, bleed),
		contraction: skyToColumn(w, h, bleed),
		seed,
		...bandGeometry(counts, h)
	};
	for (const n of nodes) {
		placeInBand(attrs, n, frame);
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
		y: frame.bandTop[hop] + frame.bandH[hop] / 2
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
// The pull-back is also where they stop being a diagram: over the same travel
// that brings the crowd in around them the fifteen are drawn into it (see
// writeIntroIntoSky), and once the camera lands they fly with it like anyone
// else. The reader gets the network while the camera is still close enough to
// read it, and a single sky once it isn't.
//
// This step no longer hands straight to hopBands: the chapter card sits between
// them and opens on this exact closing frame (see layouts/chapters.js). It is
// the same frame in the literal sense — the crowd is authored across the card's
// `galaxyBox`, not the plot's `fieldBox`, so the pull-back lands on a sky that
// already fills the screen and stepping onto the card moves nothing: the title
// fades up and the dot bar fades out, over a sky that does not so much as
// blink. The network itself still sits in the column; only the field around it
// is full-bleed.
// ---------------------------------------------------------------------------

const mix = (a, b, e) => a + (b - a) * e;

/**
 * The fifteen letting go of the diagram and joining the sky.
 *
 * `blend` is how far through that they are: at 0 they are drawn exactly as
 * `writeNetwork` draws them — the constellation at the camera's `scale` — and
 * at 1 as any other dot resting in the flow, in the crowd's grey at whatever
 * size and alpha their own depth gives them. Their POSITIONS are the camera's
 * throughout: joining is a change of drawing, not of geometry, so the pull-back
 * is the same move it always was and the network is still a network while the
 * reader can read it.
 *
 * Called after `writeNetwork` rather than instead of it, so the links keep the
 * full draw progress that lets them fade in place (see HOP_SEED_EDGE_FADE).
 *
 * At blend 1 this is `restingSkyDot` and nothing else, which is what lets the
 * flight take the fifteen: `makeFlight` redraws a flown dot from the crowd's
 * landed constants, so a frame it starts from has to already be at them.
 */
function writeIntroIntoSky(attrs, nodes, w, h, scale, blend) {
	for (const id of INTRO_IDS) {
		const [x, y] = introPosition(id, w, h, scale);
		const [skyR, skyA] = restingSkyDot(id);
		const rgb = id === ANCHOR_ID ? HOP_RGB[0] : CROWD;
		set(
			attrs,
			id,
			x,
			y,
			mix(NETWORK_INTRO_RADIUS[nodes[id].hop] * scale, skyR, blend),
			rgb.map((c, k) => mix(c, CROWD[k], blend)),
			mix(1, skyA, blend)
		);
	}
}

// "slowly" — the whole pull-back is one long leg, long enough that the reader
// reads the line while the camera is still moving. Exported so the outro
// state's own echo of this bloom (race.js) shares the same duration rather
// than a second copy of the number.
export const PULLBACK_ZOOM_MS = 4000;
// the links are gone for the whole step: they fade out over the arrival tween,
// in step with the names the state stops labelling
const HOP_SEED_EDGE_FADE = 0;

/** @type {import("../layout-types.js").LayoutFn} */
function layoutHopSeed(nodes, w, h, edges, _params, bleed = NO_BLEED) {
	const { attrs } = layoutHopBands(nodes, w, h, edges, { seed: true }, bleed);
	// no focus: whatever route the reader lit up on networkIntro releases as the
	// camera pulls back, because the step is about the network as a whole again
	writeNetwork(attrs, nodes, w, h, null, PULLBACK_ZOOM, HOP_SEED_EDGE_FADE);
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM, galaxyBox(w, h, bleed));
	// the camera has landed, so the fifteen have finished joining: this frame is
	// the flight's own t = 0 and they are drawn here as the flight will draw them
	writeIntroIntoSky(attrs, nodes, w, h, PULLBACK_ZOOM, 1);
	// No delay clock of its own: every link on this arrival is fading OUT, and
	// ScrollyVisual's arrivalDelays lags only a link that is fading IN, so the
	// computed clock is already all-zero here. This used to need a hand-written
	// zero array to opt out of a shared edge lag that applied in both directions.
	return { attrs };
}

/**
 * hopSeed's pull-back: one leg re-deriving the constellation from a lerped
 * scale, so it glides out from full size instead of being tweened there in
 * TWEEN_MS. Frame 0 holds networkIntro's geometry with the links already at
 * alpha 0, so the arrival tween that precedes the leg fades them out (with the
 * names) while nothing moves; frame 1 reproduces layoutHopSeed call for call, so
 * the runner's settle is a zero-duration retarget. Both ends hold because the
 * blend rides the leg's own `e`: at 0 the fifteen are `writeNetwork`'s dots
 * exactly, at 1 they are the sky's.
 *
 * The box is struck once from the layout's own `bleed`, outside the closure, so
 * every frame of the leg and the static layout it settles onto are the same
 * call — a frame built against a different box would snap the sky inward on
 * settle.
 */
function zoomOutFrames(nodes, w, h, _edges, _params, bleed = NO_BLEED) {
	const box = galaxyBox(w, h, bleed);
	return (attrs, _trails, _phase, e) => {
		const scale = 1 + (PULLBACK_ZOOM - 1) * e;
		writeNetwork(attrs, nodes, w, h, null, scale, HOP_SEED_EDGE_FADE);
		writeFieldCrowd(attrs, w, h, scale, box);
		// the camera's travel IS the blend: the fifteen let go of the diagram at
		// the rate the crowd arrives around them, so the two finish together
		writeIntroIntoSky(attrs, nodes, w, h, scale, e);
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
		entry: { phases: [PULLBACK_ZOOM_MS], frames: zoomOutFrames },
		// once the pull-back stops, the sky it stopped in front of keeps moving, so
		// the beat rests on something alive rather than on a still photograph.
		// The fifteen move with it: by the time the camera lands they have been
		// drawn into the crowd (see writeIntroIntoSky), so they stream, brighten,
		// swell and wrap behind the same fade as the dots around them, with
		// nothing left to tell them apart.
		// `clocked`, so the flight can be handed on to the chapter card's and taken
		// back from it: the two states fly the same ids off the same box, so a
		// handoff moves nothing at all and the sky simply never stops.
		ambient: {
			clocked: true,
			frames: onSkyClock(makeFlight(layoutHopSeed, SKY_IDS))
		}
	},
	hopBands: {
		layout: (n, w, h, e, _p, bleed) => layoutHopBands(n, w, h, e, {}, bleed),
		title: "The four degrees of Kevin Bacon",
		labels: [ANCHOR_ID],
		// The cascade is authored for the forward arrival off the chapter card,
		// where the crowd is spread across the plot and sorts itself into rows;
		// any other direction (a step back from rankFocus) is one plain tween.
		// It used to reveal from hopSeed's invisible seed park, before the card
		// was inserted between them — see layouts/chapters.js.
		revealFrom: ["chapterCenters"]
	}
};

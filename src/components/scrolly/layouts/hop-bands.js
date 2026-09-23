import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import { ANCHOR_ID, INTRO_IDS, hash01 } from "../nodes.js";
import { ATTR_SIZE, DELAY_SIZE, set } from "../attr-buffer.js";
import { SKY_IDS, isIntroActor } from "../cast.js";
import {
	NETWORK_HOP_DELAY_MS,
	NETWORK_INTRO_RADIUS,
	PULLBACK_ZOOM,
	introPosition
} from "../intro-geometry.js";
import { CROWD, HOP_INK, HOP_RGB, HOP_DOT_ALPHA } from "../palette.js";
import { MARGIN, plotBottom, NO_BLEED } from "../plot.js";
import { hopFractions, hopShareLabels } from "../rank-geometry.js";
import {
	writeFieldCrowd,
	makeFlight,
	galaxyBox,
	landedSpot,
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

// How thick a row is, for whichever actor the stack is anchored on.
//
// Bacon's rows are the on-screen SAMPLE's shares, which is what they have always
// been: the sample oversamples hop 1 and hop 4 — 3.4% and 0.6% of it against
// 1.0% and 0.08% of the corpus — so those two rows stay legible instead of
// collapsing onto MIN_BAND_H, while the number printed beside each row cites the
// corpus. That split is deliberate and this chart is built on it.
//
// Another actor's rows are Bacon's, scaled by how their corpus split differs
// from his, then renormalised. So the oversampling carries over to every actor
// rather than being a favour done to Bacon alone, and what the reader watches
// across a turn is the DIFFERENCE between two actors, drawn at a scale where
// there is something to see. Jackson's hop 3 is 11.1% of the corpus against
// Bacon's 29.0%; on screen his row is a bit over a third of the height Bacon's
// is, which is that ratio and not a flattened version of it.
//
// The identity that matters: for Bacon the ratio is 1, so this is exactly the
// sample and his frame is the frame `hopBands` has always drawn. That is what
// makes stepping from step 5 onto the cycling chart move nothing at all —
// asserted by the goldens, which give `hopBands` and `hopAnchor {anchorId: 0}`
// the same three hashes.
const BACON_HOP_COUNTS = story.rankHopBands[ANCHOR_ID];

/**
 * The four row weights for one anchor, as shares summing to 1.
 *
 * Struck from the sample's raw COUNTS rather than its shares so the arithmetic
 * is exact where it has to be: at `anchorId === ANCHOR_ID` every ratio is
 * literally 1 and the result is `counts[hop] / total`, bit for bit what this
 * chart computed before it could be anchored on anybody else.
 * @param {number[]} counts the on-screen crowd per hop, index = hop
 * @param {number} anchorId
 * @returns {number[]} four shares, index 0 = hop 1
 */
function anchorShares(counts, anchorId) {
	const split = story.rankHopBands[anchorId];
	const weights = [1, 2, 3, 4].map(
		(hop) => counts[hop] * (split[hop - 1] / BACON_HOP_COUNTS[hop - 1])
	);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	return weights.map((weight) => weight / total);
}

/** the on-screen crowd per hop, index = hop — the sample the rows are scaled
 * from, and the quota that deals dots into them */
function sampleCounts(nodes) {
	const counts = [0, 0, 0, 0, 0];
	for (const n of nodes) counts[n.hop]++;
	return counts;
}

/**
 * The column one dot sets off from when it leaves hopSeed's sky.
 *
 * Each dot keeps the COLUMN it stands in on the sky — the band only decides its
 * row. The crowd's columns are a uniform scatter across the plot and the intro
 * fifteen's are their places in the pulled-back constellation, so the chart is
 * indistinguishable from any other arrival; what changes is the arrival from the
 * sky, where an independent x would send twelve thousand dots off on twelve
 * thousand unrelated diagonals and read as static. Sharing the x makes it fall:
 * the universe rains straight down into rows, which is the only reading of this
 * transition that says "sorted".
 *
 * The column the dot is standing in NOW, not the one it rests in, because the
 * sky never stops: it streams outward from the vanishing point the whole time
 * the reader is on hopSeed, so a dot can be most of the way across the screen
 * from where the static layout has it. Taking the resting column would put the
 * sort's whole first frame somewhere other than the crowd the reader is looking
 * at. At the flow's t = 0 this is exactly the resting column — which is what a
 * cold load and a reduced-motion read both get.
 *
 * The live sky position is contracted about the shared centre, the same
 * contraction the resting position gets, and because the flow's magnification is
 * about that centre too the two commute: this is exactly where the dot would be
 * if the whole flow had been authored in the column. The intro fifteen are
 * outside the flow (see `landedSpot`) and simply keep their column.
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
	if (isIntroActor(id)) return landedSpot(id, w, h)[0];
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

// the top of the header row, and of the four bands under it. The anchor's name
// hangs below its dot to within 2px of the header's foot, so the bands start a
// BAND_GAP further down — the same whitespace that separates the bands.
const TOP = MARGIN + 12;
const BANDS_TOP = TOP + HEADER_H + BAND_GAP;

/** the height the four rows share, once the three gaps between them are
 * reserved */
const bandsHeight = (h) => plotBottom(h) - BANDS_TOP - BAND_GAP * 3;

/** the px² the rows come to between them — the crowd's whole canvas, since a
 * dot's column spans the plot and its row spans the stack */
const bandArea = (w, bandsH) => (w - MARGIN * 2) * bandsH;

// What the crowd's ink comes to, as a multiple of the band area it is packed
// into. Held constant instead of the RADIUS, which is what makes the chart read
// the same at every box.
//
// Coverage is already uniform across the four ROWS by construction: a row's
// height is proportional to its dot count, so every one of them carries the
// same ink per px² and the only thing that distinguishes them is thickness.
// What is not uniform is the BOX. The phone's bands come to a sixth of the
// side-by-side column's area and hold the same 22,500 dots, so a fixed radius
// puts them at 10.4x coverage against 1.8x — far past the point where any alpha
// survives, and the rows stop reading as a crowd and become four blocks of
// flat colour.
//
// The number is the side-by-side column's own coverage, so the widest box keeps
// the 3px dot it has always had and every narrower one shrinks to meet it:
// nothing this scaling touches gets denser than it is today.
const CROWD_COVERAGE = 1.772;

/** the radius that puts CROWD_COVERAGE times `area` of ink on the canvas,
 * spread over `count` dots */
const crowdDotR = (area, count) =>
	Math.sqrt((CROWD_COVERAGE * area) / (Math.PI * count));

/**
 * The rows: the header band for the anchor, then hops 1–4 sized by the shares
 * they are handed, out of whatever the three gaps between them leave behind.
 * The gap is reserved BEFORE the shares are struck rather than taken back out of
 * each band, so it is real whitespace and every band still gets its honest share
 * of what's left.
 *
 * @param {number[]} shares the anchor's four row weights (see anchorShares)
 * @param {number} bandsH the height the four rows share (see bandsHeight)
 * @returns {{ bandTop: number[], bandH: number[] }} per hop, index = hop
 */
function bandGeometry(shares, bandsH) {
	const bandTop = [TOP];
	const bandH = [HEADER_H];
	let y = BANDS_TOP;
	for (let hop = 1; hop <= 4; hop++) {
		const share = shares[hop - 1] * bandsH;
		bandTop[hop] = y;
		bandH[hop] = Math.max(share, MIN_BAND_H);
		y += share + BAND_GAP;
	}
	return { bandTop, bandH };
}

/**
 * The row the anchor stands in: big, centred, and the only red dot.
 *
 * Invisible while the search's chip is still carrying this anchor to it
 * (`arriving`). The dot is written at the slot all the same — a hidden mark
 * still has a position, which is what the chip aims at (`locateTarget`) and
 * what stops it climbing out of the crowd to meet its own name. What the reader
 * watches instead is the seat being vacated: the anchor who was here leaves for
 * a band, and the new one is delivered by the chip rather than travelling.
 */
function placeAnchor(attrs, id, f, arriving) {
	const y = f.bandTop[0] + f.bandH[0] / 2;
	set(attrs, id, f.w / 2, y, 10, HOP_RGB[0], f.seed || arriving ? 0 : 1);
}

/**
 * One actor's dot in a band, jittered within it.
 *
 * The band is passed rather than read off the node, because it is only the
 * node's own degree while Bacon is anchoring: for anyone else the rows are a
 * corpus split this sample cannot answer per dot, so bands are handed out by
 * quota instead (see BAND_ORDER).
 *
 * @param {number} band which hop row, 1–4
 * @param {{ w: number, h: number, skyBox: number[], contraction: number,
 *   bandTop: number[], bandH: number[], r: number, seed: boolean }} f the frame
 */
function placeInBand(attrs, id, band, f) {
	set(
		attrs,
		id,
		// the column the dot leaves hopSeed's sky in, parallax and all
		departureColumn(id, f.w, f.h, f.skyBox, f.contraction),
		f.bandTop[band] + hash01(id, 4) * f.bandH[band],
		f.r,
		HOP_RGB[band],
		// `seed` parks every node at its band position but invisible — what
		// sits behind hopSeed's zoomed-out network, so the fifteen the network
		// draws are the only actors with any distance left to travel there
		f.seed ? 0 : HOP_DOT_ALPHA
	);
}

/** the four rows' labels, pinned to the middle of the band each one names */
function hopLegend(labels, f) {
	return [1, 2, 3, 4].map((hop) => ({
		color: HOP_RGB[hop],
		ink: HOP_INK[hop],
		label: `${hop} movie${hop > 1 ? "s" : ""} away — ${labels[hop - 1]} of actors`,
		x: MARGIN,
		y: f.bandTop[hop] + f.bandH[hop] / 2
	}));
}

/** the sky the crowd arrives from, how far one of its pixels travels as it
 * funnels back into the reading column, and the size a dot is at this box.
 * Struck once, outside the dot loop */
function bandFrame(w, h, bleed, shares, count, seed = false) {
	const bandsH = bandsHeight(h);
	return {
		w,
		h,
		skyBox: galaxyBox(w, h, bleed),
		contraction: skyToColumn(w, h, bleed),
		seed,
		r: crowdDotR(bandArea(w, bandsH), count),
		...bandGeometry(shares, bandsH)
	};
}

// ---------------------------------------------------------------------------
// Who stands in which row.
//
// The corpus knows every actor's distance from BACON and nothing else: the only
// per-actor breakdown exported is `story.rankHopBands`, four totals apiece for
// the ranked top 250 (tasks/build-scrolly-nodes.js). There is no per-dot answer
// for "how far is this actor from Morgan Freeman", and there never will be from
// this data.
//
// So the rows are filled by quota: each takes the number of dots its own weight
// asks for, cut out of one fixed order. Anchored on Bacon the quota lands
// exactly on the hop boundaries and every dot is in its own degree, which is the
// chart step 5 has always drawn — the goldens hold `hopBands` and `hopAnchor
// {anchorId: 0}` to the same three hashes, so stepping between them moves
// nothing. Anchored on anyone else a crowd dot's row is a proportion rather than
// its own distance. Nothing labels a crowd dot — the only name here is the
// anchor's — so it is not a claim the chart makes to anybody; it is written down
// because it is the one thing the chart says less than it looks like it does.
// ---------------------------------------------------------------------------

/**
 * Every dot the bands hold, in one fixed order: by its own distance from Bacon,
 * then by id.
 *
 * A band is a CUT through this list (see bandCuts), so changing the anchor
 * slides three boundaries rather than re-dealing the field — a dot changes rows
 * only if a boundary passed it, and the cycle reads as the breakdown moving
 * instead of as a reshuffle. Ordering by hop is what makes that true: a hash
 * order would scatter the same number of changes evenly across the crowd, and
 * every turn would look like static.
 *
 * Struck once, at module scope: 22,500 entries that depend on neither the box
 * nor the anchor.
 */
const BAND_ORDER = rawNodes.nodes
	.map((_, id) => id)
	.sort((a, b) => rawNodes.nodes[a][2] - rawNodes.nodes[b][2] || a - b);

/**
 * Where the three boundaries fall, as counts of dots spent by the end of each
 * band. The last band takes the remainder rather than its own rounded share, so
 * the cuts always spend exactly the crowd there is — four independent roundings
 * would leave a handful of dots with no row, or ask for more dots than exist.
 * @param {number[]} shares four hop shares summing to 1
 * @param {number} n how many dots there are to deal
 * @returns {number[]} four cut counts, the last of them `n`
 */
function bandCuts(shares, n) {
	const cuts = [];
	let spent = 0;
	for (let band = 0; band < 3; band++) {
		spent += Math.round(shares[band] * n);
		cuts.push(Math.min(spent, n));
	}
	cuts.push(n);
	return cuts;
}

/** bands cascade 1→4, and each dot jitters within its own so the row fills in
 * rather than snapping on all at once. Arriving from hopSeed this clock
 * staggers TRAVEL, not a fade: the crowd is already on screen, spread across the
 * plot, and falls into its rows a degree at a time. Keyed on the band the dot is
 * falling INTO — which for Bacon is its own hop, and for anyone else is the row
 * the quota put it in. */
const bandDelay = (id, band) =>
	band * NETWORK_HOP_DELAY_MS + hash01(id, 5) * 400;

/**
 * Everyone but the anchor, who is standing in the header row: one pass down
 * BAND_ORDER, moving to the next row as each cut is spent.
 * @param {number[]} cuts dots spent by the end of each band (see bandCuts)
 */
function dealBands(attrs, delays, cuts, anchorId, frame) {
	let dealt = 0;
	let band = 1;
	for (const id of BAND_ORDER) {
		if (id === anchorId) continue;
		while (band < 4 && dealt >= cuts[band - 1]) band++;
		placeInBand(attrs, id, band, frame);
		delays[id] = bandDelay(id, band);
		dealt++;
	}
}

/** @type {import("../layout-types.js").LayoutFn} */
function layoutHopBands(nodes, w, h, _edges, params, bleed = NO_BLEED) {
	const { seed = false, anchorId = ANCHOR_ID, arriving = false } = params ?? {};
	const counts = sampleCounts(nodes);
	const shares = anchorShares(counts, anchorId);
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const frame = bandFrame(w, h, bleed, shares, nodes.length - 1, seed);
	placeAnchor(attrs, anchorId, frame, arriving);
	delays[anchorId] = bandDelay(anchorId, 0);
	dealBands(attrs, delays, bandCuts(shares, nodes.length - 1), anchorId, frame);
	// the seed frame carries no reveal choreography or legend — it only
	// pre-positions the crowd behind hopSeed's network
	if (seed) return { attrs };
	const labels = hopShareLabels(hopFractions(anchorId));
	return { attrs, delays, legend: hopLegend(labels, frame) };
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
// The crowd is authored across `galaxyBox`, not the plot's `fieldBox`, so the
// pull-back lands on a sky that fills the screen, and hopBands sorts it into
// rows straight from there (see departureColumn). The network itself still sits
// in the column; only the field around it is full-bleed.
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
		ambient: { frames: makeFlight(layoutHopSeed, SKY_IDS) }
	},
	hopBands: {
		// Straight through, with no params of its own, so the layout falls back to
		// Bacon as the anchor — which is the same call `hopAnchor` makes on its own
		// first frame, and why stepping between the two moves no dot at all.
		// `seed` is hopSeed's alone, and that state calls the layout directly
		// rather than coming past this entry.
		layout: layoutHopBands,
		title: "The four degrees of Kevin Bacon",
		labels: [ANCHOR_ID],
		// The cascade is authored for the forward arrival off hopSeed's sky,
		// where the crowd is spread across the plot and sorts itself into rows;
		// any other direction (a step back from rankFocus) is one plain tween.
		revealFrom: ["hopSeed"]
	},
	hopAnchor: {
		// The same layout `hopBands` draws, handed an anchor.
		layout: layoutHopBands,
		// No state plays this layout's cascade on the way in. The cascade is
		// hopBands' sort off hopSeed — a degree at a time, out of a crowd spread across
		// the plot — and every arrival HERE comes off a step already resting on
		// Bacon, so not a dot moves. Left to default the delays would still be
		// spent: measured 2026-09-22, 1.8s of blank chart between the departing
		// furniture fading out and the arriving furniture fading in, with nothing
		// travelling for any of it. An empty list is the field's own way of saying
		// the reveal is authored for nobody (see arrivalDelays).
		revealFrom: [],
		// Static, because `furnitureSet` freezes a title per state change so a
		// departing copy keeps its own text while it fades (ScrollyVisual). It does
		// not need to carry the anchor's name in any case: the anchor's dot is the
		// only labelled thing on the chart, and it is 60px above this line.
		title: "Actors with 4 degrees of separation",
		// Nobody at all while the chip is carrying the anchor here: the name is
		// still legible on the chip itself, and printing it under the empty seat
		// as well would announce the arrival twice and beat the thing announcing
		// it. It appears with the dot, on the beat the chip is dropped — the same
		// exchange the scatters make (see ActorSearch's `moves`).
		labels: (params) =>
			params?.arriving ? [] : [params?.anchorId ?? ANCHOR_ID],
		params: (s) => ({ anchorId: s.hops.anchorId, arriving: s.hops.arriving })
	}
};

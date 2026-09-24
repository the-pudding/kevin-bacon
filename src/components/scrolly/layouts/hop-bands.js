import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import PoissonDiskSampling from "poisson-disk-sampling";
import { ANCHOR_ID, INTRO_IDS, dotHash, hash01 } from "../nodes.js";
import { ATTR_SIZE, DELAY_SIZE, set } from "../attr-buffer.js";
import { HOP_CYCLE_IDS, SKY_IDS, isIntroActor } from "../cast.js";
import {
	NETWORK_HOP_DELAY_MS,
	NETWORK_INTRO_RADIUS,
	PULLBACK_ZOOM,
	introPosition
} from "../intro-geometry.js";
import { CROWD, HOP_INK, HOP_RGB, HOP_DOT_ALPHA } from "../palette.js";
import { MARGIN, NO_BLEED, screenSpan } from "../plot.js";
import { hopFractions, hopShareLabels } from "../rank-geometry.js";
import {
	writeFieldCrowd,
	makeFlight,
	galaxyBox,
	landedSpot,
	flowSpot,
	restingSkyDot,
	skyFlight
} from "../sky.js";
import { writeNetwork } from "./intro.js";
import { withGalaxyHighlight } from "../galaxy-highlight.js";

// ---------------------------------------------------------------------------
// Hop bands (Present chapter): row per degree of separation. Band thickness
// follows the on-screen sample.
// ---------------------------------------------------------------------------

// Whitespace between adjacent rows. Without it the bands tile edge to edge and
// neighbouring degrees read as one gradient rather than four rows — hop 2's
// blue and hop 3's cyan are the pair that blend.
const BAND_GAP = 12;

// How thick a row is, for whichever actor the stack is anchored on.
//
// Bacon's rows are the on-screen SAMPLE's shares, which is what they have always
// been: the sample oversamples hop 1 and hop 4 — 3.4% and 0.6% of it against
// 1.0% and 0.08% of the corpus — so those two rows stay legible instead of
// shrinking to a single row of dots, while the number printed beside each row cites the
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

/** a sample dot's own distance from Bacon */
const hopOf = (id) => rawNodes.nodes[id][2];

/** the whole sample per hop, index = hop — what the rows are scaled from, and
 * what the dots on show are drawn from in proportion (see shownDots) */
const SAMPLE_COUNTS = [0, 0, 0, 0, 0];
for (let id = 0; id < rawNodes.nodes.length; id++) SAMPLE_COUNTS[hopOf(id)]++;

/**
 * The column one dot sets off from when it leaves the sky — hopSeed's, which
 * the title card carries on flowing, so the sort starts off the title.
 *
 * Each dot keeps the COLUMN it stands in on the sky — the band only decides its
 * row. The crowd's columns are a uniform scatter across the bands and the intro
 * fifteen's are their places in the pulled-back constellation, so the chart is
 * indistinguishable from any other arrival; what changes is the arrival from the
 * sky, where an independent x would send twelve thousand dots off on twelve
 * thousand unrelated diagonals and read as static. Sharing the x makes it fall:
 * the universe rains straight down into rows, which is the only reading of this
 * transition that says "sorted".
 *
 * The bands span the screen the sky fills (`screenSpan`), so the column is the
 * dot's own screen x with nothing between: no funnel into the reading column,
 * and so no horizontal travel at all for a dot the reader can see over the
 * bands. Past the span's cap (a screen wider than SCREEN_CHART_MAX_W) the strip
 * either side is sky with no band under it, and a dot there takes a hashed
 * column like one off the canvas.
 *
 * The column the dot is standing in NOW, not the one it rests in, because the
 * sky never stops: it streams outward from the vanishing point the whole time
 * the reader is on hopSeed and the title card, so a dot can be most of the way
 * across the screen from where the static layout has it. Taking the resting
 * column would put the sort's whole first frame somewhere other than the crowd
 * the reader is looking at. At the flow's t = 0 this is exactly the resting
 * column — which is what a cold load and a reduced-motion read both get. The
 * intro fifteen are outside the flow (see `landedSpot`) and keep their
 * constellation's column instead — which stands in the reading column, so
 * beside the prose it can fall outside a capped span and takes a hashed
 * column like anyone else there.
 *
 * A flowing sky has no outer edge the way a flat one did — a dot is carried out
 * by up to SKY_FAR / SKY_NEAR as it comes forward, so much of the crowd is
 * further out than the screen is wide. Every one of those is off the canvas,
 * which is what makes the rule simple: a dot the reader can see over the bands
 * falls straight down from where they see it, and any other takes a column of
 * its own.
 * The crowd that does land in the bands fills them evenly, so a flat hash for
 * the rest keeps the bands even — the same reasoning the scatters' own park spot
 * uses for a dot they do not plot.
 */
function departureColumn(id, f) {
	const col = isIntroActor(id)
		? landedSpot(id, f.w, f.h)[0]
		: flowSpot(id, f.w, f.h, f.skyBox, skyFlight.t)[0];
	if (col >= f.x0 && col <= f.x1) return col;
	return f.x0 + hash01(id, 22) * (f.x1 - f.x0);
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
 * reserved. Down to a MARGIN off the box's foot rather than to `plotBottom`:
 * that line keeps a chart clear of the step card or its own axis furniture, and
 * this chart has neither to clear — the prose lies over it at every width. */
const bandsHeight = (h) => h - MARGIN - BANDS_TOP - BAND_GAP * 3;

// The crowd stands on a blue-noise scatter: every dot the same size, no two
// touching, and no rows or columns for the eye to find. Seats are dealt by
// Poisson-disc sampling, so no two seats are nearer than a dot's width plus the
// gap, and the space between them varies, the way it does in a crowd. A
// lattice packs tighter, but it reads as a honeycomb.
//
// The dot's SIZE is what's held constant across boxes, not the ink it comes to:
// a phone's rows hold fewer dots than a desktop's (see crowdSeats) rather than
// the same dots drawn smaller. Every one of the sample's 22,500 would come to
// about a pixel across on a phone, so this chart shows a proportional subset of
// them and the rest fade out as they fall (see shownDots).
export const CROWD_DOT_R = 3;
// the least clear space between neighbours, edge to edge
export const DOT_GAP = 0.5;
// the least distance between two seats, centre to centre
const SEAT_SPACING = CROWD_DOT_R * 2 + DOT_GAP;

// a few boxes' seats, most recent last: a drag-resize strikes a new box on
// every frame, and there is no reason to keep them all
const SEAT_CACHE_SIZE = 8;
const seatCache = new Map();

/**
 * Every seat the four bands have at this box, top to bottom: one fixed scatter
 * across the bands' whole area, struck once per box and never re-dealt.
 *
 * The rows are cuts through it, in this order (see layoutHopBands): the first
 * row takes the top so many seats, the next the so many after them, and each
 * row below is moved down a BAND_GAP further than the one above. Seats are
 * sorted by height, so everything above a cut is above everything below it, and
 * moving the lower part down only pulls the two apart; no two dots can come to
 * overlap across a cut. An anchor turn moves the cuts and not the seats, so
 * only the dots near a moving cut change rows, and every other dot stays put.
 *
 * Seeded off `dotHash` (a sine hash stepped by one repeats; see its note), so
 * the same box always gets the same seats: goldens hash this layout, and the
 * render layer caches it.
 * @returns {number[][]} [x, y] per seat, y measured from the top of the bands
 */
function crowdSeats(x0, x1, h) {
	const key = `${x0},${x1},${h}`;
	if (!seatCache.has(key)) {
		let draw = 0;
		const sampler = new PoissonDiskSampling(
			{
				shape: [x1 - x0 - CROWD_DOT_R * 2, bandsHeight(h) - CROWD_DOT_R * 2],
				minDistance: SEAT_SPACING
			},
			() => dotHash(draw++, 24)
		);
		const seats = sampler
			.fill()
			.map(([x, y]) => [x0 + CROWD_DOT_R + x, CROWD_DOT_R + y])
			.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
		seatCache.set(key, seats);
		if (seatCache.size > SEAT_CACHE_SIZE)
			seatCache.delete(seatCache.keys().next().value);
	}
	return seatCache.get(key);
}

/** how far down a row's seats are moved: a BAND_GAP per row above it */
const bandOffset = (band) => BANDS_TOP + (band - 1) * BAND_GAP;

/**
 * The rows: the header band for the anchor, then hops 1–4, each running from
 * its top seat to its bottom one. A row with nobody in it (an anchor with
 * nobody at that distance) is a dot's height at the foot of the row above, so
 * its label still has somewhere to hang.
 *
 * @param {number[][]} seats the box's seats (see crowdSeats)
 * @param {number[]} cuts seats spent by the end of each row (see bandCuts)
 * @returns {{ bandTop: number[], bandH: number[] }} per hop, index = hop
 */
function bandGeometry(seats, cuts) {
	const bandTop = [TOP];
	const bandH = [HEADER_H];
	let foot = BANDS_TOP - BAND_GAP;
	for (let hop = 1; hop <= 4; hop++) {
		const first = hop > 1 ? cuts[hop - 2] : 0;
		const last = cuts[hop - 1];
		const top =
			last > first
				? bandOffset(hop) + seats[first][1] - CROWD_DOT_R
				: foot + BAND_GAP;
		foot =
			last > first
				? bandOffset(hop) + seats[last - 1][1] + CROWD_DOT_R
				: top + CROWD_DOT_R * 2;
		bandTop[hop] = top;
		bandH[hop] = foot - top;
	}
	return { bandTop, bandH };
}

/**
 * The row the anchor stands in: big, centred on the screen, and the only red
 * dot.
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
	set(
		attrs,
		id,
		(f.x0 + f.x1) / 2,
		y,
		10,
		HOP_RGB[0],
		f.seed || arriving ? 0 : 1
	);
}

// `seed` parks every node at its band position but invisible — what sits
// behind hopSeed's zoomed-out network, so the fifteen the network draws are the
// only actors with any distance left to travel there
const bandAlpha = (f) => (f.seed ? 0 : HOP_DOT_ALPHA);

/**
 * The dots on show in seat order: the dot at index k sits in seat k, whichever
 * actor is anchoring.
 *
 * The order is struck on Bacon's rows. Each row's dots are ranked by the column
 * they leave the sky in (`departureColumn`) and its seats by x, and the two are
 * paired off, so each dot falls into a seat near its own column and the sort
 * still reads as the sky raining straight down.
 *
 * Every other anchor seats the same list, which is what keeps a turn calm. The
 * rows are cuts through the list and through the seats alike (see bandCuts), so
 * when a cut moves, the dots it passes keep their seats and only move a
 * BAND_GAP into the next row, and nobody else moves at all. The anchor going up
 * to the header leaves its seat to Bacon, who comes down into the crowd. A
 * searched anchor who is not on show leaves no seat, so Bacon takes the spare
 * one at the foot (see shownDots).
 *
 * @param {Uint8Array} shown 1 per dot on show, indexed by id
 * @returns {number[]} ids, index = seat
 */
function seatOrder(shown, f) {
	const bacon = dealBands(
		BAND_ORDER.filter((id) => shown[id] && id !== ANCHOR_ID),
		anchorShares(SAMPLE_COUNTS, ANCHOR_ID)
	);
	const order = [];
	for (let band = 1; band <= 4; band++) {
		const from = order.length;
		const seats = bacon[band]
			.map((_, k) => from + k)
			.sort((a, b) => f.seats[a][0] - f.seats[b][0]);
		bacon[band]
			.map((id) => ({ id, x: departureColumn(id, f) }))
			.sort((a, b) => a.x - b.x || a.id - b.id)
			.forEach(({ id }, k) => (order[seats[k]] = id));
	}
	return order;
}

/**
 * The dots on show for this anchor, in seat order: Bacon's order with the
 * anchor taken out and Bacon put back in (see seatOrder).
 */
function seatedFor(order, anchorId) {
	if (anchorId === ANCHOR_ID) return order;
	const seat = order.indexOf(anchorId);
	if (seat < 0) return [...order, ANCHOR_ID];
	return order.map((id, k) => (k === seat ? ANCHOR_ID : id));
}

/**
 * Seats the dots on show, each in the seat its index names, drawn in the row
 * its seat falls in.
 *
 * The row is the seat's and not the node's own degree, because that is only
 * the node's degree while Bacon is anchoring: for anyone else the rows are a
 * corpus split this sample cannot answer per dot, so they are handed out by
 * quota instead (see BAND_ORDER).
 * @param {number[]} seated ids, index = seat
 * @param {number[]} cuts seats spent by the end of each row (see bandCuts)
 */
function seatCrowd(attrs, delays, seated, cuts, f) {
	let band = 1;
	seated.forEach((id, k) => {
		while (band < 4 && k >= cuts[band - 1]) band++;
		const [x, y] = f.seats[k];
		set(
			attrs,
			id,
			x,
			bandOffset(band) + y,
			CROWD_DOT_R,
			HOP_RGB[band],
			bandAlpha(f)
		);
		delays[id] = bandDelay(id, band);
	});
}

/**
 * A dot this chart does not show: it falls into the band the whole crowd's
 * quota puts it in, from the column it leaves the sky in, fading out as it
 * goes — so the sort off the sky thins the crowd as it lands instead of
 * dropping dots on the spot.
 */
function placeHidden(attrs, delays, id, band, f) {
	set(
		attrs,
		id,
		departureColumn(id, f),
		f.bandTop[band] + hash01(id, 4) * f.bandH[band],
		CROWD_DOT_R,
		HOP_RGB[band],
		0
	);
	delays[id] = bandDelay(id, band);
}

// How far below its row's top edge a label hangs, at most. A thin row is
// labelled through its middle as it always was; a thick one hangs its label
// just inside its top edge instead, because the prose lies over the chart's
// middle (`proseOver`) and on a phone runs the full width — so a label at the
// middle of the 2-movie row, which is most of the chart, sat under the words.
const LEGEND_TOP_INSET = 12;

/** the four rows' labels, each hung just inside the top of the row it names */
function hopLegend(labels, f) {
	return [1, 2, 3, 4].map((hop) => ({
		color: HOP_RGB[hop],
		ink: HOP_INK[hop],
		label: `${hop} movie${hop > 1 ? "s" : ""} away — ${labels[hop - 1]} of actors`,
		x: f.x0,
		y: f.bandTop[hop] + Math.min(f.bandH[hop] / 2, LEGEND_TOP_INSET)
	}));
}

/** the bands' horizontal span, the sky the crowd arrives from, and the seats
 * at this box. Struck once, outside the dot loop; the rows' geometry is added
 * once the dots on show have been dealt (see layoutHopBands).
 *
 * The span is the screen's, not the reading column's (`screenSpan`: edge to
 * edge up to a cap, centred on the screen), and the prose lies over it
 * (`proseOver` below). `.scrolly-visual`'s box is untouched — the canvas
 * element already reaches the viewport's edges, so widening the chart is a
 * matter of authoring into the bleed. */
function bandFrame(w, h, bleed, seed = false) {
	const [x0, x1] = screenSpan(w, bleed);
	return {
		w,
		h,
		x0,
		x1,
		skyBox: galaxyBox(w, h, bleed),
		seed,
		seats: crowdSeats(x0, x1, h)
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
//
// Only a subset of the crowd is on show (see shownDots): as many as the box
// seats, drawn from each degree in proportion. The rest are dealt by the
// same quota, fall into their rows unseen and are drawn at alpha 0.
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
	.sort((a, b) => hopOf(a) - hopOf(b) || a - b);

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
 * rather than snapping on all at once. Arriving from the title card this clock
 * staggers TRAVEL, not a fade: the crowd is already on screen, spread across the
 * plot, and falls into its rows a degree at a time. Keyed on the band the dot is
 * falling INTO — which for Bacon is its own hop, and for anyone else is the row
 * the quota put it in. */
const bandDelay = (id, band) =>
	band * NETWORK_HOP_DELAY_MS + hash01(id, 5) * 400;

/**
 * `ids`, in their BAND_ORDER order, split into the four rows: one pass down the
 * list, moving to the next row as each cut is spent.
 * @param {number[]} ids the dots to deal, in BAND_ORDER order
 * @param {number[]} shares the anchor's four row weights (see anchorShares)
 * @returns {number[][]} the dots per row, index = hop (index 0 is empty)
 */
function dealBands(ids, shares) {
	const cuts = bandCuts(shares, ids.length);
	const bands = [[], [], [], [], []];
	let band = 1;
	ids.forEach((id, dealt) => {
		while (band < 4 && dealt >= cuts[band - 1]) band++;
		bands[band].push(id);
	});
	return bands;
}

// The anchors the cycle turns through, who drop out of the header into a band
// and climb back up on every turn — so they are always among the dots on show,
// and the reader never watches one fade out as it lands.
const FEATURED = new Set(HOP_CYCLE_IDS);

/** each hop's dots in the order they are picked to be shown: the featured
 * anchors first, then by a fixed hash. Struck once, at module scope. */
const SHOW_ORDER = [1, 2, 3, 4].map((hop) =>
	BAND_ORDER.filter((id) => hopOf(id) === hop).sort(
		(a, b) =>
			Number(FEATURED.has(b)) - Number(FEATURED.has(a)) ||
			hash01(a, 23) - hash01(b, 23)
	)
);

/**
 * Which dots this chart shows at a box of `capacity` seats: Bacon, and
 * `capacity − 1` more drawn from each hop in proportion to the sample.
 *
 * The draw is by each dot's own distance from Bacon, cut with the same
 * `bandCuts` Bacon's rows are, so anchored on him every row holds exactly its
 * share of the dots on show and each of them is in its own degree. It depends
 * on the box and nothing else — not the anchor — so an anchor turn moves the
 * dots on show between rows and never swaps one for another.
 *
 * At most `capacity` are ever dealt into the rows: `capacity − 1` when the
 * anchor is one of them and has gone up to the header, `capacity` when a
 * searched anchor is not and Bacon drops into a row. So the one seat left
 * over while an anchor on show is up in the header is where Bacon sits when a
 * searched one is not (see seatedFor).
 * @returns {Uint8Array} 1 per dot on show, indexed by id
 */
function shownDots(capacity) {
	const shown = new Uint8Array(rawNodes.nodes.length);
	shown[ANCHOR_ID] = 1;
	const cuts = bandCuts(
		anchorShares(SAMPLE_COUNTS, ANCHOR_ID),
		Math.max(0, capacity - 1)
	);
	SHOW_ORDER.forEach((ids, k) => {
		const quota = cuts[k] - (k > 0 ? cuts[k - 1] : 0);
		for (const id of ids.slice(0, quota)) shown[id] = 1;
	});
	return shown;
}

/** @type {import("../layout-types.js").LayoutFn} */
function layoutHopBands(_nodes, w, h, _edges, params, bleed = NO_BLEED) {
	const { seed = false, anchorId = ANCHOR_ID, arriving = false } = params ?? {};
	const shares = anchorShares(SAMPLE_COUNTS, anchorId);
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const base = bandFrame(w, h, bleed, seed);
	const shown = shownDots(base.seats.length);
	const seated = seatedFor(seatOrder(shown, base), anchorId);
	const cuts = bandCuts(shares, seated.length);
	const frame = { ...base, ...bandGeometry(base.seats, cuts) };
	placeAnchor(attrs, anchorId, frame, arriving);
	delays[anchorId] = bandDelay(anchorId, 0);
	seatCrowd(attrs, delays, seated, cuts, frame);
	dealBands(
		BAND_ORDER.filter((id) => id !== anchorId),
		shares
	).forEach((ids, band) => {
		for (const id of ids)
			if (!shown[id]) placeHidden(attrs, delays, id, band, frame);
	});
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
// pull-back lands on a sky that fills the screen; the title card carries it on,
// and hopBands sorts it into rows straight from there (see departureColumn). The network itself still sits
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
		// the sky fills the screen, under the prose too (see isProseHalo)
		proseHalo: true,
		// once the pull-back stops, the sky it stopped in front of keeps moving, so
		// the beat rests on something alive rather than on a still photograph.
		// The fifteen move with it: by the time the camera lands they have been
		// drawn into the crowd (see writeIntroIntoSky), so they stream, brighten,
		// swell and wrap behind the same fade as the dots around them, with
		// nothing left to tell them apart.
		//
		// Stepping back from the title card carries its sky on rather than
		// winding it back to rest (see `titleGalaxy` below); the beat the card
		// was showing fades where it stands.
		ambient: {
			frames: makeFlight(layoutHopSeed, SKY_IDS),
			carryFrom: ["titleGalaxy"]
		}
	},
	// The title card, straight after the pull-back: the same sky hopSeed landed
	// on, carrying on flowing under the piece's name, with the highlight beat
	// picking well-known actors out of it (see galaxy-highlight.js). Nothing is
	// moved to get here — the arrival carries hopSeed's flight on at the clock it
	// had reached (`carryFrom`), so the step change is the card fading in and
	// nothing else.
	titleGalaxy: {
		layout: layoutHopSeed,
		// No labels STANDING STILL: the resting frame under the title is an
		// anonymous crowd, and the names arrive with the motion instead — the
		// beat's own per-frame cut in ScrollyVisual is what names anybody. An
		// empty set rather than no declaration at all: it says the resting card
		// names nobody, which is also what holds the t = 0 contract.
		labels: () => [],
		// The fifteen fly here as crowd, as they do on hopSeed. The beat can never
		// want one of them — GALAXY_CAST is derived from FIELD_IDS, which excludes
		// the fifteen by construction, so every actor it can light is one this
		// state actually draws.
		ambient: {
			frames: withGalaxyHighlight(makeFlight(layoutHopSeed, SKY_IDS)),
			carryFrom: ["hopSeed"]
		}
	},
	hopBands: {
		// Straight through, with no params of its own, so the layout falls back to
		// Bacon as the anchor — which is the same call `hopAnchor` makes on its own
		// first frame, and why stepping between the two moves no dot at all.
		// `seed` is hopSeed's alone, and that state calls the layout directly
		// rather than coming past this entry.
		layout: layoutHopBands,
		// One chart with hopAnchor, so the two share one scene: the legend stays
		// up and glides with its rows across the step change instead of fading
		// out and in around them. The title changes the way every title does:
		// out on the press, in on the landing (ScrollyVisual's titleState). As
		// two scenes, 4 <-> 5 blanked the legend for a whole tween.
		scene: "hops",
		// The bands span the whole screen (see bandFrame), so the prose lies
		// over them rather than beside them — Stage.svelte reads this — and the
		// prose carries the halo to stay legible over the rows (see isProseHalo).
		proseOver: true,
		proseHalo: true,
		title: "The four degrees of Kevin Bacon",
		labels: [ANCHOR_ID],
		// The cascade is authored for the forward arrival off the title card's
		// sky (hopSeed's, carried on), where the crowd is spread across the plot
		// and sorts itself into rows; any other direction (a step back from
		// rankFocus) is one plain tween.
		revealFrom: ["titleGalaxy"]
	},
	hopAnchor: {
		// The same layout `hopBands` draws, handed an anchor.
		layout: layoutHopBands,
		// No state plays this layout's cascade on the way in. The cascade is
		// hopBands' sort off the sky — a degree at a time, out of a crowd spread across
		// the plot — and every arrival HERE comes off a step already resting on
		// Bacon, so not a dot moves. Left to default the delays would still be
		// spent: measured 2026-09-22, 1.8s of blank chart between the departing
		// furniture fading out and the arriving furniture fading in, with nothing
		// travelling for any of it. An empty list is the field's own way of saying
		// the reveal is authored for nobody (see arrivalDelays).
		revealFrom: [],
		scene: "hops",
		proseOver: true,
		proseHalo: true,
		// Static: it does not need to carry the anchor's name, because the
		// anchor's dot is the only labelled thing on the chart and it is 60px
		// above this line — and a title that changed on every turn of the cycle
		// would crossfade on every turn too.
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

import rawNodes from "$data/scrolly-nodes.json";
import {
	STRIDE,
	GALAXY_LINK_BASE,
	GALAXY_LINK_MAX,
	setEdge
} from "./attr-buffer.js";
import { FIELD_IDS } from "./cast.js";
import { dotHash } from "./nodes.js";
import { CROWD, INK } from "./palette.js";
import { TITLE_BAND, NO_BLEED, lin } from "./plot.js";
import {
	FLIGHT_CYCLE_MS,
	FLIGHT_FADE,
	SKY_FAR,
	SKY_NEAR,
	galaxyBox,
	galaxyCentre,
	skyFrac,
	skyMag
} from "./sky.js";

// ---------------------------------------------------------------------------
// The chapter card's highlight beat: one well-known actor at a time picked out
// of the flowing crowd — inked, enlarged and named — with spokes drawn from them
// out across the sky, more spokes for a more prolific actor.
//
// It is an ILLUSTRATION, not a measurement. The spokes do not go to the actor's
// real co-stars: the corpus co-star graph is not in this repo (the data carries
// eighteen baked edges, all inside the intro constellation), and the story never
// claims otherwise. What the spokes carry is one true thing — that some actors
// sit on far more of the corpus than others — and they carry it by count alone.
//
// Two things shape the whole design:
//
// The beat is a pure function of the flight clock, not a timer. The obvious
// build — a setInterval writing `story`, the way step 1's actor tour works — is
// dead on arrival here, because the render effect's `sweeping` guard returns
// early on a param change while an ambient loop owns the frame, so no dot and no
// spoke would ever move (and `sweeping` must not become `$state`; see
// notes/scrolly-framework.md). The ambient writer already holds the rAF, the
// buffers and an elapsed `t`, so the cycle lives there and derives everything
// from `Math.floor(t / GALAXY_BEAT_MS)`.
//
// Nothing here draws. Spokes rent slots from the attr array's edge pool and are
// stroked by the same loop as the constellation's links — which reads both
// endpoints out of the live buffer every frame, and so follows dots that are
// moving, which on this card is all of them.
// ---------------------------------------------------------------------------

/** one actor's turn in the light */
export const GALAXY_BEAT_MS = 5000;
// the name and the ink ramp up and down inside the beat rather than switching:
// at t = 0 this is what makes the writer reproduce the static layout exactly,
// since the envelope opens at zero and the card names nobody standing still
const GALAXY_FADE_MS = 600;
/**
 * How fast a spoke unspools from the actor outward, as a share of the sky's own
 * width per second — a constant SPEED rather than a constant duration, so a
 * nearby dot is reached long before a distant one, and measured THROUGH the
 * volume rather than across the screen (see worldSpot).
 *
 * Expressed against the sky's width rather than in px/ms so it means the same
 * thing on every viewport: the volume is about a third the width of a phone's
 * frame, so a fixed px rate would draw the same fan twice as fast there.
 *
 * **The beat length is what caps how slow this can go**, and the binding case is
 * a phone rather than a desktop: the volume is as deep as it is wide, so on a
 * narrow frame the deepest spokes span almost a full sky-width, where on a
 * desktop the widest span about 0.6 of one. Measured real lengths are a median
 * of 419px and a maximum of 1,024px on a desktop, 206 / 522 on a phone, against
 * a budget of `GALAXY_BEAT_MS - GALAXY_FADE_MS` before the fan starts fading:
 *
 *     rate   desktop median   phone slowest   margin left
 *     0.45          560ms          2117ms         2283ms
 *     0.35          719ms          2722ms         1678ms
 *     0.28          899ms          3402ms          998ms
 *     0.22         1145ms          4330ms           70ms
 *     0.20         1259ms          4763ms      cut off part-drawn
 *
 * At 0.28 a typical spoke lands in ~0.9s and the deepest phone spoke in ~3.4s,
 * still leaving the finished fan a second on screen before it goes. Slower than
 * this wants a longer `GALAXY_BEAT_MS` to sit in, not a smaller number here.
 */
const GALAXY_DRAW_WIDTHS_PER_S = 0.28;

/**
 * How many actors the cycle runs through. Sized by the visibility gate
 * (`focusHolds`), not by taste, and it is the knob worth reaching for first.
 *
 * A given actor is well enough placed to carry a whole beat only about 4% of the
 * time on a desktop: the flow spends most of a dot's trip carrying it out past
 * the reading column, and a name has to be inside that column to be drawn at
 * all. So a beat needs many candidates to find one somewhere useful, and the
 * cast trades fame against silence. Share of beats that find nobody, measured
 * against the visibility gate alone:
 *
 *     cast   down to   desktop   phone
 *       40   56 films    15.5%    3.8%
 *       60   53 films     8.0%    1.7%
 *       90   49 films     3.0%    0.3%
 *      110   47 films     2.0%    0.0%
 *
 * `GALAXY_NO_REPEAT` then strikes a few more candidates off each beat, which at
 * ninety takes the real figure to ~6% on a desktop and ~1% on a phone — a quiet
 * beat about once every minute and a half at the wide end.
 *
 * Ninety is the balance struck, against a cast reaching down to 49 films in a
 * corpus whose median actor has five. Deeper is quieter but less famous — the
 * tail of this ordering is prolific character and voice actors rather than
 * household names, which is the known cost of deriving the cast from film count
 * instead of curating it. A silent beat is not a glitch: it is the card as it
 * was before this existed.
 */
export const GALAXY_CAST_N = 90;

/** spokes at the least and most prolific of the cast (see spokeCount) */
const GALAXY_SPOKES_MIN = 12;
const GALAXY_SPOKES_MAX = GALAXY_LINK_MAX;

/**
 * A spoke's ink at full envelope, over EDGE_GREY. The stroke stays the plain
 * network grey — `setEdge`'s highlight channel is deliberately left at zero,
 * because the fan is dozens of lines over a chapter title and weighting them
 * turns it into a black web. What the beat picks out is the NODES: the actor at
 * the centre, and the crowd dots the spokes reach (see the target constants).
 */
const GALAXY_LINK_ALPHA = 0.16;

// The far end of a spoke: a crowd dot brought forward so it reads as something
// the actor is connected TO, rather than as a line that happens to stop there.
// It gets no name (the reader should be looking at one actor, not at a list) and
// — deliberately — no change of SIZE either.
//
// Size is the one channel left alone, because radius is how this sky says DEPTH:
// `depthSize` spreads the crowd's radius by each dot's own distance, so a dot
// swollen for being connected is a dot lying about where it stands, and a whole
// fan of them pulls the volume flat exactly where the beat is trying to show it
// off. Weight and colour can say "this one" without touching that.
const GALAXY_TARGET_ALPHA = 0.75;
/** how far a target's grey blends toward INK at full envelope */
const GALAXY_TARGET_INK = 0.2;
/**
 * The focused actor's radius against the one the flight gives it. Exported
 * because the title card lights the anchor on its own terms (see
 * `layouts/intro.js`) and a second number for "a dot picked out of this sky"
 * would let the two beats drift apart.
 */
export const GALAXY_FOCUS_R_MULT = 3;
/**
 * px of the reading column the focused actor keeps clear of its edges, so the
 * NAME centred under the dot has somewhere to sit (see focusHolds). Targets take
 * no margin: a spoke ending on a dot at the very edge of the sky is fine.
 *
 * Exported for the same reason as the multiplier above: the title card's own
 * lit dot is named by the same annotation layer and needs the same room.
 */
export const GALAXY_FOCUS_MARGIN = 32;
/**
 * How many recent actors a beat refuses to repeat (see pickFocus). Every one of
 * these is a candidate struck off an already narrow field, so it trades directly
 * against the silent-beat rate: four takes it from ~3% to ~6% on a desktop.
 *
 * Worth every point of that. Four is enough to remove back-to-back repeats and
 * repeats-within-four entirely (measured over 900 beats on both viewports and
 * all three cards), and a name that comes up twice running reads as a bug in a
 * way that a quiet beat does not.
 */
const GALAXY_NO_REPEAT = 4;
/**
 * Candidate draws a beat may make before settling for the spokes it has. Flat,
 * and far more than it needs: roughly one dot in five holds the frame, so a full
 * fan of GALAXY_LINK_MAX wants ~400 draws, and this runs once every
 * GALAXY_BEAT_MS. Sizing it per spoke instead is what once left the most
 * connected actors short of their fan.
 */
const GALAXY_TARGET_DRAWS = 1500;

/**
 * The cast: the most prolific actors the flight actually carries. `FIELD_IDS` is
 * already the right pool — every actor at hop 1–4 bar the intro fifteen — which
 * matters twice over: the fifteen are held OUT of the flight on `hopSeed` and
 * `outro`, so a cast clear of them stays usable if the beat ever extends to
 * those states, and an unreachable actor (hop -1) is parked hidden and could
 * never be lit at all.
 *
 * `films` is the story's only stand-in for degree — the corpus has no co-star
 * count — and it is a fair one: an actor's co-stars scale with the films they
 * are in, which is why Samuel L. Jackson tops both. Ties break on id so the
 * order is stable across builds.
 */
export const GALAXY_CAST = FIELD_IDS.map((id) => ({
	id,
	films: rawNodes.nodes[id][3]
}))
	.sort((a, b) => b.films - a.films || a.id - b.id)
	.slice(0, GALAXY_CAST_N)
	.map((c) => c.id);

const CAST_FILMS = GALAXY_CAST.map((id) => rawNodes.nodes[id][3]);
const CAST_MIN = Math.min(...CAST_FILMS);
const CAST_MAX = Math.max(...CAST_FILMS);

// Derived at module load, so a knob that makes the spoke scale meaningless says
// so on the first import rather than writing NaN widths for the rest of the run
// (the same stance `idOf` takes on an unknown pid).
if (CAST_MIN === CAST_MAX)
	throw new Error(
		`galaxy highlight: cast of ${GALAXY_CAST_N} has no spread in films (all ${CAST_MIN}), so spoke counts cannot scale`
	);
if (GALAXY_SPOKES_MAX > GALAXY_LINK_MAX)
	throw new Error(
		`galaxy highlight: GALAXY_SPOKES_MAX ${GALAXY_SPOKES_MAX} exceeds the edge pool's ${GALAXY_LINK_MAX}`
	);

/**
 * Who the beat is on, for the name. Published rather than returned because the
 * reader of it is the annotation layer, which runs in `drawScene` a moment after
 * the writer — the same one-live-number arrangement `skyFlight.t` uses, and for
 * the same reason: one definition, two readers on different clocks.
 *
 * `null` whenever no name should show, which includes both ends of every beat.
 * @type {{ id: number|null }}
 */
export const galaxyHighlight = { id: null };

/**
 * The pool's endpoint table — `[from, to]` per rented slot, mutated in place so
 * ScrollyVisual's `edgeEnds` can hold these very arrays and see each beat's
 * pairs without rebuilding. A slot whose alpha is zero is never read, so stale
 * pairs behind the live ones are harmless.
 */
export const galaxyLinks = {
	ends: Array.from({ length: GALAXY_LINK_MAX }, () => [0, 0])
};

/** drops the beat, so a name cannot outlive the flight that was showing it */
export function resetGalaxyHighlight() {
	galaxyHighlight.id = null;
}

// A dot has to survive its whole turn: picked inside either ramp of the flight's
// entry/exit window, or close enough to the near plane to wrap before the beat
// is out, it would fade to nothing or leap back to the far plane mid-beat and
// take its name and every spoke with it. So a beat only ever uses dots with the
// whole of it left to run — which is ~57% of the crowd at any instant, and
// rotates as the sky flows, so nothing is permanently ineligible.
const BEAT_SHARE = GALAXY_BEAT_MS / FLIGHT_CYCLE_MS;
const SAFE_LO = FLIGHT_FADE;
const SAFE_HI = 1 - FLIGHT_FADE - BEAT_SHARE;
const wrapSafe = (id, t) => {
	const f = skyFrac(id, t);
	return f >= SAFE_LO && f <= SAFE_HI;
};

/**
 * Staying in the window is not enough: the flow carries a dot outward by up to
 * SKY_FAR / SKY_NEAR over a trip, across a box already half again wider than the
 * canvas, so a dot that merely exists is off screen about four times in five.
 * Picked without this test the beat spends most of its turn naming an actor
 * nobody can see, with spokes rooted somewhere past the frame edge.
 *
 * So a dot has to hold the FRAME for the whole beat, not just the flight's
 * window — and where it will be at the end of the beat is exactly knowable from
 * where it is now, without the writer's entry offsets: the flow is radial about
 * the sky's centre, so a dot's distance from that centre scales by the ratio of
 * its magnification then to its magnification now.
 *
 * The path between the two is the straight radial segment joining them, and the
 * frame is a rectangle, so both endpoints inside it puts the whole trip inside
 * it. That makes this a guarantee rather than a sample.
 */
const SKY_SPAN = SKY_FAR - SKY_NEAR;
const tripMag = (f) => skyMag(SKY_FAR - f * SKY_SPAN);
const beatGrowth = (f) => tripMag(f + BEAT_SHARE) / tripMag(f);

/**
 * How deep the sky is, as a multiple of the width of the box dots enter across.
 * Only the draw rate reads it — the projection itself has no need of a depth in
 * pixels, since `skyMag` works in focal units — so this is purely the exchange
 * rate between "far away" and "off to one side" when measuring how far a spoke
 * has to travel. At 1 the volume is about as deep as it is wide, which is what
 * the flow looks like: a dot crosses it in `FLIGHT_CYCLE_MS` while drifting
 * across a comparable slice of the frame.
 */
const GALAXY_DEPTH_SPAN = 1;

/**
 * Where a dot really is, in the sky's own three dimensions.
 *
 * The flow is a perspective projection: a dot's screen offset from the vanishing
 * point is its true lateral offset times `SKY_FAR / z`. Dividing that back out
 * recovers the lateral offset — which is fixed for the dot's whole trip, since
 * it flies straight at the camera — and the trip fraction gives the depth. So
 * the units are entry-plane pixels on all three axes: what the dot's offset
 * would measure if it were at the far plane.
 *
 * The consequence worth understanding before tuning anything: screen distance
 * stops predicting real distance. Two dots at the near plane on opposite sides
 * of the frame are only a quarter as far apart as two dots that look equally
 * separated at the far plane, because at four times the distance the same
 * angular gap is four times the span. That is the whole point of measuring here.
 *
 * @param {number[]} out written with [x, y, z]
 */
function worldSpot(attrs, id, t, cx, cy, depthPx, out) {
	const frac = skyFrac(id, t);
	// 1 / skyMag: undoes the magnification the projection applied
	const k = (SKY_FAR - frac * SKY_SPAN) / SKY_FAR;
	const i = id * STRIDE;
	out[0] = (attrs[i] - cx) * k;
	out[1] = (attrs[i + 1] - cy) * k;
	out[2] = frac * depthPx;
}

/**
 * Does this dot hold the box `[x0, x1] x [y0, y1]` from here to the end of the
 * beat? Both ends of the trip are tested; the box is a rectangle and the trip is
 * a straight radial segment, so that puts the whole of it inside.
 */
function heldInBox(attrs, id, growth, cx, cy, x0, x1, y0, y1) {
	const i = id * STRIDE;
	const x = attrs[i];
	const y = attrs[i + 1];
	const ex = cx + (x - cx) * growth;
	const ey = cy + (y - cy) * growth;
	return (
		x >= x0 &&
		x <= x1 &&
		y >= y0 &&
		y <= y1 &&
		ex >= x0 &&
		ex <= x1 &&
		ey >= y0 &&
		ey <= y1
	);
}

/**
 * The focus has to hold the READING COLUMN, not the bled canvas — a tighter box
 * than the sky it is standing in, and the reason is the name rather than the
 * dot. Names are HTML in `.annotations`, which is `inset: 0` on the column with
 * `overflow: hidden`, so a name belonging to a dot out in the bleed is clipped
 * away entirely (and its horizontal clamp would have dragged it off its dot
 * first). Widening that box is not an option worth taking: it is the coordinate
 * frame every panel, hit target and label in the story is positioned against.
 *
 * `GALAXY_FOCUS_MARGIN` then keeps the dot off the column's own edges, so the
 * name centred underneath it has somewhere to sit.
 */
const focusHolds = (attrs, id, growth, cx, cy, w, h) =>
	heldInBox(
		attrs,
		id,
		growth,
		cx,
		cy,
		GALAXY_FOCUS_MARGIN,
		w - GALAXY_FOCUS_MARGIN,
		-TITLE_BAND + GALAXY_FOCUS_MARGIN,
		h - GALAXY_FOCUS_MARGIN
	);

/**
 * A spoke's far end only has to hold the CANVAS, which on a card runs out into
 * the bleed on both sides — nothing about a target is HTML, so the sky's own
 * extent is the only limit, and letting spokes reach past the column is most of
 * what makes them read as crossing the whole frame.
 */
const targetHolds = (attrs, id, growth, cx, cy, w, h, bleed) =>
	heldInBox(attrs, id, growth, cx, cy, -bleed.l, w + bleed.r, -TITLE_BAND, h);

/** 0 at both ends of a beat, 1 across the middle */
const envelope = (into) =>
	Math.max(
		0,
		Math.min(1, into / GALAXY_FADE_MS, (GALAXY_BEAT_MS - into) / GALAXY_FADE_MS)
	);

/** the eligible set, hoisted so a beat's choice allocates nothing */
/** @type {number[]} */
const eligible = [];

/**
 * How many flights have begun — the one thing here not derived from the cast and
 * the clock. The flight's clock RESTARTS at zero on every arrival, so anything
 * keyed purely on the beat index replays the same sequence every visit.
 *
 * A counter rather than `Math.random`: stable for the life of a flight, which is
 * what matters (a re-seed mid-beat would swap the name being read), while still
 * differing between flights. Reproducible too, so the distribution stays
 * measurable.
 */
let flightSeq = 0;

/**
 * The cast member this beat lights: the next one round the cycle that can hold
 * the frame for the whole beat, skipping anyone who cannot and anyone who has
 * just had a turn.
 *
 * **Both of those guards exist because the gate is narrow, and the second one is
 * not optional.** Only a handful of the cast hold the frame at any instant, and
 * eligibility PERSISTS: an actor's usable window is about 13s against a 5s beat,
 * so a well-placed actor stays well-placed for two or three beats running. Take
 * the first eligible one from a start index that merely advances by one, and the
 * same person is picked again and again — a reader really does get John Cusack
 * three times in a row, which reads as broken rather than as random.
 *
 * So the start index is HASHED per beat rather than marched, and the last
 * `GALAXY_NO_REPEAT` focuses are excluded outright. The hash alone is not enough:
 * with only a few candidates, a random start still lands on one of the same few.
 * The exclusion is what actually guarantees a different face each beat.
 *
 * Returning null is a real answer rather than a failure: a few beats in a
 * hundred find nobody well placed and stay silent, and there is deliberately no
 * second-choice actor, because a name the reader cannot see is worse than none.
 *
 * @param {number[]} recent most-recent focus ids first (see the writer)
 */
function pickFocus(beat, nonce, tBeat, attrs, cx, cy, w, h, recent) {
	eligible.length = 0;
	for (const id of GALAXY_CAST) {
		if (recent.includes(id) || !wrapSafe(id, tBeat)) continue;
		const g = beatGrowth(skyFrac(id, tBeat));
		if (focusHolds(attrs, id, g, cx, cy, w, h)) eligible.push(id);
	}
	if (eligible.length === 0) return null;
	// dotHash is [0, 1), so this indexes the set without running off its end
	const r = dotHash(beat * 0x9e37 + nonce * 0x85eb, 15);
	return eligible[(r * eligible.length) | 0];
}

/**
 * How many spokes an actor gets — scaled across the CAST's own film range, not
 * the corpus's. The cast is the top of a very long tail (the corpus median is 5
 * films, the cast spans ~66 to 116), so measured against the corpus every one of
 * them would sit pinned at the top and look identical. Against each other the
 * difference is the thing the beat is actually showing.
 */
function spokeCount(id) {
	const films = rawNodes.nodes[id][3];
	return Math.round(
		lin(films, CAST_MIN, CAST_MAX, GALAXY_SPOKES_MIN, GALAXY_SPOKES_MAX)
	);
}

/**
 * Where a beat's spokes land: drawn uniformly from the whole crowd, so they run
 * right across the frame rather than picking out a neighbourhood — the corpus's
 * reach is the point, and a spoke crossing the whole sky is what carries it.
 *
 * A candidate has to hold the frame for the beat on the same terms as the focus,
 * only without the name's margin. Both ends matter: only about one dot in five
 * is on canvas at any instant, and a target that drifts out mid-beat leaves a
 * spoke pointing off the frame at nothing.
 *
 * `dotHash` rather than `hash01`: the candidate counter walks by one, which is
 * exactly the stride a sine hash turns into a marching phase.
 *
 * The draw cap is flat and generous rather than a multiple of the count — this
 * runs once per beat, so a few hundred rejected hashes cost nothing, and sizing
 * it per spoke is what left the most-connected actors short of their spokes.
 */
function pickTargets(count, focus, attrs, cx, cy, w, h, bleed, beat, tBeat) {
	/** @type {number[]} */
	const out = [];
	for (let a = 0; out.length < count && a < GALAXY_TARGET_DRAWS; a++) {
		const id = FIELD_IDS[(dotHash(beat * 8191 + a, 17) * FIELD_IDS.length) | 0];
		if (id === focus || out.includes(id) || !wrapSafe(id, tBeat)) continue;
		const g = beatGrowth(skyFrac(id, tBeat));
		if (!targetHolds(attrs, id, g, cx, cy, w, h, bleed)) continue;
		out.push(id);
	}
	return out;
}

/**
 * Wraps a galaxy state's ambient writer with the highlight beat. The flight runs
 * first and untouched — it owns every dot's x, y, radius and alpha — and this
 * then re-inks one of them and rents the pool for its spokes.
 *
 * Three things hold the ambient contract:
 *
 * At t = 0 the envelope is zero, so no spoke has alpha, the focus is lerped none
 * of the way toward ink, and the cast is written at the crowd's own colour —
 * which is precisely what the static layout produces. The card still names
 * nobody standing still, so the loop's first tick moves nothing.
 *
 * Nothing accumulates. Positions are only ever READ, once per beat, to test a
 * candidate for being on canvas; everything written is absolute, and the flight
 * overwrites radius and alpha from its own stored base every frame regardless.
 *
 * Colour is the one channel `makeFlight` leaves alone, so it is the one that
 * could persist: the cast is re-written to the crowd's grey every frame, before
 * the focus is inked, rather than the outgoing focus being restored on a beat
 * change. One write per cast member, and no way for a past focus to stay lit —
 * which a restore-on-change would not guarantee, since the buffer is never
 * re-allocated between frames and a resize rebuilds the writer mid-beat.
 *
 * @param {import("./states.js").AmbientAnim["frames"]} framesFn
 * @returns {import("./states.js").AmbientAnim["frames"]}
 */
export function withGalaxyHighlight(framesFn) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED) => {
		const write = framesFn(nodes, w, h, edges, params, bleed);
		// the point the flow expands about — the same centre makeFlight magnifies
		// from, which is what makes a dot's path radial and its beat-end position
		// predictable (see beatGrowth)
		const [cx, cy] = galaxyCentre(w, h, bleed);
		// the sky's depth in the same units as its lateral spread, so a spoke's
		// length through the volume is one number (see worldSpot)
		const box = galaxyBox(w, h, bleed);
		const skyWidth = box[1] - box[0];
		const depthPx = skyWidth * GALAXY_DEPTH_SPAN;
		// px of volume per ms, so the fan takes the same time relative to the frame
		// whatever the viewport
		const drawSpeed = (skyWidth * GALAXY_DRAW_WIDTHS_PER_S) / 1000;
		// scratch for the two world positions a spoke's length is measured between,
		// hoisted so the beat allocates nothing
		const wFocus = [0, 0, 0];
		const wTarget = [0, 0, 0];
		// where this card joins the cycle, so the three of them do not all open on
		// the same actor (the clock restarts at every arrival)
		const nonce = flightSeq++;
		let beat = -1;
		/** @type {number|null} */
		let focus = null;
		/** @type {number[]} */
		let targets = [];
		/** each spoke's length when its beat was struck, aligned with `targets` */
		/** @type {number[]} */
		const lens = [];
		// the last few actors shown, most recent first — per flight, so a resize or
		// a re-arrival starts the no-repeat window fresh, which is right: the reader
		// is looking at a new card either way
		/** @type {number[]} */
		const recent = [];
		return (attrs, _trails, t) => {
			write(attrs, _trails, t);
			const b = Math.floor(t / GALAXY_BEAT_MS);
			const tBeat = b * GALAXY_BEAT_MS;
			if (b !== beat) {
				beat = b;
				// hand the outgoing targets back to the crowd BEFORE the new ones are
				// chosen. Their colour is the one thing nothing else restores: the
				// flight rewrites radius and alpha from its own base every frame, and
				// the cast's grey is rewritten below, but a dot that was a spoke's far
				// end and is not one any more would otherwise keep the ink it was
				// given for good.
				for (const id of targets) {
					const i = id * STRIDE;
					attrs[i + 3] = CROWD[0];
					attrs[i + 4] = CROWD[1];
					attrs[i + 5] = CROWD[2];
				}
				focus = pickFocus(b, nonce, tBeat, attrs, cx, cy, w, h, recent);
				if (focus != null) {
					recent.unshift(focus);
					if (recent.length > GALAXY_NO_REPEAT) recent.pop();
				}
				targets =
					focus == null
						? []
						: pickTargets(
								spokeCount(focus),
								focus,
								attrs,
								cx,
								cy,
								w,
								h,
								bleed,
								b,
								tBeat
							);
				// each spoke's REAL length at the moment it was struck — the distance
				// through the volume, not across the screen — which is what lets the
				// fan draw at one speed rather than in one duration (see below)
				lens.length = 0;
				if (focus != null) {
					worldSpot(attrs, focus, tBeat, cx, cy, depthPx, wFocus);
					for (const id of targets) {
						worldSpot(attrs, id, tBeat, cx, cy, depthPx, wTarget);
						// floored at a pixel so the ramp below is always a real division:
						// two dots in the same place would otherwise give 0/0 on the
						// beat's first tick, and a NaN in this buffer spreads
						lens.push(
							Math.max(
								1,
								Math.hypot(
									wTarget[0] - wFocus[0],
									wTarget[1] - wFocus[1],
									wTarget[2] - wFocus[2]
								)
							)
						);
					}
				}
			}
			for (const id of GALAXY_CAST) {
				const i = id * STRIDE;
				attrs[i + 3] = CROWD[0];
				attrs[i + 4] = CROWD[1];
				attrs[i + 5] = CROWD[2];
			}
			const e = focus == null ? 0 : envelope(t - tBeat);
			// The connected nodes, brought forward out of the crowd. Alpha is nudged
			// from whatever the flight just gave them, which is safe to do relatively
			// because the flight rewrites it every frame — but COLOUR is written
			// absolutely, from the constants, because nothing resets it per frame and
			// a relative blend would darken the same dot again on every tick until it
			// went black. Radius is left entirely alone: it is this sky's depth cue.
			if (e > 0) {
				const ink = e * GALAXY_TARGET_INK;
				for (const id of targets) {
					const i = id * STRIDE;
					// radius untouched on purpose — see GALAXY_TARGET_ALPHA
					attrs[i + 6] += e * (GALAXY_TARGET_ALPHA - attrs[i + 6]);
					attrs[i + 3] = CROWD[0] + ink * (INK[0] - CROWD[0]);
					attrs[i + 4] = CROWD[1] + ink * (INK[1] - CROWD[1]);
					attrs[i + 5] = CROWD[2] + ink * (INK[2] - CROWD[2]);
				}
				// the focus last, so it wins outright over a target that happens to be
				// one of the cast, and is never scaled twice
				const i = focus * STRIDE;
				attrs[i + 2] *= 1 + e * (GALAXY_FOCUS_R_MULT - 1);
				attrs[i + 6] += e * (1 - attrs[i + 6]);
				attrs[i + 3] += e * (INK[0] - attrs[i + 3]);
				attrs[i + 4] += e * (INK[1] - attrs[i + 4]);
				attrs[i + 5] += e * (INK[2] - attrs[i + 5]);
			}
			// One SPEED for the whole fan, not one duration, and the speed of a crow
			// flying THROUGH the volume rather than of a pen moving across the screen.
			//
			// A shared 0-1 progress makes a long line travel faster than a short one
			// so they all land together, which reads as the fan being inflated. A
			// constant rate over SCREEN distance fixes that but still flattens the
			// sky, because it says a dot that merely looks close is close. Over real
			// distance, a spoke reaching from the near plane to the far one takes its
			// time however short it looks, while two dots that are genuinely
			// neighbours are joined at once even if the camera has flung them to
			// opposite sides of the frame — which is the depth the sky has and the
			// projection alone cannot say out loud.
			//
			// Struck against each spoke's length at its own beat, so the ramp stays
			// strictly monotone even as the flow pulls the ends apart.
			const drawn = (t - tBeat) * drawSpeed;
			for (let k = 0; k < GALAXY_LINK_MAX; k++) {
				const slot = GALAXY_LINK_BASE + k;
				if (k >= targets.length) {
					setEdge(attrs, slot, 0, 0);
					continue;
				}
				galaxyLinks.ends[k][0] = /** @type {number} */ (focus);
				galaxyLinks.ends[k][1] = targets[k];
				setEdge(
					attrs,
					slot,
					Math.min(1, drawn / lens[k]),
					e * GALAXY_LINK_ALPHA
				);
			}
			// the name rides its dot's alpha in the annotation layer, so this only
			// has to say WHO — and say nobody at both ends of the beat
			galaxyHighlight.id = e > 0 ? focus : null;
		};
	};
}

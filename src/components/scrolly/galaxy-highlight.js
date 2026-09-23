import rawNodes from "$data/scrolly-nodes.json";
import {
	STRIDE,
	GALAXY_LINK_BASE,
	GALAXY_LINK_MAX,
	setEdge
} from "./attr-buffer.js";
import { FIELD_IDS, idOf } from "./cast.js";
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
// The title card's highlight beat: up to two well-known actors at a time picked
// out of the flowing crowd — inked, enlarged and named — with spokes drawn from
// each out across the sky, more spokes for a more prolific actor.
//
// It is an ILLUSTRATION, not a measurement. The spokes do not go to the actor's
// real co-stars: the corpus co-star graph is not in this repo (the data carries
// eighteen baked edges, all inside the intro constellation), and the story never
// claims otherwise. What the spokes carry is one true thing — that some actors
// sit on far more of the corpus than others — and they carry it by count alone.
// Two actors overlapping, on staggered clocks rather than a single one, is
// deliberate too: the first actor the beat ever named used to read as an
// answer ("this is Gen Z's Kevin Bacon") for two compounding reasons — the
// flight hadn't moved yet when beat 0 was picked (see GALAXY_START_DELAY_MS),
// and the pick was seeded from a value fixed at 0 on every single page load,
// so it was not just under-eligible but the SAME actor for every visitor (see
// flightSeq). A second actor joining partway through the first's turn, then
// each changing independently rather than both swapping together, is part of
// what keeps any single actor from reading as *the* answer.
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
// from `Math.floor(tEff / GALAXY_BEAT_MS)`, `tEff` being `t` shifted by the
// start delay (see `withGalaxyHighlight`).
//
// Nothing here draws. Spokes rent slots from the attr array's edge pool and are
// stroked by the same loop as the constellation's links — which reads both
// endpoints out of the live buffer every frame, and so follows dots that are
// moving, which on this card is all of them.
// ---------------------------------------------------------------------------

/** one actor's turn in the light */
export const GALAXY_BEAT_MS = 3000;
// the name and the ink ramp up and down inside the beat rather than switching:
// at t = 0 this is what makes the writer reproduce the static layout exactly,
// since the envelope opens at zero and the card names nobody standing still
const GALAXY_FADE_MS = 600;
/**
 * How long slot 0's clock waits, from the card's own mount, before striking its
 * first beat — folded into that clock (see `withGalaxyHighlight`'s per-slot
 * `tEff`) rather than a separate gate, so it stays a pure function of `t`.
 *
 * This exists for two reasons that turn out to be one fix. At `t = 0` almost
 * nothing in the flight is `wrapSafe`/`focusHolds`-eligible yet — the crowd has
 * barely started moving — so beat 0's `eligible` set is one or two candidates
 * wide regardless of the hash, which is what used to make the title card open
 * on the same actor (Alfred Molina) every time: see the old measurement in
 * `notes/design/title-card.md`. Waiting two seconds lets enough of the flight
 * accrue that the opening pick is drawn from a real pool, and, as a side
 * effect, reads as an intentional beat of quiet before the sky starts naming
 * anyone rather than a name appearing the instant the card does.
 */
const GALAXY_START_DELAY_MS = 2000;
/**
 * How far apart the two slots' clocks are staggered, so only one of them ever
 * changes at once — see `withGalaxyHighlight`. Half a beat means each slot's
 * OWN change lands exactly midway through the other slot's current turn, so a
 * reader always has a moment to register "one changed" before the other one
 * does; a smaller stagger would leave less of that moment, a larger one would
 * make the two turns feel unrelated rather than interleaved.
 *
 * Slot 1's own start delay is `GALAXY_START_DELAY_MS + GALAXY_SLOT_PHASE_MS`,
 * so the very first sequence is: nothing, then slot 0's first actor, then
 * slot 1 joins partway through slot 0's turn, then slot 0 changes while slot 1
 * keeps showing, and so on — never both changing on the same tick.
 */
const GALAXY_SLOT_PHASE_MS = GALAXY_BEAT_MS / 2;
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
 * `GALAXY_BEAT_MS` shortened to 3000ms cuts the budget to 2400ms, which rules
 * out every rate below 0.45 in the table above (0.35's phone-slowest alone
 * already blows the budget). 0.45 is the fastest rate this file measured, so it
 * is reused rather than extrapolated past what was actually timed: a typical
 * spoke lands in ~0.6s and the deepest phone spoke in ~2.1s, leaving ~280ms of
 * margin before the fade. That margin is real but not generous — if a future
 * device or dataset makes the phone-slowest spoke measurably longer than 2117px,
 * this needs re-measuring rather than assumed to still hold.
 */
const GALAXY_DRAW_WIDTHS_PER_S = 0.45;

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
 * ninety took the real figure to ~6% on a desktop and ~1% on a phone — a quiet
 * beat about once every minute and a half at the wide end.
 *
 * 130 (down to 47 films, between the measured 110 and 150 rows of the same
 * trend) trades a little more of that headroom for a bigger, more varied pool —
 * against a corpus whose median actor has five films. Deeper is quieter but
 * less famous — the tail of this ordering is prolific character and voice
 * actors rather than household names, which is the known cost of deriving the
 * cast from film count instead of curating it, and is also why `GALAXY_EXTRA_IDS`
 * below adds a handful of actors BY NAME rather than raising this further:
 * several current, widely recognised actors (shorter careers, so far fewer
 * films) sit well outside any film-count cutoff a cast this size could reach. A
 * silent beat is not a glitch: it is the card as it was before this existed.
 *
 * The table above is against ONE focus. There are now two independent slots
 * (see `withGalaxyHighlight`), and whichever strikes second on any given beat
 * additionally wants an eligible actor `GALAXY_FOCUS_MIN_SEP` away from the
 * other slot's current one — stricter than a lone pick, though not as strict as
 * needing two such actors AT ONCE, since the slots strike at different times.
 * Expect a somewhat higher share of quiet or single-slot moments than the
 * figures above, offset in part by the shorter `GALAXY_BEAT_MS` independently
 * widening the eligible window (`SAFE_HI`). 130 has not been re-measured
 * against the two-slot predicate; if quiet moments read as too frequent rather
 * than as sporadic, this is the knob to lower before touching anything else.
 */
export const GALAXY_CAST_N = 130;

/**
 * Spokes at the least and most prolific of the cast (see spokeCount), per
 * focus. Halved from the pool's full `GALAXY_LINK_MAX` now that a beat lights
 * two actors at once and they share one edge pool — each focus gets a disjoint
 * half of the slots (see `writeSpokes`), so neither can be sized against the
 * whole pool any more.
 */
const GALAXY_SPOKES_MIN = 6;
const GALAXY_SPOKES_MAX = GALAXY_LINK_MAX / 2;
/** the focus a spoke range belongs to gets this many of the pool's slots */
const GALAXY_FOCUS_SLOTS = GALAXY_LINK_MAX / 2;
/**
 * How far apart (in `worldSpot`'s entry-plane px, the same units a spoke's own
 * length is measured in) a slot's new pick must land from the OTHER slot's
 * current focus before it is preferred (see `awayFrom`). Without this a slot
 * could strike on an actor standing shoulder to shoulder with the one already
 * showing, which reads as one clump rather than two distinct highlights, and
 * their spoke fans would overlap into an unreadable tangle. There is no
 * measured table behind this number the way there is for the draw rate above —
 * it is a judgement call to revisit if the two ever land implausibly close, or
 * if requiring this separation is starving a slot's strikes too often.
 */
const GALAXY_FOCUS_MIN_SEP = 220;

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
/** The focused actor's radius against the one the flight gives it. */
const GALAXY_FOCUS_R_MULT = 3;
/**
 * px of the reading column the focused actor keeps clear of its edges, so the
 * NAME centred under the dot has somewhere to sit (see focusHolds). Targets take
 * no margin: a spoke ending on a dot at the very edge of the sky is fine.
 */
const GALAXY_FOCUS_MARGIN = 32;
/**
 * How many recent focuses either slot refuses to repeat (see pickFocus). Every
 * one of these is a candidate struck off an already narrow field, so it trades
 * directly against the silent-strike rate: four takes it from ~3% to ~6% on a
 * desktop (that figure predates the two-slot change above; see `GALAXY_CAST_N`).
 *
 * Worth every point of that. Four is enough to remove back-to-back repeats and
 * repeats-within-four entirely (measured over 900 beats on both viewports and
 * all three cards), and a name that comes up twice running reads as a bug in a
 * way that a quiet beat does not.
 *
 * One list shared by both slots rather than one each: a strike from EITHER slot
 * unshifts one id, and the two slots strike roughly twice as often between them
 * as a single beat used to, so this window still spans a comparable stretch of
 * real time — about two full beat periods — even though it is now four STRIKES
 * rather than four beats.
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
 * Offset folded into the second focus's target-hash seed (see `pickTargets`'s
 * `beat` param, an integer, not the beat state object) so its fan draws from a
 * different candidate ordering than the first focus's — otherwise both foci
 * would walk the same `dotHash(beat * 8191 + a, 17)` sequence and tend to pick
 * the same crowd dots in the same order. Arbitrary and large enough that the
 * two seeds never collide across any real beat index.
 */
const FOCUS2_SEED = 0x2f5a;

/**
 * A handful of actors added BY NAME regardless of where film count would rank
 * them — see the note on `GALAXY_CAST_N` above. Film count stands in for
 * degree, but it also stands in for CAREER LENGTH, and a story aimed at a Gen Z
 * audience should not let its highlight reel be entirely veterans and
 * character actors just because they have been in more things. Curated by
 * name, not by a lower threshold, the same way the scatter's `GENZ_NAMED_IDS`
 * is: a rule ("anyone under N films but ranked above X") would let in whoever
 * the data happens to favour instead of who the story means, and would need
 * its own justification anyway.
 *
 * Looked up via `idOf`, same as every other named actor in `cast.js`: an id
 * that stops resolving throws at import time rather than silently dropping
 * someone from the pool.
 */
const GALAXY_EXTRA_IDS = [
	idOf(1136406), // Tom Holland
	idOf(505710), // Zendaya
	idOf(1190668), // Timothée Chalamet
	idOf(234352), // Margot Robbie
	idOf(1373737), // Florence Pugh
	idOf(1397778) // Anya Taylor-Joy
];

/**
 * The cast: the most prolific actors the flight actually carries, plus
 * `GALAXY_EXTRA_IDS`. `FIELD_IDS` is already the right pool — every actor at
 * hop 1–4 bar the intro fifteen — which matters twice over: the fifteen fly
 * on the title card as crowd, the constellation having just dissolved into the
 * sky on `hopSeed`, so a beat that could light one would pull the diagram back
 * out of it; and the pool is the whole corpus bar the fifteen, so the beat can
 * light any actor the story ever plots.
 *
 * `films` is the story's only stand-in for degree — the corpus has no co-star
 * count — and it is a fair one for the ranked slice: an actor's co-stars scale
 * with the films they are in, which is why Samuel L. Jackson tops both. Ties
 * break on id so the order is stable across builds. `Set` dedupes in case a
 * named extra is already inside the ranked slice.
 */
export const GALAXY_CAST = [
	...new Set([
		...FIELD_IDS.map((id) => ({
			id,
			films: rawNodes.nodes[id][3]
		}))
			.sort((a, b) => b.films - a.films || a.id - b.id)
			.slice(0, GALAXY_CAST_N)
			.map((c) => c.id),
		...GALAXY_EXTRA_IDS
	])
];

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
if (GALAXY_SPOKES_MAX > GALAXY_FOCUS_SLOTS)
	throw new Error(
		`galaxy highlight: GALAXY_SPOKES_MAX ${GALAXY_SPOKES_MAX} exceeds one focus's half of the edge pool (${GALAXY_FOCUS_SLOTS})`
	);

/**
 * Who the beat is on, for the name(s). Published rather than returned because
 * the reader of it is the annotation layer, which runs in `drawScene` a moment
 * after the writer — the same one-live-array arrangement `skyFlight.t` uses,
 * and for the same reason: one definition, two readers on different clocks.
 *
 * Up to two ids, never more; empty whenever no name should show, which
 * includes both ends of every beat and any beat that found fewer than two
 * eligible, separated candidates.
 * @type {{ ids: number[] }}
 */
export const galaxyHighlight = { ids: [] };

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
	galaxyHighlight.ids = [];
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
/** of `eligible`, those far enough from the other slot's current focus */
/** @type {number[]} */
const secondEligible = [];
/** of `eligible`, those merely not the other slot's current focus — the
 * fallback pool when nothing clears the separation gate */
/** @type {number[]} */
const nearEligible = [];

/**
 * How many flights have begun — the one thing here not derived from the cast and
 * the clock. The flight's clock RESTARTS at zero on every arrival, so anything
 * keyed purely on the beat index replays the same sequence every visit.
 *
 * A counter rather than a fresh `Math.random()` per flight: stable for the life
 * of a flight, which is what matters (a re-seed mid-beat would swap the name
 * being read), while still differing between flights within the same session —
 * a page with several galaxy cards should not open all of them on the same
 * actor.
 *
 * The STARTING value used to be the fixed `0`, on the reasoning that it made the
 * opening pick reproducible for measurement. That reasoning held only across
 * ARTIFICIAL variation of the starting offset (which is what the old measured
 * table in `notes/design/title-card.md` swept) — every real visitor's session
 * re-evaluates this module fresh and always starts at the same fixed value, so
 * a fixed `0` made the opening actor(s) at a given viewport identical on EVERY
 * real page load, not just the first one measured. That is the actual substance
 * of "it feels like the answer": not that beat 0 was under-eligible (fixed by
 * `GALAXY_START_DELAY_MS` above), but that it was the same actor(s) every time,
 * for everyone. Seeding from `Math.random()` once per module load (once per
 * real visit) fixes that at the cost of the old measurement table no longer
 * being reproducible from a fixed seed — re-run it with an explicit override if
 * `GALAXY_CAST_N` or the eligibility gates ever need re-tuning.
 */
let flightSeq = Math.floor(Math.random() * 1_000_000);

/**
 * The cast member a SLOT'S beat lights: an eligible actor who can hold the
 * frame for the whole beat, skipping anyone who cannot, anyone who has just had
 * a turn (in either slot), and — if the other slot currently has someone lit —
 * anyone within `GALAXY_FOCUS_MIN_SEP` of them (measured in the same world
 * units a spoke's own length is, via `worldSpot`). Two actors picked out
 * shoulder to shoulder would read as one clump with two names, not two distinct
 * highlights, so the nearer candidates are set aside first and only used if
 * nothing else is left — a slot going dark is worse than a slightly close pair.
 *
 * **The no-repeat guard exists because the gate is narrow, and it is not
 * optional.** Only a handful of the cast hold the frame at any instant, and
 * eligibility PERSISTS: an actor's usable window is several beats long against
 * one short beat, so a well-placed actor stays well-placed for two or three
 * beats running. Take the first eligible one from a start index that merely
 * advances by one, and the same person is picked again and again — a reader
 * really does get John Cusack three times in a row, which reads as broken
 * rather than as random.
 *
 * So the start index is HASHED per beat rather than marched, and the last
 * `GALAXY_NO_REPEAT` focuses (shared across both slots) are excluded outright.
 * The hash alone is not enough: with only a few candidates, a random start
 * still lands on one of the same few. The exclusion is what actually
 * guarantees a different face each beat.
 *
 * Returning null is a real answer rather than a failure: some beats find
 * nobody well placed and the slot goes quiet, and there is deliberately no
 * second-choice actor, because a name the reader cannot see is worse than none.
 *
 * @param {number[]} recent most-recent focus ids first, from both slots (see the writer)
 * @param {number|null} avoidId the other slot's current focus, if it has one
 * @returns {number|null}
 */
function pickFocus(
	beat,
	nonce,
	tBeat,
	attrs,
	cx,
	cy,
	w,
	h,
	depthPx,
	recent,
	avoidId
) {
	eligible.length = 0;
	for (const id of GALAXY_CAST) {
		if (recent.includes(id) || !wrapSafe(id, tBeat)) continue;
		const g = beatGrowth(skyFrac(id, tBeat));
		if (focusHolds(attrs, id, g, cx, cy, w, h)) eligible.push(id);
	}
	if (eligible.length === 0) return null;
	const pool =
		avoidId == null
			? eligible
			: awayFrom(avoidId, tBeat, attrs, cx, cy, depthPx);
	if (pool.length === 0) return null;
	// dotHash is [0, 1), so this indexes the set without running off its end
	const r = dotHash(beat * 0x9e37 + nonce * 0x85eb, 15);
	return pool[(r * pool.length) | 0];
}

/**
 * `eligible`, minus `avoidId` itself, preferring those `GALAXY_FOCUS_MIN_SEP`
 * or further from it (see `pickFocus`) and falling back to whatever is left
 * unfiltered if that leaves nothing.
 * @returns {number[]}
 */
function awayFrom(avoidId, tBeat, attrs, cx, cy, depthPx) {
	worldSpot(attrs, avoidId, tBeat, cx, cy, depthPx, wFocus);
	secondEligible.length = 0;
	nearEligible.length = 0;
	for (const id of eligible) {
		if (id === avoidId) continue;
		worldSpot(attrs, id, tBeat, cx, cy, depthPx, wTarget);
		const sep = Math.hypot(
			wTarget[0] - wFocus[0],
			wTarget[1] - wFocus[1],
			wTarget[2] - wFocus[2]
		);
		nearEligible.push(id);
		if (sep >= GALAXY_FOCUS_MIN_SEP) secondEligible.push(id);
	}
	return secondEligible.length > 0 ? secondEligible : nearEligible;
}

/**
 * How many spokes an actor gets — scaled across the CAST's own film range, not
 * the corpus's. The ranked slice is the top of a very long tail (the corpus
 * median is 5 films, that slice alone spans ~47 to 116), so measured against
 * the corpus every one of them would sit pinned at the top and look identical.
 * `GALAXY_EXTRA_IDS` pulls the floor down further still (Zendaya's 11, the
 * lowest of them) — those actors read as connected to fewer things, which is
 * honest: it is what "fewer films" means here, not a comment on how well known
 * they are. `GALAXY_SPOKES_MIN` keeps them a real, visible fan rather than a
 * bare stub. Against each other the difference is the thing the beat is
 * actually showing.
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
 *
 * `otherFocus` keeps the second focus's fan off the first focus's own dot (and
 * vice versa): a spoke landing on the OTHER highlighted actor would read as the
 * two being connected to each other, which is not a claim either fan makes.
 */
function pickTargets(
	count,
	focus,
	otherFocus,
	attrs,
	cx,
	cy,
	w,
	h,
	bleed,
	beat,
	tBeat
) {
	/** @type {number[]} */
	const out = [];
	for (let a = 0; out.length < count && a < GALAXY_TARGET_DRAWS; a++) {
		const id = FIELD_IDS[(dotHash(beat * 8191 + a, 17) * FIELD_IDS.length) | 0];
		if (
			id === focus ||
			id === otherFocus ||
			out.includes(id) ||
			!wrapSafe(id, tBeat)
		)
			continue;
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
// scratch for the two world positions a spoke's length is measured between,
// hoisted so a beat allocates nothing
const wFocus = [0, 0, 0];
const wTarget = [0, 0, 0];

/** one dot back at the crowd's own colour */
function toCrowd(attrs, id) {
	const i = id * STRIDE;
	attrs[i + 3] = CROWD[0];
	attrs[i + 4] = CROWD[1];
	attrs[i + 5] = CROWD[2];
}

/**
 * A slot's new beat — one of the two independent, staggered cycles (see
 * `withGalaxyHighlight`); the OTHER slot's own focus, if it has one, is
 * untouched here and keeps showing through this slot's change, which is the
 * whole point of staggering them.
 *
 * The outgoing targets go back to the crowd BEFORE the new ones are chosen —
 * their colour is the one thing nothing else restores: the flight rewrites
 * radius and alpha from its own base every frame, and the cast's grey is
 * rewritten every frame too, but a dot that was a spoke's far end and is not
 * one any more would otherwise keep the ink it was given for good. Then the new
 * focus, its spokes, and each spoke's REAL length at the moment it was struck —
 * the distance through the volume, not across the screen — which is what lets
 * the fan draw at one speed rather than in one duration (see writeSpokes).
 * Floored at a pixel so that ramp is always a real division: two dots in the
 * same place would otherwise give 0/0 on the beat's first tick, and a NaN in
 * this buffer spreads.
 *
 * The two slots' target hashes are seeded apart (`b` vs `b + FOCUS2_SEED`) so
 * they draw from different candidate orderings rather than picking the same
 * crowd dots in the same sequence, on the rare beat where their `b` happens to
 * coincide.
 * @param {{ slots: { index: number, focus: number|null, targets: number[], lens: number[] }[], recent: number[] }} beat
 * @param {0|1} slot which of the two independent cycles this strike is for
 * @param {number} tBeat the beat's start on the SKY's clock
 * @param {{ cx: number, cy: number, w: number, h: number, bleed: import("./plot.js").Bleed, depthPx: number, nonce: number, skyT0: number }} f the flight
 */
function strikeSlot(beat, slot, b, tBeat, attrs, f) {
	const s = beat.slots[slot];
	const other = beat.slots[1 - slot];
	s.index = b;
	for (const id of s.targets) toCrowd(attrs, id);
	s.focus = pickFocus(
		b,
		f.nonce + slot * 0x6f1,
		tBeat,
		attrs,
		f.cx,
		f.cy,
		f.w,
		f.h,
		f.depthPx,
		beat.recent,
		other.focus
	);
	s.lens.length = 0;
	if (s.focus == null) {
		s.targets = [];
		return;
	}
	beat.recent.unshift(s.focus);
	if (beat.recent.length > GALAXY_NO_REPEAT) beat.recent.pop();
	s.targets = pickTargets(
		spokeCount(s.focus),
		s.focus,
		other.focus,
		attrs,
		f.cx,
		f.cy,
		f.w,
		f.h,
		f.bleed,
		slot === 0 ? b : b + FOCUS2_SEED,
		tBeat
	);
	worldSpot(attrs, s.focus, tBeat, f.cx, f.cy, f.depthPx, wFocus);
	for (const id of s.targets) {
		worldSpot(attrs, id, tBeat, f.cx, f.cy, f.depthPx, wTarget);
		s.lens.push(
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

/**
 * The connected nodes, brought forward out of the crowd, and each slot's focus
 * inked — by that slot's OWN envelope, since the two are on independent,
 * staggered clocks and are almost never at the same point in their beat.
 * Alpha is nudged from whatever the flight just gave them, which is safe to do
 * relatively because the flight rewrites it every frame — but COLOUR is
 * written absolutely, from the constants, because nothing resets it per frame
 * and a relative blend would darken the same dot again on every tick until it
 * went black. Radius is left entirely alone on the targets: it is this sky's
 * depth cue. Each slot's focus last, so it wins outright over a target that
 * happens to be one of the cast, and is never scaled twice.
 * @param {[number, number]} es each slot's own envelope value
 */
function inkBeat(attrs, beat, es) {
	for (let slot = 0; slot < 2; slot++) {
		const e = es[slot];
		if (e <= 0) continue;
		const s = beat.slots[slot];
		const ink = e * GALAXY_TARGET_INK;
		for (const id of s.targets) {
			const i = id * STRIDE;
			attrs[i + 6] += e * (GALAXY_TARGET_ALPHA - attrs[i + 6]);
			attrs[i + 3] = CROWD[0] + ink * (INK[0] - CROWD[0]);
			attrs[i + 4] = CROWD[1] + ink * (INK[1] - CROWD[1]);
			attrs[i + 5] = CROWD[2] + ink * (INK[2] - CROWD[2]);
		}
		const i = /** @type {number} */ (s.focus) * STRIDE;
		attrs[i + 2] *= 1 + e * (GALAXY_FOCUS_R_MULT - 1);
		attrs[i + 6] += e * (1 - attrs[i + 6]);
		attrs[i + 3] += e * (INK[0] - attrs[i + 3]);
		attrs[i + 4] += e * (INK[1] - attrs[i + 4]);
		attrs[i + 5] += e * (INK[2] - attrs[i + 5]);
	}
}

/**
 * The spokes, in the edge pool. One SPEED for the whole fan, not one duration,
 * and the speed of a crow flying THROUGH the volume rather than of a pen moving
 * across the screen. A shared 0-1 progress makes a long line travel faster than
 * a short one so they all land together, which reads as the fan being inflated.
 * A constant rate over SCREEN distance fixes that but still flattens the sky,
 * because it says a dot that merely looks close is close. Over real distance,
 * a spoke reaching from the near plane to the far one takes its time however
 * short it looks, while two dots that are genuinely neighbours are joined at
 * once even if the camera has flung them to opposite sides of the frame — which
 * is the depth the sky has and the projection alone cannot say out loud. Struck
 * against each spoke's length at its own beat, so the ramp stays strictly
 * monotone even as the flow pulls the ends apart.
 *
 * Each slot rents a fixed, disjoint half of the pool (`GALAXY_FOCUS_SLOTS`
 * slots each) rather than the two sharing it by however many spokes either
 * happens to have — a fixed split keeps one slot's spoke count from ever
 * encroaching on the other's, and lets an empty slot simply fall back to
 * all-empty slots below. Each slot draws against its OWN elapsed time since its
 * own beat began, since the two clocks are staggered and rarely agree.
 * @param {[number, number]} es each slot's own envelope value
 * @param {[number, number]} drawn each slot's own px of volume drawn so far
 */
function writeSpokes(attrs, beat, es, drawn) {
	for (let slot = 0; slot < 2; slot++) {
		const base = slot * GALAXY_FOCUS_SLOTS;
		const s = beat.slots[slot];
		const e = es[slot];
		for (let k = 0; k < GALAXY_FOCUS_SLOTS; k++) {
			const linkSlot = GALAXY_LINK_BASE + base + k;
			if (s.focus == null || k >= s.targets.length) {
				setEdge(attrs, linkSlot, 0, 0);
				continue;
			}
			galaxyLinks.ends[base + k][0] = s.focus;
			galaxyLinks.ends[base + k][1] = s.targets[k];
			// clamped at 0 as well as 1: before a slot's beat opens `drawn` is
			// negative, and a spoke that has not started is undrawn, which is what
			// the static layout says too
			setEdge(
				attrs,
				linkSlot,
				Math.max(0, Math.min(1, drawn[slot] / s.lens[k])),
				e * GALAXY_LINK_ALPHA
			);
		}
	}
}

/**
 * Wraps a galaxy state's ambient writer with the highlight beat. The flight runs
 * first and untouched — it owns every dot's x, y, radius and alpha — and this
 * then re-inks up to two of them and rents the pool for their spokes.
 *
 * The two are on independent clocks, staggered half a beat apart
 * (`GALAXY_SLOT_PHASE_MS`), rather than changing together: slot 0 strikes at
 * `GALAXY_START_DELAY_MS`, `+ GALAXY_BEAT_MS`, `+ 2 * GALAXY_BEAT_MS`, …, and
 * slot 1 at the same points shifted forward by `GALAXY_SLOT_PHASE_MS`. That
 * gives the sequence the beat is meant to read as — one actor appears, a
 * second joins partway through the first's turn, the first then changes while
 * the second keeps showing, and so on — rather than both swapping in lockstep,
 * which reads as one bigger event instead of two independent ones.
 *
 * Three things hold the ambient contract:
 *
 * At `t = tBeat` a slot's envelope is zero, so its spokes have no alpha and its
 * focus is lerped none of the way toward ink — which is precisely what the
 * static layout produces at `t = 0`, before either slot's delay has elapsed.
 * The card still names nobody standing still, so the loop's first tick moves
 * nothing.
 *
 * Nothing accumulates. Positions are only ever READ, once per strike, to test a
 * candidate for being on canvas; everything written is absolute, and the flight
 * overwrites radius and alpha from its own stored base every frame regardless.
 * Both slots' clocks stay pure functions of `t` too: each slot's `tEff`/`b`/
 * `tBeat` below only ever derive from the `t` this frame was called with,
 * folding in its own delay as an offset rather than as separate mutable state.
 *
 * Colour is the one channel `makeFlight` leaves alone, so it is the one that
 * could persist: the cast is re-written to the crowd's grey every frame, before
 * either focus is inked, rather than an outgoing focus being restored on its
 * slot's change. One write per cast member, and no way for a past focus to stay
 * lit — which a restore-on-change would not guarantee, since the buffer is
 * never re-allocated between frames and a resize rebuilds the writer mid-beat.
 *
 * @param {import("./states.js").AmbientAnim["frames"]} framesFn
 * @returns {import("./states.js").AmbientAnim["frames"]}
 */
export function withGalaxyHighlight(framesFn) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED, skyT0 = 0) => {
		const write = framesFn(nodes, w, h, edges, params, bleed, skyT0);
		// the point the flow expands about — the same centre makeFlight magnifies
		// from, which is what makes a dot's path radial and its beat-end position
		// predictable (see beatGrowth)
		const [cx, cy] = galaxyCentre(w, h, bleed);
		// the sky's depth in the same units as its lateral spread, so a spoke's
		// length through the volume is one number (see worldSpot)
		const box = galaxyBox(w, h, bleed);
		const skyWidth = box[1] - box[0];
		// px of volume per ms, so the fan takes the same time relative to the frame
		// whatever the viewport
		const drawSpeed = (skyWidth * GALAXY_DRAW_WIDTHS_PER_S) / 1000;
		// where this card joins the cycle, so several galaxy cards on one page do
		// not all open on the same actor (the clock restarts at every arrival)
		const flight = {
			cx,
			cy,
			w,
			h,
			bleed,
			depthPx: skyWidth * GALAXY_DEPTH_SPAN,
			nonce: flightSeq++,
			// the sky's clock at this writer's t = 0. The beat is scheduled on
			// the loop's own `t` — it opens on its start delay however long the
			// sky under it has been flowing — but every prediction of where a dot
			// will be is made on the SKY's clock, which a carried arrival starts
			// part-way through (see makeFlight's `skyT0`)
			skyT0
		};
		// two independent slots: who is lit, who the spokes reach, how long each
		// spoke is — plus one no-repeat history shared by both. Per flight, so a
		// resize or a re-arrival starts everything fresh, which is right: the
		// reader is looking at a new card either way
		const beat = {
			slots: [
				{ index: -1, focus: null, targets: [], lens: [] },
				{ index: -1, focus: null, targets: [], lens: [] }
			],
			recent: []
		};
		/** @type {[number, number]} */
		const es = [0, 0];
		/** @type {[number, number]} */
		const drawn = [0, 0];
		return (attrs, _trails, t) => {
			write(attrs, _trails, t);
			for (let slot = 0; slot < 2; slot++) {
				const delay = GALAXY_START_DELAY_MS + slot * GALAXY_SLOT_PHASE_MS;
				const tEff = Math.max(0, t - delay);
				const b = Math.floor(tEff / GALAXY_BEAT_MS);
				const tBeat = b * GALAXY_BEAT_MS + delay;
				if (b !== beat.slots[slot].index) {
					strikeSlot(
						beat,
						/** @type {0|1} */ (slot),
						b,
						flight.skyT0 + tBeat,
						attrs,
						flight
					);
				}
				es[slot] = beat.slots[slot].focus == null ? 0 : envelope(t - tBeat);
				drawn[slot] = (t - tBeat) * drawSpeed;
			}
			for (const id of GALAXY_CAST) toCrowd(attrs, id);
			if (es[0] > 0 || es[1] > 0) inkBeat(attrs, beat, es);
			writeSpokes(attrs, beat, es, drawn);
			// the names ride their dots' alpha in the annotation layer, so this only
			// has to say WHO — and say nobody where a slot's envelope is closed
			galaxyHighlight.ids = beat.slots
				.filter((_, slot) => es[slot] > 0)
				.map((s) => /** @type {number} */ (s.focus));
		};
	};
}

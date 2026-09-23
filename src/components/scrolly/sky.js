// The sky: the crowd that arrives as the camera pulls back, the volume it is
// authored through, and the flow that carries it toward the reader forever.
// Everything here is a pure function of (id, t) — the static layouts are the
// flow at t = 0 and the per-frame flight is the same functions with the clock
// running — which is what makes the join between a layout and its ambient
// move nothing.
import { STRIDE, set } from "./attr-buffer.js";
import { FIELD_IDS, isIntroActor } from "./cast.js";
import {
	NETWORK_INTRO_RADIUS,
	PULLBACK_DOT_R,
	PULLBACK_ZOOM,
	introPosition
} from "./intro-geometry.js";
import { ANCHOR_ID, dotHash, hash01 } from "./nodes.js";
import { CROWD } from "./palette.js";
import { MARGIN, NO_BLEED, TITLE_BAND, plotBottom } from "./plot.js";

// the constellation's own crowd alpha: by the end of the pull-back the fifteen
// are meant to be indistinguishable members of the field, which is the whole
// point of the beat — only Bacon stays darker and larger.
//
// Well under 1, because the galaxy is meant to read as deep space rather than
// as a page of dots: faint enough that the display type on the title card sits
// in front of it rather than in it, and that the field the camera pulls back
// into reads as depth. Every galaxy writer takes its alpha from here — the
// crowd (writeFieldCrowd), the fifteen greying into it (hop-bands.js) and the
// closing chart's cast (race.js) — so they cannot drift apart.
//
// The field's MEAN rather than its flat value: every writer spreads it about
// this number by the dot's depth (depthFade), which is what makes the sky read
// as a volume standing still as well as moving.
export const FIELD_ALPHA = 0.35;

// How the field opens, all measured as shares of the camera's travel rather
// than as clocks, so a scrubbed or interrupted pull-back stays consistent with
// itself. The edge ramp alone cannot hold the opening frame clean: a dot has to
// be authored a third of the canvas out from Bacon before full zoom pushes it
// off the edge, which leaves a ring of white between the constellation and the
// nearest field dot. Gating on the camera instead lets a dot be authored right
// up against the constellation — the ones already in frame simply fade up where
// they stand while the outer ones still cross in.
//
// The reader gets the constellation alone for a beat (HOLD) so the camera is
// visibly pulling back off Bacon's network before anything else arrives; then
// the crowd trickles in dot by dot over STAGGER rather than arriving as one
// sheet, each fading up over SHARE. HOLD + STAGGER + SHARE stays under 1 so the
// last dot lands before the camera stops.
//
// SKEW back-loads the trickle: a dot's slot is its hash raised to this power, so
// spreading arrivals evenly over STAGGER is not what the eye reads as gradual.
// A field this size looks full long before it is — the first two thousand dots
// already read as a crowd — so an even rate spends its whole second half adding
// dots nobody can see arriving, and the visible part of the build is over in a
// blink. Below 1 the early arrivals are sparse and countable and the rate climbs
// from there, which tracks how the crowd actually reads.
const FIELD_OPEN_HOLD = 0.12;

const FIELD_OPEN_STAGGER = 0.75;

const FIELD_OPEN_SHARE = 0.08;

const FIELD_OPEN_SKEW = 0.5;

// Keep-out disc around Bacon. The field is authored blind across the whole plot
// rect, and Bacon's fitted spot is the exact horizontal centre of it at every
// viewport width (the baked intro layout puts the anchor at w/2), so a dot whose
// x-hash is ~0.5 sits on his column on every screen — several of the field do,
// and they land under the one dot the reader has been told to watch. Anything
// authored inside the disc is moved out into the annulus just beyond it, on an
// angle and a radius of its own: at this field size a whole handful gets moved,
// and snapping them all to the disc edge would ring Bacon in evenly-spaced dots.
// Sized in constellation units and scaled with the camera, so the gap the reader
// sees is the same at every scale; enforcing it at the landing covers the whole
// leg, since a dot's distance from Bacon only shrinks as the camera pulls back.
//
// It is enforced where a dot ENTERS the flow, which is a weaker guarantee than
// it used to be: the flow carries dots outward from the canvas centre, and Bacon
// sits about 30px above that, so a ray can cross the disc on its way out. Counted
// rather than assumed — 1 to 4 of the twelve thousand are inside it at any
// moment, transiently, against a Bacon drawn opaque at five times their radius.
// The systematic version of this problem is what the disc is for (a dot whose
// x-hash is ~0.5 parked on his column at every viewport, on every frame); a
// handful drifting through is not it, and chasing them would mean deflecting
// dots mid-flight, which is a visible jump to fix an invisible one.
// The title card's OWN reveal: a fixed schedule in real ms rather than one
// gated on camera travel, because the card is already landed and there is no
// travel to gate on (see FIELD_OPEN_* above, which the title card cannot use
// for exactly that reason — `writeFieldCrowd` is called there at the landed
// `PULLBACK_ZOOM`, so `travel` is always 1 and every `opening` already fully
// resolved). Applied by `withTitleReveal` in `layouts/intro.js` as a multiply
// on top of the flight's own alpha, so a dot's fade-up rides the live flow
// clock — it is already mid-flight, at whatever depth `t` has carried it to,
// rather than static and then set moving. A different hash salt (22, against
// FIELD_OPEN's 14) so the title's own arrival order doesn't just echo the
// pull-back's.
const TITLE_REVEAL_HOLD_MS = 200;

const TITLE_REVEAL_STAGGER_MS = 1400;

const TITLE_REVEAL_FADE_MS = 500;

const TITLE_REVEAL_SKEW = 0.5;

/** a dot's own slot in the title card's reveal: when its fade-up begins */
const titleRevealStart = (id) =>
	TITLE_REVEAL_HOLD_MS +
	hash01(id, 22) ** TITLE_REVEAL_SKEW * TITLE_REVEAL_STAGGER_MS;

/** how open a dot's reveal is at t: 0 before its slot, 1 once its fade completes */
export const titleRevealGate = (id, t) =>
	Math.min(1, Math.max(0, (t - titleRevealStart(id)) / TITLE_REVEAL_FADE_MS));

const FIELD_KEEPOUT_GAP = 12;

const FIELD_KEEPOUT =
	(NETWORK_INTRO_RADIUS[0] + NETWORK_INTRO_RADIUS[1] + FIELD_KEEPOUT_GAP) *
	PULLBACK_ZOOM;

/**
 * Writes the field into `attrs` at the pull-back's live `scale` (1 = full zoom,
 * PULLBACK_ZOOM = landed), leaving every other slot alone.
 *
 * Each dot is authored at the spot it holds when the camera lands, and its
 * position at any wider scale is that spot pushed out from Bacon — the point the
 * pull-back turns about — so the field contracts into frame exactly as the
 * constellation does, and expands back out of it on the way back. Radius follows
 * the constellation's crowd rather than the landing size, so a dot arrives at
 * whatever the graph's dots are at that moment instead of popping in already
 * shrunk. Opacity is geometry and camera only — the trickle-in is a per-dot
 * offset into the camera's own travel, not a clock — so the same call serves the
 * static frame and every animated one, and a scrub lands on the same frame the
 * animation would have drawn at that scale.
 */
/** the field's rect: the plot area, which is the whole canvas above the step card */
const fieldBox = (w, h) => [MARGIN, w - MARGIN, MARGIN, plotBottom(h)];

/**
 * A full-bleed state's rect: the whole bled canvas, edge to edge and from the
 * top of the screen down. A sky carries no chart, so nothing needs the margins
 * or the bottom 40% that `fieldBox` keeps clear — the crowd is the picture, and
 * boxing it into the column reads as a rectangle of dots rather than a sky.
 *
 * `bleed` is how far the canvas extends past the 700px reading column on each
 * side, and TITLE_BAND how far it extends above the box (see ScrollyVisual's
 * render transform), so negative x, x past `w` and negative y are all on screen.
 * The charts keep `fieldBox`: widening hopBands' would spread the bands' rain
 * across the whole viewport too.
 *
 * The rect is then inflated past the canvas by GALAXY_SPREAD, and the flow
 * carries dots out past that again, so most of the crowd is off screen at any
 * moment and what remains on it is a thin scatter rather than a solid ground of
 * dots. Spread is the only sparsity lever available: the crowd cannot lose
 * members, because hopBands sorts this exact set and a dot missing from the sky
 * would have no row to fall into. Dots off the canvas cost a fill the context
 * clips and nothing else.
 */
// How much bigger than the canvas dots ENTER the sky across, each way from its
// centre. Lower than it reads, because entry is the far plane and the flow then
// carries a dot out by up to SKY_FAR / SKY_NEAR: averaged over the volume that
// magnification spreads the crowd about a further half again, so this is the
// number that leaves the same share of it on the canvas as a flat field at 2.2
// did. Retune it against the on-canvas count, not by eye on one frame — the
// whole point of the spread is how much of the crowd is off screen at any moment.
export const GALAXY_SPREAD = 1.46;

/**
 * The middle of the bled canvas — the point `galaxyBox` is struck about, and so
 * the point the sky spreads out from. It is also the flow's VANISHING POINT: the
 * crowd streams outward from here, and it has to be the same centre the field
 * was authored about or the sky drifts off to one side as it flies. Factored out
 * rather than written twice for that reason.
 *
 * It is the middle of the SCREEN, not of the column, and stays so when the two
 * differ: a full-bleed sky fills the viewport, so a vanishing point sitting in the
 * half the charts use would fly the sky off toward one edge.
 * @returns {[number, number]}
 */
export const galaxyCentre = (w, h, bleed = NO_BLEED) => [
	(-bleed.l + (w + bleed.r)) / 2,
	(-TITLE_BAND + h) / 2
];

export const galaxyBox = (w, h, bleed = NO_BLEED) => {
	const [cx, cy] = galaxyCentre(w, h, bleed);
	const kx = ((w + bleed.l + bleed.r) / 2) * GALAXY_SPREAD;
	const ky = ((h + TITLE_BAND) / 2) * GALAXY_SPREAD;
	return [cx - kx, cx + kx, cy - ky, cy + ky];
};

export const SKY_NEAR = 1;

export const SKY_FAR = 4;

const SKY_SPAN = SKY_FAR - SKY_NEAR;

export const SKY_MID = (SKY_NEAR + SKY_FAR) / 2;

/**
 * How long one dot takes to cross the whole volume, far plane to near plane.
 * The story's main feel knob: at this length a dot out near the canvas edge
 * moves 15–25px a second, which reads as travel without turning the sky the
 * title sits in front of into weather.
 */
export const FLIGHT_CYCLE_MS = 26000;

// The share of that trip spent fading in at the far plane and out at the near
// one. A dot has to cross the whole volume and start again, and that wrap is a
// jump — from the biggest and brightest a dot ever is, back to the smallest and
// faintest — so it happens behind a fade at both ends rather than in the open.
// The same window is applied to the static field (see writeFieldCrowd), which is
// what keeps the loop's first tick identical to the frame it joins.
//
// Exported because the highlight beat has to know it: an actor picked while it is
// inside either ramp would be named as it fades, so `galaxy-highlight.js` keeps
// its cast and its spoke targets clear of both ends of the trip.
export const FLIGHT_FADE = 0.12;

/**
 * The flow's clock, in ms since the running flight began — the ONE piece of live
 * state the sky publishes. `makeFlight` writes it every frame it draws; a layout
 * that receives the crowd off a galaxy state reads it to place dots where the
 * sky actually has them rather than where they rest.
 *
 * Its initial value is zero, which is not a fallback but the truth: before any
 * flight has run the sky IS at t = 0, which is where every static galaxy layout
 * is authored, so a cold load or a reduced-motion read gets the frame it should.
 *
 * A layout reading this is the one thing in the story that is not a pure
 * function of (state, w, h, bleed, params), so the render layer drops its layout
 * cache whenever a flight stops — see ScrollyVisual's stopSweep, which is also
 * what fixes the moment a departing state is struck against.
 */
export const skyFlight = { t: 0 };

/** where in its trip a dot starts the story — its offset into the flow's clock */
const skyPhase = (id) => hash01(id, 21);

/** a dot's place in its trip at time t: 0 just entered at the far plane, 1 about to pass the camera */
export function skyFrac(id, t) {
	const u = skyPhase(id) + t / FLIGHT_CYCLE_MS;
	return u - Math.floor(u);
}

/** how far out from the vanishing point a dot at depth z is carried */
export const skyMag = (z) => SKY_FAR / z;

/** fades a dot up as it enters at the far plane and down as it passes the camera */
export const flightWindow = (frac) =>
	Math.min(1, frac / FLIGHT_FADE, (1 - frac) / FLIGHT_FADE);

/**
 * Where one actor stands through the sky's depth when the field is at rest —
 * the flow's own t = 0, so the static layouts and the flight cannot disagree
 * about the volume. Uniform over [SKY_NEAR, SKY_FAR], because a dot crosses the
 * volume at a constant rate and the phases are uniform.
 */
export const fieldDepth = (id) => SKY_FAR - skyFrac(id, 0) * SKY_SPAN;

// Aerial perspective, referenced to the middle of the volume so the field keeps
// the overall weight `FIELD_ALPHA` and `PULLBACK_DOT_R` give it and only spreads
// about it. Both are the SAME law — a square root of the depth ratio — for two
// reasons: a dot's size and brightness have to change at the same rate as it
// comes toward the reader or it reads as swelling rather than approaching, and
// one `Math.sqrt` then serves both in a loop that runs over twelve thousand dots
// a frame. A softer law than the 1/z a true projection would use for size: at
// full strength the far plane is a quarter of the near one, which on a light
// ground takes the back of the sky to nothing and leaves a field of foreground
// dots.
export const SKY_DEPTH_GAMMA = 0.5;

/** a dot's radius multiplier at depth z — about 1.6x at the near plane, 0.8x at the far */
export const depthSize = (z) => (SKY_MID / z) ** SKY_DEPTH_GAMMA;

// A dot's ink goes as radius squared times alpha, and that power of (MID / z) is
// convex, so spreading the field about the middle of the volume ADDS weight even
// though both multipliers average to about 1 — a quarter again as much ink as
// the flat field, which is the opposite of what a sky a title sits in front of
// wants. The entry/exit window takes some back. So the fade carries both means
// and divides them out: the sky is exactly as heavy as FIELD_ALPHA and the
// crowd's radius make it, only now distributed through the depth.
//
// Derived rather than written down — the mean of (MID / z)^p over a uniform z,
// closed form, times the window's own mean — so retuning any of it cannot leave
// a stale number behind.
const SKY_INK_POWER = 3 * SKY_DEPTH_GAMMA;

const SKY_INK_MEAN =
	((SKY_MID ** SKY_INK_POWER *
		(SKY_FAR ** (1 - SKY_INK_POWER) - SKY_NEAR ** (1 - SKY_INK_POWER))) /
		((1 - SKY_INK_POWER) * SKY_SPAN)) *
	(1 - FLIGHT_FADE);

/** a dot's alpha multiplier at depth z — about 1.4x at the near plane, 0.7x at the far */
export const depthFade = (z) => (SKY_MID / z) ** SKY_DEPTH_GAMMA / SKY_INK_MEAN;

/**
 * Where one actor ENTERS the volume on its `cycle`-th trip through — a uniform
 * spot in the sky's box, clear of Bacon at the moment it enters (see
 * FIELD_KEEPOUT, and the note there on what the flow does to that guarantee),
 * which the magnification then carries outward. Cycle 0 is the resting field, so
 * this is also what authors the static sky.
 *
 * `dotHash` rather than `hash01`: the cycle walks the salt by one on every trip,
 * and stepping a sine hash's input by a constant steps its phase by a constant —
 * a dot would enter on a slow march across the sky instead of somewhere new.
 *
 * @returns {[number, number]}
 */
function entrySpot(id, cycle, box, bx, by) {
	const [x0, x1, y0, y1] = box;
	const fx = x0 + dotHash(id, cycle * 2) * (x1 - x0);
	const fy = y0 + dotHash(id, cycle * 2 + 1) * (y1 - y0);
	if (Math.hypot(fx - bx, fy - by) >= FIELD_KEEPOUT) return [fx, fy];
	const a = dotHash(id, cycle * 2 + 0x40000) * Math.PI * 2;
	const d = FIELD_KEEPOUT * (1 + dotHash(id, cycle * 2 + 0x80000));
	return [bx + Math.cos(a) * d, by + Math.sin(a) * d];
}

/**
 * Where one actor stands in the flow at time `t` — the single definition of a
 * field dot's position, so anything else placing the same crowd (a galaxy
 * state's universe, `hopBands` reading the column a dot leaves the sky in) lands
 * on the identical frame rather than one that merely looks the same. A pixel of
 * drift between them would twitch the whole field on a step change.
 *
 * `box` is the rect the crowd ENTERS across, defaulting to the plot area. The
 * galaxy states pass `galaxyBox` to spread the same dots over the whole screen. Because both boxes are struck about the same centre and the
 * magnification is about that centre too, one is exactly the other contracted —
 * which is what `skyToColumn` trades on.
 *
 * @returns {[number, number]}
 */
export function flowSpot(id, w, h, box, t) {
	const [x0, x1, y0, y1] = box;
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	const u = skyPhase(id) + t / FLIGHT_CYCLE_MS;
	const cycle = Math.floor(u);
	const m = skyMag(SKY_FAR - (u - cycle) * SKY_SPAN);
	const [ex, ey] = entrySpot(id, cycle, box, bx, by);
	return [cx + (ex - cx) * m, cy + (ey - cy) * m];
}

/**
 * Where one actor stands when the pull-back has landed: the flow at rest.
 * @returns {[number, number]}
 */
export function fieldSpot(id, w, h, box = fieldBox(w, h)) {
	return flowSpot(id, w, h, box, 0);
}

/**
 * Where one actor stands once hopSeed's camera has landed — `fieldSpot` for the
 * crowd, and for the intro fifteen the place the landed camera has them: the
 * pull-back holds the constellation's geometry and changes only how the dots
 * are drawn, so the fifteen blend into the crowd where they stand instead of
 * flying out across the plot to scatter spots of their own. They are the one part of
 * the sky that is NOT in the flow — a constellation streaming past the reader
 * would stop being a diagram — so they simply stand in front of it.
 *
 * `box` is the rect the crowd is authored across, exactly as on `fieldSpot`, and
 * defaults the same way. The fifteen ignore it: they stand where hopSeed's
 * landed camera left them whichever box the crowd is spread across.
 *
 * @returns {[number, number]}
 */
export function landedSpot(id, w, h, box = fieldBox(w, h)) {
	return isIntroActor(id)
		? introPosition(id, w, h, PULLBACK_ZOOM)
		: fieldSpot(id, w, h, box);
}

/**
 * How one dot is DRAWN once it is resting in the flow: the size and alpha its
 * own depth gives it at the landed camera, spread about `PULLBACK_DOT_R` and
 * `FIELD_ALPHA` and behind the entry/exit window.
 *
 * These are exactly the constants `makeFlight` draws a flown dot with, so a
 * layout that hands a dot to the flight has to land it here or the loop's first
 * tick would resize and rebrighten it. That is the whole reason this is one
 * function rather than four lines in each caller: the crowd's own writer below,
 * and the constellation joining the sky on `hopSeed` all have to agree with the flight to the last decimal.
 *
 * @returns {[number, number]} radius, alpha
 */
export function restingSkyDot(id) {
	const z = fieldDepth(id);
	return [
		PULLBACK_DOT_R * depthSize(z),
		FIELD_ALPHA * depthFade(z) * flightWindow(skyFrac(id, 0))
	];
}

/**
 * @param {Set<number>} [skip] ids to leave untouched — a caller drawing some of
 * these ids itself elsewhere in the same frame, whose position/alpha this
 * writer would otherwise overwrite with a fieldSpot placement
 */
export function writeFieldCrowd(
	attrs,
	w,
	h,
	scale,
	box = fieldBox(w, h),
	skip
) {
	const [bx, by] = introPosition(ANCHOR_ID, w, h);
	const k = scale / PULLBACK_ZOOM;
	// how far through the pull-back the camera is: 0 at full zoom, 1 at landing
	const travel = (1 - scale) / (1 - PULLBACK_ZOOM);
	const r = NETWORK_INTRO_RADIUS[1] * scale;
	for (const id of FIELD_IDS) {
		if (skip?.has(id)) continue;
		const [fx, fy] = fieldSpot(id, w, h, box);
		const x = bx + (fx - bx) * k;
		const y = by + (fy - by) * k;
		// this dot's own slot in the trickle: the hold, plus its place in the stagger
		const start =
			FIELD_OPEN_HOLD + hash01(id, 14) ** FIELD_OPEN_SKEW * FIELD_OPEN_STAGGER;
		const opening = Math.max(
			0,
			Math.min(1, (travel - start) / FIELD_OPEN_SHARE)
		);
		// depth rides the camera's radius rather than replacing it, so the crowd
		// still arrives at whatever size the constellation's dots are at that
		// moment — it is spread about that size, not pinned to one of its own.
		// The entry/exit window rides alpha for the same reason it does in the
		// flight: this frame IS the flow's t = 0, so a dot part-way through
		// entering has to be part-way faded here too or the loop's first tick
		// would brighten it.
		const d = fieldDepth(id);
		set(
			attrs,
			id,
			x,
			y,
			r * depthSize(d),
			CROWD,
			FIELD_ALPHA * depthFade(d) * flightWindow(skyFrac(id, 0)) * opening
		);
	}
}

/**
 * How far a sky pixel travels when the crowd funnels back into the reading
 * column — the ratio between `galaxyBox` and the plot's own `fieldBox`, so the
 * handoff off hopSeed's sky is a uniform contraction.
 *
 * The two boxes share a centre only while the column is centred in the viewport.
 * Side by side with the prose they do not, and the contraction becomes that same
 * scale about the sky's centre followed by a translation onto the column's
 * (`departureColumn` applies both). The commute survives it: the flow's
 * magnification `m` is struck about the sky's centre `c`, so contracting then
 * translating gives `s·m·(p − c) + f`, and flowing a contracted dot about the
 * column's centre `f` gives `m·(s·(p − c) + f − f) + f` — the same point. A
 * dot's live sky position put through this is still exactly where that dot would
 * be if the whole flow had been authored in the column.
 */
export function skyToColumn(w, h, bleed) {
	const [x0, x1] = galaxyBox(w, h, bleed);
	const [cx0, cx1] = fieldBox(w, h);
	return (cx1 - cx0) / (x1 - x0);
}

/**
 * The flight over one galaxy state. Every state that rests on the sky shares
 * this one writer, so the motion cannot differ between the title card, the
 * pull-back and the outro.
 *
 * `layoutFn` is the state's OWN static layout, rebuilt here with the same
 * `bleed` the arrival was built with — that rebuild is what makes the base the
 * frame the tween landed on, and a different bleed would snap the whole sky
 * inward on settle. `ids` is who flies: the crowd everywhere, plus the intro
 * fifteen on hopSeed, where they have stopped being a diagram and joined it.
 *
 * A dot's size and alpha follow its depth every frame, because a thing coming
 * toward you grows and darkens and that is most of what makes the motion read as
 * approach. Both take the same square root of the depth ratio, so the loop
 * spends one `Math.sqrt` on the pair; the entry spot is only re-drawn on the
 * frames a dot actually wraps, which across the whole field is a few hundred
 * hashes a second rather than twelve thousand a frame.
 *
 * The FIRST trip is flown on the base frame, not on a hashed entry spot: a dot's
 * entry offset is read back off whatever the static layout put it at, divided by
 * the magnification its resting depth implies. That is what makes t = 0 exact
 * for dots the flow did not author — the intro fifteen standing where hopSeed's
 * camera left them, the closing chart's cast greyed in where the
 * camera found them — and it keeps this writer's one job the same as the drift's
 * before it: take the frame the arrival landed on and move it.
 *
 * Radius and alpha are taken from the crowd's landed constants rather than read
 * back, which is exact because an ambient only ever starts at `settle()`: by
 * then every flown dot is at PULLBACK_DOT_R and FIELD_ALPHA, the pull-back's
 * trickle is over and the outro's cast has finished greying in.
 *
 * @param {LayoutFn} layoutFn
 * @param {number[]} ids
 * @returns {import("./states.js").AmbientAnim["frames"]}
 */
export function makeFlight(layoutFn, ids) {
	return (nodes, w, h, edges, params, bleed = NO_BLEED) => {
		const { attrs: base } = layoutFn(nodes, w, h, edges, params, bleed);
		const box = galaxyBox(w, h, bleed);
		const [cx, cy] = galaxyCentre(w, h, bleed);
		const [bx, by] = introPosition(ANCHOR_ID, w, h);
		const n = ids.length;
		const at = new Int32Array(n);
		const phase = new Float64Array(n);
		// the entry offset of the trip a dot is currently on, and which trip that
		// is — re-drawn only on the frame the dot wraps
		const ex = new Float32Array(n);
		const ey = new Float32Array(n);
		const cyc = new Int32Array(n);
		for (let k = 0; k < n; k++) {
			const id = ids[k];
			const i = id * STRIDE;
			const p = skyPhase(id);
			// the magnification the base frame already stands at
			const m0 = skyMag(SKY_FAR - p * SKY_SPAN);
			at[k] = i;
			phase[k] = p;
			cyc[k] = 0;
			ex[k] = (base[i] - cx) / m0;
			ey[k] = (base[i + 1] - cy) / m0;
		}
		// size and alpha are a ratio to the middle of the volume; the loop wants it
		// as a multiplier on 1 / sqrt(z)
		const ref = Math.sqrt(SKY_MID);
		const alphaRef = (FIELD_ALPHA * ref) / SKY_INK_MEAN;
		const sizeRef = PULLBACK_DOT_R * ref;
		const invFade = 1 / FLIGHT_FADE;
		return (attrs, _trails, t) => {
			skyFlight.t = t;
			const march = t / FLIGHT_CYCLE_MS;
			for (let k = 0; k < n; k++) {
				const u = phase[k] + march;
				const c = u | 0;
				if (c !== cyc[k]) {
					cyc[k] = c;
					const [nx, ny] = entrySpot(ids[k], c, box, bx, by);
					ex[k] = nx - cx;
					ey[k] = ny - cy;
				}
				const frac = u - c;
				const z = SKY_FAR - frac * SKY_SPAN;
				// one divide and one square root serve position, size and alpha
				const q = 1 / Math.sqrt(z);
				const i = at[k];
				const m = SKY_FAR * q * q;
				attrs[i] = cx + ex[k] * m;
				attrs[i + 1] = cy + ey[k] * m;
				attrs[i + 2] = sizeRef * q;
				attrs[i + 6] =
					alphaRef * q * Math.min(1, frac * invFade, (1 - frac) * invFade);
			}
		};
	};
}

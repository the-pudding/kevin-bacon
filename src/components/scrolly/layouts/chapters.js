import { INTRO_IDS, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	STRIDE,
	CROWD,
	FIELD_ALPHA,
	FIELD_IDS,
	PULLBACK_DOT_R,
	PULLBACK_ZOOM,
	cardSpot,
	fieldEdgeAlpha,
	writeFieldCrowd,
	galaxyBox,
	set,
	parkHidden
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Chapter cards: a title beat between chapters, with the corpus drifting behind
// it. Every other state is drawn inside the 700px reading column; a card is the
// one place that column is dropped, and the crowd opens out across the whole
// viewport (`galaxyBox`) so the title lands on a sky rather than on a rectangle
// of dots. Arriving is therefore the one move the card makes: the field blooms
// outward from wherever the previous state left it over the state tween, and
// draws back into the column on the way out, so the reader gets the corpus as
// something too big for the page exactly where the prose stops.
//
// The intro constellation is the exception that stays put: its fifteen dots
// take the crowd's mark where they already stand (`cardSpot`), so what dissolves
// is the diagram, not their positions.
// ---------------------------------------------------------------------------

/**
 * Everyone the card shows. FIELD_IDS is every reachable actor bar the curated
 * fifteen, who are excluded there because hopSeed draws them as a constellation;
 * here that constellation is over, so they join the crowd on the same terms.
 * Between them these cover every node with a hop — the rest park hidden.
 */
const UNIVERSE_IDS = [...FIELD_IDS, ...INTRO_IDS];

/**
 * The intro fifteen (Bacon included) joining the field where they stand. They
 * keep hopSeed's landed positions (`cardSpot`) and take on the crowd's radius,
 * grey and edge ramp, so nothing about the constellation travels: the fifteen
 * simply stop being drawn as a diagram and blend into the crowd already around
 * them, Bacon shrinking and greying out among them.
 */
function writeIntroIntoField(attrs, w, h, box) {
	for (const id of INTRO_IDS) {
		const [x, y] = cardSpot(id, w, h);
		set(
			attrs,
			id,
			x,
			y,
			PULLBACK_DOT_R,
			CROWD,
			FIELD_ALPHA * fieldEdgeAlpha(x, y, w, h, box)
		);
	}
}

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutChapterCenters(nodes, w, h, _edges, _params, bleed = 0) {
	const attrs = new Float64Array(ATTR_SIZE);
	// the sky: the whole canvas, past the reading column on both sides
	const box = galaxyBox(w, h, bleed);
	// unreachable actors have no place in a crowd of degrees of separation; park
	// them where hopBands parks them too, so they never move across the handoff
	for (const n of nodes) if (n.hop < 0) parkHidden(attrs, n, w, h);
	// PULLBACK_ZOOM is the landed camera, so this is hopSeed's closing frame
	// re-authored across the wider box — same dots, same radius, same grey, each
	// carried out to its place in the sky by the arrival tween
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM, box);
	writeIntroIntoField(attrs, w, h, box);
	return { attrs };
}

// ---------------------------------------------------------------------------
// The drift. Each dot orbits a small ellipse of its own, on its own clock and
// out of phase with its neighbours, so the field breathes rather than pulsing.
//
// Written as an OFFSET that is zero at t = 0 (see the cos/sin expansion below),
// which is what satisfies the STATE_AMBIENT contract by construction: the loop's
// first tick redraws exactly the frame the arrival tween landed on. It is also
// why the offset is measured from a stored base rather than from the live
// buffer — reading back what it just wrote would accumulate, and the field would
// slowly wander off the canvas.
// ---------------------------------------------------------------------------

// Slow and small: this sits behind display type, so it has to read as alive
// without ever pulling the eye off the words.
const DRIFT_MIN_PX = 2;
const DRIFT_MAX_PX = 7;
const DRIFT_PERIOD_MIN_MS = 9000;
const DRIFT_PERIOD_MAX_MS = 22000;
// Angular speeds are quantised into this many bands so a frame needs two trig
// calls per band instead of four per dot — at ~11k dots that is the difference
// between ~45,000 transcendentals a frame and 24. The eye can't count twelve
// speeds anyway, and amplitude, phase and direction all stay continuous, so
// nothing about the motion reads as banded. Same trade as drawScene's Path2D
// bucketing: quantise the thing nobody can see, keep the thing they can.
const DRIFT_BANDS = 12;

/** @type {import("../states.js").AmbientAnim["frames"]} */
function driftFrames(nodes, w, h, params, bleed = 0) {
	// same `bleed` the static layout was built with, or the drift base would be
	// the column-width field and the whole sky would snap inward on settle
	const { attrs: base } = layoutChapterCenters(
		nodes,
		w,
		h,
		null,
		params,
		bleed
	);
	const n = UNIVERSE_IDS.length;
	const at = new Int32Array(n);
	const baseX = new Float32Array(n);
	const baseY = new Float32Array(n);
	const ax = new Float32Array(n);
	const ay = new Float32Array(n);
	const cosP = new Float32Array(n);
	const sinP = new Float32Array(n);
	/** @type {number[][]} */
	const members = Array.from({ length: DRIFT_BANDS }, () => []);
	for (let k = 0; k < n; k++) {
		const id = UNIVERSE_IDS[k];
		const i = id * STRIDE;
		at[k] = i;
		baseX[k] = base[i];
		baseY[k] = base[i + 1];
		const span = DRIFT_MAX_PX - DRIFT_MIN_PX;
		// x and y amplitudes are drawn separately, so orbits are ellipses at every
		// eccentricity rather than a field of identical circles
		ax[k] = DRIFT_MIN_PX + hash01(id, 15) * span;
		// the sign is which way round the dot travels; half the field each way, or
		// the whole crowd rotates together and reads as a turning wheel
		ay[k] =
			(hash01(id, 19) < 0.5 ? -1 : 1) * (DRIFT_MIN_PX + hash01(id, 16) * span);
		const phase = hash01(id, 17) * Math.PI * 2;
		cosP[k] = Math.cos(phase);
		sinP[k] = Math.sin(phase);
		const b = Math.min(
			DRIFT_BANDS - 1,
			Math.floor(hash01(id, 18) * DRIFT_BANDS)
		);
		members[b].push(k);
	}
	const omega = new Float64Array(DRIFT_BANDS);
	for (let b = 0; b < DRIFT_BANDS; b++) {
		const period =
			DRIFT_PERIOD_MIN_MS +
			(b / (DRIFT_BANDS - 1)) * (DRIFT_PERIOD_MAX_MS - DRIFT_PERIOD_MIN_MS);
		omega[b] = (Math.PI * 2) / period;
	}
	const groups = members.map((m) => Int32Array.from(m));
	return (attrs, _trails, t) => {
		for (let b = 0; b < DRIFT_BANDS; b++) {
			const a = omega[b] * t;
			// the band's whole per-frame trig. Both terms are 0 at t = 0, so the
			// angle-sum expansion below collapses to the base position exactly:
			//   cos(a + p) - cos p = cos p (cos a - 1) - sin p sin a
			//   sin(a + p) - sin p = cos p sin a     + sin p (cos a - 1)
			const c1 = Math.cos(a) - 1;
			const s1 = Math.sin(a);
			const g = groups[b];
			for (let j = 0; j < g.length; j++) {
				const k = g[j];
				const i = at[k];
				attrs[i] = baseX[k] + ax[k] * (cosP[k] * c1 - sinP[k] * s1);
				attrs[i + 1] = baseY[k] + ay[k] * (cosP[k] * s1 + sinP[k] * c1);
			}
		}
	};
}

export const states = {
	chapterCenters: {
		layout: layoutChapterCenters,
		// no labels and no pulse: the card names a chapter, not an actor
		ambient: { frames: driftFrames }
	}
};

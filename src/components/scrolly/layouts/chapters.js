import { INTRO_IDS } from "../nodes.js";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import { FIELD_IDS } from "../cast.js";
import { PULLBACK_DOT_R, PULLBACK_ZOOM } from "../intro-geometry.js";
import { CROWD } from "../palette.js";
import { NO_BLEED } from "../plot.js";
import { parkHidden } from "../scatter-scales.js";
import {
	FIELD_ALPHA,
	cardSpot,
	writeFieldCrowd,
	galaxyBox,
	makeFlight,
	onSkyClock,
	fieldDepth,
	depthSize,
	depthFade,
	flightWindow,
	skyFrac
} from "../sky.js";
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
 * The card's sky: two clocks, not one.
 *
 * The crowd is CONTINUING a flight the reader has been watching — hopSeed flies
 * the same ids off the same box — so it rides the story's clock and nothing
 * about it re-deals on arrival. The fifteen have been standing still in front of
 * that flight, and their base is where hopSeed's camera left them rather than a
 * flow position, so carrying them on the same clock would fly the constellation
 * out along its own rays the instant the card arrived. They get their own trip
 * from zero.
 *
 * At t0 = 0 the two are one frame and this is the static layout, which is what
 * holds the ambient's t = 0 contract.
 *
 * @type {import("../states.js").AmbientAnim["frames"]}
 */
function cardSky(nodes, w, h, edges, params, bleed = NO_BLEED, t0 = 0) {
	const joiners = makeFlight(layoutChapterCenters, INTRO_IDS)(
		nodes,
		w,
		h,
		edges,
		params,
		bleed
	);
	const crowd = onSkyClock(makeFlight(layoutChapterCenters, FIELD_IDS))(
		nodes,
		w,
		h,
		edges,
		params,
		bleed,
		t0
	);
	return (attrs, trails, t) => {
		joiners(attrs, trails, t);
		// last, so the clock published to skyFlight — which hopBands' departure
		// columns read to find the crowd — is the story's and not the fifteen's
		crowd(attrs, trails, t);
	};
}

/**
 * The intro fifteen (Bacon included) joining the field where they stand. They
 * keep hopSeed's landed positions (`cardSpot`) and take on the crowd's radius
 * and grey, so nothing about the constellation travels: the fifteen simply
 * stop being drawn as a diagram and blend into the crowd already around them,
 * Bacon shrinking and greying out among them.
 */
function writeIntroIntoField(attrs, w, h) {
	for (const id of INTRO_IDS) {
		const [x, y] = cardSpot(id, w, h);
		// the crowd's depth and its place in the flow too, not just its size and
		// grey: the fifteen are joining a sky that has a front and a back and is
		// streaming past, and a flat plane of them inside it would pick the
		// constellation back out of the crowd it just dissolved into. They keep
		// their POSITIONS — that is the whole beat — and only start moving once the
		// card's flight takes over from the arrival.
		const d = fieldDepth(id);
		set(
			attrs,
			id,
			x,
			y,
			PULLBACK_DOT_R * depthSize(d),
			CROWD,
			FIELD_ALPHA * depthFade(d) * flightWindow(skyFrac(id, 0))
		);
	}
}

/** @type {import("../layout-types.js").LayoutFn} */
function layoutChapterCenters(nodes, w, h, _edges, _params, bleed = NO_BLEED) {
	const attrs = new Float64Array(ATTR_SIZE);
	// the sky: the canvas and well past it on every side, so the crowd thins out
	// across something bigger than the screen rather than tiling it
	const box = galaxyBox(w, h, bleed);
	// unreachable actors have no place in a crowd of degrees of separation; park
	// them where hopBands parks them too, so they never move across the handoff
	for (const n of nodes) if (n.hop < 0) parkHidden(attrs, n, w, h);
	// PULLBACK_ZOOM is the landed camera, so this is hopSeed's closing frame
	// re-authored across the wider box — same dots, same radius, same grey, each
	// carried out to its place in the sky by the arrival tween
	writeFieldCrowd(attrs, w, h, PULLBACK_ZOOM, box);
	writeIntroIntoField(attrs, w, h);
	return { attrs };
}

export const states = {
	chapterCenters: {
		layout: layoutChapterCenters,
		// No pulse, and no labels STANDING STILL: the card names a chapter, not an
		// actor, and the static frame it arrives on is an anonymous crowd. Unlike
		// the splash's titleGalaxy, this ambient carries no highlight beat, so no
		// actor is ever named here — an empty set rather than no declaration at
		// all, because it also holds the ambient loop's t = 0 contract.
		labels: () => [],
		// the fifteen fly with the crowd here, and only here: this is the one
		// galaxy state where they have stopped being a constellation, so holding
		// them still would pick them back out of the sky they just joined
		ambient: {
			clocked: true,
			frames: cardSky
		}
	}
};

import { INTRO_IDS } from "../nodes.js";
import {
	ATTR_SIZE,
	CROWD,
	FIELD_ALPHA,
	FIELD_IDS,
	PULLBACK_DOT_R,
	PULLBACK_ZOOM,
	cardSpot,
	writeFieldCrowd,
	galaxyBox,
	NO_BLEED,
	makeFlight,
	fieldDepth,
	depthSize,
	depthFade,
	flightWindow,
	skyFrac,
	set,
	parkHidden
} from "../layout-shared.js";
import { withGalaxyHighlight } from "../galaxy-highlight.js";

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

/** @type {import("../layout-shared.js").LayoutFn} */
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
		// actor, and the static frame it arrives on is an anonymous crowd. The
		// names arrive with the motion instead — once the sky is flowing, the
		// highlight beat picks one well-known actor out of it at a time (see
		// galaxy-highlight.js). An empty set rather than no declaration at all,
		// because the beat's own per-frame cut in ScrollyVisual is what names
		// anybody; this says the resting card names nobody, which is also what
		// holds the ambient loop's t = 0 contract.
		labels: () => [],
		// the fifteen fly with the crowd here, and only here: this is the one
		// galaxy state where they have stopped being a constellation, so holding
		// them still would pick them back out of the sky they just joined
		ambient: {
			frames: withGalaxyHighlight(
				makeFlight(layoutChapterCenters, UNIVERSE_IDS)
			)
		}
	}
};

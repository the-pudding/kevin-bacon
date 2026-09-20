import { INTRO_IDS } from "../nodes.js";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import { SKY_IDS } from "../cast.js";
import { PULLBACK_ZOOM } from "../intro-geometry.js";
import { CROWD } from "../palette.js";
import { NO_BLEED } from "../plot.js";
import {
	cardSpot,
	writeFieldCrowd,
	galaxyBox,
	makeFlight,
	onSkyClock,
	restingSkyDot
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
// The intro fifteen are no exception by the time a reader arrives: hopSeed's
// pull-back has already drawn them into the sky and set them flying with it, so
// the card simply keeps them where it finds them (`cardSpot`, the mark that
// pull-back landed on) and carries the one flight on.
// ---------------------------------------------------------------------------

/**
 * The intro fifteen (Bacon included) standing in the field where hopSeed's
 * landed camera left them (`cardSpot`), drawn as sky rather than as diagram.
 *
 * The crowd's depth and its place in the flow, not just its size and grey: the
 * fifteen are in a sky that has a front and a back and is streaming past, and a
 * flat plane of them inside it would pick the constellation back out of the
 * crowd. They have already been drawn into it by the time the reader gets here
 * — hopSeed's pull-back does that (see writeIntroIntoSky) — so this frame is
 * the one the card arrives on and the one the card's flight carries on from,
 * and stepping onto the card changes nothing about them at all.
 */
function writeIntroIntoField(attrs, w, h) {
	for (const id of INTRO_IDS) {
		const [x, y] = cardSpot(id, w, h);
		const [r, alpha] = restingSkyDot(id);
		set(attrs, id, x, y, r, CROWD, alpha);
	}
}

/** @type {import("../layout-types.js").LayoutFn} */
function layoutChapterCenters(_nodes, w, h, _edges, _params, bleed = NO_BLEED) {
	const attrs = new Float64Array(ATTR_SIZE);
	// the sky: the canvas and well past it on every side, so the crowd thins out
	// across something bigger than the screen rather than tiling it
	const box = galaxyBox(w, h, bleed);
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
		// One flight over one cast: the fifteen stopped being a constellation on
		// hopSeed and fly on the same clock as everyone else there, so the card
		// takes the whole sky over mid-stream and a step across it moves nothing.
		// A card the reader reaches from a chart instead is handed clock 0, which
		// is where every galaxy layout is authored, so it opens on its own static
		// frame exactly as before.
		ambient: {
			clocked: true,
			frames: onSkyClock(makeFlight(layoutChapterCenters, SKY_IDS))
		}
	}
};

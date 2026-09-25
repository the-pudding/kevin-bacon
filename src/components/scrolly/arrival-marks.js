// What a state change does to the dots before anything travels: the two
// restatements that keep a hidden dot's position a designed spot rather than
// wherever it last happened to be. Pure over buffers, so the arrivals test can
// run them over the layouts themselves (contracts.spec.js).
import { EDGE_BASE, STRIDE } from "./attr-buffer.js";
import { ALPHA_SEEN } from "./render.js";

/**
 * Park every id the arriving state does not draw where the frame the reader
 * is looking at has it, so it fades out where it stands instead of being
 * lerped across the canvas to a hidden spot it is invisible at anyway — the
 * career crowd climbing off the top of the plot, the race cast crossing the
 * chart inside the future block, the sky sliding onto the films scatter.
 *
 * The live mark is restated WHOLE — position, radius and colour — so a leaver
 * crossfades nothing on its way out; exactly what fadeOutTrails does for a
 * departing line's geometry and its ink. The alpha is left at the layout's
 * own, because that alpha IS the fade.
 *
 * "Does not draw" is the renderer's own floor, so a dot that was already
 * invisible keeps the hidden spot its layout designed. A leaver never reaches
 * that spot on this arrival; `restateHidden` puts it there at the next state
 * change, once it is invisible. On a cold start the live frame is all zeros,
 * so this is a no-op by construction.
 *
 * Write into a per-arrival copy, never a layout's own attrs — those are
 * cached, and mutating one would poison every later visit to the state.
 * @param {Float64Array} attrs the arrival's target, rewritten
 * @param {ArrayLike<number>} live the frame on screen
 */
export function parkLeavers(attrs, live) {
	for (let i = 0; i < EDGE_BASE; i += STRIDE) {
		if (attrs[i + 6] > ALPHA_SEEN || live[i + 6] <= ALPHA_SEEN) continue;
		for (let k = 0; k < 6; k++) attrs[i + k] = live[i + k];
	}
}

/**
 * Move every dot the departing state hides, and the reader cannot see, onto
 * the departing state's mark for it — position, radius and colour, alpha left
 * at the live frame's — so an arrival that shows it starts it from the spot
 * the departing state designed (motion.md rule 14), not from wherever an
 * earlier fade-out left it.
 *
 * Invisible, so nothing drawn moves, and it holds on a press mid-flight: a dot
 * still fading out is visible and is left alone. A dot the departing state
 * DRAWS is left alone too, even at alpha 0 on the live frame — one still on
 * its way in, or one the sky's flight has carried to the edge of its window —
 * because its spot there is not a hidden spot, and it travels on from where it
 * is like any dot the reader can see.
 * @param {Float32Array} buf the live frame (through the tweener's `reframe`)
 * @param {ArrayLike<number>} departing the departing state's layout attrs
 */
export function restateHidden(buf, departing) {
	for (let i = 0; i < EDGE_BASE; i += STRIDE) {
		if (buf[i + 6] > ALPHA_SEEN || departing[i + 6] > ALPHA_SEEN) continue;
		for (let k = 0; k < 6; k++) buf[i + k] = departing[i + k];
	}
}

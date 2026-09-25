// The curved state tween's bows (tween.js `bows`, motion.md rule 15): a
// frame's dots draining into the next one. Every dot bows across its line to
// its seat, to the right of its own heading, so the whole travel turns one way
// — a drain's handedness — and no dot backs up or hangs. How far it bows is
// the lean: a share of the box's shorter side, and never more than a share of
// its own travel, so a slow dot with a short chord takes the full share and a
// fast one crossing the screen from off-canvas is held to the cap, a small
// fraction of its chord. The tween is still the framework's 700ms (rule 10);
// these are shape, not tempo.
//
// A state opts in by naming the origins it curves out of (`curve` in
// states.js) and handing over a builder: `drainBows` for a plain drain, or a
// `bowsInto` with a `sizeOf` for a field of its own — hop-bands.js sizes each
// bow by how much of the sky's flow was carrying the dot across its line.
import { BOW_SIZE, STRIDE } from "./attr-buffer.js";
import { NODE_COUNT } from "./nodes.js";

export const LEAN_CAP = 0.15;
export const LEAN_SHARE = 0.35;

/**
 * Which side of its own heading a dot bows to. The arrival's to choose, not
 * the story's: a crowd draining into a point turns one way and reads as a
 * drain either way round, but a fan opening out of a column reads as a spray
 * only if it rises — bowed to the right, every rightward dot sagged below its
 * line and lifted into place (Owen on 11 → 12, 2026-09-25).
 */
export const RIGHT = 1;
export const LEFT = -1;

/**
 * One bow per node, from the frame the travel sets off from to the arrival's
 * layout; edge groups stay 0. A dot with no travel (still, or parked on its
 * own spot) gets none.
 *
 * @param {Float32Array} live the frame the travel sets off from
 * @param {Float64Array} target the arrival's layout
 * @param {number} w
 * @param {number} h
 * @param {((x: number, y: number, nx: number, ny: number) => number) | null} sizeOf
 *   the share of the lean a dot standing at (x, y) takes, 0–1, given the unit
 *   normal (nx, ny) it bows along; null for the whole lean
 * @param {number} hand RIGHT or LEFT of the dot's heading
 * @returns {Float64Array}
 */
export function bowsInto(live, target, w, h, sizeOf = null, hand = RIGHT) {
	const bows = new Float64Array(BOW_SIZE);
	const cap = LEAN_CAP * Math.min(w, h);
	for (let id = 0; id < NODE_COUNT; id++) {
		const i = id * STRIDE;
		const dx = target[i] - live[i];
		const dy = target[i + 1] - live[i + 1];
		const chord = Math.hypot(dx, dy);
		if (chord < 1) continue;
		// the chord's unit normal to the right of the heading, on a screen
		// whose y runs down, turned to the left for a left hand
		const nx = (-dy / chord) * hand;
		const ny = (dx / chord) * hand;
		const lean = Math.min(cap, chord * LEAN_SHARE);
		const bow = sizeOf ? lean * sizeOf(live[i], live[i + 1], nx, ny) : lean;
		bows[id * 2] = bow * nx;
		bows[id * 2 + 1] = bow * ny;
	}
	return bows;
}

/**
 * The plain drain, turning the given way: every travelling dot takes the
 * whole lean. The builder for an arrival with no field of its own to read — a
 * crowd collapsing onto a bar, fanning out of a column, converging on an
 * origin.
 * @param {number} hand RIGHT or LEFT
 * @returns {import("./states.js").ArrivalCurve["bows"]}
 */
export const drain = (hand) => (live, target, w, h) =>
	bowsInto(live, target, w, h, null, hand);

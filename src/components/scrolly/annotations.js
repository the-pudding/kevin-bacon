// The annotation layer's per-frame decisions: which names a frame shows, the
// tracked entries the HTML labels ride, and the vertical de-collision that
// keeps beside-dot names apart. Pure functions over the frame buffer plus one
// small stateful stacker; nothing here touches the DOM or the story.
import { STRIDE } from "./attr-buffer.js";
import { createLabelDecollider } from "./label-decollide.js";
import { ALPHA_SEEN } from "./render.js";

/**
 * @typedef {Object} TrackedLabel
 * @property {number} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {number} alpha the dot's own alpha
 * @property {number} labelAlpha the name's alpha: the dot's, or 0 while held
 * @property {number} labelOffset vertical nudge from the de-collider
 */

/**
 * Where a name sits when it is not hung below its dot, centred (the default):
 * beside it ("left"/"right", stacked apart by the de-collider below), or still
 * hung below it but running one way from it rather than centred ("belowRight"
 * starts just left of the dot and runs right, "belowLeft" ends just right of it
 * — neither is stacked).
 * @typedef {"left" | "right" | "belowRight" | "belowLeft"} LabelSide
 */

/**
 * The race labels one FRAME shows: the step's own subject, then the labelled
 * dots nearest the centre of Hollywood, up to `top` in all.
 *
 * Ranks on screen-y rather than avg-distance because the two are the same
 * order — the axis is fitted with the record at the top — and y is already in
 * the buffer the frame just wrote, so no curve has to be re-read per frame.
 *
 * The subject is exempt from the cut — a step's ink dot must never be the
 * anonymous one, and raceFull rests on cameras where Hackman is outside the
 * ten nearest the centre — but not from the plot test: a name the draw pass has
 * culled has nothing left to label.
 *
 * A `floor` caps the cut by height as well as by count: a name is only taken
 * while the stack the de-collider will sweep — every kept name pushed at least
 * `gap` below the one above it — still ends on or above it. On a short canvas
 * the stack otherwise runs off the plot and over the year ticks under it.
 *
 * @param {Float32Array | Float64Array} attrs the frame's dot buffer
 * @param {{ highlight?: number[], labelIds: Iterable<number>, onPlot: (id: number) => boolean, top: number, floor?: number | null, gap?: number }} rule
 * @returns {Set<number>}
 */
export function raceLabelCut(
	attrs,
	{ highlight, labelIds, onPlot, top, floor = null, gap = 0 }
) {
	const keep = new Set((highlight ?? []).filter(onPlot));
	// only a subject the frame draws takes room in the stack: a faded one's y
	// still runs on down its curve, off the plot, and would refuse every name
	const ys = [...keep]
		.filter((id) => attrs[id * STRIDE + 6] > ALPHA_SEEN)
		.map((id) => attrs[id * STRIDE + 1]);
	for (const [id, y] of rankedRest(attrs, labelIds, keep, onPlot)) {
		if (keep.size >= top) break;
		ys.push(y);
		if (floor != null && stackBottom(ys, gap) > floor) break;
		keep.add(id);
	}
	return keep;
}

/**
 * The cut's candidates beyond the exempt ones, as [id, y], nearest the top first.
 * @param {Float32Array | Float64Array} attrs
 * @param {Iterable<number>} labelIds
 * @param {Set<number>} keep
 * @param {(id: number) => boolean} onPlot
 */
function rankedRest(attrs, labelIds, keep, onPlot) {
	/** @type {[number, number][]} */
	const rest = [];
	for (const id of labelIds) {
		// a name whose dot the frame has faded out — or whose dot the draw pass
		// is culling off the plot — isn't shown either way, and must not eat one
		// of the slots on its way off the plot
		if (keep.has(id) || attrs[id * STRIDE + 6] <= ALPHA_SEEN || !onPlot(id)) {
			continue;
		}
		rest.push([id, attrs[id * STRIDE + 1]]);
	}
	return rest.sort((a, b) => a[1] - b[1]);
}

/**
 * Where the lowest name of a downward-only stack lands: the de-collider's
 * top-down sweep (label-decollide.js) over these dot ys.
 * @param {number[]} ys
 * @param {number} gap
 */
function stackBottom(ys, gap) {
	let prev = -Infinity;
	for (const y of [...ys].sort((a, b) => a - b)) prev = Math.max(y, prev + gap);
	return prev;
}

/**
 * The tracked entries for one frame: every id any state labels or pulses, read
 * live out of the attr array so the HTML annotations stay glued to their dots
 * mid-tween. A name rides its dot's alpha, except while `shown` leaves it out,
 * while an entry choreography's `gate` has not introduced it yet, or while the
 * arrival lag is holding it (`held`).
 *
 * @param {Float32Array | Float64Array} attrs
 * @param {number[]} ids
 * @param {{ names: (id: number) => string, shown: Set<number>, gate: Set<number> | null, held: Set<number> | null }} rule
 * @returns {TrackedLabel[]}
 */
export function trackLabels(attrs, ids, { names, shown, gate, held }) {
	return ids.map((id) => {
		const i = id * STRIDE;
		const visible =
			shown.has(id) && (!gate || gate.has(id)) && !(held && held.has(id));
		return {
			id,
			name: names(id),
			x: attrs[i],
			y: attrs[i + 1],
			r: attrs[i + 2],
			alpha: attrs[i + 6],
			labelAlpha: visible ? attrs[i + 6] : 0,
			labelOffset: 0
		};
	});
}

/**
 * How long a name's CSS opacity transition runs (`.node-label` in
 * ScrollyVisual reads it as `--label-fade`), and so how long a name that has
 * gone invisible keeps riding its dot before it is frozen.
 */
export const LABEL_FADE_MS = 300;

/**
 * Holds every settled-invisible name on last frame's object, so the keyed
 * `{#each}` the names render from skips its row.
 *
 * Every id any state can label is mounted on every step — hundreds of them, one
 * or two showing — and `trackLabels` builds a fresh entry for each every frame.
 * Handed fresh objects, every row re-rendered and rewrote its style each frame,
 * and every one of those restyles re-resolved the eighty-shadow halo:
 * notes/perf/mobile-perf-review.md, finding 1. A name that cannot be seen has
 * nothing to update, so it is handed back the entry it last rendered.
 *
 * A name stays live — a fresh entry every frame, exactly as before — while it
 * is showing, while it is fading out (`fadeMs` from the frame it went to
 * alpha 0, so the fade still rides its dot), while its text has changed (a new
 * key, a new row), and for `liveId`: the pulse ring reads that dot's own alpha
 * and position out of the entry whether or not its name shows.
 *
 * @param {number} fadeMs
 */
export function createLabelFreezer(fadeMs) {
	/** @type {Map<number, { entry: TrackedLabel, hiddenAt: number | null }>} */
	const last = new Map();
	/**
	 * @param {TrackedLabel[]} labels this frame's entries
	 * @param {number} now ms
	 * @param {number | null} liveId
	 * @returns {TrackedLabel[]}
	 */
	return (labels, now, liveId) =>
		labels.map((t) => {
			const was = last.get(t.id);
			if (!was) {
				// first seen invisible: nothing on screen to fade, frozen from here
				last.set(t.id, {
					entry: t,
					hiddenAt: t.labelAlpha > 0 ? null : -Infinity
				});
				return t;
			}
			if (t.labelAlpha > 0 || t.id === liveId || was.entry.name !== t.name) {
				was.entry = t;
				was.hiddenAt = null;
				return t;
			}
			was.hiddenAt ??= now;
			if (now - was.hiddenAt >= fadeMs) return was.entry;
			was.entry = t;
			return t;
		});
}

/**
 * Whether two frames put every name on the same side, so a frame that changes
 * no side hands the template the map it already has.
 * @param {Record<number, LabelSide>} a
 * @param {Record<number, LabelSide>} b
 */
export function sameSides(a, b) {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((k) => a[k] === b[k]);
}

/**
 * This frame's side for every name on screen: the state's own `labelDirs` for
 * the names it shows, and the side it last had for a name that is on its way
 * out.
 *
 * `labelDirs` belongs to the ARRIVING state, and a name that state no longer
 * labels is still on screen for the length of its fade-out — so reading the
 * live map for it drops it back to the default below-and-centred placement in
 * the frame of the press. That is the flip: "Samuel L. Jackson · 116 films"
 * stepping from beside its dot to under it at 14 → 15, and the eight Gen Z
 * names leaving their right-hand stack to pile up on one column at 23 → 24.
 * A name that is leaving fades out where it stood (motion.md rule 2), so it
 * keeps both the side and the nudge it had on the last frame that showed it.
 *
 * @param {TrackedLabel[]} labels
 * @param {Record<number, LabelSide>} dirs the arriving state's map
 * @param {Map<number, {dir: LabelSide, offset: number}>} lastShown
 * @returns {Record<number, LabelSide>}
 */
function frameSides(labels, dirs, lastShown) {
	/** @type {Record<number, LabelSide>} */
	const side = {};
	for (const t of labels) {
		if (t.labelAlpha > 0) {
			// re-recorded below once this frame's sweep has nudged it
			lastShown.delete(t.id);
			if (dirs[t.id] != null) side[t.id] = dirs[t.id];
			continue;
		}
		const was = lastShown.get(t.id);
		if (was) {
			side[t.id] = was.dir;
			t.labelOffset = was.offset;
		}
	}
	return side;
}

/** @param {LabelSide | undefined} dir whether the stacker nudges a name on this side */
const isBeside = (dir) => dir === "left" || dir === "right";

/**
 * Lifts a stack of beside-dot names as a body by however far its lowest name
 * runs past `floor`, writing the lifted nudges back into `offsets`.
 * @param {TrackedLabel[]} beside
 * @param {Map<number, number>} offsets
 * @param {number} floor
 */
function liftOverFloor(beside, offsets, floor) {
	let over = 0;
	for (const t of beside) {
		over = Math.max(over, t.y + (offsets.get(t.id) ?? 0) - floor);
	}
	if (over <= 0) return;
	for (const [id, off] of offsets) offsets.set(id, off - over);
}

/**
 * Vertical de-collision for beside-dot names (labelDirs "left"/"right"):
 * nudges apart labels whose dots have landed within a line-height of each
 * other, easing the displacement per id so a rank swap slides names past each
 * other instead of snapping. Ported from the pudding-post race-chart.
 *
 * Only beside-dot labels stack — below-dot labels are already x-separated by
 * their own dot. Left and right labels sit on opposite sides of the cloud and
 * never visually collide, so each side de-collides on its own; otherwise a left
 * label can shove a right label down just for sharing a y.
 *
 * The stack only ever grows DOWNWARD, which is free when the names sit in the
 * plot's right-hand gutter. A step whose names lie over the plot passes a
 * `floor`, and the whole set is lifted as a body by any overflow past it —
 * rather than clamping the names that cross the line, which would stop them
 * making room for the ones under them and pile the sweep up behind them.
 *
 * @param {number} gapPx the line-height a name needs
 */
export function createLabelStacker(gapPx) {
	const left = createLabelDecollider();
	const right = createLabelDecollider();
	/**
	 * Each name's side and nudge on the last frame that SHOWED it, so a name
	 * fading out can keep them instead of being re-placed by the state that no
	 * longer labels it (see frameSides).
	 * @type {Map<number, {dir: LabelSide, offset: number}>}
	 */
	const lastShown = new Map();
	return {
		/**
		 * Nudge this frame's beside-dot names apart, writing each one's
		 * `labelOffset`. Returns the names moved, the side every name on screen is
		 * drawn on (departing ones included — the caller places its labels from
		 * this, not from the state's own map) and whether the stack has come to
		 * rest — a de-collider relaxes toward its target a little per frame, so a
		 * caller keeps drawing until it has.
		 * @param {TrackedLabel[]} labels
		 * @param {Record<number, LabelSide>} dirs
		 * @param {number | null} floor
		 */
		stack(labels, dirs, floor) {
			const side = frameSides(labels, dirs, lastShown);
			// every name on screen keeps its side for its fade-out; a beside-dot
			// name's nudge is recorded over this once the sweep below has run
			for (const t of labels) {
				if (t.labelAlpha > 0 && side[t.id] != null) {
					lastShown.set(t.id, { dir: side[t.id], offset: 0 });
				}
			}
			const beside = labels.filter(
				(t) => t.labelAlpha > 0 && isBeside(side[t.id])
			);
			if (beside.length === 0) {
				return { moved: beside, dirs: side, settled: true };
			}
			const offsets = new Map([
				...left(
					beside.filter((t) => side[t.id] === "left"),
					gapPx
				),
				...right(
					beside.filter((t) => side[t.id] === "right"),
					gapPx
				)
			]);
			if (floor != null) liftOverFloor(beside, offsets, floor);
			for (const t of beside) {
				t.labelOffset = offsets.get(t.id) ?? 0;
				lastShown.set(t.id, { dir: side[t.id], offset: t.labelOffset });
			}
			return {
				moved: beside,
				dirs: side,
				settled: left.settled() && right.settled()
			};
		}
	};
}

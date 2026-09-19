// The race chapter's live camera: where the playhead (the year at the plot's
// right edge) and the future strip's frontier are on the canvas RIGHT NOW,
// which every camera writer publishes into per frame (FrameOutput.camera) so a
// later leg or a reader's grab continues from wherever the previous motion
// actually got to; the camera of the race step the reader is leaving,
// snapshotted before the arriving step resets it, so a retrace starts from
// exactly there; and the two things the story reads off it — the hold
// (`story.race.view`, the params a settled chart rests at) and the pan control's
// bounds (`story.race.cam`).
//
// Plain fields, not $state: nothing the story SHOWS depends on them directly.
// The frames they steer are drawn by the choreography that owns them, and the
// render effect reacts to `story.race.view`, which is published at rest.
import {
	racePanBounds,
	raceRestPlayhead,
	getRacePxPerYear,
	RACE_RECENT_EXTENT,
	RACE_DATA_END
} from "./layouts/race.js";

/**
 * @typedef {{ extent: [number, number], frontier?: number, restPlayhead?: number, tailPx?: number, tailYears?: number, minPlayhead?: number, maxPlayhead?: number }} RaceStep
 */

/** @param {Object} story the shared interaction state (story.svelte.js) */
export function createRaceCamera(story) {
	const cam = {
		playhead: RACE_RECENT_EXTENT[1],
		frontier: RACE_DATA_END,
		/** the camera of the race step the reader left; playhead null before any */
		exit: {
			playhead: /** @type {number | null} */ (null),
			frontier: RACE_DATA_END
		},

		/** a frame's camera, from a FrameOutput */
		apply(camera) {
			if (camera.playhead != null) cam.playhead = camera.playhead;
			if (camera.frontier != null) cam.frontier = camera.frontier;
		},

		/** the camera as a hold: the params a settled chart rests at */
		hold() {
			return { playhead: cam.playhead, frontier: cam.frontier };
		},

		/**
		 * The reader has changed state. Remember the departing camera, drop the
		 * story's hold and pan target (a freshly-entered state rests at its own
		 * resting year, and a pan on one step must not leak into the next one's
		 * first grab), and rest on the arriving step's resting camera — its own
		 * declared `restPlayhead`, else the last year its camera may rest on
		 * (raceRestPlayhead); before the canvas is measured a step that pins its
		 * camera by the left edge would resolve against a zero-width plot, so it
		 * rests on its extent's end until `publish` clamps it.
		 * @param {RaceStep | undefined} step the arriving state's race descriptor
		 */
		reset(step, w, h) {
			cam.exit = { playhead: cam.playhead, frontier: cam.frontier };
			if (story.race.view !== null) story.race.view = null;
			if (story.race.scrubYear !== null) story.race.scrubYear = null;
			if (step) {
				cam.playhead =
					w && h
						? raceRestPlayhead(w, h, step)
						: (step.restPlayhead ?? step.extent[1]);
			}
			cam.frontier = step?.frontier ?? RACE_DATA_END;
		},

		/**
		 * Publish the pan control's bounds for `step` — or null off the chapter —
		 * clamping the live camera into them, and retargeting a hold a resize has
		 * put out of range rather than leaving the camera somewhere the reader
		 * can't get back to. One-way by construction: no layout's `params`
		 * selector reads `raceCam`, so this can never feed back into the render
		 * effect. Called at rest points, not per frame.
		 * @param {RaceStep | undefined} step
		 */
		publish(step, w, h) {
			if (!step?.extent || !w || !h) {
				if (story.race.cam !== null) story.race.cam = null;
				return;
			}
			const bounds = racePanBounds(w, h, step, cam.playhead);
			cam.playhead = Math.min(
				bounds.panMax,
				Math.max(bounds.panMin, cam.playhead)
			);
			if (
				story.race.view &&
				Math.abs(story.race.view.playhead - cam.playhead) > 0.01
			) {
				story.race.view = cam.hold();
			}
			story.race.cam = {
				pxPerYear: getRacePxPerYear(),
				playhead: cam.playhead,
				...bounds
			};
		},

		/**
		 * One tick of the reader's pan glide toward `year`: the playhead moves `k`
		 * of the remaining distance (1 = snap), with the target clamped to the
		 * step's bounds — an out-of-range target the eased playhead could never
		 * reach would otherwise keep the glide alive for good. Returns whether it
		 * has caught up.
		 * @param {RaceStep} step
		 * @param {number | null} year the reader's target, null = hold still
		 * @param {number} k
		 */
		glide(step, w, h, year, k) {
			const { panMin, panMax } = racePanBounds(w, h, step, cam.playhead);
			const target = Math.min(panMax, Math.max(panMin, year ?? cam.playhead));
			const diff = target - cam.playhead;
			const caughtUp = Math.abs(diff) < 0.02;
			cam.playhead = caughtUp ? target : cam.playhead + diff * k;
			return caughtUp;
		}
	};
	return cam;
}

import { describe, expect, test } from "vitest";
import { createRaceCamera } from "../race-camera.js";
import { STATE_RACE } from "../states.js";
import {
	raceRestPlayhead,
	racePanBounds,
	RACE_DATA_END,
	RACE_FUTURE_END,
	RACE_REWIND_WAYPOINT_YEAR
} from "../layouts/race.js";

const W = 700;
const H = 820;
const freshStory = () => ({ raceView: null, scrubYear: null, raceCam: null });

describe("createRaceCamera", () => {
	test("a state change remembers the departing camera and rests on the arriving step's", () => {
		const story = freshStory();
		const cam = createRaceCamera(story);
		cam.apply({ playhead: 2010, frontier: RACE_FUTURE_END });
		story.raceView = { playhead: 2010 };
		story.scrubYear = 2011;
		cam.reset(STATE_RACE.raceRecent, W, H);
		expect(cam.exit).toEqual({ playhead: 2010, frontier: RACE_FUTURE_END });
		expect(story.raceView).toBeNull();
		expect(story.scrubYear).toBeNull();
		expect(cam.playhead).toBe(raceRestPlayhead(W, H, STATE_RACE.raceRecent));
		expect(cam.frontier).toBe(RACE_DATA_END);
	});

	test("raceFull rests on the rewind's waypoint by declaration", () => {
		const cam = createRaceCamera(freshStory());
		cam.reset(STATE_RACE.raceFull, W, H);
		expect(cam.playhead).toBe(RACE_REWIND_WAYPOINT_YEAR);
		// ...and before the canvas is measured, too
		cam.reset(STATE_RACE.raceFull, 0, 0);
		expect(cam.playhead).toBe(RACE_REWIND_WAYPOINT_YEAR);
	});

	test("raceFuture opens its strip at rest", () => {
		const cam = createRaceCamera(freshStory());
		cam.reset(STATE_RACE.raceFuture, W, H);
		expect(cam.frontier).toBe(RACE_FUTURE_END);
	});

	test("off the chapter the playhead is left be and the frontier shuts", () => {
		const cam = createRaceCamera(freshStory());
		cam.apply({ playhead: 1999, frontier: RACE_FUTURE_END });
		cam.reset(undefined, W, H);
		expect(cam.playhead).toBe(1999);
		expect(cam.frontier).toBe(RACE_DATA_END);
	});

	test("publish clamps the camera into the step's bounds and retargets a stale hold", () => {
		const story = freshStory();
		const cam = createRaceCamera(story);
		cam.reset(STATE_RACE.raceFull, W, H);
		// a camera run past the end of the data comes back to the ceiling...
		cam.apply({ playhead: 3000 });
		cam.publish(STATE_RACE.raceFull, W, H);
		expect(cam.playhead).toBe(RACE_DATA_END);
		const bounds = racePanBounds(W, H, STATE_RACE.raceFull, cam.playhead);
		expect(story.raceCam).toMatchObject({ playhead: cam.playhead, ...bounds });
		// ...and a hold that no longer matches the camera is rewritten to it
		story.raceView = { playhead: 1990 };
		cam.publish(STATE_RACE.raceFull, W, H);
		expect(story.raceView).toEqual(cam.hold());
		// a hold that does match is left alone, identity included
		const held = story.raceView;
		cam.publish(STATE_RACE.raceFull, W, H);
		expect(story.raceView).toBe(held);
	});

	test("publish off the chapter clears the pan control", () => {
		const story = freshStory();
		story.raceCam = { playhead: 2000 };
		const cam = createRaceCamera(story);
		cam.publish(undefined, W, H);
		expect(story.raceCam).toBeNull();
	});

	test("glide eases toward a clamped target and reports when it has caught up", () => {
		const cam = createRaceCamera(freshStory());
		cam.reset(STATE_RACE.raceFull, W, H);
		const start = cam.playhead;
		expect(cam.glide(STATE_RACE.raceFull, W, H, start + 10, 0.5)).toBe(false);
		expect(cam.playhead).toBeCloseTo(start + 5, 9);
		expect(cam.glide(STATE_RACE.raceFull, W, H, start + 10, 1)).toBe(false);
		expect(cam.playhead).toBe(start + 10);
		expect(cam.glide(STATE_RACE.raceFull, W, H, start + 10, 1)).toBe(true);
		// a target past the ceiling is clamped, so the glide can always catch up
		cam.glide(STATE_RACE.raceFull, W, H, 3000, 1);
		expect(cam.playhead).toBe(RACE_DATA_END);
	});
});

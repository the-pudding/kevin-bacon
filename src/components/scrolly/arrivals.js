// What a step change does to the story before the destination step renders.
// The registry's go() runs prepareArrival with the destination already
// resolved and BEFORE `current` moves (see step-registry.svelte.js), so a
// component that mounts with the step reads the right value at mount —
// PairQuiz decides whether to ask from story.quiz.revealed as it mounts, and a
// post-render $effect would leave it painting the blurred question for a frame
// before being told not to.
import { entryFor, isRankState } from "./states.js";
import { resetGenzLines, resetSimRace, story } from "./story.svelte.js";

/** @typedef {import("./step-registry.svelte.js").Move} Move */

/**
 * Arrival rules by destination state — the states whose arrival changes the
 * story. Every other arrival changes nothing but the step.
 * @type {Record<string, (move: Move) => void>}
 */
const ARRIVALS = {
	// arriving at the quiz backwards means the reader has already been through
	// it, so reveal every pair instead of re-asking (see story.svelte.js).
	// Arriving forwards re-arms the question — and with it the step's gate.
	scatterQuiz: ({ back }) => {
		story.quiz.revealed = back;
	},
	// the simulation rests at zero runs until the reader presses Start, so a
	// reader who walked back out of the chapter and in again gets the race to
	// watch rather than the finished chart under a dead Start button. Forward
	// arrivals from OUTSIDE the state only: the steps inside it that read the
	// result out must keep the settled chart they describe.
	simRace: ({ forward, from }) => {
		if (forward && from !== "simRace") resetSimRace();
	},
	// ...and the same for the Gen Z step, which is one step rather than a
	// chapter: its whole payoff is the draw-on, so an arrival must find the
	// plot empty and the button live. It is `skipback`, so the only arrival
	// there is a forward one.
	raceGenz: ({ forward }) => {
		if (forward) resetGenzLines();
	}
};

/**
 * Stepping back out of the rank chapter resets the guess, so returning to it
 * later starts the guessing game fresh instead of picking up where the reader
 * left off (guessed, or already seeing the reveal) — and re-arms the ladder's
 * fade-in latch (story.rank.revealed), which has to outlive rankFocus, so
 * without this a second walk into rankFocus would mount the ladder already
 * revealed and fade Bacon's bar up over a collapse still tweening underneath.
 */
function leaveRank() {
	story.rank.guesses = [];
	story.rank.gaveUp = false;
	story.rank.revealed = false;
}

/** @param {Move} move */
export function prepareArrival(move) {
	const { to, from, forward, back } = move;
	// A step whose card is held back by its own entry choreography has to have
	// that flag up BEFORE it renders. ScrollyVisual raises it too, but from an
	// effect — one flush too late, which is long enough for the dot bar to mount
	// on the un-held step, start its fade in, and then be told to leave again.
	// The reader sees it flash. Raised here for a FORWARD arrival only, which is
	// the only direction a choreography ever plays on; if the arrival then turns
	// out not to play one (reduced motion, a resize) ScrollyVisual drops it on
	// the same flush, so the hold lasts a frame and nothing waits on it.
	story.entryHeld = forward && entryFor(to, from)?.cardAfter != null;
	// the rank panel only carries over into raceRecent when the reader actually
	// walks there out of the rank chapter — that is the one arrival whose bars
	// collapse into the chart's dots. Reloading straight onto raceRecent, or
	// stepping back to it from raceFull, must not flash the list up over a
	// chart that is already drawn.
	//
	// It then STAYS up for as long as the reader is on raceRecent (both its
	// steps): the collapse is a 500ms clock the canvas is waiting on, and a step
	// taken inside that window used to pull the overlay out from over a canvas
	// parked on the collapsed frame — leaving the bare nodes on screen with the
	// chart never drawn. Only leaving the state hands it back.
	story.rank.handoff =
		to === "raceRecent" && (isRankState(from) || story.rank.handoff);
	if (back && isRankState(from) && !isRankState(to)) leaveRank();
	ARRIVALS[to]?.(move);
}

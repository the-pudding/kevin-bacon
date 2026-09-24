// What a step change does to the story before the destination step renders.
// The registry's go() runs prepareArrival with the destination already
// resolved and BEFORE `current` moves (see step-registry.svelte.js), so a
// component that mounts with the step reads the right value at mount —
// PairQuiz decides whether to ask from story.quiz.revealed as it mounts, and a
// post-render $effect would leave it painting the blurred question for a frame
// before being told not to.
import { isRankState } from "./states.js";
import {
	resetGenzLines,
	resetHopAnchor,
	resetSimRace,
	settleGenzLines,
	settleSimRace,
	story
} from "./story.svelte.js";

/** @typedef {import("./step-registry.svelte.js").Move} Move */

/**
 * Arrival rules by destination state — the states whose arrival changes the
 * story. Every other arrival changes nothing but the step.
 * @type {Record<string, (move: Move) => void>}
 */
const ARRIVALS = {
	// the cycling hop chart always opens on Bacon — the anchor the step before it
	// rests on — so the arrival moves the rows and nothing else, and the cycle is
	// something the reader watches start. Both directions: the step after it is
	// still about Bacon's own number, so stepping back in has the same job.
	// Unpinning with it is the point of doing this at all — a reader who named
	// somebody, walked on and came back would otherwise find the chart frozen on
	// a pick they made minutes ago with no cycle to explain it.
	hopAnchor: () => resetHopAnchor(),
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
	// A BACKWARD arrival is the other half of the same rule, and it was missing:
	// the reader is coming from the steps that read the result out, so the chart
	// they are stepping back onto has to be the finished one those steps
	// describe. Without it a cold `?step=29` and then Previous landed on an
	// empty simulation under prose naming the winner.
	simRace: ({ forward, from }) => {
		if (forward && from !== "simRace") resetSimRace();
		else if (!forward) settleSimRace();
	},
	// ...and the same for the Gen Z step, which is one step rather than a
	// chapter: its whole payoff is the draw-on, so a forward arrival must find
	// the plot empty and the button live, and a backward one — which `skipback`
	// makes possible from the step after it — must find the field drawn.
	raceGenz: ({ forward }) => {
		if (forward) resetGenzLines();
		else settleGenzLines();
	}
};

/**
 * Stepping back out of the rank chapter resets the guess, so returning to it
 * later starts the guessing game fresh instead of picking up where the reader
 * left off (guessed, or already seeing the reveal).
 */
function leaveRank() {
	story.rank.guesses = [];
	story.rank.skipped = false;
}

/** @param {Move} move */
export function prepareArrival(move) {
	const { to, from } = move;
	// Un-land the beat. `settledStep` is only ever written by a landing, so a
	// reader who steps back and returns before the step they stepped back to has
	// landed would find it still naming the step they came back to: landed from
	// the frame of the press, and anything latched on the landing (the rank
	// ladder's fade-in) never sees the change it waits for. Here rather than on
	// every step change: advance() only moves one step on, so every round trip
	// includes a go(), and so a pass through here.
	story.settledStep = -1;
	// ...and the state-scoped twin, for the same reason: stepping networkIntro on
	// to hopSeed and back before hopSeed had landed left it reading
	// "networkIntro", so the tour's dwell started on the frame of the press, over
	// dots still flying home. Only on a change of STATE, because a move between
	// two steps sharing one is not a landing at all — nothing travels, so nothing
	// would settle it again, and the tour across the 0 → 1 join would stop dead.
	if (to !== from) story.settled = null;
	prepareRank(move);
	ARRIVALS[to]?.(move);
}

/**
 * The rank chapter's arrival rules: the ladder's carry-over into raceRecent,
 * its fade-in latch and the guess, for the steps into and out of the chapter.
 * @param {Move} move
 */
function prepareRank({ to, from, back }) {
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
	// Every walk INTO the rank chapter re-arms the ladder's fade-in latch
	// (story.rank.revealed), which has to outlive rankFocus for the handoff into
	// raceRecent. Left up, the ladder mounted already revealed: on a second walk
	// into rankFocus it faded up over a collapse still tweening underneath, and back
	// from raceRecent it faded up in the frame of the press over a race chart
	// that had not begun to leave. Down, Stage raises it once the step lands.
	if (isRankState(to) && !isRankState(from)) story.rank.revealed = false;
	story.rank.bareCanvas = to === "rankReveal" && from === "raceRecent";
}

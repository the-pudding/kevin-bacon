// Shared interaction state for the scrolly story (see notes/scrolly-framework.md
// "Interactive steps"). Step-card UI components write here; ScrollyVisual's
// layout effect reads the fields relevant to the active state, so a change
// re-runs the current layout with a short tween — an interaction is a param
// update, not a step change.
//
// Grouped by the interaction that owns the fields: `intro` (step 1's tour and
// taps), `rank` (the guess-the-rank ladder), `race` (the race chart's camera
// and its Gen Z draw-on), `quiz` (the pair quiz) and `sim` (the simulation
// replay). The four top-level
// fields are the framework's own: what the reader has asked for, what is
// playing, what has landed, and whether a step's prose is still held back.
//
// Five of these interactions gate the story: the reader cannot be carried to
// the step that reads out the answer without doing the thing (the rank guess,
// the race rewind, the quiz, the Gen Z draw-on, the simulation). Two of them
// are their own way out — the control calls the step registry's `advance()` —
// two carry the reader on when their animation lands (`advanceon`), and the
// fifth (the quiz) opens a gate the reader's own Next then walks through. The
// fields below are what those gates are asked about; see `gate` / `skipback` /
// `advanceon` in Step.svelte.
import simStory from "$data/scrolly-story.json";
import { SIM_LABEL_N } from "./cast.js";

const SIM_N_SIMS = simStory.genz.nSims;

export const story = $state({
	/** name of the STATE whose arrival has finished, else null. Set by
	 * ScrollyVisual's settle(), and set-only: stepping away un-arms every gate
	 * on it by itself, because the name stops matching. Read by the things that
	 * genuinely ask a state question — the actor tour and its caption, the rank
	 * ladder's latch. */
	settled: null,
	/** index of the STEP whose arrival has finished, -1 before the first paint.
	 * The step-scoped twin of `settled`, and the signal almost everything that
	 * arrives with a step actually wants.
	 *
	 * A state name cannot answer "has this step landed?", because six steps
	 * share a state with their neighbour — both hopBands steps, both raceRecent
	 * steps, both simRace steps and three of the five scatterCenters steps — so
	 * on the second of any pair `settled` already reads that state before the
	 * arrival has begun. That gap is why the overlay's hold had to be hard-coded
	 * to one state, why `veil` existed for exactly one entry, and why the prose
	 * could only be held back on five steps out of thirty.
	 *
	 * Written only by ScrollyVisual's land(). No layout params selector reads
	 * it, so writing it can never retarget a tween. */
	settledStep: -1,
	/** an entry choreography is running and has not yet reached the leg that
	 * earns its step's prose (see EntryAnim's `cardAfter`). Written by
	 * ScrollyVisual: raised on an arrival that declares one, dropped when that
	 * leg lands, and dropped again by every later arrival, so an interrupted
	 * choreography can never leave a step card silent. `settled` cannot serve
	 * here — it marks the END of a reveal, which for the opening flight is eight
	 * seconds of constellation after the beat the prose is waiting on, and which
	 * a cold start does not reach for just as long. */
	entryHeld: false,
	/** a reader's ask for one of the active state's `requests` (see RequestAnim
	 * in states.js): `kind` names it and `nonce` counts asks, so a second press
	 * of the same button is a fresh ask and the reset back to nothing is not one.
	 * Written by request() below; ScrollyVisual plays it */
	request: { kind: null, nonce: 0 },
	/** the kind of request whose animation is in flight, else null. ScrollyVisual
	 * owns this write; a StartButton reads it to go quiet while its own run
	 * plays. Cleared by a state change that abandons the run, so a reader who
	 * steps away mid-run finds the button live if they come back */
	running: null,

	/** step 1's constellation: the tour in Index.svelte and the reader's taps
	 * (see layouts/intro.js) */
	intro: {
		/** node id whose route(s) to Bacon are highlighted; null = the plain
		 * constellation, which is where the step rests before the tour starts */
		focus: null,
		/** the reader picked an actor themselves, so the automatic tour stands
		 * down and leaves the highlight where they put it. Tapping the highlighted
		 * actor again (or Bacon) clears both and the tour resumes */
		pinned: false,
		/** bumped whenever a tap CLEARS the highlight. The tour watches it to know
		 * the reader dismissed what was on screen, so it leaves the constellation
		 * neutral and restarts its clock instead of carrying on mid-turn. A
		 * counter rather than a flag because a release can leave every other
		 * field as it was — tapping the actor the tour is already showing, or
		 * Bacon, clears a focus off a `pinned` that was false to begin with.
		 *
		 * It exists so the tour never has to READ `focus`, which it writes: an
		 * effect that does both re-runs itself on its own write and skips an
		 * actor every tick. */
		releases: 0
	},

	/** the guess-the-rank ladder (GuessRank, RankBars, layouts/rank.js) */
	rank: {
		/** every actor the reader has guessed, in the order they picked them. The
		 * last one is the current guess (what the list focuses on); the earlier
		 * ones stay named and un-faded, since the reader already knows who they
		 * are */
		guesses: [],
		/** reader gave up instead of guessing #1 */
		gaveUp: false,
		/** `{ x, y, w }` in canvas coordinate space of the hop bar on RankBars'
		 * centered focus row, measured live by RankBars itself — null until it has
		 * mounted and reported a position. The canvas bar tweens to meet that
		 * exact box, so the two are the same strip (see layouts/rank.js) */
		focusBar: null,
		/** `{ cx, top, pitch, bottom }` in canvas coordinate space of RankBars'
		 * rows — the CENTRE of row #1's bar at the list's current scroll (where
		 * the bar collapses to), the px between consecutive rows, and the last y
		 * the opaque panel covers. The race chapter's arrival reads it to place
		 * the canvas copy of each collapsed node on the row its actor occupied in
		 * the list, and to hide the ones sitting past `bottom`, which the reader
		 * never saw as HTML (see the draw-on entry in layouts/race.js); no layout
		 * consumes it, so republishing it as the reader scrolls can't retarget a
		 * tween */
		listRows: null,
		/** true once RankBars' bars have finished collapsing into single nodes
		 * and the HTML overlay has stood down, so the canvas can take the same
		 * nodes over and fly them onto the race chart. RankBars owns the clock
		 * (RANK_COLLAPSE_MS); ScrollyVisual only waits on this flag. Reset when
		 * the reader steps back into the rank chapter. No layout's params
		 * selector reads it, so writing it mid-transition can never retarget a
		 * tween */
		collapsed: false,
		/** the ladder panel has faded in. A latch: it has to outlive rankFocus —
		 * the panel spans the step change into raceRecent — and re-checking
		 * `settled` live would hide it again the moment the reader reaches
		 * rankReveal. Index raises it; the arrival rules re-arm it when the reader
		 * steps back out of the chapter (see arrivals.js) */
		revealed: false,
		/** the ladder carries over into raceRecent. Set by the arrival rules for
		 * the one forward step out of the rank chapter into raceRecent — the
		 * arrival whose bars collapse into the chart's dots — and held for as long
		 * as the reader stays there, so a reload straight onto raceRecent, or a
		 * step back to it from raceFull, never flashes the list up over a chart
		 * that is already drawn */
		handoff: false
	},

	/** the race chart's camera and controls (RaceScrubber, race-camera.js,
	 * layouts/race.js) */
	race: {
		/** optional `{ playhead }` camera override; null = the active race state
		 * rests at the right-hand end of its content extent. It is the *hold*
		 * target written once when the reader releases a pan (ScrollyVisual owns
		 * the write; see scrubbing/scrubYear). */
		view: null,
		/** target playhead year while the reader pans (null = not set) */
		scrubYear: null,
		/** true while the reader is actively dragging the plot or keying the year
		 * slider — ScrollyVisual direct-writes the panned frame per change instead
		 * of tweening */
		scrubbing: false,
		/** the live camera, `{ pxPerYear, panMin, panMax, playhead, pannable }`
		 * or null off the race chapter. One-way — ScrollyVisual is the only
		 * component that knows the canvas width, so it writes this and
		 * RaceScrubber only reads it. No layout consumes it, so there is no
		 * cycle. */
		cam: null,
		/** Gen Z race step: the lines are drawn. The step's one layout param — it
		 * rests with the field NOT on the chart, so the reader's press is what
		 * puts it there — and what the step's `advanceon` watches, so the draw
		 * carries the story on by itself. Written once, at the end of a run, for
		 * the same reason `sim.runs` is: a per-frame write would retarget the
		 * tweener mid-draw. Cleared by resetGenzLines() when the reader walks
		 * into the chapter again */
		genzLinesShown: false
	},

	/** the pair quiz (PairQuiz, layouts/scatters.js) */
	quiz: {
		/** per-pair pick, keyed by pair index → picked pid */
		picks: {},
		/** the reader stepped *back* into the quiz step, so it shows every pair
		 * revealed instead of re-asking. Set (and cleared again on a forwards
		 * arrival) by the step registry's arrival rules, which run before the
		 * step renders so PairQuiz reads the right value at mount. It also opens
		 * the quiz step's forward gate — a reader who reloaded past the quiz and
		 * stepped back has a revealed panel with nothing to answer, and
		 * states.js's `quizDone` is the one predicate both the gate and the panel
		 * read, so they cannot disagree */
		revealed: false
	},

	/** the simulation replay (layouts/sim-race.js) */
	sim: {
		/** how many of the 10,000 recorded runs have been replayed — the chart's
		 * playhead. 0 = the reader hasn't pressed Start yet. Written once per run
		 * (0 or all of them), never per frame: the animation writes the canvas
		 * buffers directly, and a per-frame write here would retarget the tweener
		 * mid-run (see the simulation's request in layouts/sim-race.js). Also
		 * zeroed — with `names`, by resetSimRace() below — when the reader walks
		 * into the chapter again, so the step has a race to watch rather than the
		 * finished chart */
		runs: 0,
		/** how many of the leaders' names the replay has reached (see
		 * SIM_NAMES_AT / simNamesDue — they arrive one at a time, in win order).
		 * Published by the replay's frames, a handful of times per run, because
		 * the layout never sees the live playhead: `runs` is only published when
		 * a run ends */
		names: 0
	}
});

// -- Asking for a reader-triggered animation ---------------------------------
// One caller: the StartButton in the step's own panel, which is the only way
// past that step (see `gate` in Step.svelte). What plays is the active state's
// own declaration (`requests[kind]`, see RequestAnim in states.js); this only
// records the ask.

/** Ask ScrollyVisual to play the active state's request `kind` — the rewind,
 * the simulation replay, the Gen Z draw-on. The state decides whether there is
 * anything left to play. */
export function request(kind) {
	story.request = { kind, nonce: story.request.nonce + 1 };
}

/** Put the Gen Z race step back to the state that asks to be started: the camera
 * panned down onto an empty plot, with the field still to be drawn. Called by
 * the step registry's arrival rules on a forward arrival, so walking into the
 * chapter again re-asks rather than showing the finished chart. */
export function resetGenzLines() {
	story.race.genzLinesShown = false;
}

/** Put the simulation race back to the state that asks to be started: no runs
 * replayed and no winners named. Both fields together, because the two label
 * selectors fall back to `names` whenever `runs` is below the threshold (see
 * layouts/sim-race.js) — zeroing the playhead alone would draw all five winners
 * on a chart collapsed back to the origin. Called by the step registry's
 * arrival rules on a forward arrival into the chapter from outside it; the
 * replay's own `start` (layouts/sim-race.js) zeroes both before a run. */
export function resetSimRace() {
	story.sim.runs = 0;
	story.sim.names = 0;
}

/** Put the Gen Z race step in the state its NEXT step's prose describes: the
 * field drawn. The mirror of resetGenzLines, for a reader who reaches that
 * prose without the draw-on having run — a cold deep link and then Previous.
 * Without it the step reads out a result over an empty plot. */
export function settleGenzLines() {
	story.race.genzLinesShown = true;
}

/** Put the simulation race in the state its own later steps describe: every run
 * replayed and every winner named. The mirror of resetSimRace, and both fields
 * together for that function's reason — the label selectors fall back to
 * `names` below the threshold, so a full playhead with no names draws the
 * finished chart with nobody on it. */
export function settleSimRace() {
	story.sim.runs = SIM_N_SIMS;
	story.sim.names = SIM_LABEL_N;
}

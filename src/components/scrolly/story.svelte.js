// Shared interaction state for the scrolly story (see notes/scrolly-framework.md
// "Interactive steps"). Step-card UI components write here; ScrollyVisual's
// layout effect reads the fields relevant to the active state, so a change
// re-runs the current layout with a short tween — an interaction is a param
// update, not a step change. Every question is skippable: the step after an
// interaction reveals its answer unconditionally. The two Start buttons are not
// questions — the step's own Next presses them (see the request functions at the
// bottom of this file, and Index.svelte's `beforenext` gates).
export const story = $state({
	/** rank ladder: every actor the reader has guessed, in the order they picked
	 * them. The last one is the current guess (what the list focuses on); the
	 * earlier ones stay named and un-faded, since the reader already knows who
	 * they are */
	rankGuesses: [],
	/** rank ladder: reader gave up instead of guessing #1 */
	rankGaveUp: false,
	/** pair quiz: per-pair pick, keyed by pair index → picked pid */
	quizPicks: {},
	/** pair quiz: the reader stepped *back* into the quiz step, so it shows every
	 * pair revealed instead of re-asking — whether they answered or skipped. Set
	 * (and cleared again on a forwards arrival) by Index's navigate(), which runs
	 * before the step renders so PairQuiz reads the right value at mount */
	quizRevealed: false,
	/** prediction scatter: false = film count alone, true = the full model */
	predictInsights: false,
	/** simulation race: how many of the 10,000 recorded runs have been replayed —
	 * the chart's playhead. 0 = the reader hasn't pressed Run yet. Written once
	 * per run (0 or all of them), never per frame: the animation writes the canvas
	 * buffers directly, and a per-frame write here would retarget the tweener
	 * mid-run (see ScrollyVisual's playSimRun) */
	simRuns: 0,
	/** simulation race: a replay is in flight. ScrollyVisual owns this write;
	 * SimRunner only reads it, to disable its buttons */
	simRunning: false,
	/** simulation race: bumped by SimRunner to ask for a replay. A counter rather
	 * than a boolean so pressing Start again re-runs from zero */
	simRunNonce: 0,
	/** simulation race: how many of the leaders' names the replay has reached (see
	 * SIM_NAMES_AT / simNamesDue — they arrive one at a time, in win order).
	 * Written by ScrollyVisual, a handful of times per run, because the layout
	 * never sees the live playhead: `simRuns` is only published when a run ends */
	simNames: 0,
	/** name of the state whose arrival tween has finished, else null. Set by
	 * ScrollyVisual — a layout reads it to hold an interaction back until its
	 * own authored reveal has landed (see layouts/intro.js). Cleared on every
	 * step change, so an interrupted reveal never arms. */
	settled: null,
	/** intro network: node id whose route(s) to Bacon are highlighted; null = the
	 * plain constellation, which is where the step rests before the tour starts.
	 * Written by the tour in Index.svelte and by taps (see layouts/intro.js) */
	introFocus: null,
	/** intro network: the reader picked an actor themselves, so step 1's automatic
	 * tour stands down and leaves the highlight where they put it. Tapping the
	 * highlighted actor again (or Bacon) clears both and the tour resumes */
	introPinned: false,
	/** intro network: bumped whenever a tap CLEARS the highlight. The tour watches
	 * it to know the reader dismissed what was on screen, so it leaves the
	 * constellation neutral and restarts its clock instead of carrying on mid-turn.
	 * A counter rather than a flag because a release can leave every other field as
	 * it was — tapping the actor the tour is already showing, or Bacon, clears a
	 * focus off an `introPinned` that was false to begin with.
	 *
	 * It exists so the tour never has to READ `introFocus`, which it writes: an
	 * effect that does both re-runs itself on its own write and skips an actor
	 * every tick. */
	introReleases: 0,
	/** rank ladder: `{ x, y, w }` in canvas coordinate space of the hop bar on
	 * RankBars' centered focus row, measured live by RankBars itself — null until
	 * it has mounted and reported a position. The canvas bar tweens to meet that
	 * exact box, so the two are the same strip (see layouts/rank.js) */
	rankFocusBar: null,
	/** rank ladder: `{ cx, top, pitch, bottom }` in canvas coordinate space of
	 * RankBars' rows — the CENTRE of row #1's bar at the list's current scroll
	 * (where the bar collapses to), the px between consecutive rows, and the last
	 * y the opaque panel covers. The race chapter's arrival reads it to place the
	 * canvas copy of each collapsed node on the row its actor occupied in the list,
	 * and to hide the ones sitting past `bottom`, which the reader never saw as
	 * HTML (see ScrollyVisual's raceEntry branch); no layout consumes it, so
	 * republishing it as the reader scrolls can't retarget a tween */
	rankListRows: null,
	/** rank ladder: true once RankBars' bars have finished collapsing into single
	 * nodes and the HTML overlay has stood down, so the canvas can take the same
	 * nodes over and fly them onto the race chart. RankBars owns the clock
	 * (RANK_COLLAPSE_MS); ScrollyVisual only waits on this flag. Reset when the
	 * reader steps back into the rank chapter. No layout's params selector reads
	 * it, so writing it mid-transition can never retarget a tween */
	rankCollapsed: false,
	/** race chart: bumped by RaceRewindStart to ask for the raceRecent rewind's
	 * first leg (the backwards camera pan). A counter, not a boolean, for
	 * the same reason as simRunNonce — ScrollyVisual owns the animation, this only
	 * requests it, gated to the raceRecent state */
	raceRewindNonce: 0,
	/** race chart: true while the rewind's first leg is in flight, written by
	 * ScrollyVisual; RaceRewindStart only reads it, to disable its button */
	raceRewinding: false,
	/** race chart: optional `{ playhead }` camera override; null = the active race
	 * state rests at the right-hand end of its content extent. It is the *hold*
	 * target written once when the reader releases a pan (ScrollyVisual owns the
	 * write; see scrubbing/scrubYear). */
	raceView: null,
	/** race chart: target playhead year while the reader pans (null = not set) */
	scrubYear: null,
	/** race chart: true while the reader is actively dragging the plot or keying
	 * the year slider — ScrollyVisual direct-writes the panned frame per change
	 * instead of tweening */
	scrubbing: false,
	/** race chart: the live camera, `{ pxPerYear, panMin, panMax, playhead,
	 * pannable }` or null off the race chapter. One-way — ScrollyVisual is the
	 * only component that knows the canvas width, so it writes this and
	 * RaceScrubber only reads it. No layout consumes it, so there is no cycle. */
	raceCam: null,
	/** race chart, DEV ONLY: bumped by RaceYBandDev.svelte after every edit to the
	 * per-year y band table. The table itself lives in layouts/race.js (set through
	 * setRaceDevBands) so nothing reactive lands in the per-frame path; this is only
	 * the signal that tells ScrollyVisual to drop its cached layouts and redraw. */
	raceYBandsRev: 0,
	/** race chart, DEV ONLY: bumped by RacePxPerYearDev.svelte after every edit to
	 * the x-axis year spacing. The value itself lives in layouts/race.js (set
	 * through setRacePxPerYear) so nothing reactive lands in the per-frame path;
	 * this is only the signal that tells ScrollyVisual to drop its cached layouts
	 * and redraw. */
	racePxPerYearRev: 0
});

// -- Asking for the two reader-triggered animations --------------------------
// Both have two callers now: the Start button in the step's panel, and the same
// step's Next gate, which presses it for a reader who reached for Next instead
// (see Index.svelte's `beforenext` gates). The nonce protocol is written down
// once, here, rather than retyped either side.

/** Ask ScrollyVisual for the race chapter's backwards pan (see raceRewindNonce).
 * ScrollyVisual decides whether there is any pan left to play. */
export function requestRaceRewind() {
	story.raceRewindNonce += 1;
}

/** Ask ScrollyVisual to play the 10,000 recorded simulation runs from zero — the
 * playhead reset and the nonce together are the request (see simRuns /
 * simRunNonce for why both writes land in one flush). */
export function requestSimRun() {
	story.simRuns = 0;
	story.simRunNonce += 1;
}

// Shared interaction state for the scrolly story (see notes/scrolly-framework.md
// "Interactive steps"). Step-card UI components write here; ScrollyVisual's
// layout effect reads the fields relevant to the active state, so a change
// re-runs the current layout with a short tween — an interaction is a param
// update, not a step change. Every interaction is skippable: the step after an
// interaction reveals its answer unconditionally.
export const story = $state({
	/** rank ladder: corpus rank the reader guessed (null = not guessed) */
	rankGuess: null,
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
	/** win-bar breakdown: pid of the bar the reader tapped (null = none) */
	winFocus: null,
	/** name of the state whose arrival tween has finished, else null. Set by
	 * ScrollyVisual — a layout reads it to hold an interaction back until its
	 * own authored reveal has landed (see layouts/intro.js). Cleared on every
	 * step change, so an interrupted reveal never arms. */
	settled: null,
	/** intro network: node id whose route(s) to Bacon are highlighted; null = the
	 * plain constellation, which is where the step rests. Tapping the highlighted
	 * actor again (or Bacon) clears it (see layouts/intro.js) */
	introFocus: null,
	/** rank ladder: `{ x, y, w }` in canvas coordinate space of the hop bar on
	 * RankBars' centered focus row, measured live by RankBars itself — null until
	 * it has mounted and reported a position. The canvas bar tweens to meet that
	 * exact box, so the two are the same strip (see layouts/rank.js) */
	rankFocusBar: null,
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
	raceCam: null
});

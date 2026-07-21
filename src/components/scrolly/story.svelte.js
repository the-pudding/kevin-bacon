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
	/** prediction scatter: false = film count alone, true = the full model */
	predictInsights: false,
	/** win-bar breakdown: pid of the bar the reader tapped (null = none) */
	winFocus: null,
	/** rank ladder: on-screen y (canvas coordinate space) of RankBars' centered
	 * focus row, measured live by RankBars itself — null until it has mounted
	 * and reported a position (see layouts/rank.js) */
	rankFocusY: null,
	/** race chart: optional { window:[y0,y1], domain:[d0,d1] } override for the
	 * windowed/scrubbed frame; null = use the active race state's baked window.
	 * On raceFull it is the *hold* target written once when the reader releases a
	 * scrub (ScrollyVisual owns the write; see scrubbing/scrubYear). */
	raceView: null,
	/** race chart (raceFull): playhead year while scrubbing (null = not set) */
	scrubYear: null,
	/** race chart (raceFull): true while the reader is actively dragging the plot
	 * or keying the year slider — ScrollyVisual direct-writes the pinned-centre
	 * frame per change instead of tweening (see delivery-plan Stage 5) */
	scrubbing: false
});

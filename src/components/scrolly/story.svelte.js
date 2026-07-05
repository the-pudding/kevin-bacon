// Shared interaction state for the scrolly story (see notes/scrolly-framework.md
// "Interactive steps"). Step-card UI components write here; ScrollyVisual's
// layout effect reads the fields relevant to the active state, so a change
// re-runs the current layout with a short tween — an interaction is a param
// update, not a step change. Every interaction is skippable: the step after an
// interaction reveals its answer unconditionally.
export const story = $state({
	/** rank ladder: corpus rank the reader guessed (null = not guessed) */
	rankGuess: null,
	/** pair quiz: per-pair pick, keyed by pair index → picked pid */
	quizPicks: {},
	/** prediction scatter feature toggles */
	predictConcurrence: false,
	predictDegree: false,
	/** win-bar breakdown: pid of the bar the reader tapped (null = none) */
	winFocus: null
});

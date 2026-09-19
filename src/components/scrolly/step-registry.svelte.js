// The step registry: the story's wizard. Every <Step>, <Chapter> and <Splash>
// registers itself here in document order as it mounts, and the reader's
// navigation — the tap gutters and the arrow keys (TapNav), a step's own
// control (StartButton, GuessRank) and a gated step carrying the reader on
// itself (`advanceon`, watched by Index) — all move `current` through it. The
// active step is kept in the URL (?step=N) so each tab keeps its own place
// across refreshes, independently of every other tab on the origin.
//
// Created once by Index.svelte, which puts it in the "scrolly-steps" context
// for the components to read. Runes, so it is created inside a component's
// init; the derived views (chapterStarts, dotSteps, …) are getters over that
// state rather than $derived, so a consumer's own $derived tracks them and the
// registry stays a plain object under test.
import { onMount, untrack } from "svelte";
import urlParams from "$utils/urlParams.js";
import { story } from "./story.svelte.js";

const STEP_PARAM = "step";

/**
 * What a <Step> / <Chapter> / <Splash> registers: the visual state it shows
 * (+ per-step params), an optional `panel` snippet rendered over the canvas
 * while it is active, the three gating fields documented on Step.svelte —
 * `gate` (the reader's Next is refused while it returns false), `skipback` (a
 * backward move passes through this step) and `advanceon` (the step carries
 * the reader on itself) — `hideBar` (drops the progress bar for this step
 * alone), `chapter` for a chapter card's title, or `splash` for the title
 * card's own name-and-how-to-move pair.
 * @typedef {{ state: import("./states.js").VisualState, params?: Object, panel?: import("svelte").Snippet, gate?: () => boolean, skipback?: boolean, advanceon?: () => boolean, hideBar?: boolean, chapter?: { title: string }, splash?: { title: import("svelte").Snippet, cta: import("svelte").Snippet } }} StepConfig
 */

/**
 * A move between steps, as the arrival rules see it: the visual states either
 * side and the reader's direction of travel. `forward` and `back` are both
 * false when the destination is the step the reader is on.
 * @typedef {{ to: string|undefined, from: string|undefined, forward: boolean, back: boolean }} Move
 */

/**
 * The step the URL restored, or null when it carries none. Read synchronously
 * (not in onMount) so it is already correct by the time ScrollyVisual's first
 * paint effect runs; onMount fires too late, after that effect has committed
 * to the state `current` had at mount. Every <Step> registers during the
 * initial render (its registration is plain top-level script, not gated on
 * being the active step — see Step.svelte), so the registry is fully
 * populated by then too, and `current` starting at the restored index (rather
 * than 0, corrected later) is what lets the first paint land directly on the
 * right state instead of flashing `lone` and tweening from it once onMount
 * catches up.
 */
function readStep() {
	if (typeof window === "undefined") return null;
	const n = parseInt(urlParams.get(STEP_PARAM), 10);
	return Number.isInteger(n) ? n : null;
}

/**
 * @param {{ navigate: (move: Move) => void }} hooks `navigate` runs with the
 *   resolved destination BEFORE `current` changes (see `go`), so it can
 *   prepare state the destination step reads on its first render — a
 *   post-render $effect is too late for anything that mounts with the step.
 */
export function createStepRegistry({ navigate }) {
	const restored = readStep();
	let value = $state(restored !== null && restored > 0 ? restored : 0);
	// true only when a saved step from a prior visit exists, so this render
	// isn't the reader's first-ever view. ScrollyVisual uses this to skip the
	// `lone`-authored pop-in, which would otherwise replay (and be misread as an
	// empty chart) on every refresh regardless of which step it lands on
	let coldStart = $state(restored !== null && restored > 0);
	/** @type {StepConfig[]} filled by each step as it mounts, in document order */
	const configs = $state([]);
	// one-way: the reader tapping forward off the last step leaves the wizard
	// for the credits, and there is no path back in (TapNav drops the back
	// gutter along with everything else once this is true)
	let exited = $state(false);

	$effect(() => {
		urlParams.set(STEP_PARAM, value);
	});

	// safety net for a stale/malformed URL (?step past the end of the story):
	// `current` already starts at the restored step, so this only ever corrects
	// it back into range once the step count is known. That correction lands on
	// `lone`, which coldStart would otherwise still be armed for (it was set
	// from the same out-of-range step) — clear it so ScrollyVisual's first paint
	// plays the pop-in instead of settling instantly, as it would for any other
	// genuine first-ever view.
	onMount(() => {
		if (value >= configs.length) {
			value = 0;
			coldStart = false;
		}
	});

	const active = () => configs[value ?? 0];
	const stateAt = (i) => configs[i]?.state;

	/**
	 * A backward move that would land on a `skipback` step passes through it
	 * instead, so the reader never arrives back on the controls behind their
	 * own answer.
	 */
	function resolveBack(to) {
		let dest = to;
		while (dest > 0 && configs[dest].skipback) dest -= 1;
		return dest;
	}

	const steps = {
		/**
		 * One object rather than positional args: a step has six optional kinds
		 * of registration, and `register(s, undefined, undefined, c)` is a call
		 * nobody can read.
		 * @param {StepConfig} config
		 * @returns {number} the step's index
		 */
		register: (config) => configs.push(config) - 1,
		get current() {
			return value;
		},
		get count() {
			return configs.length;
		},
		/** every registration, by step index */
		get configs() {
			return configs;
		},
		/** the active step's registration */
		get config() {
			return active();
		},
		/** the active step's visual state */
		get state() {
			return active()?.state;
		},
		get coldStart() {
			return coldStart;
		},
		// which step each chapter opens on, in order — [3, 12, 20] today. Derived
		// from the registry rather than written down, so inserting a step or a
		// chapter re-segments the progress bar with no edit anywhere else.
		get chapterStarts() {
			return configs.reduce((out, c, i) => (c.chapter ? [...out, i] : out), []);
		},
		get chapter() {
			return active()?.chapter?.title ?? null;
		},
		// ...and while a step's prose is still held back by an entry choreography
		// (story.entryHeld). The bar reports a position, and the reader has not
		// been given one until the words that go with it are on screen — off the
		// title card it would otherwise be up for three seconds before the card
		// speaks, which is the whole of the opening flight.
		get hideBar() {
			return !!active()?.hideBar || story.entryHeld;
		},
		// the active step's gate is shut, so the reader's Next has nothing to do —
		// TapNav reads this to disable the right-hand gutter, so a held step reads
		// as held rather than as a dead tap
		get nextBlocked() {
			const gate = active()?.gate;
			return !!gate && !gate();
		},
		// Which steps own a dot on the progress bar. Neither the title card nor a
		// chapter card is a step the bar claims a dot for — the reader has arrived
		// at the story, not moved through it — and neither is a gated interaction
		// step: it and the step that reads out its answer are one beat to the
		// reader (they cannot arrive at the second without passing the first, and
		// stepping back skips straight over it), so they share the successor's dot
		// rather than making the bar tick twice for one move.
		get dotSteps() {
			return configs.reduce(
				(out, c, i) =>
					c.splash || c.chapter || c.skipback ? out : [...out, i],
				[]
			);
		},
		get dotStep() {
			return active()?.skipback ? (value ?? 0) + 1 : (value ?? 0);
		},
		// Deliberately NOT routed through go() below: this is the in-chapter
		// nudge a step's own control gives itself once its interaction is done
		// (GuessRank on a correct guess or a give-up, the rewind's StartButton,
		// and the effect watching a gated step's `advanceon`). Every one of them
		// moves within a chapter, so none crosses a transition the arrival rules
		// care about — and sending them through go() would put them straight
		// into the gate their own press exists to answer.
		advance: () => {
			if (value < configs.length - 1) value += 1;
		},
		/**
		 * The reader's own navigation — the tap gutters and the arrow keys both
		 * land here, so the gate and everything `navigate` prepares happen for a
		 * tap exactly as they do for a key.
		 *
		 * Two things sit between the press and the move, in this order:
		 *
		 * - `skipback` resolves the real destination first (resolveBack).
		 * - the departing step's `gate` then gets the last word on a FORWARD
		 *   move. While it is shut the press does nothing at all: the step's own
		 *   control is the only way on, and it goes through advance() above.
		 *
		 * `navigate` runs with the resolved destination *before* `current`
		 * changes, so the arrival rules can prepare state the destination step
		 * reads on its first render.
		 * @param {number} to
		 */
		go(to) {
			if (to < 0 || to > configs.length - 1) return;
			const back = to < value;
			const dest = back ? resolveBack(to) : to;
			const gate = configs[value]?.gate;
			if (!back && gate && !gate()) return;
			navigate({
				to: stateAt(dest),
				from: stateAt(value),
				forward: dest > value,
				back: dest < value
			});
			value = dest;
		},
		next: () => steps.go(value + 1),
		prev: () => steps.go(value - 1),
		get exited() {
			return exited;
		},
		// the last step's own forward press, once its gate (if any) is open —
		// TapNav calls this instead of next() at the end of the step list
		exit: () => {
			exited = true;
		}
	};

	// --- a step that carries the reader on itself ---
	// A gated step's own control is the only way past it, and one of them isn't
	// a button press but the thing the press starts: the simulation's 10,000
	// runs ARE the payoff, and the next step names the winner, so the story
	// waits for the race and then moves on by itself. The step declares when
	// that has happened as `advanceon`, and this watches whichever step is
	// active — so a reader who steps away mid-run disarms it by leaving, with
	// no flag to clear.
	//
	// advance() is untracked because it writes the step this effect reads:
	// without it the write re-runs the effect against the step it just left.
	$effect(() => {
		if (active()?.advanceon?.()) untrack(() => steps.advance());
	});

	return steps;
}

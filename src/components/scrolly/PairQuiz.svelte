<script>
	// @ts-check
	// The pair quiz, ported from the Pudding prototype
	// (references/pudding-post/.../distance-films-quiz.js) onto the shared canvas:
	// five "who is closer to the center of Hollywood?" pairs, asked one at a time
	// in the step card under the sentence that sets them up, and answered on the
	// scatter.
	//
	// Picking runs three beats. The two chips MARK in place — a ✓ on the closer
	// of the pair and, if the reader named the other one, a ✗ on theirs — then
	// both FLY onto the graph, each morphing into a dot and landing at its true
	// remoteness position, and the canvas's own dots fade in underneath them
	// before the chips go. Height is still the whole of who is closer (closer =
	// higher); colour is the verdict, and only the dot the reader actually picked
	// carries one (see `verdictRgb` in layouts/scatters.js).
	//
	// It was a `panel` snippet floated over the canvas behind a blurred wash
	// until 2026-09-20 — the last control in the story that was, and the reveal
	// was deliberately neutral (no ✓/✗, no colour). Both are reversed here: the
	// chips are in the card for the reasons notes/design/interactions.md rule 1
	// gives for the three StartButtons and GuessRank before them, and they say
	// how the reader did.
	//
	// Being in the card is also what lets the flight be a plain transform rather
	// than the pinned `position: fixed` it used to need. Nothing is dropped out
	// of flow on a pick now, so there is no reflow to outrun — and a translate is
	// relative to the chip's own box, which a `fixed` chip is not: the step's
	// prose wrapper carries an in:fly transform for its first ~560ms, and a
	// transform makes its element the containing block for fixed descendants, so
	// a pick in that window used to be resolvable against the wrong box.
	import { tick } from "svelte";
	import { story } from "./story.svelte.js";
	import { INTERACTIVE_IDS, nodeName, quizDone } from "./states.js";
	import { quizWinner } from "./layouts/scatters.js";
	import { CROWD, QUIZ_RIGHT, QUIZ_WRONG, rgb } from "./palette.js";
	import {
		HOLD_MS,
		MARK_MS,
		flyToDot,
		prefersReducedMotion
	} from "./fly-to-dot.js";
	import { recordPairPick } from "$utils/analytics.js";

	/** @type {{ visual: any }} */
	let { visual } = $props();

	// MARK_MS is the beat the ✓/✗ is held before the chips leave. The mark stays
	// legible well past it either way — it rides the chip through the first third
	// of the flight, before the squish takes the glyph with it.
	const pairs = INTERACTIVE_IDS.quiz;

	// Where this mount picks up. Past the end (nothing left to ask) when the
	// reader stepped back into this step — quizRevealed — or when every pair is
	// answered; otherwise the first unanswered pair, which resumes a quiz left
	// part-finished by stepping back to an earlier step and forward again.
	//
	// `quizDone` rather than that test spelled out here, because the step's
	// forward gate asks the same question: a quiz with nothing left to ask must
	// be a step the gate lets the reader leave, or they are stuck on it.
	const firstUnanswered = pairs.findIndex(
		(_, idx) => story.quiz.picks[idx] === undefined
	);
	let i = $state(quizDone(story) ? pairs.length : firstUnanswered);
	let phase = $state("asking"); // "asking" | "marking" | "resolving"
	/** which chip the reader tapped, while it is being marked and flown */
	let picked = $state(/** @type {number | null} */ (null));

	/** @type {HTMLButtonElement[]} */
	let cardEls = [];
	/** @type {HTMLElement | undefined} */
	let quizEl = $state();
	/** @type {HTMLElement | undefined} */
	let doneEl = $state();
	// The verdict, said to a screen reader: the ✓/✗ is aria-hidden and the
	// colour is no account at all.
	let verdict = $state("");
	/** @type {ReturnType<typeof setTimeout> | null} */
	let markTimer = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	let destroyed = false;

	$effect(() => () => {
		destroyed = true;
		if (markTimer) clearTimeout(markTimer);
		if (holdTimer) clearTimeout(holdTimer);
	});

	const pair = $derived(i < pairs.length ? pairs[i] : null);
	const winner = $derived(pair ? quizWinner(pair) : null);

	// The reader's score, read back off the same picks the canvas colours its
	// dots from — so the number and the greens on the chart can never disagree.
	const marked = $derived(
		pairs.map((p, idx) => {
			const choice = story.quiz.picks[idx];
			return choice === undefined ? null : [p.a, p.b][choice] === quizWinner(p);
		})
	);
	const answered = $derived(marked.filter((m) => m !== null).length);
	const score = $derived(marked.filter((m) => m === true).length);

	/** the mark a chip wears once the answer is out: a ✓ on the closer of the
	 * two, a ✗ on the reader's chip when that was not the one they named */
	const markOf = (choice, id) =>
		phase === "asking"
			? ""
			: id === winner
				? "✓"
				: choice === picked
					? "✗"
					: "";

	/**
	 * A chip's colour once the answer is out — and its dot's, which is the point:
	 * the chip lands AS that dot, so the two are struck from the same rule
	 * (`verdictRgb`, layouts/scatters.js) or the flight ends in a colour pop.
	 *
	 * Colour says one thing and one thing only: "this is the one you named, and
	 * here is how it went". The chip the reader passed over stays crowd grey
	 * whether or not it was the right answer — the ✓ says that, and loading the
	 * colour with both meanings at once is what would make either unreadable.
	 */
	const colourOf = (choice, id) =>
		choice !== picked ? CROWD : id === winner ? QUIZ_RIGHT : QUIZ_WRONG;

	// The state write and the move onward come FIRST; the analytics write goes
	// LAST, on both paths out of a pick. It is background instrumentation reached
	// from a click handler: anything it throws (blocked site data makes
	// localStorage throw on touch — see $utils/analytics.js) lands in the middle
	// of the pick, and with the order the other way round it took the reader's
	// answer with it. `pairIndex` is captured before `onward`, which may move `i`.
	function settle(choice, onward) {
		const { a, b } = pairs[i];
		const pickedId = [a, b][choice];
		const otherId = [a, b][1 - choice];
		const pairIndex = i;
		story.quiz.picks[i] = choice;
		onward();
		recordPairPick({
			pairIndex,
			pickedId,
			otherId,
			correct: pickedId === quizWinner(pairs[pairIndex])
		});
	}

	// The keyed {#each} mounts the next pair's chips fresh (the flight's
	// transforms need new boxes), so a reader who picked from the keyboard
	// would be left on <body>. Their place moves on with the question: to the
	// next pair's first chip, or to the score once there is none.
	async function advance() {
		holdTimer = null;
		if (destroyed) return;
		const hadFocus = quizEl?.contains(document.activeElement) ?? false;
		i += 1;
		picked = null;
		phase = "asking";
		if (!hadFocus) return;
		await tick();
		if (destroyed) return;
		(pair ? cardEls[0] : doneEl)?.focus();
	}

	function pick(choice) {
		if (phase !== "asking" || !pair) return;
		picked = choice;
		phase = "marking";
		const pickedId = [pair.a, pair.b][choice];
		verdict =
			pickedId === winner
				? `${nodeName(pickedId)}: correct.`
				: `${nodeName(pickedId)}: not quite — ${nodeName(winner)} is closer.`;
		markTimer = setTimeout(() => {
			markTimer = null;
			fly();
		}, MARK_MS);
	}

	async function fly() {
		if (destroyed || !pair) return;
		const choice = /** @type {number} */ (picked);
		const { a, b } = pair;

		// no flight under reduced motion, or before the canvas has tracked the dots
		if (prefersReducedMotion() || !visual?.locate) {
			phase = "resolving";
			settle(choice, advance);
			return;
		}

		// Capture geometry + targets NOW, before a resize can move anything.
		// locate() returns viewport coords; getBoundingClientRect is viewport too.
		// Both options fly — the reader's and the one they passed over.
		const plans = [a, b].map((id, c) => {
			const card = cardEls[c];
			const target = visual.locate(id);
			if (!card || !target) return null;
			return {
				el: card,
				rect: card.getBoundingClientRect(),
				target,
				fill: rgb(colourOf(c, id))
			};
		});

		if (plans.some((p) => !p)) {
			phase = "resolving";
			settle(choice, advance);
			return;
		}

		phase = "resolving";

		// Both chips on one clock (see fly-to-dot.js). Every box and target above
		// was captured before the first animation started, which is that
		// function's stated contract for flying more than one element.
		await Promise.all(plans.map((plan) => flyToDot(plan)));
		if (destroyed) return;

		// Reveal the real canvas dots (the param re-run fades them in), and hold
		// the flown chips in place over that fade so there is no pop, then remove
		// them and ask the next pair.
		settle(choice, () => {
			holdTimer = setTimeout(advance, HOLD_MS);
		});
	}
</script>

<!-- data-owns-arrows: an arrow key on a chip is not the reader asking to
     leave the quiz (TapNav) -->
<div class="quiz" data-owns-arrows bind:this={quizEl}>
	<p class="sr-only" role="status">{verdict}</p>
	<!-- The counter only, and it keeps its line when there is nothing left to
	     count. The score below goes in the chips' box rather than here: that
	     box is already reserved at two chips' worth, so a line of any sensible
	     length lands inside a reservation that is already paid for, where a
	     longer line HERE would wrap and grow the card. -->
	<p class="quiz__status">
		{pair ? `Pair ${i + 1} of ${pairs.length}` : ""}
	</p>
	<!-- The chips' box stays put whether or not it holds chips, and its height is
	     struck from the chip metrics rather than typed out: this is a card-hosted
	     control, and the card's measured height is what half the canvas's bottom
	     clearances are taken off (`stepsHeight` → `overlayHeight`), so a block
	     that shrank as the quiz ran would walk the prose up the screen a pair at
	     a time and take the x-axis title with it. The chips sit abreast, never
	     wrapping to a second row, which would be the same jump by another
	     route; the narrowest supported width is 375px, where the pair fits
	     with each name on two lines (measured 2026-10-06). The two chips'
	     worth of reservation is kept, and is what the sign-off below is
	     written into. -->
	<div class="quiz__cards">
		{#if !pair}
			<!-- The score, and the only thing that tells the reader the step has
			     let go of them: the gate opens silently, the right-hand gutter
			     just stops being disabled.

			     `quizDone` is true either because every pair was answered or
			     because the reader stepped back into a step they had never taken
			     (states.js — a reload straight past the quiz, then Prev). Only
			     the first of those has a score to report; telling the second
			     they got 0 out of 5 would be a lie about something they never
			     did. -->
			<p class="quiz__done" tabindex="-1" bind:this={doneEl}>
				{answered === pairs.length
					? `You got ${score} out of ${pairs.length}.`
					: "Tap on to carry on."}
			</p>
		{:else}
			{#each [pair.a, pair.b] as id, choice (i + "-" + choice)}
				<button
					bind:this={cardEls[choice]}
					class="quiz__card"
					style={phase === "asking"
						? ""
						: `--verdict: ${rgb(colourOf(choice, id))}`}
					type="button"
					aria-disabled={phase !== "asking"}
					onclick={() => pick(choice)}
				>
					{nodeName(id)}
					<span class="quiz__mark" aria-hidden="true">{markOf(choice, id)}</span
					>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* The tap halves cover this block's full width (TapNav), so it takes its
	   presses back — the step card above it is pointer-transparent at --z-card
	   precisely so a control can. Not a z-index lift, for the reason GuessRank's
	   own file gives: the step wrapper's fly transition forms a stacking context
	   that a lift on this element cannot escape at any value; the lift lives up
	   on .scrolly-steps instead (Stage.svelte).

	   Still inset by --control-inset, which is now about the thumb rather than
	   about the layers: both ends of every chip sat exactly where a reader
	   reaching for the next step presses. The prose above stays full width and
	   keeps giving its outer edge up — a tap there is meant to be a step.

	   --chip-h / --chip-gap are here rather than in the two rules that use them
	   so the reserved height below cannot drift from the chips it is reserving
	   for. */
	.quiz {
		--chip-h: var(--48px); /* the minimum tap target on mobile */
		--chip-gap: 0.75rem;
		/* room for the 10px ✓/✗ at 0.5rem from the edge plus a few px clear of
		   the name, and no more: every px of gutter is taken from a name that
		   already wraps to two lines at 375 */
		--mark-gutter: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		/* The same 16px every prose step leaves under its last line — `p` carries
		   `margin: 16px 0` (reset.css) and the column is pinned to the bottom of
		   the layout, so that bottom margin IS the story's gap above the screen
		   edge. A card-hosted control has no such margin of its own and so sat
		   flush on the edge, which is worst exactly where it matters: a 44px tap
		   target with its lower half under a phone's home indicator. Margin
		   rather than padding, so it stays outside the height this block reserves
		   below. */
		margin-bottom: 1rem;
		/* Margin, not padding: this block takes pointer events back (below), and
		   padding is inside the element's own hit box — the inset would swallow
		   the very presses it exists to keep clear. */
		pointer-events: auto;
		/* the prose column carries a halo for the full-bleed states (see
		   .scrolly-steps); a control is a solid object and does not want one */
		text-shadow: none;
	}

	/* min-height, not just a line of text: past the last pair this is empty, and
	   a collapsed counter would take the whole block down with it. In em against
	   its own line-height rather than `lh`, which is newer than this piece needs
	   to be. */
	.quiz__status,
	.quiz__done {
		margin: 0;
		font-family: var(--type-chip-family);
		/* letter-spacing: var(--type-chip-tracking); */
		font-size: 14px;
		line-height: 1.4;
		color: var(--prose-fg);
		-webkit-font-smoothing: antialiased;
	}

	.quiz__status {
		min-height: 1.4em;
		font-family: var(--type-ui-family);
		font-weight: 600;
		margin-right: 10px;
		min-width: 70px;
	}

	.quiz__cards {
		display: flex;
		flex-direction: row;
		gap: var(--chip-gap);
		align-items: center;
		min-height: calc(2 * var(--chip-h) + var(--chip-gap));
	}

	.quiz__card {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--type-chip-family);
		letter-spacing: var(--type-chip-tracking);
		font-size: var(--16px);
		/* the inline padding is the ✓/✗'s gutter (.quiz__mark), on both sides
		   so the name stays centred */
		padding: 0.7rem var(--mark-gutter);
		min-height: var(--chip-h);
		--verdict: var(--control-card-border);
		border: 1px solid var(--verdict);
		border-radius: 2rem;
		background: var(--surface-raised);
		color: var(--prose-fg);
		cursor: pointer;
		height: 48px;
		/* the WAAPI flight drives transform/colour; keep it compositor-friendly */
		will-change: transform;
		-webkit-font-smoothing: antialiased;
	}

	/* A picked chip is aria-disabled at once — it is showing an answer now, not
	   offering a choice — and `pick` refuses a second press. aria- rather than
	   native disabled, which would drop a keyboard reader's focus to <body>.
	   It stays legible through the mark and the flight: no fade, and the
	   cursor stops promising a press. */
	.quiz__card[aria-disabled="true"] {
		cursor: default;
	}

	/* Mouse only, as reset.css's button hover is. A touch leaves :hover on the
	   point it tapped, and the next pair's chips mount under that point — so on
	   a phone the chip where the last pick landed came up wearing the green
	   border, which reads as the answer. */
	@media (hover: hover) and (pointer: fine) {
		.quiz__card:not([aria-disabled="true"]):hover {
			border-color: var(--control-card-hover-border);
		}
	}

	/* Absolutely placed rather than laid out beside the name, so the name is
	   centred in the chip and stays exactly where it was when the mark arrives.
	   Ink, not the verdict colour: the glyph says which actor was the closer one
	   and the colour says which one the reader named, and those are two different
	   questions (see colourOf). */
	.quiz__mark {
		position: absolute;
		right: 0.5rem;
	}
</style>

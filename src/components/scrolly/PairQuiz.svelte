<script>
	// @ts-check
	// Blur-overlay pair quiz, ported from the Pudding prototype
	// (references/pudding-post/.../distance-films-quiz.js) onto the shared canvas.
	// The quiz appears as a blurred overlay ON the scatter, one pair at a time;
	// picking either option flies BOTH cards onto the graph — each morphs into a
	// blue dot and lands at its true avg-distance position, then stays there
	// labelled. Neutral reveal: no ✓/✗, no numbers — the dot's height (closer =
	// higher) is the answer. This is a `panel` snippet rendered over the canvas by
	// Index.svelte (see notes/scrolly-framework.md "Exception").
	import { story } from "./story.svelte.js";
	import { INTERACTIVE_IDS, nodeName } from "./states.js";
	import { BLUE } from "./layout-shared.js";

	/**
	 * @type {{ visual?: { locate: (id: number) => { x: number, y: number } | null } }}
	 */
	let { visual } = $props();

	const PROMPT = "Who is closer to the centre of Hollywood?";
	const FLIGHT_MS = 900;
	const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
	const DOT_DIAMETER = 11; // landing dot is r 5.5; card squishes to this footprint
	const HOLD_MS = 450; // matches ScrollyVisual's PARAM_TWEEN_MS (dot fade-in)
	const DOT_FILL = `rgb(${BLUE.join(", ")})`;

	const pairs = INTERACTIVE_IDS.quiz;

	// first unanswered pair, so stepping back after answering shows the finished
	// (blur-free) state rather than re-asking
	const firstUnanswered = pairs.findIndex(
		(_, idx) => story.quizPicks[idx] === undefined
	);
	let i = $state(firstUnanswered === -1 ? pairs.length : firstUnanswered);
	let phase = $state("asking"); // "asking" | "resolving"

	/** @type {HTMLButtonElement[]} */
	let cardEls = [];
	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	let destroyed = false;

	let reducedMotion = $state(false);
	$effect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => (reducedMotion = query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});

	$effect(() => () => {
		destroyed = true;
		if (holdTimer) clearTimeout(holdTimer);
	});

	const pair = $derived(i < pairs.length ? pairs[i] : null);

	function commit(choice) {
		story.quizPicks[i] = choice;
		advance();
	}

	function advance() {
		holdTimer = null;
		if (destroyed) return;
		i += 1;
		phase = "asking";
	}

	async function pick(choice) {
		if (phase !== "asking" || !pair) return;
		const { a, b } = pair;

		// no flight under reduced motion, or before the canvas has tracked the dots
		if (reducedMotion || !visual?.locate) {
			phase = "resolving";
			commit(choice);
			return;
		}

		// Capture geometry + targets NOW, while the layout is still intact (prompt
		// present) and before a resize can move anything. locate() returns viewport
		// coords; getBoundingClientRect is viewport too. Both options fly.
		const plans = [a, b].map((id, c) => {
			const card = cardEls[c];
			const target = visual.locate(id);
			if (!card || !target) return null;
			return { card, rect: card.getBoundingClientRect(), target };
		});

		if (plans.some((p) => !p)) {
			phase = "resolving";
			commit(choice);
			return;
		}

		// Pin each card at its captured viewport rect BEFORE dropping the prompt —
		// so the flex column reflow can't shift the cards out from under the flight
		// (that shift was landing dots above their true spot). Fixed = viewport
		// space, matching the captured rect and locate()'s coords.
		for (const { card, rect } of plans) {
			card.style.position = "fixed";
			card.style.margin = "0";
			card.style.left = `${rect.left}px`;
			card.style.top = `${rect.top}px`;
			card.style.width = `${rect.width}px`;
			card.style.height = `${rect.height}px`;
			card.style.zIndex = "2";
		}

		phase = "resolving"; // lift the blur + prompt; pinned cards stay put

		// One animation per card: the move and the card→dot morph (text fading out,
		// non-uniform squish to a round DOT_DIAMETER footprint) run on one clock.
		await Promise.all(
			plans.map(({ card, rect, target }) => {
				const dx = target.x - (rect.left + rect.width / 2);
				const dy = target.y - (rect.top + rect.height / 2);
				const sx = DOT_DIAMETER / rect.width;
				const sy = DOT_DIAMETER / rect.height;
				return card.animate(
					[
						{
							transform: "translate(0, 0) scale(1, 1)",
							backgroundColor: "var(--color-bg, #fff)",
							borderColor: "var(--color-gray-400, #999)",
							color: "var(--color-fg, #282828)",
							borderRadius: "2rem"
						},
						{
							transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
							backgroundColor: DOT_FILL,
							borderColor: DOT_FILL,
							color: "transparent",
							borderRadius: "50%"
						}
					],
					{ duration: FLIGHT_MS, easing: EASE, fill: "forwards" }
				).finished;
			})
		);
		if (destroyed) return;

		// Reveal the real canvas dots (param re-run fades them in), and hold the
		// flown cards in place over that fade so there's no pop, then remove them.
		story.quizPicks[i] = choice;
		holdTimer = setTimeout(advance, HOLD_MS);
	}
</script>

{#if pair}
	<div class="quiz" class:asking={phase === "asking"}>
		<div class="quiz__inner">
			{#if phase === "asking"}
				<p class="quiz__prompt">{PROMPT}</p>
			{/if}
			<div class="quiz__cards">
				{#each [pair.a, pair.b] as id, choice (i + "-" + choice)}
					<button
						bind:this={cardEls[choice]}
						class="quiz__card"
						type="button"
						disabled={phase !== "asking"}
						onclick={() => pick(choice)}
					>
						{nodeName(id)}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.quiz {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* let flown cards travel across the whole scatter */
		overflow: visible;
		pointer-events: none;
	}

	/* blur the scatter behind the overlay only while a question is showing */
	.quiz.asking {
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		background: color-mix(in srgb, var(--color-bg, #fff) 55%, transparent);
	}

	.quiz__inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		max-width: min(92%, 30rem);
		text-align: center;
	}

	.quiz__prompt {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.35;
		color: var(--color-gray-900, #222);
	}

	.quiz__cards {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
	}

	.quiz__card {
		pointer-events: auto;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		padding: 0.7rem 1.2rem;
		min-height: 2.75rem; /* comfortable tap target on mobile */
		border: 1px solid var(--color-gray-400, #999);
		border-radius: 2rem;
		background: var(--color-bg, #fff);
		color: var(--color-fg, #282828);
		cursor: pointer;
		/* the WAAPI flight drives transform/colour; keep it compositor-friendly */
		will-change: transform;
	}

	.quiz__card:disabled {
		cursor: default;
	}

	.quiz__card:not(:disabled):hover {
		border-color: var(--color-gray-900, #222);
	}

	/* narrow screens: stack the two options full-width */
	@media (max-width: 30rem) {
		.quiz__cards {
			flex-direction: column;
			width: 100%;
		}

		.quiz__card {
			width: 100%;
		}
	}
</style>

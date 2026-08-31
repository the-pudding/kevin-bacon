<script>
	// @ts-check
	/**
	 * DEV-ONLY tuner for the race chart's x-axis density: pixels between
	 * consecutive year labels (see PX_PER_YEAR's replacement, pxPerYear, in
	 * layouts/race.js).
	 *
	 * It writes the value straight into race.js through setRacePxPerYear (a plain
	 * module variable, so no $state read lands in the per-frame draw path) and
	 * bumps story.racePxPerYearRev, which is ScrollyVisual's cue to drop its
	 * cached layouts and redraw. Same wiring as RaceYBandDev, minus the curve
	 * editor — this is a single scalar.
	 *
	 * Only mounted under `import.meta.env.DEV` (dynamically imported by Index).
	 */
	import { onMount } from "svelte";
	import localStorage from "$utils/localStorage.js";
	import { story } from "./story.svelte.js";
	import { getRacePxPerYear, setRacePxPerYear } from "./layouts/race.js";

	const STORE_KEY = "kb-race-px-per-year";
	const HIDDEN_KEY = "kb-race-px-per-year-hidden";
	const MIN = 20;
	const MAX = 140;
	const SHIPPED = getRacePxPerYear();

	function restore() {
		const saved = localStorage.get(STORE_KEY);
		return Number.isFinite(saved) && saved >= MIN && saved <= MAX
			? saved
			: SHIPPED;
	}

	/** @type {number} the live px-per-year value */
	let px = $state(restore());

	/** install the value and tell ScrollyVisual to drop its cached layouts */
	function commit() {
		setRacePxPerYear(px);
		localStorage.set(STORE_KEY, px);
		story.racePxPerYearRev++;
	}

	// Install whatever the panel opened with, so a restored session reaches the
	// chart before the reader sees a frame drawn off the shipped value.
	onMount(() => {
		if (px !== SHIPPED) commit();
	});

	function onInput(e) {
		px = Number(e.currentTarget.value);
		commit();
	}

	function resetAll() {
		px = SHIPPED;
		commit();
	}

	let hidden = $state(localStorage.get(HIDDEN_KEY) === true);
	function setHidden(v) {
		hidden = v;
		localStorage.set(HIDDEN_KEY, v);
	}
</script>

{#if story.raceCam && hidden}
	<button class="reopen" type="button" onclick={() => setHidden(false)}>
		px/yr
	</button>
{:else if story.raceCam}
	<div class="px-dev">
		<span class="tag">px/yr</span>
		<input
			type="range"
			min={MIN}
			max={MAX}
			step="1"
			value={px}
			oninput={onInput}
		/>
		<output class="value">{px}</output>
		<button type="button" onclick={() => setHidden(true)}>hide</button>
		<button type="button" onclick={resetAll}>reset</button>
	</div>
{/if}

<style>
	/* A small strip hung under the chart, below where RaceYBandDev sits (64%) so
	   both can be open at once without overlapping, and clear of the plot's own
	   x-axis labels (plotBottom is 60% of canvas height, see layout-shared.js). */
	.px-dev {
		position: absolute;
		left: 0;
		right: 0;
		top: 72%;
		z-index: 5;
		padding: 0.35rem 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-bg, #fff);
		border-top: 1px solid var(--color-gray-300, #ccc);
		border-bottom: 1px solid var(--color-gray-300, #ccc);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg, #222);
	}
	.reopen {
		position: absolute;
		right: 0.5rem;
		top: 72%;
		z-index: 5;
		background: var(--color-bg, #fff);
		font-family: var(--font-mono);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.55;
	}
	.reopen:hover {
		opacity: 1;
	}
	.tag {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.6;
	}
	.value {
		min-width: 3ch;
		text-align: right;
	}
	input[type="range"] {
		flex: 1 1 auto;
	}
	button {
		font: inherit;
		color: inherit;
		padding: 0.15rem 0.4rem;
		background: none;
		border: 1px solid var(--color-gray-300, #ccc);
		border-radius: 3px;
		cursor: pointer;
	}
</style>

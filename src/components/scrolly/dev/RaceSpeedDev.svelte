<script>
	// @ts-check
	/**
	 * DEV-ONLY tuner for the race chart's choreographed animation speed: a single
	 * multiplier over every entry draw-on and rewind leg's duration (see
	 * raceTuning.speedScale in layouts/race.js, and `scaled` / rewindMs under its
	 * "Choreographies"). 1 is the originally-tuned pace, >1 slows it down, <1
	 * speeds it up.
	 *
	 * Unlike RacePxPerYearDev/RaceYBandDev, this needs no tuning revision bump:
	 * nothing here is cached by layout — each animation reads the scale once,
	 * when it starts, so a live edit only affects the NEXT triggered animation
	 * (a rewind already in flight keeps the pace it started with).
	 *
	 * Only mounted under `import.meta.env.DEV` (dynamically imported by Index).
	 */
	import { onMount } from "svelte";
	import localStorage from "$utils/localStorage.js";
	import { story } from "../story.svelte.js";
	import { raceTuning } from "../layouts/race.js";

	const STORE_KEY = "kb-race-speed-scale";
	const HIDDEN_KEY = "kb-race-speed-scale-hidden";
	const MIN = 0.5;
	const MAX = 3;
	const SHIPPED = raceTuning.speedScale;

	function restore() {
		const saved = localStorage.get(STORE_KEY);
		return Number.isFinite(saved) && saved >= MIN && saved <= MAX
			? saved
			: SHIPPED;
	}

	/** @type {number} the live speed-scale value */
	let scale = $state(restore());
	onMount(() => {
		if (scale !== SHIPPED) raceTuning.speedScale = scale;
	});

	function onInput(e) {
		scale = Number(e.currentTarget.value);
		raceTuning.speedScale = scale;
		localStorage.set(STORE_KEY, scale);
	}

	function resetAll() {
		scale = SHIPPED;
		raceTuning.speedScale = scale;
		localStorage.set(STORE_KEY, scale);
	}

	let hidden = $state(localStorage.get(HIDDEN_KEY) === true);
	function setHidden(v) {
		hidden = v;
		localStorage.set(HIDDEN_KEY, v);
	}
</script>

{#if story.race.cam && hidden}
	<button class="reopen" type="button" onclick={() => setHidden(false)}>
		speed
	</button>
{:else if story.race.cam}
	<div class="speed-dev">
		<span class="tag">speed</span>
		<input
			type="range"
			min={MIN}
			max={MAX}
			step="0.1"
			value={scale}
			oninput={onInput}
		/>
		<output class="value">{scale.toFixed(1)}x</output>
		<button type="button" onclick={() => setHidden(true)}>hide</button>
		<button type="button" onclick={resetAll}>reset</button>
	</div>
{/if}

<style>
	/* A small strip hung under the chart, below RacePxPerYearDev's (72%) so all
	   three dev panels can be open at once without overlapping. */
	.speed-dev {
		position: absolute;
		left: 0;
		right: 0;
		top: 80%;
		z-index: var(--z-tap-above);
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
		top: 80%;
		z-index: var(--z-tap-above);
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
		min-width: 3.5ch;
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

<script>
	// @ts-check
	/**
	 * DEV-ONLY switch for the race chart's y axis: swap the camera fit
	 * (raceWindowYFit in layouts/race.js — the record at the top, the y band's
	 * worth of chasing field under it) for two literal constants.
	 *
	 * It exists to settle PRD item P-08-1, which asks for exactly that and which
	 * nobody can judge from the code. "fixed" off is the chart as it ships, so the
	 * panel is a side-by-side rather than a change.
	 *
	 * The bounds go straight into race.js through setRaceDevFixedYFit (a plain
	 * module variable, so no $state read lands in the per-frame draw path) and
	 * bump story.raceFixedYRev, which is ScrollyVisual's cue to drop its cached
	 * layouts and redraw. Same wiring as RaceYBandDev and RacePxPerYearDev.
	 *
	 * Only mounted under `import.meta.env.DEV` (dynamically imported by Index).
	 */
	import { onMount } from "svelte";
	import localStorage from "$utils/localStorage.js";
	import { story } from "./story.svelte.js";
	import { setRaceDevFixedYFit } from "./layouts/race.js";

	const STORE_KEY = "kb-race-fixed-y";
	const HIDDEN_KEY = "kb-race-fixed-y-hidden";
	// The range each slider covers. The record itself runs 2.256 (1980) to 2.087
	// (2025) and the widest bottom the shipped band ever reaches is 2.381, at the
	// 1980 pan floor — so the two spans bracket every edge the camera fit
	// currently produces, with room either side to overshoot it.
	const TOP_MIN = 2.0;
	const TOP_MAX = 2.3;
	const BOTTOM_MIN = 2.15;
	const BOTTOM_MAX = 2.6;
	const STEP = 0.005;
	// what the panel opens on: 2.40 clears every camera's current bottom edge, and
	// 2.05 sits just above the record's lowest point (2.084, in 2021)
	const SEED_TOP = 2.05;
	const SEED_BOTTOM = 2.4;

	function restore() {
		const saved = localStorage.get(STORE_KEY);
		const ok =
			saved &&
			typeof saved === "object" &&
			Number.isFinite(saved.top) &&
			Number.isFinite(saved.bottom) &&
			saved.top < saved.bottom;
		return ok
			? { on: saved.on === true, top: saved.top, bottom: saved.bottom }
			: { on: false, top: SEED_TOP, bottom: SEED_BOTTOM };
	}

	const SAVED = restore();
	/** @type {boolean} whether the axis is pinned at all; off is the shipped chart */
	let on = $state(SAVED.on);
	/** @type {number} the plot's top edge — the LOWER avg distance of the two */
	let top = $state(SAVED.top);
	/** @type {number} the plot's bottom edge */
	let bottom = $state(SAVED.bottom);

	/** install the bounds and tell ScrollyVisual to drop its cached layouts */
	function commit() {
		setRaceDevFixedYFit(on ? [top, bottom] : null);
		localStorage.set(STORE_KEY, { on, top, bottom });
		story.raceFixedYRev++;
	}

	// Install whatever the panel opened with, so a restored session reaches the
	// chart before the reader sees a frame drawn off the camera fit. Only ask for
	// the redraw when the axis is actually pinned: off is the shipped chart, and a
	// bump raised while no layout has changed lands in ScrollyVisual's catch-all,
	// which snaps whatever arrival is in flight straight to its end.
	onMount(() => {
		if (on) commit();
	});

	// The two bounds may not cross: an inverted domain flips the whole plot, and
	// a zero-height one divides by nothing. The slider being dragged gives way.
	function onTop(e) {
		top = Math.min(Number(e.currentTarget.value), bottom - STEP);
		commit();
	}

	function onBottom(e) {
		bottom = Math.max(Number(e.currentTarget.value), top + STEP);
		commit();
	}

	function toggle() {
		on = !on;
		commit();
	}

	function resetAll() {
		on = false;
		top = SEED_TOP;
		bottom = SEED_BOTTOM;
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
		fixed y
	</button>
{:else if story.raceCam}
	<div class="fixed-y-dev">
		<span class="tag">fixed y</span>
		<button type="button" class="toggle" class:active={on} onclick={toggle}>
			{on ? "on" : "off"}
		</button>
		<span class="edge">top</span>
		<input
			type="range"
			min={TOP_MIN}
			max={TOP_MAX}
			step={STEP}
			value={top}
			disabled={!on}
			oninput={onTop}
		/>
		<output class="value">{top.toFixed(3)}</output>
		<span class="edge">bottom</span>
		<input
			type="range"
			min={BOTTOM_MIN}
			max={BOTTOM_MAX}
			step={STEP}
			value={bottom}
			disabled={!on}
			oninput={onBottom}
		/>
		<output class="value">{bottom.toFixed(3)}</output>
		<button type="button" onclick={() => setHidden(true)}>hide</button>
		<button type="button" onclick={resetAll}>reset</button>
	</div>
{/if}

<style>
	/* A strip hung under the chart, below RaceSpeedDev (80%) so all four race
	   panels can be open at once without overlapping. */
	.fixed-y-dev {
		position: absolute;
		left: 0;
		right: 0;
		top: 88%;
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
		top: 88%;
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
		display: flex;
		align-items: center;
		gap: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.6;
		white-space: nowrap;
	}
	.edge {
		opacity: 0.5;
	}
	/* the panel's own on/off switch, inverted when live. A checkbox can't do this
	   job here: styles/reset.css strips `appearance` from every input and only
	   restores it for type="range", so one would draw as a blank chip that reads
	   the same in both states. */
	.toggle.active {
		background: var(--color-fg, #222);
		color: var(--color-bg, #fff);
		border-color: var(--color-fg, #222);
	}
	.value {
		min-width: 5ch;
		text-align: right;
	}
	input[type="range"] {
		flex: 1 1 auto;
	}
	input[type="range"]:disabled {
		opacity: 0.4;
	}
	button {
		font: inherit;
		/* the global reset paints every button as a solid dark chip with white
		   text (styles/reset.css); this panel wants a bare outlined one, so the
		   foreground has to come back with the background */
		color: inherit;
		padding: 0.15rem 0.4rem;
		background: none;
		border: 1px solid var(--color-gray-300, #ccc);
		border-radius: 3px;
		cursor: pointer;
	}
</style>

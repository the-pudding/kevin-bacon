<script>
	// @ts-check
	/**
	 * raceFull year scrubber (delivery-plan Stage 5). Two controls over one
	 * playhead year: a full-plot pointer drag surface and a bits-ui year Slider
	 * (keyboard-accessible). Both write `story.scrubYear`/`story.scrubbing` only —
	 * ScrollyVisual owns the buffer writes and the on-release `raceView` hold.
	 * While `scrubbing` is true it direct-writes the pinned-centre frame per change
	 * (no easing), so this needs no motion logic of its own.
	 */
	import Slider from "$components/ui/Slider.svelte";
	import { RACE_SCRUB_BOUNDS } from "./layouts/race.js";
	import { story } from "./story.svelte.js";

	const [MIN, MAX] = RACE_SCRUB_BOUNDS;
	// playhead year; canonical UI value, mirrored into story.scrubYear on change
	let value = $state(MAX);
	/** @type {HTMLElement | undefined} */
	let surface = $state();
	let dragging = false;

	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

	function yearFromX(clientX) {
		if (!surface) return value;
		const rect = surface.getBoundingClientRect();
		const t = clamp((clientX - rect.left) / rect.width, 0, 1);
		return Math.round(MIN + t * (MAX - MIN));
	}
	function scrubTo(clientX) {
		const y = yearFromX(clientX);
		value = y;
		story.scrubYear = y;
	}
	function onPointerDown(e) {
		dragging = true;
		surface?.setPointerCapture(e.pointerId);
		story.scrubbing = true;
		scrubTo(e.clientX);
	}
	function onPointerMove(e) {
		if (dragging) scrubTo(e.clientX);
	}
	function endDrag(e) {
		if (!dragging) return;
		dragging = false;
		if (surface?.hasPointerCapture?.(e.pointerId))
			surface.releasePointerCapture(e.pointerId);
		story.scrubbing = false;
	}

	// slider (keyboard/click): same playhead, same scrubbing/hold protocol
	function onSlide(v) {
		value = v;
		story.scrubbing = true;
		story.scrubYear = v;
	}
	function onCommit() {
		story.scrubbing = false;
	}
</script>

<div class="race-scrubber">
	<!-- pointer-only enhancement over the accessible Slider below; hidden from AT
	     (the Slider is the operable, keyboard-driven control) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drag-surface"
		aria-hidden="true"
		bind:this={surface}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={endDrag}
		onpointercancel={endDrag}
	></div>
	<div class="control">
		<output class="year">{value}</output>
		<Slider
			{value}
			class="race-slider"
			min={MIN}
			max={MAX}
			step={1}
			onValueChange={onSlide}
			onValueCommit={onCommit}
		/>
	</div>
</div>

<style>
	.race-scrubber {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}
	/* covers the plot so the reader can wind the timeline from anywhere; pan-y
	   lets a vertical swipe still scroll the page */
	.drag-surface {
		flex: 1 1 auto;
		touch-action: pan-y;
		cursor: ew-resize;
	}
	.control {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1rem 0.5rem;
	}
	.control :global(.bits-slider) {
		flex: 1 1 auto;
	}
	.year {
		flex: none;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.9rem;
		color: var(--color-fg, #222);
		min-width: 4ch;
		text-align: right;
	}
</style>

<script>
	// @ts-check
	/**
	 * Race-chapter pan control. Two controls over one playhead year: a pointer
	 * drag surface over the plot and a bits-ui year Slider (keyboard-accessible).
	 * Both write `story.scrubYear`/`story.scrubbing` only — ScrollyVisual owns the
	 * buffer writes and the on-release `raceView` hold.
	 *
	 * The x axis is fixed-scale (PX_PER_YEAR px per year, see layouts/race.js), so
	 * the drag is a RELATIVE pan: a year travels exactly as far as the finger, the
	 * way a map does. Bounds and the live playhead come from `story.raceCam`, which
	 * ScrollyVisual publishes because only it knows the canvas width.
	 */
	import Slider from "$components/ui/Slider.svelte";
	import { story } from "./story.svelte.js";

	const cam = $derived(story.raceCam);
	// playhead the reader is aiming at; falls back to the published camera whenever
	// they aren't driving it (a step change, a choreography, a resize re-clamp)
	const value = $derived(story.scrubYear ?? cam?.playhead ?? 0);

	/** @type {HTMLElement | undefined} */
	let surface = $state();
	// pointer origin of the live drag: where it started, and the playhead it
	// started from — a relative pan needs both
	let from = null;

	const clamp = (v) => Math.min(cam.panMax, Math.max(cam.panMin, v));

	function onPointerDown(e) {
		if (!cam?.pannable) return;
		from = { x: e.clientX, playhead: cam.playhead };
		surface?.setPointerCapture(e.pointerId);
		story.scrubbing = true;
	}
	function onPointerMove(e) {
		if (!from) return;
		// drag right → the content follows the finger → earlier years
		story.scrubYear = clamp(
			from.playhead - (e.clientX - from.x) / cam.pxPerYear
		);
	}
	function endDrag(e) {
		if (!from) return;
		from = null;
		if (surface?.hasPointerCapture?.(e.pointerId))
			surface.releasePointerCapture(e.pointerId);
		story.scrubbing = false;
	}

	// slider (keyboard/click): same playhead, same scrubbing/hold protocol
	function onSlide(v) {
		story.scrubbing = true;
		story.scrubYear = clamp(v);
	}
	function onCommit() {
		story.scrubbing = false;
	}
</script>

{#if cam?.pannable}
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
			<output class="year">{Math.round(value)}</output>
			<Slider
				{value}
				class="race-slider"
				min={cam.panMin}
				max={cam.panMax}
				step={1}
				onValueChange={onSlide}
				onValueCommit={onCommit}
			/>
		</div>
	</div>
{/if}

<style>
	.race-scrubber {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}
	/* covers the plot so the reader can pan the timeline from anywhere; pan-y
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

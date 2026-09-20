<script>
	// @ts-check
	/**
	 * Race-chapter pan control. Two controls over one playhead year: a pointer
	 * drag surface over the plot and a bits-ui year Slider (keyboard-accessible).
	 * Both write `story.race.scrubYear`/`story.race.scrubbing` only — ScrollyVisual owns the
	 * buffer writes and the on-release `raceView` hold.
	 *
	 * The x axis is fixed-scale (PX_PER_YEAR px per year, see layouts/race.js), so
	 * the drag is a RELATIVE pan: a year travels exactly as far as the finger, the
	 * way a map does. Bounds and the live playhead come from `story.race.cam`, which
	 * ScrollyVisual publishes because only it knows the canvas width.
	 */
	import Slider from "$components/ui/Slider.svelte";
	import { story } from "./story.svelte.js";

	const cam = $derived(story.race.cam);
	// playhead the reader is aiming at; falls back to the published camera whenever
	// they aren't driving it (a step change, a choreography, a resize re-clamp)
	const value = $derived(story.race.scrubYear ?? cam?.playhead ?? 0);
	// The Slider's own domain is whole years, and every value it is handed has to
	// BE one: the camera's bounds and playhead are fractional (a step's resting
	// camera is its extent start + however many years the viewport shows), and
	// bits-ui snaps a
	// value that isn't on its step grid by writing the snapped one back through
	// onValueChange — indistinguishable here from the reader moving the control, so
	// the mount of a freshly-arrived step would announce a scrub nobody started
	// (and never commit it, leaving story.race.scrubbing stuck on). The grid is rounded
	// OUTWARD so it always spans at least one whole year however wide the viewport
	// makes the camera; onSlide clamps the year it yields back to the real bounds,
	// so the two ends of the track still mean exactly panMin and panMax.
	const sliderMin = $derived(Math.floor(cam?.panMin ?? 0));
	const sliderMax = $derived(Math.ceil(cam?.panMax ?? 0));
	const sliderValue = $derived(Math.round(value));

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
		story.race.scrubbing = true;
	}
	function onPointerMove(e) {
		if (!from) return;
		// drag right → the content follows the finger → earlier years
		story.race.scrubYear = clamp(
			from.playhead - (e.clientX - from.x) / cam.pxPerYear
		);
	}
	function endDrag(e) {
		if (!from) return;
		from = null;
		if (surface?.hasPointerCapture?.(e.pointerId))
			surface.releasePointerCapture(e.pointerId);
		story.race.scrubbing = false;
	}

	// slider (keyboard/click): same playhead, same scrubbing/hold protocol
	function onSlide(v) {
		story.race.scrubbing = true;
		story.race.scrubYear = clamp(v);
	}
	function onCommit() {
		story.race.scrubbing = false;
	}
</script>

{#if cam?.pannable}
	<div class="race-scrubber">
		<!-- pointer-only enhancement over the accessible Slider below; hidden from AT
		     (the Slider is the operable, keyboard-driven control) -->
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
				value={sliderValue}
				class="race-slider"
				min={sliderMin}
				max={sliderMax}
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
	   lets a vertical swipe still scroll the page.

	   Opts back in: the panel layer this renders into is pointer-events:none
	   (Stage.svelte), so without this the whole scrubber is inert and the
	   canvas takes every press. Unpositioned, so it stays in the z-auto paint
	   layer and the tap gutters (--z-tap) still cover it where they overlap —
	   which is the asymmetry the .control note below describes. */
	.drag-surface {
		flex: 1 1 auto;
		pointer-events: auto;
		touch-action: pan-y;
		cursor: ew-resize;
	}
	/* The one part of the scrubber that beats the tap gutters. .drag-surface
	   above deliberately loses to them — panning is a centre-of-the-chart
	   gesture — but the slider track runs the full width, and a tap on its far
	   end is how the reader jumps to the earliest or latest year. Needs
	   position for the z-index to apply. */
	.control {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1rem 0.5rem;
		position: relative;
		z-index: var(--z-tap-above);
	}
	/* The track is the only operable thing in the row, so it is the only part
	   that takes pointer events — the row itself stays transparent to them, so
	   a press on the year readout or the row's padding still reaches the gutter
	   underneath. Same idiom as Index's .route and ScrollyVisual's .hits: a
	   pointer-events:none container, lifted, whose one child opts in. */
	.control :global(.bits-slider) {
		flex: 1 1 auto;
		pointer-events: auto;
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

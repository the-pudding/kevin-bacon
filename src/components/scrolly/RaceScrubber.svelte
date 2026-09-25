<script>
	// @ts-check
	/**
	 * Race-chapter pan control. Two controls over one playhead year: a pointer
	 * drag surface over the plot and a native year range input (keyboard-accessible).
	 * Both write `story.race.scrubYear`/`story.race.scrubbing` only — ScrollyVisual owns the
	 * buffer writes and the on-release `raceView` hold.
	 *
	 * The x axis is fixed-scale (PX_PER_YEAR px per year, see layouts/race.js), so
	 * the drag is a RELATIVE pan: a year travels exactly as far as the finger, the
	 * way a map does. Bounds and the live playhead come from `story.race.cam`, which
	 * ScrollyVisual publishes because only it knows the canvas width.
	 */
	import { story } from "./story.svelte.js";

	const cam = $derived(story.race.cam);
	// playhead the reader is aiming at; falls back to the published camera whenever
	// they aren't driving it (a step change, a choreography, a resize re-clamp)
	const value = $derived(story.race.scrubYear ?? cam?.playhead ?? 0);
	// The range's own domain is whole years, and every value it is handed is one:
	// the camera's bounds and playhead are fractional (a step's resting camera is
	// its extent start + however many years the viewport shows), and a range input
	// silently sanitises an off-grid value onto its step grid, so the grid is made
	// explicit here rather than left to the browser. It is rounded OUTWARD so it
	// always spans at least one whole year however wide the viewport makes the
	// camera; onSlide clamps the year it yields back to the real bounds, so the two
	// ends of the track still mean exactly panMin and panMax.
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

	// range (keyboard/press): same playhead, same scrubbing/hold protocol.
	// `input` fires on every move; `change` on release, or on each key press.
	function onSlide(e) {
		story.race.scrubbing = true;
		story.race.scrubYear = clamp(Number(e.currentTarget.value));
	}
	function onCommit() {
		story.race.scrubbing = false;
	}
</script>

{#if cam?.pannable}
	<div class="race-scrubber">
		<!-- pointer-only enhancement over the accessible range below; hidden from AT
		     (the range is the operable, keyboard-driven control) -->
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
			<!-- min/max before value: a value set first is clamped to the default
			     0–100 domain before the real bounds arrive -->
			<input
				type="range"
				class="race-slider"
				aria-label="Year"
				min={sliderMin}
				max={sliderMax}
				step="1"
				value={sliderValue}
				oninput={onSlide}
				onchange={onCommit}
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
	/* pan-y lets a vertical swipe still scroll the page.

	   Opts back in: the panel layer this renders into is pointer-events:none
	   (Stage.svelte), so without this the whole scrubber is inert and the
	   canvas takes every press. Unpositioned, so it stays in the z-auto paint
	   layer and the tap halves (--z-tap) cover it — which since the halves went
	   edge to edge (TapNav) means they cover ALL of it: dragging the plot no
	   longer pans, and the year slider below is the way to scrub. Kept, rather
	   than lifted, because lifting it would hand the whole plot to the scrubber
	   and leave the race steps with nowhere left to tap on. */
	.drag-surface {
		flex: 1 1 auto;
		pointer-events: auto;
		touch-action: pan-y;
		cursor: ew-resize;
	}
	/* The one part of the scrubber that beats the tap halves, and so the only
	   way to move the timeline: .drag-surface above loses to them everywhere.
	   The slider track runs the full width, and a tap on its far end is how the
	   reader jumps to the earliest or latest year. Needs position for the
	   z-index to apply. */
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
	   a press on the year readout or the row's padding still reaches the half
	   underneath. Same idiom as Index's .route and ScrollyVisual's .hits: a
	   pointer-events:none container, lifted, whose one child opts in. */
	.race-slider {
		flex: 1 1 auto;
		min-width: 0;
		/* the minimum tap target on mobile; the track stays centred in it */
		height: var(--48px);
		margin: 0;
		accent-color: var(--control-scrubber);
		cursor: pointer;
		pointer-events: auto;
	}
	.year {
		flex: none;
		white-space: nowrap;
		font-family: var(--type-chart-family);
		letter-spacing: var(--type-chart-tracking);
		font-variant-numeric: tabular-nums;
		font-size: 0.9rem;
		color: var(--chart-readout);
		min-width: 4ch;
		text-align: right;
	}
</style>

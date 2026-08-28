<script>
	// @ts-check
	/**
	 * DEV-ONLY curve editor for the race chart's y band.
	 *
	 * The band is the gap between the crown (the top of the plot) and the bottom
	 * edge — how much of the chasing field comes along with the record. It is a
	 * curve over the years, held as a handful of control points and interpolated
	 * by the same monotone cubic the chart's own lines use (see layouts/race.js).
	 *
	 * This panel draws that curve: drag a point to reshape it, click the plot to
	 * add one, alt-click a point to drop it. The curve the chart ships with
	 * (RACE_Y_BAND_POINTS) stays on screen as a dashed ghost to measure edits
	 * against, and the year currently on the chart's right edge rides along as a
	 * vertical marker, so you can see which part of the curve you're looking at in
	 * the real chart. "copy" emits a replacement for that table.
	 *
	 * It writes the points straight into race.js through setRaceDevBands (a plain
	 * module variable, so no $state read lands in the per-frame draw path) and
	 * bumps story.raceYBandsRev, which is ScrollyVisual's cue to drop its cached
	 * layouts and redraw.
	 *
	 * Only mounted under `import.meta.env.DEV` (dynamically imported by Index).
	 */
	import { onMount, tick } from "svelte";
	import localStorage from "$utils/localStorage.js";
	import { story } from "./story.svelte.js";
	import {
		RACE_BAND_FIRST,
		RACE_BAND_LAST,
		RACE_Y_BAND_POINTS,
		setRaceDevBands
	} from "./layouts/race.js";
	import { monotoneSegments, curveYAt } from "./layout-shared.js";

	const STORE_KEY = "kb-race-y-band-points";
	const HIDDEN_KEY = "kb-race-y-band-hidden";
	// the editor's own axes. The y ceiling clears the tallest point the shipped
	// curve reaches (0.1121 at 1980) with room to pull one above it.
	const BAND_MAX = 0.15;
	const BAND_MIN = 0.005;
	// The editor is a full-width strip, so its SVG is sized in REAL pixels off the
	// measured container rather than scaled from a fixed viewBox: at 1:1 the
	// stroke widths and label sizes mean the same thing at every viewport, and a
	// wide screen gets more years of resolution instead of a taller box.
	const PLOT = { h: 120, left: 38, top: 8, right: 10, bottom: 16 };
	const X0 = PLOT.left;
	const Y0 = PLOT.top;
	const Y1 = PLOT.h - PLOT.bottom;
	/** measured width of the strip; 0 until the first layout pass */
	let plotW = $state(0);
	const X1 = $derived(Math.max(X0 + 1, plotW - PLOT.right));

	const xOf = (year) =>
		X0 +
		((year - RACE_BAND_FIRST) / (RACE_BAND_LAST - RACE_BAND_FIRST)) * (X1 - X0);
	const yOf = (band) => Y1 - (band / BAND_MAX) * (Y1 - Y0);
	const yearAt = (px) =>
		RACE_BAND_FIRST +
		((px - X0) / (X1 - X0)) * (RACE_BAND_LAST - RACE_BAND_FIRST);
	const bandAt = (py) => ((Y1 - py) / (Y1 - Y0)) * BAND_MAX;
	const clampYear = (y) =>
		Math.min(RACE_BAND_LAST, Math.max(RACE_BAND_FIRST, Math.round(y)));
	const clampBand = (b) =>
		Math.round(Math.min(BAND_MAX, Math.max(BAND_MIN, b)) * 1e4) / 1e4;

	/** the curve the chart actually ships with — what the editor opens on, and
	 * what "reset" goes back to */
	function seedPoints() {
		return RACE_Y_BAND_POINTS.map(
			(p) => /** @type {[number, number]} */ ([p[0], p[1]])
		);
	}

	/** @type {[number, number][]} the live control points, ascending in year */
	let points = $state(restore());

	/**
	 * A saved curve only counts if it still parses as ascending [year, band]
	 * pairs — a stale or hand-mangled one would put the monotone interpolation
	 * into a state it can't draw.
	 */
	function restore() {
		const saved = localStorage.get(STORE_KEY);
		const ok =
			Array.isArray(saved) &&
			saved.length > 1 &&
			saved.every(
				(p, k) =>
					Array.isArray(p) &&
					p.length === 2 &&
					Number.isFinite(p[0]) &&
					Number.isFinite(p[1]) &&
					(k === 0 || p[0] > saved[k - 1][0])
			);
		return ok
			? saved.map((p) => /** @type {[number, number]} */ ([p[0], p[1]]))
			: seedPoints();
	}

	/**
	 * Hand the curve to race.js, persist it, and tell ScrollyVisual to redraw.
	 * Snapshotted rather than passed by reference: race.js reads it on every frame
	 * and has no business touching a reactive proxy.
	 *
	 * Called explicitly by every mutator rather than from an $effect — an effect
	 * that both reads and bumps raceYBandsRev would re-trigger itself forever.
	 */
	function commit() {
		const snap = $state.snapshot(points);
		setRaceDevBands(snap);
		localStorage.set(STORE_KEY, snap);
		story.raceYBandsRev++;
	}
	// install whatever the editor opened with: with no saved edits that is the
	// shipped table and this changes nothing, but a restored session has to reach
	// the chart before the reader sees a frame drawn off the shipped curve
	onMount(commit);

	// ---- the two curves the editor draws -------------------------------------

	/** the shipped curve, as a ghost to measure edits against */
	const shippedPath = $derived.by(() => {
		const segs = monotoneSegments(seedPoints());
		let d = "";
		for (let y = RACE_BAND_FIRST; y <= RACE_BAND_LAST; y += 0.5) {
			d += `${d ? "L" : "M"}${xOf(y).toFixed(1)} ${yOf(curveYAt(segs, y)).toFixed(1)}`;
		}
		return d;
	});

	/**
	 * The live curve, sampled through the SAME monotone interpolation race.js
	 * will use. Drawing a polyline through the control points instead would show
	 * you a shape the chart doesn't have.
	 */
	const curvePath = $derived.by(() => {
		const segs = monotoneSegments($state.snapshot(points));
		let d = "";
		for (let y = RACE_BAND_FIRST; y <= RACE_BAND_LAST; y += 0.5) {
			d += `${d ? "L" : "M"}${xOf(y).toFixed(1)} ${yOf(curveYAt(segs, y)).toFixed(1)}`;
		}
		return d;
	});

	// ---- camera readout -------------------------------------------------------

	const cam = $derived(story.raceCam);
	/** the year on the chart's right edge — where in the curve you're standing */
	const year = $derived(story.scrubYear ?? cam?.playhead ?? RACE_BAND_LAST);
	const liveBand = $derived.by(() =>
		curveYAt(monotoneSegments($state.snapshot(points)), year)
	);

	// ---- show / hide ----------------------------------------------------------

	// Hiding only takes the editor off screen — the curve it installed stays
	// installed, so you can hide the strip to look at the chart it is shaping
	// without the shape changing under you. Persisted so it survives a reload.
	let hidden = $state(localStorage.get(HIDDEN_KEY) === true);
	function setHidden(v) {
		hidden = v;
		localStorage.set(HIDDEN_KEY, v);
	}

	// ---- editing --------------------------------------------------------------

	/** @type {SVGSVGElement | undefined} */
	let svg = $state();
	/** index of the point being dragged, or null */
	let dragging = $state(null);

	// the SVG is drawn 1:1 in CSS pixels, so client coords map straight across
	function localPoint(e) {
		const r = svg.getBoundingClientRect();
		return { px: e.clientX - r.left, py: e.clientY - r.top };
	}

	function onPointDown(e, k) {
		e.stopPropagation();
		// alt-click drops a point; the curve needs two to stay a curve
		if (e.altKey) {
			if (points.length > 2) {
				points.splice(k, 1);
				commit();
			}
			return;
		}
		dragging = k;
		svg.setPointerCapture(e.pointerId);
	}

	function onMove(e) {
		if (dragging === null) return;
		const { px, py } = localPoint(e);
		const k = dragging;
		// a point may not pass its neighbours: the interpolation needs the years
		// strictly ascending, and swapping two handles mid-drag is unreadable anyway
		const lo = k === 0 ? RACE_BAND_FIRST : points[k - 1][0] + 1;
		const hi = k === points.length - 1 ? RACE_BAND_LAST : points[k + 1][0] - 1;
		points[k] = [
			Math.min(hi, Math.max(lo, clampYear(yearAt(px)))),
			clampBand(bandAt(py))
		];
		commit();
	}

	function onUp(e) {
		if (dragging === null) return;
		dragging = null;
		if (svg.hasPointerCapture?.(e.pointerId))
			svg.releasePointerCapture(e.pointerId);
	}

	/** click on open plot: add a control point there */
	function onPlotDown(e) {
		const { px, py } = localPoint(e);
		const y = clampYear(yearAt(px));
		if (points.some((p) => p[0] === y)) return;
		const k = points.findIndex((p) => p[0] > y);
		points.splice(k === -1 ? points.length : k, 0, [y, clampBand(bandAt(py))]);
		commit();
	}

	function resetAll() {
		points = seedPoints();
		commit();
	}

	// stepping the camera by whole years: RaceScrubber only mounts on raceFull, so
	// the panel needs its own way to walk the timeline on the other race steps.
	// Same scrub protocol — announce, move, release.
	//
	// The release waits a tick: ScrollyVisual starts its glide loop from an $effect
	// on story.scrubbing, so clearing the flag in the same flush would mean the
	// effect only ever sees `false` and the camera never moves. Once the loop is
	// running it self-drives to the target either way.
	async function stepYear(delta) {
		if (!cam) return;
		const next = Math.min(
			cam.panMax,
			Math.max(cam.panMin, (story.scrubYear ?? cam.playhead) + delta)
		);
		story.scrubbing = true;
		story.scrubYear = next;
		await tick();
		story.scrubbing = false;
	}

	let copied = $state(false);
	/** the curve as a ready-to-paste declaration for race.js */
	async function copyPoints() {
		const rows = points.map(([y, b]) => `\t[${y}, ${b.toFixed(4)}]`);
		const text = `// The y band over the years, as monotone-cubic control points.\nconst RACE_Y_BAND_POINTS = [\n${rows.join(",\n")}\n];\n`;
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}

	// y gridlines at round hundredths
	const GRID = [0.03, 0.06, 0.09, 0.12];
</script>

{#if cam && hidden}
	<!-- the way back: without this the only way to reopen the editor would be to
	     clear its localStorage key by hand -->
	<button class="reopen" type="button" onclick={() => setHidden(false)}>
		y band
	</button>
{:else if cam}
	<div class="ybands-dev">
		<div class="editor-wrap" bind:clientWidth={plotW}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				bind:this={svg}
				class="editor"
				width={plotW}
				height={PLOT.h}
				onpointerdown={onPlotDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
			>
				<!-- y grid + labels -->
				{#each GRID as g}
					<line class="grid" x1={X0} x2={X1} y1={yOf(g)} y2={yOf(g)} />
					<text class="axis" x={X0 - 4} y={yOf(g) + 3} text-anchor="end"
						>{g.toFixed(2)}</text
					>
				{/each}
				<!-- x labels at the decades -->
				{#each [1980, 1990, 2000, 2010, 2020] as t}
					<line class="grid" x1={xOf(t)} x2={xOf(t)} y1={Y0} y2={Y1} />
					<text class="axis" x={xOf(t)} y={Y1 + 12} text-anchor="middle"
						>{t}</text
					>
				{/each}

				<!-- where the real chart is standing right now -->
				<line class="playhead" x1={xOf(year)} x2={xOf(year)} y1={Y0} y2={Y1} />
				<circle
					class="playhead-dot"
					cx={xOf(year)}
					cy={yOf(liveBand)}
					r="2.5"
				/>

				<path class="shipped" d={shippedPath} />
				<path class="curve" d={curvePath} />

				{#each points as p, k}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<circle
						class="handle"
						class:active={dragging === k}
						cx={xOf(p[0])}
						cy={yOf(p[1])}
						r="4.5"
						onpointerdown={(e) => onPointDown(e, k)}
					/>
				{/each}
			</svg>
		</div>

		<div class="row">
			<span class="tag">y band</span>
			<button type="button" onclick={() => stepYear(-1)} title="earlier year"
				>−</button
			>
			<output class="year">{Math.round(year)}</output>
			<button type="button" onclick={() => stepYear(1)} title="later year"
				>+</button
			>
			<span class="meta">
				band {liveBand.toFixed(4)} · {points.length} pts
			</span>
			<span class="hint">click to add · alt-click to drop</span>
			<button type="button" onclick={() => setHidden(true)}>hide</button>
			<button type="button" onclick={resetAll}>reset</button>
			<button type="button" onclick={copyPoints}>
				{copied ? "copied" : "copy"}
			</button>
		</div>
	</div>
{/if}

<style>
	/* A full-width strip hung just under the chart. The race plot bottom is 60% of
	   the canvas height (plotBottom in layout-shared.js) and its x labels sit 10px
	   below that, so 64% clears both. It is anchored by its TOP and sized by its
	   content, which leaves the foot of the page — where Wizard's Previous/Next
	   live — uncovered; what it does cover is the story copy, the right thing to
	   lose while tuning. */
	.ybands-dev {
		position: absolute;
		left: 0;
		right: 0;
		top: 64%;
		z-index: 5;
		padding: 0.35rem 0.75rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: var(--color-bg, #fff);
		border-top: 1px solid var(--color-gray-300, #ccc);
		border-bottom: 1px solid var(--color-gray-300, #ccc);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg, #222);
	}
	/* the hidden state's only affordance: small enough to sit over the chart's
	   bottom-right gutter without covering a line */
	.reopen {
		position: absolute;
		right: 0.5rem;
		top: 64%;
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

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tag {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.6;
	}
	.year {
		min-width: 4ch;
		text-align: center;
	}
	.meta {
		opacity: 0.7;
	}
	.hint {
		flex: 1 1 auto;
		text-align: right;
		opacity: 0.5;
	}

	.editor-wrap {
		width: 100%;
	}
	.editor {
		display: block;
		touch-action: none;
		cursor: crosshair;
	}
	.grid {
		stroke: var(--color-gray-200, #e5e5e5);
		stroke-width: 1;
	}
	.axis {
		font-size: 7px;
		fill: var(--color-fg, #222);
		opacity: 0.5;
	}
	.shipped {
		fill: none;
		stroke: var(--color-fg, #222);
		stroke-width: 1;
		stroke-dasharray: 2 2;
		opacity: 0.35;
	}
	.curve {
		fill: none;
		stroke: var(--color-fg, #222);
		stroke-width: 1.5;
	}
	.playhead {
		stroke: var(--color-red, #c0392b);
		stroke-width: 1;
		opacity: 0.5;
	}
	.playhead-dot {
		fill: var(--color-red, #c0392b);
	}
	.handle {
		fill: var(--color-bg, #fff);
		stroke: var(--color-fg, #222);
		stroke-width: 1.5;
		cursor: grab;
	}
	.handle.active {
		fill: var(--color-fg, #222);
		cursor: grabbing;
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

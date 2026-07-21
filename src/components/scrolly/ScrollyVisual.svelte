<script>
	// @ts-check
	import { makeNodes } from "./nodes.js";
	import { createTweener } from "./tween.js";
	import {
		ATTR_SIZE,
		DELAY_SIZE,
		STRIDE,
		EDGE_BASE,
		STATES,
		OVERLAYS,
		STATE_LABELS,
		STATE_LABEL_DIRS,
		STATE_PULSE,
		STATE_PARAMS,
		STATE_REVEAL_FROM,
		STATE_SEED,
		STATE_TRACKED,
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META
	} from "./states.js";
	import { MARGIN, plotBottom } from "./layout-shared.js";
	import { story } from "./story.svelte.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, params?: Object, stepsHeight?: number }} */
	let { state: stateName, params, stepsHeight = 0 } = $props();

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	// interaction inside a state (params change): quicker, direct retarget
	const PARAM_TWEEN_MS = 450;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	// delays for a skipped reveal (see STATE_REVEAL_FROM below): dots retarget
	// in unison, but edges hold back until the dots have mostly landed — edges
	// draw toward their endpoints' *final* spots, so fading them in earlier
	// strings lines between mid-flight dots and far-away destinations
	const SKIP_REVEAL_DELAYS = new Float64Array(DELAY_SIZE);
	SKIP_REVEAL_DELAYS.fill(TWEEN_MS * 0.75, nodes.length);
	// edges draw outward from the anchor: orient each from its lower-hop end so
	// the line grows from Bacon toward the outer actor
	const edgeEnds = edges.map(({ source, target }) =>
		nodes[source].hop <= nodes[target].hop ? [source, target] : [target, source]
	);
	// every id any state labels or pulses — tracked out of the attr array each
	// frame so the HTML annotations stay glued to their dots mid-tween.
	// Dynamic label states (function values) declare their possible ids in
	// STATE_TRACKED instead.
	const TRACKED_IDS = [
		...new Set([
			...Object.values(STATE_LABELS).filter(Array.isArray).flat(),
			...Object.values(STATE_PULSE),
			...STATE_TRACKED
		])
	];
	const tweener = createTweener(ATTR_SIZE, drawScene, STRIDE);
	// trails (race/career lines) tween on their own array so polylines morph
	// with the same interruption-safe semantics as dots
	const trailTweener = createTweener(TRAIL_SIZE, drawScene, TRAIL_STRIDE);
	// last trail target, kept so states without trails fade them out in place
	let lastTrailTarget = null;
	const TAU = Math.PI * 2;
	// one Path2D per (quantised rgb, alpha bucket): batches ~1k dots into a
	// handful of fills instead of a fillStyle + fill per dot
	const dotBuckets = new Map();

	// layouts are pure in (state, w, h, params) — cache so re-visited states
	// skip both the recompute and the per-call Float64Array allocation; the
	// tweener only reads the result, never mutates it. `params` merges the
	// step's static params with the interaction fields the state consumes
	// (STATE_PARAMS selector), so an interaction re-runs the current layout.
	const layoutCache = new Map();
	function layoutFor(name, w, h, layoutParams) {
		const key = `${name}:${w}:${h}:${JSON.stringify(layoutParams) ?? ""}`;
		let result = layoutCache.get(key);
		if (!result) {
			result = STATES[name](nodes, w, h, edges, layoutParams);
			layoutCache.set(key, result);
		}
		return result;
	}

	let canvas = $state();
	/** @type {HTMLElement | undefined} */
	let container = $state();
	let width = $state(0);
	let height = $state(0);
	let reducedMotion = $state(false);
	/** @type {{ id: number, name: string, x: number, y: number, r: number, alpha: number }[]} */
	let tracked = $state([]);
	// static per-state chart furniture (ticks/callouts/legend) from the layout result
	/** @type {{ axes?: { x?: {pos:number,label:string}[], y?: {pos:number,label:string}[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[], legend?: import("./layout-shared.js").LegendItem[], legendY?: number } | null} */
	let decor = $state(null);

	let ctx = null;
	let prevState = null;
	let prevParamsKey = null;
	let prevW = 0;
	let prevH = 0;
	let entered = false;

	const overlay = $derived(OVERLAYS[stateName]);
	// what the active layout actually varies on: the state's selector plucks
	// the interaction fields it consumes (reading the `story` $state proxy
	// here makes the layout effect re-run when those fields change)
	const layoutParams = $derived(
		STATE_PARAMS[stateName]?.(story, params) ?? params ?? null
	);
	// vertical centre of the rotated y-axis title. Every scatter/line layout maps
	// its y-domain onto the full plot area (top ≈ MARGIN+8 → plotBottom), so the
	// plot-area centre IS the axis centre. NB the even-step tick labels don't reach
	// the padded domain edges, so a (firstTick+lastTick)/2 would sit off-centre —
	// use the plot bounds directly. This is the y-range of the plot, not half the
	// tall canvas.
	const yLabelTop = $derived(
		height ? (MARGIN + 8 + plotBottom(height)) / 2 : 0
	);
	// x-axis title sits just under the plot, but never behind the step card: on
	// long-prose steps the card climbs into the plot, so clamp the title up to
	// stay above it (text-shadow keeps it legible over any dots it then overlaps)
	const xLabelTop = $derived(
		height ? Math.min(plotBottom(height) + 32, height - stepsHeight - 24) : 0
	);
	const labelIds = $derived.by(() => {
		const spec = STATE_LABELS[stateName];
		return new Set(
			typeof spec === "function" ? spec(layoutParams) : (spec ?? [])
		);
	});
	// per-node label placement overrides ("left"/"right" beside the dot instead
	// of the default below-and-centred)
	const labelDirs = $derived(STATE_LABEL_DIRS[stateName] ?? {});
	const pulseId = $derived(STATE_PULSE[stateName] ?? null);
	// keeps the ring anchored to the last center actor while it fades out
	let lastPulseId = $state(null);
	$effect(() => {
		if (pulseId != null) lastPulseId = pulseId;
	});
	const ring = $derived(tracked.find((t) => t.id === lastPulseId));

	// Pudding's scatter.locate(): the live on-canvas position of a tracked dot, in
	// VIEWPORT coordinates (canvas-relative x/y + the container's bounding rect), so
	// callers don't have to share the canvas's offset parent. Used by the pair-quiz
	// panel to fly option cards onto their true dot positions. null until the id has
	// been tracked at least once. Quiz ids are always tracked (STATE_TRACKED) and
	// never move on a pick, so this is a stable flight target.
	export function locate(id) {
		const t = tracked.find((entry) => entry.id === id);
		if (!t || !container) return null;
		const rect = container.getBoundingClientRect();
		return { x: rect.left + t.x, y: rect.top + t.y };
	}

	function drawScene() {
		if (!ctx) return;
		const attrs = tweener.current;
		const trailAttrs = trailTweener.current;
		ctx.clearRect(0, 0, width, height);
		// trails under everything: race/career lines, prediction diagonal
		for (let t = 0; t < TRAIL_META.length; t++) {
			const base = t * TRAIL_STRIDE;
			const alpha = trailAttrs[base + TRAIL_POINTS * 2];
			if (alpha <= 0.008) continue;
			const { rgb, width: lw } = TRAIL_META[t];
			ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
			ctx.lineWidth = lw;
			ctx.beginPath();
			ctx.moveTo(trailAttrs[base], trailAttrs[base + 1]);
			for (let k = 1; k < TRAIL_POINTS; k++) {
				ctx.lineTo(trailAttrs[base + k * 2], trailAttrs[base + k * 2 + 1]);
			}
			ctx.stroke();
		}
		ctx.lineWidth = 1;
		// a live (target alpha > 0) line's endpoint is drawn at its final spot
		// (not its live position) so the line points to where the actor is going
		// and the actor slides onto it, instead of the angle swinging as the
		// actor tweens into place; a dying line (faded out in the target state)
		// tracks both live dots instead — the target state's endpoint positions
		// belong to a layout this edge isn't part of
		const target = layoutFor(stateName, width, height, layoutParams).attrs;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			const progress = attrs[i];
			const alpha = attrs[i + 1];
			if (alpha <= 0.004 || progress <= 0.004) continue;
			const [from, to] = edgeEnds[e];
			const dying = target[i + 1] <= 0.004;
			const xa = attrs[from * STRIDE];
			const ya = attrs[from * STRIDE + 1];
			const xb = dying ? attrs[to * STRIDE] : target[to * STRIDE];
			const yb = dying ? attrs[to * STRIDE + 1] : target[to * STRIDE + 1];
			ctx.strokeStyle = `rgba(120, 120, 120, ${alpha})`;
			ctx.beginPath();
			ctx.moveTo(xa, ya);
			ctx.lineTo(xa + (xb - xa) * progress, ya + (yb - ya) * progress);
			ctx.stroke();
		}
		dotBuckets.clear();
		for (let i = 0; i < EDGE_BASE; i += STRIDE) {
			const alpha = attrs[i + 6];
			if (alpha <= 0.004) continue;
			const rB = attrs[i + 3] >> 4;
			const gB = attrs[i + 4] >> 4;
			const bB = attrs[i + 5] >> 4;
			const aB = alpha >= 1 ? 15 : (alpha * 16) | 0;
			const key = (rB << 12) | (gB << 8) | (bB << 4) | aB;
			let bucket = dotBuckets.get(key);
			if (!bucket) {
				bucket = {
					path: new Path2D(),
					style: `rgba(${(rB << 4) | 8}, ${(gB << 4) | 8}, ${(bB << 4) | 8}, ${(aB + 0.5) / 16})`
				};
				dotBuckets.set(key, bucket);
			}
			const x = attrs[i];
			const y = attrs[i + 1];
			const r = attrs[i + 2];
			// moveTo before arc so consecutive circles aren't joined by a chord
			bucket.path.moveTo(x + r, y);
			bucket.path.arc(x, y, r, 0, TAU);
		}
		for (const { path, style } of dotBuckets.values()) {
			ctx.fillStyle = style;
			ctx.fill(path);
		}
		tracked = TRACKED_IDS.map((id) => ({
			id,
			name: nodes[id].name,
			x: attrs[id * STRIDE],
			y: attrs[id * STRIDE + 1],
			r: attrs[id * STRIDE + 2],
			alpha: attrs[id * STRIDE + 6]
		}));
	}

	$effect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => (reducedMotion = query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});

	$effect(() => {
		if (!canvas || !width || !height || !stateName) return;
		const resized = width !== prevW || height !== prevH;
		if (resized) {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx = canvas.getContext("2d");
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			prevW = width;
			prevH = height;
		}
		const paramsKey = JSON.stringify(layoutParams) ?? "";
		const layout = layoutFor(stateName, width, height, layoutParams);
		const { attrs, delays } = layout;
		decor = {
			axes: layout.axes,
			notes: layout.notes,
			legend: layout.legend,
			legendY: layout.legendY
		};
		// states without trails fade the previous ones out where they lie
		let trailTarget = layout.trails;
		if (!trailTarget) {
			trailTarget = lastTrailTarget
				? lastTrailTarget.slice()
				: new Float64Array(TRAIL_SIZE);
			for (let t = 0; t < TRAIL_META.length; t++) {
				trailTarget[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
			}
		}
		lastTrailTarget = trailTarget;
		const firstPaint = !entered;
		entered = true;
		if (firstPaint && !reducedMotion) {
			// entry: seed positions with radius/alpha zeroed so dots grow in place
			const entry = attrs.slice();
			for (let i = 0; i < EDGE_BASE; i += STRIDE) {
				entry[i + 2] = 0;
				entry[i + 6] = 0;
			}
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) {
				entry[i] = 0;
				entry[i + 1] = 0;
			}
			tweener.to(entry, 0);
			prevState = stateName;
			prevParamsKey = paramsKey;
			tweener.to(attrs, ENTER_MS, TWEEN_JITTER, delays);
			trailTweener.to(trailTarget, ENTER_MS, 0, layout.trailDelays);
			return;
		}
		const stateChange = stateName !== prevState;
		const paramChange = !stateChange && paramsKey !== prevParamsKey;
		// a state's authored reveal only plays when arriving from the states
		// it was choreographed for (STATE_REVEAL_FROM); any other direction
		// (e.g. scrolling backwards) is one plain tween
		const revealFrom = STATE_REVEAL_FROM[stateName];
		const playReveal = !revealFrom || revealFrom.includes(prevState);
		const stateDelays = playReveal ? delays : SKIP_REVEAL_DELAYS;
		prevState = stateName;
		prevParamsKey = paramsKey;
		if (resized || reducedMotion) {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
		} else if (stateChange && STATE_SEED[stateName]) {
			// seed frame: fade the prior visual out where it lies (alpha → 0, no
			// movement), then once faded snap invisibly into the seed positions —
			// so the next state reveals from a consistent frame without any dot
			// being seen changing xy
			const fade = Float64Array.from(tweener.current);
			for (let i = 0; i < EDGE_BASE; i += STRIDE) fade[i + 6] = 0;
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) fade[i + 1] = 0;
			tweener.to(fade, TWEEN_MS, 0, null, () => tweener.to(attrs, 0));
			trailTweener.to(trailTarget, TWEEN_MS, 0, layout.trailDelays);
		} else if (stateChange) {
			tweener.to(attrs, TWEEN_MS, TWEEN_JITTER, stateDelays);
			trailTweener.to(trailTarget, TWEEN_MS, 0, layout.trailDelays);
		} else if (paramChange) {
			// interaction: retarget quickly, no choreography (delays would make
			// a small pan/highlight feel laggy)
			tweener.to(attrs, PARAM_TWEEN_MS, 0);
			trailTweener.to(trailTarget, PARAM_TWEEN_MS, 0);
		} else {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
		}
	});

	$effect(() => () => {
		tweener.stop();
		trailTweener.stop();
	});
</script>

<div
	class="visual"
	bind:this={container}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<canvas bind:this={canvas}></canvas>
	<div class="annotations">
		{#if ring}
			<div
				class="pulse-wrap"
				style="left: {ring.x}px; top: {ring.y}px; width: {ring.r *
					2}px; height: {ring.r * 2}px; opacity: {pulseId != null
					? ring.alpha
					: 0}"
			>
				<div class="pulse-ring"></div>
			</div>
		{/if}
		{#each tracked as t (t.id)}
			<!-- a per-node override ("left"/"right") sits the label beside the dot,
			     vertically centred; otherwise it hangs below, anchored so it never
			     spills past the canvas edge (right-align near the right edge,
			     left-align near the left, else centred on the dot) -->
			{@const dir = labelDirs[t.id]}
			{@const transform =
				dir === "right"
					? `translate(${t.x + t.r + 4}px, calc(${t.y}px - 50%))`
					: dir === "left"
						? `translate(calc(${t.x - t.r - 4}px - 100%), calc(${t.y}px - 50%))`
						: `translate(${
								t.x > width - 96
									? `calc(${t.x}px - 100%)`
									: t.x < 96
										? `${t.x}px`
										: `calc(${t.x}px - 50%)`
							}, ${t.y + t.r + 4}px)`}
			<p
				class="node-label"
				style="transform: {transform}; opacity: {labelIds.has(t.id)
					? t.alpha
					: 0}"
			>
				{t.name}
			</p>
		{/each}
	</div>
	<div class="overlay">
		{#key overlay?.xLabel}
			{#if overlay?.xLabel}
				<p class="x-label fade-in" style="top: {xLabelTop}px; bottom: auto">
					{overlay.xLabel}
				</p>
			{/if}
		{/key}
		{#key overlay?.yLabel}
			{#if overlay?.yLabel}
				<!-- centre the axis title on the graph's y-axis extent, not the tall canvas -->
				<p class="y-label fade-in" style="top: {yLabelTop}px">
					{overlay.yLabel}
				</p>
			{/if}
		{/key}
		{#key stateName}
			<!-- ticks/notes are pixel-pinned to a fixed window; the sweep pans the
			     domain per frame, so hide them for the fly and let them snap back on
			     landing (per-frame animated furniture is Stage 6) -->
			{#if !sweeping}
				{#each decor?.axes?.x ?? [] as tick}
					<p
						class="tick tick-x fade-in"
						style="left: {tick.pos}px; {decor.axes.xBase != null
							? `top: ${decor.axes.xBase}px`
							: ''}"
					>
						{tick.label}
					</p>
				{/each}
				{#each decor?.axes?.y ?? [] as tick}
					<p class="tick tick-y fade-in" style="top: {tick.pos}px">
						{tick.label}
					</p>
				{/each}
				{#each decor?.notes ?? [] as note}
					<p
						class="note fade-in {note.align ?? 'left'}"
						class:strong={note.strong}
						class:wrap={note.wrap}
						style="left: {note.x}px; top: {note.y}px"
					>
						{note.text}
					</p>
				{/each}
			{/if}
			{#if decor?.legend}
				<ul
					class="legend fade-in"
					style={decor.legendY != null
						? `top: ${decor.legendY}px; bottom: auto`
						: ""}
				>
					{#each decor.legend as item}
						<li class="legend-item">
							<span
								class="legend-swatch"
								style="background: rgb({item.color.join(',')})"
							></span>
							{item.label}
						</li>
					{/each}
				</ul>
			{/if}
		{/key}
	</div>
</div>

<style>
	.visual {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.annotations {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.node-label {
		position: absolute;
		top: 0;
		left: 0;
		margin: 0;
		/* positioned via inline transform (compositor-only), not left/top */
		will-change: transform, opacity;
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--color-gray-900, #222);
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
		transition: opacity 0.3s ease;
	}

	.pulse-wrap {
		position: absolute;
		transform: translate(-50%, -50%);
		transition: opacity 0.3s ease;
	}

	.pulse-ring,
	.pulse-ring::after {
		position: absolute;
		inset: 0;
		border: 2px solid rgba(34, 34, 34, 0.45);
		border-radius: 50%;
		animation: ripple 1.8s ease-out infinite;
	}

	.pulse-ring::after {
		content: "";
		animation-delay: -0.9s;
	}

	@keyframes ripple {
		from {
			transform: scale(1);
			opacity: 0.6;
		}
		to {
			transform: scale(2.2);
			opacity: 0;
		}
	}

	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.fade-in {
		animation: fade-in 0.4s ease both;
	}

	@media (prefers-reduced-motion: reduce) {
		.fade-in {
			animation: none;
		}

		.node-label,
		.pulse-wrap {
			transition: none;
		}

		.pulse-ring,
		.pulse-ring::after {
			animation: none;
		}

		.pulse-ring {
			transform: scale(1.3);
		}

		.pulse-ring::after {
			content: none;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.overlay p {
		position: absolute;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gray-600, #666);
	}

	.x-label {
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		/* clamps above the step card on long-prose steps — may sit over dots */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
	}

	.tick {
		font-size: 0.65rem;
		color: var(--color-gray-500, #888);
		/* tick numbers can sit over the dot cloud (tight left margin) — keep them legible */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
	}

	.tick-x {
		bottom: 1.6rem; /* fallback when the layout provides no xBase */
		transform: translateX(-50%);
	}

	.tick-x[style*="top:"] {
		bottom: auto;
	}

	.note.strong {
		font-weight: 700;
		color: var(--color-gray-900, #222);
	}

	.tick-y {
		/* indented past the rotated axis title (.y-label sits in the x: 0 column) */
		left: 1.1rem;
		transform: translateY(-50%);
	}

	.note {
		font-size: 0.7rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
	}

	.note.wrap {
		white-space: normal;
		max-width: 16rem;
	}

	.note.center {
		transform: translateX(-50%);
	}

	.note.right {
		transform: translateX(-100%);
		text-align: right;
	}

	.y-label {
		top: 50%;
		left: 0;
		/* rotate INSIDE transform (not the `rotate:` property): the property applies
		   before `transform`, flipping the Y axis so translateY(-50%) would push the
		   label DOWN by half its length instead of centring it. Order it here so the
		   translate stays in screen space. */
		transform: translateY(-50%) rotate(180deg);
		writing-mode: vertical-rl;
	}

	.legend {
		position: absolute;
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
		white-space: nowrap;
		font-family: var(--font-mono);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.6rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
	}

	.legend-swatch {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>

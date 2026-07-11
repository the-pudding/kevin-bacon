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
		STATE_PULSE,
		STATE_PARAMS,
		STATE_REVEAL_FROM,
		STATE_TRACKED,
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META,
		BLANK
	} from "./states.js";
	import { story } from "./story.svelte.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, params?: Object }} */
	let { state: stateName, params } = $props();

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
	let width = $state(0);
	let height = $state(0);
	let reducedMotion = $state(false);
	/** @type {{ id: number, name: string, x: number, y: number, r: number, alpha: number }[]} */
	let tracked = $state([]);
	// static per-state chart furniture (ticks/callouts) from the layout result
	/** @type {{ axes?: { x?: {pos:number,label:string}[], y?: {pos:number,label:string}[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[] } | null} */
	let decor = $state(null);

	let ctx = null;
	let prevState = null;
	let prevParamsKey = null;
	let prevW = 0;
	let prevH = 0;
	let entered = false;

	// a step with no visual: everything fades out in place, canvas renders nothing
	const isBlank = $derived(stateName === BLANK);
	const overlay = $derived(OVERLAYS[stateName]);
	// what the active layout actually varies on: the state's selector plucks
	// the interaction fields it consumes (reading the `story` $state proxy
	// here makes the layout effect re-run when those fields change)
	const layoutParams = $derived(
		STATE_PARAMS[stateName]?.(story, params) ?? params ?? null
	);
	const labelIds = $derived.by(() => {
		const spec = STATE_LABELS[stateName];
		return new Set(
			typeof spec === "function" ? spec(layoutParams) : (spec ?? [])
		);
	});
	const pulseId = $derived(STATE_PULSE[stateName] ?? null);
	// keeps the ring anchored to the last center actor while it fades out
	let lastPulseId = $state(null);
	$effect(() => {
		if (pulseId != null) lastPulseId = pulseId;
	});
	const ring = $derived(tracked.find((t) => t.id === lastPulseId));

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
		const target = isBlank
			? null
			: layoutFor(stateName, width, height, layoutParams).attrs;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			const progress = attrs[i];
			const alpha = attrs[i + 1];
			if (alpha <= 0.004 || progress <= 0.004) continue;
			const [from, to] = edgeEnds[e];
			const dying = !target || target[i + 1] <= 0.004;
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
		if (isBlank) {
			// no visual: hold current positions, fade all dots/edges/trails out.
			// Fading in place (not to a parked layout) means scrolling back into a
			// real state restores object constancy from where the dots last sat.
			decor = null;
			const target = tweener.current.slice();
			for (let i = 0; i < EDGE_BASE; i += STRIDE) target[i + 6] = 0;
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) target[i + 1] = 0;
			const trailTarget = lastTrailTarget
				? lastTrailTarget.slice()
				: new Float64Array(TRAIL_SIZE);
			for (let t = 0; t < TRAIL_META.length; t++) {
				trailTarget[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
			}
			lastTrailTarget = trailTarget;
			const ms =
				resized || reducedMotion || stateName === prevState ? 0 : TWEEN_MS;
			entered = true;
			prevState = stateName;
			prevParamsKey = "";
			tweener.to(target, ms);
			trailTweener.to(trailTarget, ms);
			return;
		}
		const paramsKey = JSON.stringify(layoutParams) ?? "";
		const layout = layoutFor(stateName, width, height, layoutParams);
		const { attrs, delays } = layout;
		decor = { axes: layout.axes, notes: layout.notes };
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

<div class="visual" bind:clientWidth={width} bind:clientHeight={height}>
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
			<p
				class="node-label"
				style="transform: translate(calc({t.x}px - 50%), {t.y +
					t.r +
					4}px); opacity: {labelIds.has(t.id) ? t.alpha : 0}"
			>
				{t.name}
			</p>
		{/each}
	</div>
	{#key stateName}
		<div class="overlay">
			{#if overlay?.xLabel}
				<p
					class="x-label"
					style={decor?.axes?.xBase != null
						? `top: ${decor.axes.xBase + 22}px; bottom: auto`
						: ""}
				>
					{overlay.xLabel}
				</p>
			{/if}
			{#if overlay?.yLabel}
				<p class="y-label">{overlay.yLabel}</p>
			{/if}
			{#each decor?.axes?.x ?? [] as tick}
				<p
					class="tick tick-x"
					style="left: {tick.pos}px; {decor.axes.xBase != null
						? `top: ${decor.axes.xBase}px`
						: ''}"
				>
					{tick.label}
				</p>
			{/each}
			{#each decor?.axes?.y ?? [] as tick}
				<p class="tick tick-y" style="top: {tick.pos}px">{tick.label}</p>
			{/each}
			{#each decor?.notes ?? [] as note}
				<p
					class="note {note.align ?? 'left'}"
					class:strong={note.strong}
					class:wrap={note.wrap}
					style="left: {note.x}px; top: {note.y}px"
				>
					{note.text}
				</p>
			{/each}
		</div>
	{/key}
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
		animation: fade-in 0.4s ease both;
	}

	@media (prefers-reduced-motion: reduce) {
		.overlay {
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
	}

	.tick {
		font-size: 0.65rem;
		color: var(--color-gray-500, #888);
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
		left: 0.5rem;
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
		left: 0.5rem;
		transform: translateY(-50%);
		writing-mode: vertical-rl;
		rotate: 180deg;
	}
</style>

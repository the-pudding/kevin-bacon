<script>
	// @ts-check
	import { makeNodes } from "./nodes.js";
	import { createTweener } from "./tween.js";
	import {
		ATTR_SIZE,
		STRIDE,
		EDGE_BASE,
		STATES,
		OVERLAYS,
		STATE_LABELS,
		STATE_PULSE
	} from "./states.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").LayoutState }} */
	let { state: stateName } = $props();

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	// edges draw inward toward the anchor: orient each from its higher-hop end so
	// the line grows from the outer actor toward Bacon
	const edgeEnds = edges.map(({ source, target }) =>
		nodes[source].hop >= nodes[target].hop ? [source, target] : [target, source]
	);
	// every id any state labels or pulses — tracked out of the attr array each
	// frame so the HTML annotations stay glued to their dots mid-tween
	const TRACKED_IDS = [
		...new Set([
			...Object.values(STATE_LABELS).flat(),
			...Object.values(STATE_PULSE)
		])
	];
	const tweener = createTweener(ATTR_SIZE, draw, STRIDE);
	const TAU = Math.PI * 2;
	// one Path2D per (quantised rgb, alpha bucket): batches ~1k dots into a
	// handful of fills instead of a fillStyle + fill per dot
	const dotBuckets = new Map();

	// layouts are pure in (state, w, h) — cache so re-visited states skip both
	// the recompute and the per-call Float64Array allocation; the tweener only
	// reads the result, never mutates it
	const layoutCache = new Map();
	function layoutFor(name, w, h) {
		const key = `${name}:${w}:${h}`;
		let result = layoutCache.get(key);
		if (!result) {
			result = STATES[name](nodes, w, h, edges);
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

	let ctx = null;
	let prevState = null;
	let prevW = 0;
	let prevH = 0;
	let entered = false;

	const overlay = $derived(OVERLAYS[stateName]);
	const labelIds = $derived(new Set(STATE_LABELS[stateName] ?? []));
	const pulseId = $derived(STATE_PULSE[stateName] ?? null);
	// keeps the ring anchored to the last center actor while it fades out
	let lastPulseId = $state(null);
	$effect(() => {
		if (pulseId != null) lastPulseId = pulseId;
	});
	const ring = $derived(tracked.find((t) => t.id === lastPulseId));

	function draw(attrs) {
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		ctx.lineWidth = 1;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			const progress = attrs[i];
			const alpha = attrs[i + 1];
			if (alpha <= 0.004 || progress <= 0.004) continue;
			const [from, to] = edgeEnds[e];
			const xa = attrs[from * STRIDE];
			const ya = attrs[from * STRIDE + 1];
			const xb = attrs[to * STRIDE];
			const yb = attrs[to * STRIDE + 1];
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
		const { attrs, delays } = layoutFor(stateName, width, height);
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
			tweener.to(attrs, ENTER_MS, TWEEN_JITTER, delays);
			return;
		}
		const animate = stateName !== prevState && !resized && !reducedMotion;
		prevState = stateName;
		tweener.to(attrs, animate ? TWEEN_MS : 0, TWEEN_JITTER, delays);
	});

	$effect(() => () => tweener.stop());
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
				<p class="x-label">{overlay.xLabel}</p>
			{/if}
			{#if overlay?.yLabel}
				<p class="y-label">{overlay.yLabel}</p>
			{/if}
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

	.y-label {
		top: 50%;
		left: 0.5rem;
		transform: translateY(-50%);
		writing-mode: vertical-rl;
		rotate: 180deg;
	}
</style>

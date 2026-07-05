<script>
	// @ts-check
	import { makeNodes } from "./nodes.js";
	import { createTweener } from "./tween.js";
	import {
		ATTR_SIZE,
		STRIDE,
		EDGE_ALPHA_INDEX,
		STATES,
		OVERLAYS
	} from "./states.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").LayoutState }} */
	let { state: stateName } = $props();

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	const tweener = createTweener(ATTR_SIZE, draw, STRIDE);

	let canvas = $state();
	let width = $state(0);
	let height = $state(0);
	let reducedMotion = $state(false);

	let ctx = null;
	let prevState = null;
	let prevW = 0;
	let prevH = 0;
	let entered = false;

	const overlay = $derived(OVERLAYS[stateName]);

	function draw(attrs) {
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		const edgeAlpha = attrs[EDGE_ALPHA_INDEX];
		if (edgeAlpha > 0.004) {
			ctx.strokeStyle = `rgba(120, 120, 120, ${edgeAlpha})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (const { source, target } of edges) {
				ctx.moveTo(attrs[source * STRIDE], attrs[source * STRIDE + 1]);
				ctx.lineTo(attrs[target * STRIDE], attrs[target * STRIDE + 1]);
			}
			ctx.stroke();
		}
		for (let i = 0; i < EDGE_ALPHA_INDEX; i += STRIDE) {
			const alpha = attrs[i + 6];
			if (alpha <= 0.004) continue;
			ctx.fillStyle = `rgba(${attrs[i + 3] | 0}, ${attrs[i + 4] | 0}, ${attrs[i + 5] | 0}, ${alpha})`;
			ctx.beginPath();
			ctx.arc(attrs[i], attrs[i + 1], attrs[i + 2], 0, Math.PI * 2);
			ctx.fill();
		}
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
		const { attrs, delays } = STATES[stateName](nodes, width, height);
		const firstPaint = !entered;
		entered = true;
		if (firstPaint && !reducedMotion) {
			// entry: seed positions with radius/alpha zeroed so dots grow in place
			const entry = attrs.slice();
			for (let i = 0; i < EDGE_ALPHA_INDEX; i += STRIDE) {
				entry[i + 2] = 0;
				entry[i + 6] = 0;
			}
			entry[EDGE_ALPHA_INDEX] = 0;
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

	.caption {
		top: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		font-weight: bold;
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

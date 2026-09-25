<script>
	import "$styles/app.css";

	let { children } = $props();
</script>

<!-- the prose halo (Step.svelte's .halo) as one pass under the whole block: a
     text-shadow is painted per inline run, so the halo of the text after a <b>
     covers the bold's last letter. Dilate the text's alpha by the 4px the
     --text-halo grid reaches, soften by its 1px blur, fill with the page. -->
<svg class="halo-defs" aria-hidden="true" width="0" height="0">
	<filter
		id="prose-halo"
		x="-10%"
		y="-50%"
		width="120%"
		height="200%"
		color-interpolation-filters="sRGB"
	>
		<feMorphology in="SourceAlpha" operator="dilate" radius="4" />
		<feGaussianBlur stdDeviation="0.5" result="spread" />
		<feFlood class="halo-flood" />
		<feComposite in2="spread" operator="in" result="halo" />
		<feMerge>
			<feMergeNode in="halo" />
			<feMergeNode in="SourceGraphic" />
		</feMerge>
	</filter>
</svg>

<main id="content">
	{@render children?.()}
</main>

<style>
	.halo-defs {
		position: absolute;
	}

	.halo-flood {
		flood-color: var(--surface-holdout);
	}
</style>

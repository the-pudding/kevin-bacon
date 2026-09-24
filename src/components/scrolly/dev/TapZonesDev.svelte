<script>
	// @ts-check
	/**
	 * DEV-ONLY toggle for tinting the tap halves (TapNav.svelte): a light,
	 * very-low-opacity background over the prev/next tap regions so their
	 * extent — including the --column-gutter overhang past the reading
	 * column's edge — can be checked visually without reading the CSS.
	 * Stacked only: beside the prose TapNav mounts edge notches instead, and
	 * there are no halves to tint.
	 *
	 * Fixed to the viewport rather than the canvas: unlike the race tuners,
	 * this has to stay reachable across every step, not just one chapter, so
	 * it can't live inside .scrolly-visual (which is what the race tuners
	 * anchor to).
	 *
	 * Only mounted under `import.meta.env.DEV` (dynamically imported by
	 * Stage.svelte, next to the race tuners' `devTuners`).
	 */
	import { tapZonesDev, toggleTapZones } from "./tapZones.svelte.js";
</script>

<button
	type="button"
	class="tap-zones-toggle"
	class:on={tapZonesDev.visible}
	onclick={toggleTapZones}
	aria-pressed={tapZonesDev.visible}
>
	tap zones
</button>

<style>
	.tap-zones-toggle {
		position: fixed;
		left: 0.5rem;
		bottom: 0.5rem;
		/* has to beat --z-tap-above too: the tap halves it labels sit under
		   that, and this is a fixed HUD control, not part of the canvas stack */
		z-index: var(--z-modal);
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: inherit;
		padding: 0.2rem 0.5rem;
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-gray-300, #ccc);
		border-radius: 3px;
		cursor: pointer;
		opacity: 0.55;
	}
	.tap-zones-toggle:hover {
		opacity: 1;
	}
	.tap-zones-toggle.on {
		opacity: 1;
		background: var(--color-red, #c0392b);
		color: #fff;
		border-color: var(--color-red, #c0392b);
	}
</style>

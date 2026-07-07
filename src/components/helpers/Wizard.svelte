<script>
	/**
	 * Wizard-style step driver: an alternative to Scrolly that advances the
	 * active step index via Previous/Next buttons and Arrow keys instead of
	 * scroll position. Headless — no styling. Produces the same bindable `value`
	 * (0-based step index) that Scrolly does, so the object-constancy visual
	 * framework downstream is unaffected.
	 *
	 * <Wizard bind:value count={stepCount}>
	 * 	**steps here**
	 * </Wizard>
	 */

	let { value = $bindable(0), count = 0, children } = $props();

	function prev() {
		if (value > 0) value -= 1;
	}

	function next() {
		if (value < count - 1) value += 1;
	}

	function onKeydown(e) {
		const el = e.target;
		if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
		if (e.key === "ArrowLeft") prev();
		else if (e.key === "ArrowRight") next();
	}

	$effect(() => {
		window.addEventListener("keydown", onKeydown);
		return () => window.removeEventListener("keydown", onKeydown);
	});
</script>

{@render children?.()}

<button type="button" disabled={value <= 0} onclick={prev}>Previous</button>
<button type="button" disabled={value >= count - 1} onclick={next}>Next</button>

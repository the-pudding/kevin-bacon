<script>
	/**
	 * The story's step driver: advances the active step index via
	 * Previous/Next buttons and Arrow keys. Headless — no styling. Exposes a
	 * bindable `value` (0-based step index); the object-constancy visual
	 * framework downstream only ever sees that index.
	 *
	 * `onnavigate` fires with the destination index *before* `value` changes, so
	 * a caller can compare it against the current `value` to know the direction
	 * and prepare state the destination step reads on its first render (a
	 * post-render $effect is too late for anything that mounts with the step).
	 *
	 * <Wizard bind:value count={stepCount}>
	 * 	**steps here**
	 * </Wizard>
	 */

	let { value = $bindable(0), count = 0, onnavigate, children } = $props();

	function go(to) {
		if (to < 0 || to > count - 1) return;
		onnavigate?.(to);
		value = to;
	}

	function prev() {
		go(value - 1);
	}

	function next() {
		go(value + 1);
	}

	function onKeydown(e) {
		const el = e.target;
		// don't hijack arrow keys from text fields or a focused slider thumb
		// (bits-ui thumbs are role="slider" and step by year themselves)
		if (
			el &&
			(el.tagName === "INPUT" ||
				el.tagName === "TEXTAREA" ||
				el.closest?.('[role="slider"]'))
		)
			return;
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

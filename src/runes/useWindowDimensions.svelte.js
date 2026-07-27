/*
usage:
import useWindowDimensions from "$runes/useWindowDimensions.svelte.js";
let dimensions = new useWindowDimensions();
// optionally pass debounce time in ms
*/

import debounce from "lodash.debounce";

// window.innerWidth/innerHeight (the layout viewport), NOT visualViewport —
// visualViewport shrinks whenever the on-screen keyboard opens, which would
// otherwise resize the whole scrolly section around the reader mid-type.
function getWidth() {
	return window?.innerWidth || document.documentElement.clientWidth;
}

function getHeight() {
	return window?.innerHeight || document.documentElement.clientHeight;
}

export default class useWindowDimensions {
	#width = $state(0);
	#height = $state(0);

	#debouncedResize;

	#onResize() {
		this.#width = getWidth();
		this.#height = getHeight();
	}

	constructor(ms = 250) {
		$effect(() => {
			this.#onResize();
			this.#debouncedResize = debounce(this.#onResize.bind(this), ms);

			window?.addEventListener("resize", this.#debouncedResize);

			return () => {
				window?.removeEventListener("resize", this.#debouncedResize);
			};
		});
	}

	get width() {
		return this.#width;
	}

	get height() {
		return this.#height;
	}
}

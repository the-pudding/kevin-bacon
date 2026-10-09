// The story's <Step> list, read off Index.svelte — what the registry receives,
// for the scripts and tests that walk every step.
export const INDEX = "src/components/Index.svelte";

/** @typedef {{ state: string, attrs: string }} StepTag */

/**
 * Reads one tag from `<Name` to its closing `>`, past any `{…}` attribute value
 * (an arrow in `gate={() => …}` is not the end of the tag).
 * @returns {string} the tag's attribute text
 */
function readAttrs(markup, start) {
	let depth = 0;
	let i = start;
	for (; i < markup.length; i++) {
		const ch = markup[i];
		if (ch === "{") depth++;
		else if (ch === "}") depth--;
		else if (ch === ">" && depth === 0) break;
	}
	return markup.slice(start, i);
}

/** the template alone — no script block and no HTML comments, both of which
 * talk about <Step> in prose */
const templateOf = (source) =>
	source
		.replace(/<script[\s\S]*?<\/script>/g, "")
		.replace(/<!--[\s\S]*?-->/g, "");

/**
 * The story's steps in document order, each with its tag's attribute text.
 * @param {string} source Index.svelte
 * @returns {StepTag[]}
 */
export function parseSteps(source) {
	const markup = templateOf(source);
	const steps = [];
	for (const m of markup.matchAll(/<(Step|Splash)(?=[\s/>])/g)) {
		const attrs = readAttrs(markup, m.index);
		const state = attrs.match(/\bstate="(\w+)"/)?.[1];
		if (!state) throw new Error(`a <${m[1]}> without a state at ${m.index}`);
		steps.push({ state, attrs });
	}
	return steps;
}

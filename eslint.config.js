import js from "@eslint/js";
import globals from "globals";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import svelteConfig from "./svelte.config.js";

// ESLint owns the structural rules: unused code, import cycles and (from
// Phase 3 of the maintainability plan) complexity and function size.
// svelte-check owns types and the Svelte compiler's own diagnostics, which is
// why `svelte/valid-compile` is off here rather than reporting them twice.
export default [
	{
		ignores: [
			"build/",
			"docs/",
			".svelte-kit/",
			"node_modules/",
			"static/",
			"src/data/"
		]
	},
	js.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				__VERSION__: "readonly",
				__TIMESTAMP__: "readonly"
			}
		},
		plugins: { "import-x": importX },
		settings: {
			"import-x/resolver-next": [createNodeResolver()],
			// modules import components, never the other way round, so the cycle
			// walk stops at a .svelte file instead of parsing it
			"import-x/ignore": ["node_modules", "\\.svelte$"]
		},
		rules: {
			// cycles between our own modules only; a package's internals are its own
			"import-x/no-cycle": ["error", { ignoreExternal: true }],
			// `_edges`, `_params`: a layout keeps the LayoutFn arity it does not use
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			// size and branching caps: a function that outgrows these is split
			// (see notes/scrolly-framework.md for how the story's code is laid out)
			complexity: ["error", 10],
			"max-depth": ["error", 4],
			"max-lines-per-function": [
				"error",
				{ max: 100, skipBlankLines: true, skipComments: true }
			]
		}
	},
	{
		// a test file's describe blocks are lists of cases, not logic
		files: ["**/*.spec.js"],
		rules: { "max-lines-per-function": "off" }
	},
	{
		files: ["**/*.svelte", "**/*.svelte.js"],
		languageOptions: { parserOptions: { svelteConfig } },
		rules: {
			"svelte/valid-compile": "off",
			// Components are leaves of the module graph, and a `.svelte.js` module's
			// imports are walked from the plain modules that import it — where they
			// are parsed by the JS parser rather than the Svelte one.
			"import-x/no-cycle": "off",
			// Keyed or positional is a per-block rendering decision: axis ticks and
			// CMS paragraphs are positional on purpose.
			"svelte/require-each-key": "off",
			// The visual framework's Maps and Sets are per-frame scratch and caches
			// that must NOT be reactive (see ScrollyVisual's `sweeping` note).
			"svelte/prefer-svelte-reactivity": "off"
		}
	},
	{
		// the micro-CMS renders the team's own Google Doc copy as HTML
		files: ["src/components/helpers/CMS*.svelte"],
		rules: { "svelte/no-at-html-tags": "off" }
	}
];

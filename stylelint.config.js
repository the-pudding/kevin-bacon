// Every colour and font in component and global CSS comes from a role token
// (properties/role/, built by `npm run style`) — see notes/design/tokens.md.
// Primitives (--color-*, --category-*, --font-*, --tracking-*) are only for the
// token files, and a token read never carries a fallback: it is always
// defined, and a fallback would be a second, silently stale copy of it.
const TOKEN =
	"(color|category|font|tracking|surface|prose|chart|annotation|mark|control|art|dev|type)-|[0-9]+px";

/** @type {import("stylelint").Config} */
export default {
	ignoreFiles: [
		"src/styles/variables.css",
		"src/styles/normalize.css",
		// @font-face names the families the font.* tokens then stack
		"src/styles/font.css"
	],
	overrides: [{ files: ["**/*.svelte"], customSyntax: "postcss-html" }],
	rules: {
		"color-no-hex": true,
		"color-named": "never",
		"function-disallowed-list": [
			"rgb",
			"rgba",
			"hsl",
			"hsla",
			"hwb",
			"lab",
			"lch",
			"oklab",
			"oklch",
			"color",
			"color-mix"
		],
		"declaration-property-value-disallowed-list": {
			"/.*/": [
				"/var\\(--(color|category|font|tracking)-/",
				`/var\\(--(${TOKEN})[a-z0-9-]*\\s*,/`
			],
			"font-family": ["/^(?!var\\(--type-)/"]
		}
	}
};

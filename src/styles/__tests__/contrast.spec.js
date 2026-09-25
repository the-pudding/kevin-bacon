// WCAG contrast of the colour role tokens (properties/role/*.json), from the
// resolved values in tokens.json that `npm run style` writes. Each role token
// states its requirement in `contrast` — a pair `{ against, min }` (or a list
// of them), or `{ exempt: "<why>" }` — and a token that is only ever a
// background is covered by the pairs that name it. See notes/design/tokens.md.
import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori";
import tokens from "../tokens.json";

const PAGE = "surface.page";

const asColour = ([r, g, b, alpha]) => ({
	mode: "rgb",
	r: r / 255,
	g: g / 255,
	b: b / 255,
	alpha
});

// `top` painted over an opaque `bottom`: what the eye sees of a translucent token
const over = (top, bottom) => ({
	mode: "rgb",
	r: top.r * top.alpha + bottom.r * (1 - top.alpha),
	g: top.g * top.alpha + bottom.g * (1 - top.alpha),
	b: top.b * top.alpha + bottom.b * (1 - top.alpha),
	alpha: 1
});

// A translucent background is seen over the page, never over nothing
const background = (path) => {
	const colour = asColour(tokens[path].rgba);
	return path === PAGE ? colour : over(colour, background(PAGE));
};

const requirements = (token) =>
	token.contrast === null ? [] : [token.contrast].flat();

const entries = Object.entries(tokens);
const pairs = entries.flatMap(([path, token]) =>
	requirements(token)
		.filter((r) => r.exempt === undefined)
		.map((r) => ({ path, ...r }))
);
const exemptions = entries.flatMap(([path, token]) =>
	requirements(token)
		.filter((r) => r.exempt !== undefined)
		.map((r) => ({ path, ...r }))
);
const backgrounds = new Set(pairs.map((p) => p.against));

describe("colour role contrast", () => {
	it.each(pairs)("$path on $against is at least $min:1", (pair) => {
		expect(tokens[pair.against], `unknown token ${pair.against}`).toBeDefined();
		const bg = background(pair.against);
		const fg = over(asColour(tokens[pair.path].rgba), bg);
		expect(Number(wcagContrast(fg, bg).toFixed(2))).toBeGreaterThanOrEqual(
			pair.min
		);
	});

	it("every role outside surface.* states its contrast or is a pair's background", () => {
		const unstated = entries
			.filter(([path]) => !path.startsWith("surface."))
			.filter(
				([path, token]) => token.contrast === null && !backgrounds.has(path)
			)
			.map(([path]) => path);
		expect(unstated).toEqual([]);
	});

	it("every exemption says why", () => {
		const bare = exemptions
			.filter((e) => e.exempt.trim() === "")
			.map((e) => e.path);
		expect(bare).toEqual([]);
	});
});

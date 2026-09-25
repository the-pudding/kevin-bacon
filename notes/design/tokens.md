# Design tokens

Every colour and font the story uses is a token in `properties/`, built by
`npm run style` (Style Dictionary, `tasks/style-dictionary.js`). Nothing in a
component names a colour or a font family directly; lint refuses it.

## Two tiers

- **`properties/primitive/`** — the raw scales: `color.json` (the OKLCH greys,
  `ink`, `edge`), `category.json` (Paul Tol's bright palette and its dark
  inks), `font.json` (the three family stacks, `tracking.mono`),
  `font-size.json` (`--12px` … `--128px`). Only token files reference these.
- **`properties/role/`** — what a value is _for_, one file per group. Role
  values reference primitives (`{color.gray-700}`) or other roles.

| Group        | Styles                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `surface`    | the page, raised panels/cards/menus, the text halo, hold-out rings, selection, borders, shadow, scrim                               |
| `prose`      | body copy, headings, muted copy, links                                                                                              |
| `chart`      | graph labels: node labels, titles, ticks, axis hint, legend, the race band, the rank ladder, the results bars, the scrubber readout |
| `annotation` | over-canvas notes, callouts, arrows, the pulse ring, the pressed-dot tint                                                           |
| `mark`       | the canvas: crowd, ink, focus, edges, hop bands and their label inks, trails, quiz verdicts, career                                 |
| `control`    | buttons (per variant, with explicit hovers), inputs, switch, slider, quiz cards, search chips, the progress bar, focus ring         |
| `art`        | the wordmark and the pointer doodle                                                                                                 |
| `dev`        | the dev tuners (never shipped)                                                                                                      |
| `type`       | font family and tracking per role: prose, heading, ui, chart, annotation, callout, chip, dev                                        |

A role token can carry `modify`: `{ "alpha": n }` (a translucent version of
its reference) or `{ "lighten": n }` (an OKLCH lightness shift, used for
hovers). The build resolves those to a literal; everything else is emitted as
a `var()` of what it references.

## Outputs

- `src/styles/variables.css` — every token as a custom property (`--prose-fg`,
  `--chart-tick`, `--control-button-primary-hover`, …).
- `src/styles/tokens.js` — the `mark.*` tokens as `[r, g, b]`, because canvas
  can't read custom properties. `src/components/scrolly/palette.js` names them
  for the layouts (`INK`, `CROWD`, `HOP_RGB`, `QUIZ_RIGHT`, …).
- `src/styles/tokens.json` — every colour role resolved to rgba, with its
  contrast requirement: the contrast spec's input.

All three are committed. The full-mode gate rebuilds them and fails if the
committed copies differ from what `properties/` builds.

## Changing a colour or a font

1. Edit the role token (or the primitive it points at) in `properties/`.
2. `npm run style`.
3. `npx vitest run` — the contrast spec checks every pair. A canvas colour
   change fails only goldens' `colour` hashes; regenerate with
   `npx vitest run -u` and check nothing else moved.
4. `npm run a11y` — axe's contrast check on the rendered page, every step.
5. A `mark.*` change stales the whole tween checklist (`npm run stale`).

A new component style reads an existing role token, or a new one added to the
group it belongs to. Stylelint (`stylelint.config.js`) refuses colour
literals and colour functions, primitive tokens (`--color-*`, `--category-*`,
`--font-*`, `--tracking-*`), a token read with a fallback, and a
`font-family` that isn't a `--type-*` token. ESLint refuses colour literals
in scripts and in markup paint attributes (`fill`, `stroke`, …).

## Contrast

Each colour role in `properties/role/` states its requirement in `contrast`:

- `{ "against": "<token path>", "min": 4.5 }` — text (WCAG 1.4.3), or
  `"min": 3` for a mark or a control boundary (1.4.11). A list for several
  backgrounds (a button's text on its fill and on its hover).
- `{ "exempt": "<why>" }` — the reason is required.

A token that is only ever a background is covered by the pairs that name it.
`src/styles/__tests__/contrast.spec.js` composites translucent tokens over
their background (and a translucent background over `surface.page`), checks
every pair, and fails if a role outside `surface.*` states nothing.

`npm run a11y` (`scripts/a11y-scan.js`) runs axe-core's `color-contrast` rule
on every step at the mobile and desktop boxes, on a dev server. It cannot see
the canvas, and it reports text over the canvas whose background it can't
resolve as unresolved rather than failed; the token pairs cover both. The dev
tuners are marked `data-dev-only` and left out.

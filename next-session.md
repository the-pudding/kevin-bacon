# Handoff: Build a typography decision system for "Gen Z's Kevin Bacon"

## Starting Prompt

Goal: turn a survey of the fonts used on 14 recent Pudding stories into a
typography decision system for this story. The system should say which family
each role uses, when a story earns a font outside the house set, and how that
choice becomes tokens. The survey only informs the decisions. It does not
decide them. Owen makes the call.

Context: last session I fetched the HTML and CSS of 14 pudding.cool stories and
read their `@font-face` rules and font tokens. The results are under "Key
Context" below. This story already uses the house set: Atlas Grotesk (sans),
Tiempos Text (serif) and Atlas Typewriter (mono). They're wired as
`font.*` primitives, then eight `type.*` roles (prose, heading, ui, chart,
annotation, callout, chip, dev).

Constraints:

- Every family is a token. Primitives go in `properties/primitive/font.json`,
  roles in `properties/role/type.json`, faces in `src/styles/font.css`. Rebuild
  with `npm run style`. Components read `--type-*` only, and lint enforces it
  (`notes/design/tokens.md`).
- Owen writes the prose. Build structure and options, not reader-facing copy.
- A font change can change text metrics. The canvas box must not move
  (memory: kevin-bacon-canvas-box-must-not-move). Measure before and after.
- Changing canvas text (chart, annotation, callout, chip) is a canvas change.
  Stale the affected rows in `notes/tween-checklist.md` (`npm run stale`).
- No commits without Owen's say-so.

First steps:

1. Read `notes/design/tokens.md`, `properties/role/type.json` and
   `notes/storyboard.md` for the story's tone.
2. Draft the decision system as a note in `notes/design/` (for example
   `typography.md`). It should cover: a role → family table, rules for when a
   story gets a signature font (the survey shows one swapped-in family per
   story, usually a display or themed face), licence and hosting rules
   (house fonts load from pudding.cool; others need a licence or must be
   OFL/Google fonts), and how to verify a change (`npm run gates`, contrast,
   box measurement).
3. Ask Owen before proposing any concrete font swap. Treat it as a design
   decision, not a default.

## Relevant Files

- `properties/primitive/font.json` — the three family stacks and `tracking.mono`
- `properties/role/type.json` — the eight type roles and what each covers
- `src/styles/font.css` — the `@font-face` rules (self-hosted from pudding.cool)
- `notes/design/tokens.md` — the token architecture and the lint rules on fonts
- `notes/storyboard.md` — the story's content and tone, which should drive any
  choice of signature font
- `notes/design/title-card.md` — the splash title (the heading role), the
  likeliest place for a display font

## Key Context

The survey reads the HTML and CSS only. It misses computed styles and any
font set from JavaScript or drawn on a canvas. "Body text" is the family the
body-text token points to.

| Story                     | Body text | Sans          | Serif        | Mono                          | Signature                                  |
| ------------------------- | --------- | ------------- | ------------ | ----------------------------- | ------------------------------------------ |
| mow (2026/06)             | serif     | Atlas Grotesk | Tiempos Text | system                        | —                                          |
| essential-words (2026/07) | serif     | Source Sans 3 | Tiempos Text | Atlas Typewriter              | Tiempos Headline (likely, token undefined) |
| ethical-champions         | sans      | Atlas Grotesk | —            | Atlas Typewriter (also forms) | —                                          |
| menu-story                | serif     | EB Garamond   | EB Garamond  | Courier Prime                 | EB Garamond + Courier Prime (themed)       |
| love-story                | serif     | Atlas Grotesk | Tiempos Text | system                        | —                                          |
| kpop-generations          | sans      | ABC Diatype   | Tiempos Text | system                        | ABC Maxi Plus (h2 display)                 |
| similes                   | serif     | Atlas Grotesk | Tiempos Text | system                        | —                                          |
| ivf                       | sans      | Atlas Grotesk | Canela       | system                        | Canela (display serif)                     |
| happy-map                 | serif     | Atlas Grotesk | Tiempos Text | system                        | Playpen Sans (handwriting)                 |
| womens-sizing             | serif     | Atlas Grotesk | system serif | system (mono-heavy)           | —                                          |
| motifs                    | sans      | Atlas Grotesk | Tiempos Text | system                        | —                                          |
| democracy                 | serif     | Atlas Grotesk | Iowan first  | JetBrains Mono                | JetBrains Mono                             |
| walk                      | serif     | Atlas Grotesk | Tiempos Text | system                        | —                                          |
| onions                    | serif     | Atlas Grotesk | Tiempos Text | system                        | —                                          |

Findings:

- The house set (Atlas Grotesk, Tiempos Text, Atlas Typewriter) is the default.
  Most stories keep it and change at most one family.
- A story's typographic personality usually comes from one swapped-in font
  used in a single role: a display face for headings (Canela, ABC Maxi Plus,
  Tiempos Headline), a handwriting face (Playpen Sans), or a themed pair
  (EB Garamond + Courier Prime).
- The serif/sans split for body text is roughly 2:1 in favour of serif.
  Data-heavy stories lean on mono for labels.
- Licensing: EB Garamond, Courier Prime, Playpen Sans, JetBrains Mono and
  Source Sans/Serif/Code are free (OFL, Google Fonts). Atlas, Tiempos, Canela
  and ABC Diatype/Maxi are commercial. The house fonts are served from
  `pudding.cool/assets/fonts/`.
- Unused faces are common (essential-words ships the whole Source family
  unwired). The system should say to load only what's used.

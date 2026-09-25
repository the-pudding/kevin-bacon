# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install: `pnpm install` (or `npm install`)
- Dev server: `npm run dev`
- Build (static site to `build/`): `npm run build`
- Preview a production build: `npm run preview`
- Lint (Prettier check, then ESLint per `eslint.config.js`, then Stylelint per `stylelint.config.js`): `npm run lint`
- Test (vitest): `npm run test`. Regenerate the layout goldens after an intentional layout change: `npx vitest run -u`
- Stale the tween checklist's rows from the staged diff: `npm run stale` (`--check` only reports; the pre-commit gate runs it)
- Contact sheet of one step transition, frame by frame on a faked clock: `npm run sheet -- <from> <to>` (both directions, mobile box; `--box desktop|wide`, `--click Start` for a gated step). Output under `sheets/`, gitignored. The `tween-sheet` skill is the workflow.
- All quality gates as CI runs them (lint, the design tokens' build check, svelte-check, vitest): `npm run gates`
- WCAG colour contrast of the rendered page at every step (axe-core on a dev server): `npm run a11y` (`--box`, `--steps`)
- Format: `npm run format`
- Sync Google Docs/Sheets micro-CMS content into `src/data` (per `google.config.js`): `npm run gdoc`
- Rebuild the story data from the analysis repo: `ANALYSIS_REPO=<path> npm run scrolly-data`. The env var is required — the script never guesses where the analysis checkout is, since a stale path would silently rebuild the committed data from the wrong inputs. Rarely needed: the output is committed.
- Regenerate the design tokens from `properties/` via Style Dictionary (`variables.css`, the canvas's `tokens.js`, the contrast spec's `tokens.json`): `npm run style`
- Deploy to GitHub Pages (builds, then `rm -rf docs && cp -r build docs`, commits, pushes): `npm run staging`
- Deploy to production/AWS (pudding.cool): `npm run prodution` (typo preserved as-is in `package.json`)
- Password-protect a build (requires `.env` with `PASSWORD=...`): `make protect`, then `make github` or `make pudding`

Tests live in `src/components/scrolly/__tests__/` and run under vitest in plain Node (the layouts import nothing from Svelte; the `.svelte.js` modules compile to plain objects there). By subject: `tween.spec.js` (the tweener's timing, supersede and reframe semantics), `registry.spec.js` (invariants of the state registry in `states.js`), `goldens.spec.js` (a content hash of every state's layout at three canvas boxes, stored as vitest snapshots), `contracts.spec.js` (the frame equalities the framework requires: an entry's last leg, an ambient at t = 0 and a race step's resting frame all reproduce the static layout; and the hidden-spots walk: every dot an arrival brings on starts at the departing state's spot, inside the canvas), `render.spec.js`, `annotations.spec.js`, `choreographer.spec.js` and `race-camera.spec.js` (the visual's extracted modules), `callout.spec.js` (the race chart's callouts: which one a frame draws, and which side of its ring the note lands on), `scatter-quiz.spec.js` (the pair quiz's answer and its verdict colours — named rather than hashed, because a golden is keyed on the params JSON and so cannot catch a change that renames the key), `step-registry.spec.js` (the wizard: gates, skipback, the bar's dots) and `stale-checklist.spec.js` (the checklist script's rules, and that the table matches the `<Step>` list). The goldens are the automated half of the tween sign-off below: a refactor that changes nothing keeps every hash, and an intentional layout change regenerates its golden in the same commit.

## Terminology

- "step N" always means step **index** N: the zero-based index in the
  `?step=N` query parameter, which is the same index the `notes/tween-checklist.md`
  rows are numbered by. It is never an ordinal ("the Nth step") and never a
  chapter, state or layout name.

## Tween sign-off

`notes/tween-checklist.md` is the manual sign-off record for every step
transition — the only regression net the story's motion has.

- **ALWAYS** mark every affected step `[!]` (stale) in that checklist after
  changing anything that alters what the canvas does: a `layouts/*.js` function,
  `tween.js`, a layout module (`attr-buffer.js`, `palette.js`, `plot.js`, `cast.js`,
  `rank-geometry.js`, `scatter-scales.js`, `trails.js`, `intro-geometry.js`,
  `sky.js`), `ScrollyVisual.svelte` or its modules (`render.js`, `annotations.js`,
  `choreographer.js`, `race-camera.js`, `arrival-marks.js`), `Stage.svelte`, `states.js`, a state's
  entry/reveal/delay/ambient/camera config, an over-canvas panel, the registry or
  arrival rules (`step-registry.svelte.js`, `arrivals.js`), or the `<Step>` list
  in `Index.svelte`. `npm run stale` applies these rules from the staged diff, and
  the pre-commit gate refuses a commit that skipped it.
- **ALWAYS** stale the step either side of a changed step as well — a tween has
  two ends.
- **ALWAYS** renumber the checklist rows when a `<Step>` is added, removed or
  reordered.
- **NEVER** mark a row `[x]`. Only Owen signs a row off, after looking at it.
- **ALWAYS** read the transition's contact sheets (`npm run sheet`, the
  `tween-sheet` skill) against `notes/design/motion.md` before reporting a
  motion change as working. A claim about what the canvas does that no sheet
  backs is a guess.

## Architecture

This is The Pudding's `svelte-starter` template (SvelteKit 2 + Svelte 5 with runes, statically exported via `@sveltejs/adapter-static`), being used here to build a step-driven data-journalism piece, "Gen Z's Kevin Bacon" (see `notes/storyboard.md` for the content/visual plan). The reader advances via a prev/next wizard, not scroll — "scrolly" in names is historical (see `notes/scrolly-framework.md`).

- **Entry point**: `src/routes/+page.svelte` is the single page for the app; actual story content starts in `src/components/Index.svelte`. `src/routes/+layout.js` sets `prerender = true` and `trailingSlash = "always"` for static hosting.
- **`docs/` is generated build output**, not documentation — the `staging` script wipes and repopulates it from `build/` for GitHub Pages. Never hand-edit or add project notes there; anything placed in `docs/` will be deleted on the next deploy. Planning/notes docs live in `notes/`.
- **No data analysis lives here.** This repo is the presentation layer only. The metrics behind the story (average distance, rankings, costar measures, the Monte Carlo simulation) are computed in a separate data-analysis repo and arrive here as pre-exported JSON/CSV, which `npm run scrolly-data` joins into `src/data/scrolly-nodes.json` and `src/data/scrolly-story.json`. Those two generated files are committed, so the app builds without the analysis repo present.
- **Path aliases** (defined in both `vite.config.js` and `jsconfig.json`): `$actions`, `$components`, `$data`, `$routes`, `$runes`, `$styles`, `$utils` all resolve into `src/`.
- **Data flow**: small datasets can be imported directly (CSV via `@rollup/plugin-dsv`, JSON, SVG); anything needing server-side processing goes through `+page.server.js`, which returns data consumed in `+page.svelte` and exposed to components via `getContext("data")`.
- **Micro-CMS**: `google.config.js` lists Google Docs/Sheets to pull in via `npm run gdoc`, parsed with ArchieML and written into `src/data`.
- **Styling**: global styles live in `src/styles` and are pulled into `app.css`; every colour and font is a design token authored in `properties/` (primitives, then role groups: surface, prose, chart, annotation, mark, control, type) and compiled via Style Dictionary (`npm run style`) — components read role tokens only, which Stylelint and ESLint enforce. See `notes/design/tokens.md`.
- **Component layers** under `src/components/`:
  - `scrolly/` — the story's object-constancy visual framework (canvas dots tweening between per-step layout states, driven by the active step index from `scrolly/TapNav.svelte` through the step registry, `scrolly/step-registry.svelte.js`, which `Index.svelte` creates). `scrolly/Stage.svelte` is the layout shell — the canvas, the over-canvas panels, the prose column and the navigation — and `Index.svelte` is the prose and the `<Step>` list. Architecture and contracts documented in `notes/scrolly-framework.md` (the map) and `notes/design/` (per-chart reasoning) — read the map before touching these files.
  - `helpers/` — the CMS helpers and `Tip.svelte`. The story's step driver is not here: it is `scrolly/TapNav.svelte` (tap gutters + arrow keys) against the registry `Index.svelte` creates.
  - `ui/` — bits-ui-based headless UI wrappers (Button, Checkbox, InfoTerm, Select, Slider, ToggleGroup). Each is styled from a global `src/styles/ui.<name>.css` that must be `@import`ed by `src/styles/ui.css`, not from a scoped `<style>` block.
- `src/runes/` — Svelte 5 rune-based state utilities (`useWindowDimensions`, `useClipboard`, `useFetcher`, `useWindowFocus`); the `runed` package is also preloaded for more.
- `src/actions/` — Svelte actions (`canTab`, `checkOverlap`, `focusTrap`, `keepWithinBox`, `inView`, `resize`).
- `src/utils/` — plain JS helpers (CSV/JSON/image loading, localStorage, URL params, transforms).
- Node >= 22.22.0 is required (`.node-version` pins 24.13.1); `.npmrc` sets `engine-strict=true`.

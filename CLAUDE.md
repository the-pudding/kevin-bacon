# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install: `pnpm install` (or `npm install`)
- Dev server: `npm run dev`
- Build (static site to `build/`): `npm run build`
- Preview a production build: `npm run preview`
- Lint (Prettier check, no separate linter): `npm run lint`
- Format: `npm run format`
- Sync Google Docs/Sheets micro-CMS content into `src/data` (per `google.config.js`): `npm run gdoc`
- Regenerate CSS/JS design tokens from `properties/` via Style Dictionary: `npm run style`
- Deploy to GitHub Pages (builds, then `rm -rf docs && cp -r build docs`, commits, pushes): `npm run staging`
- Deploy to production/AWS (pudding.cool): `npm run prodution` (typo preserved as-is in `package.json`)
- Password-protect a build (requires `.env` with `PASSWORD=...`): `make protect`, then `make github` or `make pudding`

There is no test suite/framework configured in this project.

## Architecture

This is The Pudding's `svelte-starter` template (SvelteKit 2 + Svelte 5 with runes, statically exported via `@sveltejs/adapter-static`), being used here to build a step-driven data-journalism piece, "Gen Z's Kevin Bacon" (see `notes/storyboard.md` for the content/visual plan). The reader advances via a prev/next wizard, not scroll — "scrolly" in names is historical (see `notes/scrolly-framework.md`).

- **Entry point**: `src/routes/+page.svelte` is the single page for the app; actual story content starts in `src/components/Index.svelte`. `src/routes/+layout.js` sets `prerender = true` and `trailingSlash = "always"` for static hosting.
- **`docs/` is generated build output**, not documentation — the `staging` script wipes and repopulates it from `build/` for GitHub Pages. Never hand-edit or add project notes there; anything placed in `docs/` will be deleted on the next deploy. Planning/notes docs live in `notes/`.
- **`references/pudding-post`** is a git submodule (prototype Storybook components) kept purely as a visual/interaction reference for this story's charts. These prototypes are not mobile-first and should not be copied as-is — adapt them following `notes/storyboard.md` and mobile-first practices.
- **Path aliases** (defined in both `vite.config.js` and `jsconfig.json`): `$actions`, `$components`, `$data`, `$routes`, `$runes`, `$styles`, `$svg`, `$utils` all resolve into `src/`.
- **Data flow**: small datasets can be imported directly (CSV via `@rollup/plugin-dsv`, JSON, SVG); anything needing server-side processing goes through `+page.server.js`, which returns data consumed in `+page.svelte` and exposed to components via `getContext("data")`.
- **Micro-CMS**: `google.config.js` lists Google Docs/Sheets to pull in via `npm run gdoc`, parsed with ArchieML and written into `src/data`.
- **Styling**: global styles live in `src/styles` and are pulled into `app.css`; design tokens are authored in `properties/` and compiled to CSS/JS via Style Dictionary (`npm run style`).
- **Component layers** under `src/components/`:
  - `scrolly/` — the story's object-constancy visual framework (canvas dots tweening between per-step layout states, driven by the active step index from `helpers/Wizard.svelte`). Architecture and contracts documented in `notes/scrolly-framework.md` — read that before touching these files.
  - `helpers/` — interaction helpers; `Wizard.svelte` (the story's prev/next step driver) and the CMS helpers are in — most others live under `helpers/migrate/` and `layercake/migrate/` as unmigrated starter templates.
  - `layercake/` — LayerCake chart primitives (requires installing the `layercake` package before use).
  - `ui/` — bits-ui-based headless UI wrappers (Button, Checkbox, Select, Slider, Switch, ToggleGroup).
- `src/runes/` — Svelte 5 rune-based state utilities (`useWindowDimensions`, `useClipboard`, `useFetcher`, `useWindowFocus`); the `runed` package is also preloaded for more.
- `src/actions/` — Svelte actions (`canTab`, `checkOverlap`, `focusTrap`, `keepWithinBox`, `inView`, `resize`).
- `src/utils/` — plain JS helpers (CSV/JSON/image loading, localStorage, URL params, transforms).
- Node >= 22.22.0 is required (`.node-version` pins 24.13.1); `.npmrc` sets `engine-strict=true`.

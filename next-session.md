# Handoff: Fill the 26px white strip above full-bleed galaxy states

## Starting Prompt

In `/Users/owen/src/Personal/kevin-bacon` there's a 26px white strip across the top of the viewport on the story's full-bleed "galaxy" steps (`?step=2` hopSeed, the chapter cards at 3/12/20, and `?step=28` outro). The dot field should run right to the top edge on those steps. Implement the vertical-bleed fix described below. Read `notes/scrolly-framework.md` and the "Tween sign-off" section of `CLAUDE.md` before touching `src/components/scrolly/`.

**Why the obvious fix is forbidden.** `.scrolly-visual` sits at `top: var(--title-band)` (26px, `Index.svelte:1126,1138-1140`), so the canvas element does not extend into that strip and nothing drawn on it can fill it. Making that box taller — even conditionally, per state — changes the element's `clientHeight`, which is bound to `height` in `ScrollyVisual.svelte:2434`. `ScrollyVisual.svelte:1991` computes `resized = width !== prevW || height !== prevH || canvasWidth !== prevCanvasW`, and a resize calls `stopSweep()` and takes the instant snap branch at `ScrollyVisual.svelte:2158`. Outro's 4s pull-back animates in from `raceClose`, which _has_ a title while outro does not — so a per-state offset resizes the canvas exactly on that transition and snaps the story's closing animation. This was already tried and reverted; see commit `77f92da`'s message. **Do not make `width`, `height` or `canvasWidth` depend on the band.**

**The fix — the vertical twin of the existing horizontal bleed.** The canvas backing store already spans _wider_ than the measured box, with the origin pinned to the wrapper's left edge so layout coordinates keep meaning the same screen pixels; only layouts that deliberately author outside `[0, width]` see the extra room. That's `ScrollyVisual.svelte:2005-2016` (`canvas.width = canvasWidth * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, 0)`) and its comment. Do the same vertically, with a **constant** band (never per-state, never measured — a varying band would re-introduce the resize):

1. `ScrollyVisual.svelte:2752` — canvas CSS: `top: calc(-1 * <band>)`, `height: calc(100% + <band>)`.
2. `ScrollyVisual.svelte:2013` — backing store: `canvas.height = (height + BAND) * dpr`.
3. `ScrollyVisual.svelte:2015` — transform: `ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, BAND * dpr)`. This is what keeps every chart on the exact same screen pixels it occupies today.
4. `ScrollyVisual.svelte:1499` — `ctx.clearRect(-bleed, -BAND, width + bleed * 2, height + BAND)`.
5. `layout-shared.js:960` — `galaxyBox` y0 from `0` to `-BAND`, so only the full-bleed states author into the new strip.

`height` passed to layouts is unchanged, so **no chart moves and no box resizes**. The DOM overlay layers (`.annotations`, `.hits`, `.overlay`) need no change, for the same reason the horizontal bleed doesn't disturb them: the origin is preserved.

**Open decision — where the band constant lives.** It exists today only as CSS `--title-band: 26px` (`Index.svelte:1126`) and the render path needs the number in JS. Cleanest is the repo's Style Dictionary token pipeline (`properties/`, `npm run style`, which emits both CSS and JS); the alternative is a `TITLE_BAND` constant in `layout-shared.js` with the CSS var commented as its twin. Ask Owen which he wants rather than silently duplicating the number — this repo is strict about single definitions.

**Verify before reporting done.** `npm run dev`, then step _into_ (don't land on) each of: `?step=2` hopSeed's pull-back, `?step=28` outro's 4s pull-back arriving forward from 27, and the chapter cards at 3/12/20. The outro pull-back must _animate_, not snap — that's the exact regression this design avoids. Also check a couple of charted steps (e.g. 10, 18) are pixel-unchanged. Per `CLAUDE.md`, this is shared machinery, so mark the whole `notes/tween-checklist.md` table `[!]`; never mark a row `[x]` — only Owen signs rows off.

**Working tree warning.** There is unrelated in-progress work not to be committed: `src/components/results/`, `src/utils/analytics.js`, `supabase/*`, `.env.example`, `package.json`, `cspell.config.yaml`, `tasks/seed-quiz-analytics.js`, `untitled.md`. Stage only the files you touch — the previous commit did this by extracting the wanted hunks into a patch and `git apply --cached`, since `Index.svelte` carries both mine and someone else's changes. Don't commit without Owen asking.

## Relevant Files

- `src/components/scrolly/ScrollyVisual.svelte` — the render path; all but one edit lands here. Lines 1499 (clearRect), 1991 (`resized`), 2005-2016 (backing store + transform, and the comment stating the design principle to copy), 2158 (snap branch), 2433-2436 (the size bindings), 2752 (canvas CSS).
- `src/components/scrolly/layout-shared.js` — `galaxyBox` at line 960 (the one-line layout change).
- `src/components/Index.svelte` — `--title-band: 26px` (1126) and `.scrolly-visual` (1138-1140); `.scrolly-visual.exited` (1151) goes `position: fixed; inset: 0`, where the extra strip simply falls off-screen.
- `notes/scrolly-framework.md` — architecture/contracts; read before editing `scrolly/`.
- `notes/tween-checklist.md` — the only regression net for motion; must be staled.
- `CLAUDE.md` — tween sign-off rules and the repo's design principles.

## Key Context

- **Done and committed** (`77f92da`): edge fade removed for all galaxy crowds (`fieldEdgeAlpha` and `FIELD_FADE_PX` deleted outright — every caller used `galaxyBox`, so the parameter would have been dead weight), and progress dots hidden on hopSeed and outro via a new `hideBar` flag on `<Step>` → `StepProgress` (the mechanism chapter cards already used through `steps.chapter`).
- **Attempted and reverted in the same commit**: gating the `--title-band` offset on whether the active state has a title. Owen caught the snap. The commit message records this so it isn't retried.
- Only `hopBands` carries a `title` among the early states; `lone`, `networkIntro`, `hopSeed`, `chapterCenters` and `outro` have none — which is why a title-driven offset straddles exactly the animated transitions.
- `galaxyBox` consumers (the states that will gain the strip): `hop-bands.js:148` and `:175` (hopSeed static + `zoomOutFrames`), `chapters.js:65`, `race.js` `layoutOutroGalaxy`/`outroGalaxyFrames`, and `intro.js:188` (parked invisible, no visual effect).
- Pre-commit runs lint-staged: prettier, cspell and svelte-check. cspell rejected an invented compound ("title" + "less") in a code comment last session and failed the commit — watch comment vocabulary.
- Jump to any step with `?step=N`; landing by URL paints without a transition, so step _into_ a step from its neighbour to actually see the tween.

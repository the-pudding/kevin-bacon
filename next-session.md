# Handoff: Tween performance sweep across every step transition

## Starting Prompt

Goal: measure how every step transition in the story performs, forward and
back, with the method the 6→7 investigation used (2026-10-09, commit
`0cc25d4`). Produce a ranked table of the worst presses, then find the cause
of the top few with evidence. **Report findings and proposed fixes; change no
`src/` code without Owen's go-ahead.** Some of the costs are design choices,
like 6→7's 22.5k converging dots.

Context:

- **Method:** a production build with the `?step` DEV gate removed, served
  statically, Chromium headless with a 4× CDP CPU throttle, real clock. Press
  the arrow key and record rAF frame intervals for 2s, plus a CDP trace with
  the v8 CPU profiler, then break each long task into script, style, layout
  and Commit.
- **What 6→7 taught:**
  1. **Slow `Commit` frames:** `LayerTreeHost::DoUpdateLayers` with no children
     was the 2D canvas raster, not DOM. Time it directly by calling
     `ctx.getImageData(0,0,1,1)` at the end of `drawScene` (scratch copy only)
     and count the dots `drawDots` draws per frame.
  2. **Ablations can stop the tween:** removing the rank panel stopped the
     tween itself, because `rankFocus` waits on `story.rank.focusBar`, so it
     read as 60fps. For every ablation, confirm the canvas still moved (dot
     count per frame, or a sheet).
  3. **Invalidation tracing:** the trace category
     `disabled-by-default-devtools.timeline.invalidationTracking` names the
     elements restyled or relaid each frame.
  4. **Forced restyles:** Svelte `fade`/`fly` call `getComputedStyle`, so a
     big mount in the same flush shows up as `fade` self time.
- **Profiles:** use 390×844 at DPR 3 for comparison with the 2026-09-24
  review, and 375×667 at DPR 2 (the support floor). Add an unthrottled run
  for the worst few.

Do this:

1. Read `CLAUDE.md`, `notes/scrolly-framework.md`, and the memories
   `mobile-perf-review`, `tween-sheet-pitfalls` and `node-24-via-nvm-path`.
   Prefix every node command with
   `export PATH=$HOME/.nvm/versions/node/v24.13.1/bin:$PATH`.
2. **Build a scratch copy:** `rsync` the repo, excluding `node_modules`,
   `.svelte-kit`, `build`, `docs`, `sheets`, `screenshots` and `.git`, into
   the scratchpad, and symlink `node_modules` back to the repo. In
   `src/components/scrolly/step-registry.svelte.js`, replace
   `!import.meta.env.DEV || typeof window` with `typeof window`. Run
   `npx vite build --minify false` (unminified, so profiles keep names). Serve
   it with `python3 -m http.server <port> --bind 127.0.0.1` in tmux. The
   server occasionally stalls on a `goto`; rerun that one. Never build inside
   the real checkout: it shares `.svelte-kit/` with Owen's dev server.
3. **Harness:** copy it from `~/.cache/claude-scratch/kevin-bacon/tween-perf/`
   and point its port at your server:
   - `perf.mjs <from> <outdir> [w h dpr throttle key]` gives frame
     intervals, long-animation-frame entries and `trace.json`. Env vars: `Q`
     appends to the query, `CSS` injects a style for an ablation, `CATS`
     adds trace categories.
   - `analyze.mjs <trace.json> [ms]` gives the long tasks with their
     style/layout/commit split, and CPU self and total time.
   - `flush.mjs <from> [key throttle dpr]` gives per-frame canvas raster time
     and dot count. It needs the `__rec`/`__n` instrumentation patched into
     the scratch `ScrollyVisual.svelte` (`drawScene`, after `ctx.restore()`)
     and `render.js` (`drawDots`, `addDot`).
   - `centre.mjs` is a before/after geometry check against a pristine HEAD
     build (`git archive HEAD`).
4. **Sweep:** list the steps with `scripts/story-steps.js` (`parseSteps`),
   then run `perf.mjs` for every N→N+1 (ArrowRight) and N+1→N (ArrowLeft).
   - A gated step (`gate={NEVER}`: steps 7, 9 and others) refuses the arrow.
     Press its control instead (`--click`-style, e.g. "Skip"; a Playwright
     button click).
   - Step 3 is the `Splash`; check how it advances.
   - Record worst frame, the first 6 intervals, average fps over 2s, and the
     count of frames over 50ms. Run each pair twice: run-to-run noise is real.
5. Rank the transitions. For the top 3–5, trace and profile them, ablate,
   and confirm the cause. Before claiming anything about what the canvas
   does, read the transition's tween sheet (`npm run sheet -- <from> <to>
--url <dev server>`, against Owen's running dev server, after checking it
   serves current source).
6. **Write up:** the ranked table, the evidence per cause, and the fix
   options with trade-offs. If Owen wants the harness kept, propose moving
   it into `scripts/perf/` as an npm script.

## Relevant Files

- `src/components/scrolly/ScrollyVisual.svelte`: `drawScene` and the frame
  loop (`createFrameLoop`), where per-frame canvas work happens.
- `src/components/scrolly/render.js`: `drawDots`, `addDot` and the
  per-bucket `Path2D` fills, which are where raster cost scales with dot
  count.
- `src/components/scrolly/layouts/*.js`: what each state draws. `rank.js`
  sends every hop 1–4 actor into Bacon's bar, which is 6→7's 22.5k dots.
- `src/components/scrolly/RankBars.svelte`: the windowed list (`drawn`,
  `DRAWN_ROWS`, `barsOf`) from `0cc25d4`.
- `src/components/scrolly/Stage.svelte`: panels and their mount and fade
  timing.
- `src/components/scrolly/step-registry.svelte.js`: the DEV-only `?step`
  gate to patch in the scratch copy.
- `scripts/story-steps.js`, `scripts/tween-sheet.js` and
  `scripts/lib/story-page.js`: the step list, sheets and story-ready wait.
- `~/.cache/claude-scratch/kevin-bacon/tween-perf/`: the harness (outside
  the repo).

## Key Context

- **6→7 baseline (4×, 390×844, DPR 3):** frames of 483 · 250 · 217 · 117 ·
  83 · 133ms, 24fps. After `0cc25d4`: 300 · 250 · 217 · 100 · 100 · 117,
  31fps. Unthrottled, the press frame went from 117ms to 67ms. The remaining
  frames are canvas raster: 155 → 45ms per frame for 22,530 dots, against
  about 28ms per frame and 3.4k dots on 5→6. Owen accepted leaving that as
  is (2026-10-09).
- **7→8 frames:** 100–150ms during the reveal cascade and scroll to #1, still
  uninvestigated. It's a good early candidate.
- **5→6:** about 49fps, with steady roughly 30ms canvas flushes per frame.
- **HEAD's rank panel height:** varies run to run (list height 547 vs 512px
  at 390×844). That predates this work; don't mistake it for a regression.
- **Headless vs phone:** headless canvas raster is CPU-side, while phones use
  the GPU. Absolute canvas costs are overstated, but the ranking between
  steps still holds. WebKit has no throttle or trace over Playwright, so
  Safari gets frame times only.
- **Commits:** never without Owen's explicit request, use
  `git commit -- <paths>`, and add no AI co-author trailer.
- **This file:** it replaces the overlap-audit handoff, which is still
  recoverable from git (`git show HEAD:next-session.md`).

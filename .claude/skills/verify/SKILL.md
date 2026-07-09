---
name: verify
description: Build/launch/drive recipe for verifying scrolly changes in this repo end-to-end (dev server + headless Chromium screenshots).
---

# Verifying scrolly changes

1. `npm run dev -- --port 5199` (background; log to scratchpad).
2. Drive with Playwright from the scratchpad (install `playwright` there, NOT in
   this repo — Chromium builds are already cached in `~/Library/Caches/ms-playwright`).
3. Steps are `.scrolly-steps .step` (Step.svelte renders `div.step`, not
   `section`). Scroll a step active with
   `steps[i].scrollIntoView({ block: "center", behavior: "instant" })`, then
   wait ~4s (the networkIntro reveal runs ~2.8s of staggered delays + 700ms tween).
4. Capture: `page.on("console"/"pageerror")` for errors; screenshot per step.

Flows worth driving every time:

- steps 0 → 1 → 2 (lone → networkIntro → network), settled + mid-reveal
- backwards 2 → 1 → 0 (edges must re-draw, no orphan labels/pulse ring)
- flick 0 → 2 with ~350ms between (mid-tween retarget, no snap-back)
- `page.emulateMedia({ reducedMotion: "reduce" })` — everything jumps, no pulse
- viewports 320×568, 390×844, 900×800

Gotchas:

- If a state layout produces NaN the canvas goes blank silently — a blank
  screenshot with no console error usually means bad attr values, not a crash.
- The dev page shows an FPS readout (dev spike in ScrollyVisual) — ignore it.
- `npm run build` + `npm run check` + `npm run lint` + `npm run spellcheck` are
  the CI-ish gates; `check` has ~41 pre-existing errors in unmigrated
  `*/migrate/` templates — only look at scrolly/Index diagnostics.

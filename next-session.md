# Handoff: Build on raceRecent's animation, on top of the new label de-collider

## Starting Prompt

The race chart (`src/components/scrolly/layouts/race.js` + `ScrollyVisual.svelte`) just got a label de-collision/easing system ported from the pudding-post reference (`src/components/scrolly/label-decollide.js`), and `raceRecent`/`raceTrades` now name all four contenders (Samuel L. Jackson, Gene Hackman, Robert De Niro, Frank Welker) instead of one or three. Landed in commit `a766b00` (bundled with an unrelated repo-hook refactor — ignore that part).

I want to keep building on `raceRecent`'s animation now that labels can handle four names at once without colliding. Before proposing specific next steps, read `notes/scrolly-framework.md` in full (especially "Known gaps / next steps" and "Annotations (labels + pulse)"), and re-read `layouts/race.js` plus `drawScene()`/`playRaceEntry()`/`scrubLoop()` in `ScrollyVisual.svelte` to understand the entry-sweep choreography (`revealFrom: ["rankReveal"]` on `raceRecent`, driven by `runSweepPhase`/`writeRaceSweepFrame`).

Then help me figure out where to take the animation next — candidates to evaluate (discuss trade-offs first, don't just build all of them):

1. **Leader-line polish**: the de-collider draws a plain canvas stroke from dot to displaced label at fixed 0.4 alpha — no fade-in/out, so it can pop in/out abruptly as offsets cross the 0.5px threshold. Consider easing the leader's own alpha alongside the offset.
2. **Entry-sweep choreography for 4 labels**: check whether 4 simultaneously-arriving labels read clearly during the `raceRecent` draw-on sweep, or whether they should stagger in (similar to the existing `trailDelays` "dots land first, lines unspool after" pattern).
3. **Reduced-motion path**: confirm the de-collider's easing is skipped/instant under `prefers-reduced-motion` — it currently isn't wired to `reducedMotion` at all, unlike the sweep/scrub loops.
4. Anything else `notes/scrolly-framework.md`'s "Known gaps" flags that's now unblocked by a working de-collider (e.g. it mentions overlay label swaps not crossfading — the same easing idea could apply there).

Start by reading the files below, then come back with a short options list before writing code.

## Relevant Files

- `src/components/scrolly/label-decollide.js` — the de-collision/easing module (id-keyed, exponential ease, `LABEL_MAX_OFFSET_PX`/`LABEL_EASE_MS`).
- `src/components/scrolly/ScrollyVisual.svelte` — `drawScene()` (label offset + leader-line drawing, ~line 400-440), `playRaceEntry()`/`runSweepPhase()` (entry sweep), `scrubLoop()`/`startScrub()` (scrubber), `reducedMotion` state (~line 218).
- `src/components/scrolly/layouts/race.js` — `raceRecent`/`raceTrades`/`raceFull` state definitions, `labels`/`labelDirs`, `writeRaceSweepFrame`, `RACE_ENTRY_WINDOW`.
- `notes/scrolly-framework.md` — read "Annotations (labels + pulse)" and "Known gaps / next steps" before proposing changes.
- `src/components/Index.svelte` — `<Step state="raceRecent">` wiring (~line 199).

## Key Context

- The de-collider only applies to labels with a `labelDirs` "left"/"right" override — below-dot labels are untouched (deliberate scope limit).
- `raceRecent`'s four labels are all `"right"` now; `raceTrades`'s old hand-placed Welker "below" workaround is gone, replaced by the automatic de-collider.
- Verified visually via headless-Chromium screenshots (`?step=6/7/8`) and a drag-test of `RaceScrubber`'s `.drag-surface` — no console errors, no overlap. No automated test suite in this repo — verification is manual/visual via `npm run dev` + browser.
- This repo has a pre-commit hook (lint-staged + a "gate" step) that can sweep in unrelated unstaged changes and rewrite the commit message — it did so this session (commit `a766b00` also contains an unrelated "remove ready build gate" refactor). Check `git show --stat HEAD` after committing to confirm what actually landed.

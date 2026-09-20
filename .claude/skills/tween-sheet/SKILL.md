---
name: tween-sheet
description: Look at a step transition frame by frame before claiming it works. Use after any change that alters what the canvas does (a layout, tween.js, ScrollyVisual and its modules, Stage, states, an entry/ambient/camera config, the Step list) and whenever asked whether a transition looks right.
---

# Tween sheet

The tweens are sub-second, so a screenshot on the wall clock proves nothing.
`npm run sheet` plays one step transition on a faked clock and tiles its frames
into a contact sheet you can read. A motion fix is not done until its sheet has
been read against `notes/design/motion.md`; "the code looks right" is not
evidence.

## Workflow

1. **Find the affected transitions.** `npm run stale -- --check` (or the rows
   `npm run stale` marks `[!]`) names the steps; a step index N means the moves
   N-1 → N and N → N+1, both directions. Adjacent steps are both ends of one
   tween.
2. **Take a baseline before changing anything** when the change is a fix:
   `npm run sheet -- <from> <to> --out sheets/before`. Without it there is no
   way to say what the change did.
3. **Make the change.**
4. **Sheet every affected transition**: `npm run sheet -- <from> <to>`. The
   default is both directions on the mobile box; add `--box desktop` or
   `--box wide` when the change touches a layout that differs by box (the
   side-by-side chapter cards above 1200px).
   - A gated step refuses the arrow; leave it by its own control with
     `--click "Start"` (or the button's visible text).
   - A long choreography (the race sweep, the simulation) needs a wider window:
     `--ms 5000 --frames 16`.
   - **The HTML layer needs `--real-clock`.** The faked clock is exact for the
     canvas, but a transition that has not started yet has no animation to seek
     and one starting between frames is dated to the later frame — which is
     enough to mis-time the prose, the axes, the bar and a panel, and cost the
     2026-09-19 audit three retracted findings. Its floor is the cost of a
     screenshot (~200ms), so it shows the ORDER things arrive in, not the shape
     of a 200ms fade; for that, read computed styles at fixed delays instead of
     taking pictures.
   - The script starts its own dev server; pass `--url http://localhost:5173/`
     to reuse one that is already running.
5. **Read every sheet** with the Read tool (`sheets/<from>-<to>-<box>/sheet.png`),
   and the full-size `frames/NN.png` when a detail is too small on the sheet.
   Check each rule in `notes/design/motion.md`'s table, in order. The Δ column
   is the pixel change since the previous frame: a hump is a tween, a spike is a
   pop, a plateau after landing is the sky.
6. **Report with evidence.** Say which sheet you read, what happened at which
   time, and which rule each observation bears on. Quote the sheet path so Owen
   can open it. Compare against the baseline where there is one. Say plainly
   when the sheet shows something you did not intend, or something you cannot
   judge from frames.

## Reading the output

- `landed on step N` confirms the press moved the story. `!! landed on step N,
  not M` means the move was refused (a gate) or passed through (`skipback`);
  the sheet then shows the refused frame, not a transition.
- `report.json` holds each frame's Δ and the bounding box of what changed,
  for a numeric comparison between two runs.
- Frame 0 is the resting frame of `<from>` after a 5 s settle; "settled" is 5 s
  after the last frame. Everything between is the transition at equal
  intervals.

## Limits

- CSS animations and Svelte transitions are seeked to the same timeline, but
  one that starts between two frames is dated to the later frame. Use
  `--real-clock` for anything in HTML (see step 4).
- Run against a static build served from a scratch directory, not a dev server:
  every vite server and `npm run build` in this checkout share `.svelte-kit/`,
  and a regeneration reloads the page under the sheet and swallows the press
  ("!! landed on step N, not M"). Build once, serve `build/` with
  `python3 -m http.server`, and pass `--url`; runs then go four-wide.
- Reduced motion is not covered; check it by hand.
- Whether a stagger *feels* right is still a judgement. The sheet shows the
  order; it does not show the pace between frames finer than the interval.
  Tighten `--ms` around the moment in doubt when it matters.

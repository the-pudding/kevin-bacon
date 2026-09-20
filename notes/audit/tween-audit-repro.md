# Tween audit — reproduction of `tween-audit-feedback.md`

2026-09-20. Every item in Owen's desktop pass reproduced, against a **static
build** (`npm run build`, served from a scratch copy on `:8899`) at
**1280×800**, Chromium. Nothing here is a code change — this is only the
evidence that each report is real, plus the cause where the code names it
plainly.

Full frame sets live under `sheets/audit-repro/` (gitignored); the one frame
that carries each finding is copied into this directory as `repro-*.png`.

## Outcome, 2026-09-20

All eleven of Owen's items are now addressed in the working tree. Ten were
defects and are fixed; finding 1 was not a defect but a design decision, which
Owen then overruled — see "Round two" below. Every fix was re-verified by a
second pair of eyes against the final build, not signed off on its author's
report.

| #     | Fix                                                                                                                | File(s)                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 2, 3  | Hold the raw `stepsHeight`; gate with `beside` at the point of use                                                 | `Stage.svelte`                            |
| 4     | `pointer-events: auto` on the drag surface and the slider track only                                               | `RaceScrubber.svelte`                     |
| 5, 6  | `raceChoreography` declares `ownsFurniture`; `swapFurniture` keeps the on-screen per-frame channels within a scene | `layouts/race.js`, `ScrollyVisual.svelte` |
| 7     | Bound the `.node-label` clamp by the canvas, not the reading column                                                | `ScrollyVisual.svelte`                    |
| 8, 10 | `frameDirs`: the template reads the side the last drawn frame used, not the arriving state's map                   | `annotations.js`, `ScrollyVisual.svelte`  |
| 9     | `isResize` qualifies the bare-move term with `stateName === prevState`                                             | `ScrollyVisual.svelte`                    |
| 11    | `careerTrio`/`careerMany` share `scene: "career"`                                                                  | `layouts/career.js`                       |

Three defects were found along the way that nobody had reported:

- **13 → 12 was snapping identically to 21 → 20** — the same bug as finding 9,
  fixed with it. So was **4 → 3**, which was a pop: Bacon appeared at full
  darkness on his mark in a single frame.
- **On mobile at `careerMany` the x-axis label overlaps the tick labels**, and
  renders as `Care20 age30year40`. At rest, on the box motion.md rule 4 calls
  authoritative. It predates all of this — it was simply hidden while the
  furniture was being blanked, and the finding-11 fix stops hiding it.
  **Fixed in round two**, on Owen's instruction.

Two things are recorded as open, neither of them caused here:

- **27 → 28 shows Δ ~20.4 % at t = 1160 ms on the untouched baseline.** Three
  independent baseline runs agree; a fourth put the spike at 1305 ms instead,
  which is the give-away — it is the raceClose furniture's `.fade-in`
  completing between two sheet frames, and the tween-sheet skill already warns
  that an animation starting between frames is dated to the later one. **Nobody
  has established whether a reader sees it.**
- **A resize round trip that crosses `BESIDE_MIN_W` loses four race names at
  step 12.** 10 names before, 6 after, the six on their original pixels —
  nothing moves, four simply stop being drawn. **Pre-existing**: byte-identical
  on the pre-everything baseline and on the fixed tree, confirmed by two
  independent runs. It needs the round trip to cross 1200px — `1280 → 1220 →
1280` returns all ten, `1280 → 1100 → 1280` and `1280 → 1024 → 1280` lose
  four — which is why every single-resize check came back clean. Changing the
  height as well as the width also returns ten.

  The give-away is the middle of the trip: resized to 1024, all ten names are
  still on screen at their **1280 y values, unchanged to the pixel**, though the
  box is now 668 wide and stacked — while a cold load at 1024 shows no names at
  all. So the stacked layout's own answer is "none of these" and the resize
  never asks for it; on the way back the cut runs against the stacked rule. The
  four dropped sit at canvas y 484–532 and the six kept at y ≤ 452, with the
  stacked floor `0.6 × 774 = 464.4` falling exactly between them (the beside
  floor is 0.86).

  That is the trap `notes/design/chapter-cards.md` already names: "A module
  variable is not a signal… a `$derived` that called `plotBottom()` held
  whatever fraction was current when its real dependency — `height` — last
  changed." Holding the height constant is exactly what this round trip does.
  The exact reader is unpinned; the shape is a derived value in the label path
  depending on `plotFrac`/`beside` without declaring it. Reachable by a reader
  dragging a desktop window across 1200px or rotating a tablet, and nothing in
  the checklist covers it. Belongs with whoever owns `annotations.js`/`plot.js`.

- **On mobile the rank panel's box moves 17 px across the rankFocus →
  rankReveal prose swap**, once the arriving copy measures: `bottom: 200px`
  h = 357 at t = 30 ms (the swap's empty grid cell, the hold doing its job),
  then `bottom: 217px` h = 340 at t = 330 ms. **Pre-existing** — identical
  before and after the findings 2/3 fix, which is a provable no-op on mobile
  (when `!beside`, `overlayHeight === stepsHeight`, so the effect is
  byte-equivalent). The box does _not_ move during the raceRecent collapse,
  which is the case the hold exists for. Not fixed.

### Round two, on Owen's decisions

After the ten fixes above, Owen ruled on the items left open. Three more changes
landed; two were declined.

| Item                        | Decision                                                                                               | Fix                                                                                                        | Files                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Finding 1, step 3           | **Do it** — "remove the comment, it's BS. I want the stars to join the galaxy (including opacity etc)" | `hopSeed`'s flight now carries the intro fifteen, and the card's two-clock arrangement collapses to one    | `layouts/hop-bands.js`, `cast.js`, `sky.js`, `layouts/chapters.js` |
| careerMany mobile axis      | **Fix**                                                                                                | The x-axis title takes one of two rows, never a coordinate between                                         | `plot.js`, `ScrollyVisual.svelte`, new `__tests__/plot.spec.js`    |
| `button:disabled:hover`     | **Fix**                                                                                                | Scope the hover away from disabled buttons with `:where(:not(:disabled))` rather than painting it back off | `styles/reset.css`, `styles/ui.button.css`, `PairQuiz.svelte`      |
| Resize round trip           | **Leave** — "don't fix, don't care about resizing stuff"                                               | —                                                                                                          | —                                                                  |
| 24→25 pause, 12→11 duration | **Leave** — "ignore"                                                                                   | —                                                                                                          | —                                                                  |

Notes worth keeping:

- **Step 3's fifteen now sit inside the crowd's range on position, radius and
  alpha.** Bacon goes from `0.0px` of travel at `r 5.33 / α 1.000` to `96.0px`
  at `r 1.59–2.92 / α 0.030–0.406` in `rgb(187,187,187)`. His x is pinned until
  he wraps only because he sits on the sky's horizontal centre, so his ray is
  vertical — geometry, not a hold. Three `hopSeed` goldens move; nothing else
  does, and `chapterCenters` staying put is what proves the extracted
  `restingSkyDot` is numerically identical to the lines it replaced.
- **The axis title had two legible homes and a continuous clamp between them.**
  A card tall enough to lift it off its home but not past the ticks parked it
  on the numbers. Step 24 was clearing by **0.2 px** — luck, not design. The new
  rule is discrete and `plot.spec.js` sweeps every card height the canvas can
  hold, asserting only two coordinates are ever returned, so the dead band is
  outside the function's range rather than merely unvisited.

  It repaired **three** collisions, not one — 320×568 was not clean either:
  step 12 read `25 26 Y2ar 28 29 30` at −12.0 px and step 23 read `25<Year` at
  −5.0 px. 79 of 85 samples are byte-identical, including steps 9 and 20 at
  every size. One honest cost: 320×568 step 10 goes from 5.6 px of clearance to
  2.8 px — still clear, and now consistent with the other lifted steps. A
  browser sweep of 41 cold loads per step across 320–430 × 560–900 goes from
  **8 distinct placements and 15 colliding samples to 2 placements and 0**.

- **`:where()` is load-bearing in the reset fix.** A plain `:not(:disabled)`
  weighs 0,2,1 — heavier than the `button:hover` at 0,1,1 it replaces — and
  newly outranks every component that restates its enabled hover at 0,2,0. That
  first attempt turned the same dark-on-dark onto _enabled_ controls. Anyone
  touching that stylesheet will reach for `:not()`; the comment there now says
  why not.

**One new cost, introduced by the step 3 change and accepted knowingly.**
Stepping _back_, 3 → 2, now has a ~110 ms window (220–275 ms) where the canvas
is nearly bare. Before, the constellation was already in formation at 220 ms
with Bacon dark in the middle, and simply expanded as the camera zoomed in;
now the fifteen are in the sky, so stepping back has to fetch them from
wherever the drift carried them — after a few seconds, the canvas edge and
beyond — and they converge in between 330 and 605 ms, inking up as they travel.
No `motion.md` rule is broken outright: the Δ profile is smooth
(0.6, 0.9, 2.9, 0.7, 0.0, 0.1, 0.2, 0.4, 0.5, 0.5, 0.6), nothing pops, and they
are visible for most of their travel — it is rule 6's out/travel/in done more
literally than before. But the reader loses Bacon as an anchor across the hole.
Softening it means giving `networkIntro` an entry choreography for the arrival
out of `hopSeed` (a camera zoom back in, the fifteen inking up on their marks),
which is `intro.js` and a considerably bigger job. Frames:
`sheets/before-gap/3-2-desktop/` vs `sheets/after-gap/3-2-desktop/`.

**The step card's height collapses to 0 for ~716 ms on every step change**, so
every clearance computed off `stepsHeight` is wrong for that window. Measured
through a real 24 → 25 press at 375×667:

```
rest      stepsH 211  kids 1   xTop 381
  63ms    stepsH   0  kids 1   xTop 417   outgoing child out of flow
 288ms    stepsH   0  kids 0   xTop 417   no children at all
 719ms    stepsH   0  kids 0   xTop 417
 779ms    stepsH 227  kids 1   xTop 381   arriving copy lands
```

`.scrolly-steps` is one absolutely-positioned grid cell: for the first ~160 ms
the outgoing step is still a child but out of flow, and from ~240 ms to ~655 ms
it has no children at all. The x-axis title therefore drops 36 px, holds for
seven tenths of a second, and jumps back.

**Pre-existing** — identical on the pre-everything build — but newly _visible_,
because `scene: "career"` means the furniture no longer fades across 24 → 25,
so the reader watches the excursion instead of it happening behind a fade.
`Stage.svelte:96-118` already documents this exact hazard and works around it
for the rank panel alone (`rankStepsHeight`: "the height is only taken once the
arriving step has landed, and held until then"). The x-axis title and the
over-canvas panels have no such hold. The fix is that same shape applied to
`overlayHeight`, in `Stage.svelte`, and would cover the panels too. Tracked as
task #10, awaiting Owen.

Two further defects were found and **not** fixed, both reported rather than
absorbed:

- **`src/styles/ui.checkbox.css` is not imported by `src/styles/ui.css`** — the
  other six are. So `ui/Checkbox.svelte` renders unstyled and falls through to
  the reset's filled-primary paint. `CLAUDE.md` requires the import. One line;
  Checkbox is currently unused in the story.
- **`hop-bands.js`'s `departureColumn` gives an intro actor a stale column** on
  the 4→5 sort, on the stated grounds that "the intro fifteen are outside the
  flow". They have not been outside it since the card gained its joiners.
  Measured against the crowd's own rule — which reproduces every crowd dot's
  column to **0.00px**, so the metric is the rule — the fourteen affected dots
  (the anchor is excluded; `placeInBand`'s hop-0 branch puts him at `w / 2`
  outright) are off by a median of 12–220px and a worst of 327px depending on
  viewport and where in the cycle the press lands.

  **Look-tested on both boxes and it is not visible**
  (`sheets/4-5-mobile/`, `sheets/4-5-desktop/`): the rain is a dense uniform
  curtain from ~870 to ~1450 ms, the bands assemble with crisp edges and even
  density, and fourteen dots taking a 12–327px diagonal inside a crowd of
  12,097 whose neighbours travel further than that cannot be picked out — not
  even by someone who knows exactly what to look for and where. Filed as latent
  in `notes/design/chapter-cards.md` with what a fix would need. **Not a task.**

  (An earlier "~900px" figure for this, and a "99% of the crowd falls from the
  wrong column" one, were both measurement artefacts — they counted the
  intended contraction from `galaxyBox` into the reading column as error.
  Neither was acted on.)

Two notes for whoever signs these rows off:

- **The default sheet window cannot sign off 11 ↔ 12.** That move runs ~8 s in
  each direction, so the 1.6 s window ends while the camera is still panning and
  reports `settled Δ ~11 %` that is not a pop. Those rows need
  `--ms 9000 --frames 16`.
- **`npm run sheet` lands on `from` by URL**, so any state that exists only
  because the reader walked in is missing from its frame 0. Findings 8 and 10
  were invisible to it for that reason. `sheets/audit-repro/nav-sheet.mjs`
  walks in instead.

## How the frames were taken

- `npm run sheet` for the transitions it can reach. Note it lands on `from` by
  **URL** (`openAt` in `scripts/tween-sheet.js`), so any state that only exists
  because the reader walked into it is missing from its frame 0.
- For items 8, 9 and 10 that mattered: `sheets/audit-repro/nav-sheet.mjs` is the
  same faked-clock capture that **walks** to `from` (arrow keys / a named
  button) before pressing. Findings 8 and 10 are invisible to `npm run sheet`
  as it stands — see "Tooling gap" below.

---

## 1. Step 3 — Bacon's network is pinned while the sky drifts

**Reproduced.** Walked 2 → 3, sampled the canvas every 3 s for 9 s.
The sky's stars move between every frame; Bacon's dot sits at exactly
`(839.5, 312.5)` in all four (dark-pixel centroid, ±0.03 px), and the
constellation around him does not move at all.

`repro-03-network-pinned-t0.png` vs `repro-03-network-pinned-t9s.png` — same dot,
different sky.

Step 29 (`outro`) is the contrast Owen names: there the whole field is the
drifting galaxy and nothing is pinned.

## 2 & 3. Step 7 refresh, and the rank ladder's varying height — one bug

**Reproduced, and deterministic, not intermittent.**

| arrival at a rank step                         | panel inline style | rendered height |
| ---------------------------------------------- | ------------------ | --------------- |
| cold load `?step=7` or `?step=8` (5 runs each) | `bottom: 812px`    | **0 px**        |
| walked in from step 5 or 6                     | `bottom: 12px`     | 678 px          |

`repro-07-ladder-zero-height.png` is Owen's screenshot exactly: canvas carrying
nothing but Bacon's hop bar, prose and guess control intact. The panel _is_
mounted with all 250 rows and `.revealed` at opacity 1 — it just has no height,
because `top: 84px` + `bottom: 812px` exceeds the 774 px canvas.

Cause, in `Stage.svelte:104-109`:

```js
let rankStepsHeight = $state(0);
$effect(() => {
	if (!isRankState(currentState) || !overlayHeight) return;
	if (!rankStepsHeight || story.settled === currentState)
		rankStepsHeight = overlayHeight;
});
```

`overlayHeight` is `beside ? 0 : stepsHeight`. On a cold load `beside` is false
for the first frames (the viewport is not measured yet), so on a rank step the
effect fires once with `overlayHeight = 800` and seeds `rankStepsHeight`. From
then on desktop `overlayHeight` is 0 forever, the guard returns early, and the
800 is never corrected. Walking in never trips it because `beside` is already
true by the time a rank state is current.

So "sometimes full height, sometimes not" is "did this page first load on a rank
step".

## 4. Step 11 — the scrubber is dead to the pointer

**Reproduced, at both 1280×800 and 375×667.** `elementFromPoint` at the slider
thumb's centre returns the `<canvas>`, not the control. Dragging the thumb and
dragging the plot both do nothing. The keyboard still works: focusing the slider
and pressing ArrowLeft five times moves `aria-valuenow` 2006 → 2001.

Cause: `.panel-layer` sets `pointer-events: none` (`Stage.svelte:520`) and
`.race-scrubber-panel` (`Index.svelte:595`) never restores it, so the whole
scrubber inherits `none`. `.control` lifts its `z-index` above the tap gutters
but a z-index cannot bring back pointer events.

`repro-11-scrubber-dead.png`.

## 5. Step 11 → 12 — the future box flashes first

**Reproduced.** `sheets/audit-repro/11-12-desktop/sheet.png`:

- t = 145 ms — the yellow dashed future block and the 25–30 axis paint in full
  (`repro-11-12-future-flash-145ms.png`, which is Owen's screenshot)
- t = 290 ms — gone; axis back to 00–06
- t = 290 → 1595 ms — the real tween runs
- settled — the future view arrives properly

## 6. Step 12 → 11 — the same flicker, mirrored

**Reproduced.** `sheets/audit-repro/12-11-desktop/sheet.png`:

- t = 0–145 ms — step 11's chart (the target) is already on screen
- t = 290 ms — flips back toward the future view
- t = 435 ms — full future view, Δ 20.3 % (`repro-12-11-future-returns-435ms.png`)
- t = 435 → 1595 ms — holds there, Δ ≤ 0.7 %
- settled — jumps to step 11, Δ 11.0 %

**Correction, 2026-09-20.** This entry originally read "the same, mirrored, and
worse", and claimed that across the whole 1.6 s window the canvas shows the step
it is leaving and the arrival happens after it. That second half was wrong, and
it was wrong because the sheet's 1.6 s window ends before the move does — I read
a window that was too short as a defect that wasn't there.

Measured on the real clock, the whole move is: 11 → 12 pans 2006 → 2025 over
0 → 6.3 s, then the strip opens 6.3 → 8.4 s; 12 → 11 closes the strip 0 → 2.28 s
with the camera parked, then pans 2025 → 2006 over 2.28 → 7.9 s. The two
directions land within 0.5 s of each other, and the park on the way back is the
exact mirror of the strip opening on the way in. `notes/design/motion.md` rule 3
(the two directions of a move take comparable time) is satisfied, and rule 10
names `openFuture`/`closeFuture` among the four legs allowed to run long without
a press — the pan is a rate (`REWIND_PX_PER_SEC` 300, clamped by
`REWIND_MS_MAX` 6000), which is what that rule asks for.

**So finding 6 is the flicker and nothing else** — the ~258 ms at the start
where the wrong scene is up, which is the same defect as finding 5. The
duration of the move is by design. Shortening it is a design call with
`REWIND_MS_MAX` or the close leg's proportion as the lever, not a defect fix,
and it needs Owen rather than an agent.

## 7. Step 12 → 13 — labels orphaned mid-screen

**Reproduced.** `repro-12-13-orphan-labels-0ms.png` (frame 0) and frame 1
(t = 145 ms): the race name labels — Samuel L. Jackson, Willem Dafoe, Robert De
Niro, Morgan Freeman, Liam Neeson, Nicolas Cage, Matt Damon, J.K. Simmons —
hold their positions over an otherwise empty canvas for ~290 ms
after the chart has collapsed to a thin column at the left. Owen's screenshot.
The crowd only disperses into the chapter galaxy from t = 435 ms.

## 8. Step 14 → 15 — SLJ and Nicolas Cage flip from left to under

**Reproduced, but only when you walk into step 14.** The labels come from
`params.showFilms`, which a cold load at step 14 never paints, so
`npm run sheet -- 14 15` shows nothing (its frame 0 has no film labels at all).
Walked 13 → 14, then pressed, sampling every 20 ms:

- before the press — "Samuel L. Jackson · 116 films" and "Nicolas Cage · 96
  films" sit **left** of their dots
- t = 20–60 ms — both have moved **under** their dots while the incoming
  "Natalie Portman · 2.23 remoteness" / "Anna Kendrick · 2.40 remoteness" fade
  in (`repro-14-15-label-flip-60ms.png` — Owen's screenshot, frame for frame)
- t = 100 ms — the film labels are gone

The flip lasts under ~80 ms, which is why a 145 ms sheet interval steps over it.

## 9. Step 21 → 20 — no tween, the chart is just there

**Reproduced,** walked back (23 → ArrowLeft passes through the `skipback` step
22 to 21, then ArrowLeft to 20). In the frame of the press the drifting galaxy
behind the chapter title is **already** the finished scatter, in its final
positions: `repro-21-20-no-tween-0ms.png`. Measured against the settled frame,
the dot field is identical from t = 300 ms and differs by only a fading remnant
before that; every sheet frame from 435 ms on is Δ 0.0 %. Nothing travels — the
title fades out over a chart that arrived instantly.

## 10. Step 23 → 24 — the Gen Z labels flip underneath

**Reproduced,** walked (step 22 is gated; left it by "Show Gen Z actors").

- before the press — names sit to the **right** of their dots, cleanly stacked
- t = 100 ms — every name is centred **under** its dot and the pairs collide
  into an illegible smudge: "Ariana Greenblatt"/"Isabela Merced" and
  "Fred Hechinger"/"Maya Hawke", and the bottom pair overlap outright
  (`repro-23-24-label-flip-100ms.png` — Owen's screenshot)

Same shape as finding 8. Also invisible to `npm run sheet`, for the same reason:
the labels only exist because the reader ran the Gen Z draw-on.

## 11. Step 24 → 25 — the furniture leaves and comes back unchanged

**Reproduced, and no, it isn't necessary.**
`sheets/audit-repro/24-25-desktop/sheet.png`:

- t = 0 — title "Film count by career age", both axis titles, ticks 0–50 and
  50/100 all present
- t = 145 → 725 ms — **all of it gone**, blank margins
  (`repro-24-25-furniture-gone-435ms.png`)
- t = 870 ms → — fades back in at identical values and identical positions

Over that same window the plot underneath barely moves (Δ 0.0 % from 290 ms to
725 ms). ~870 ms of the transition is furniture removing and replacing itself
for no change.

---

## Tooling gap worth fixing

`scripts/tween-sheet.js` reaches `from` by URL. Three of the states in this
audit only exist after the reader has _done_ something on the way in —
step 14's film labels, step 23's Gen Z lines, step 21's chapter — so frame 0 of
those sheets is not the frame the reader is actually leaving, and findings 8, 9
and 10 are invisible in it. `sheets/audit-repro/nav-sheet.mjs` is the walked
version used here; folding a `--via` (keys and named buttons to press before the
press being measured) into `npm run sheet` would close it.

Second, smaller: a 145 ms interval steps over label de-collision, which settles
inside 100 ms. Both label findings needed `--ms 200 --frames 11`.

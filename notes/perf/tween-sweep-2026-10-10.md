# Tween performance sweep, 2026-10-10

Every step transition, forward and back, measured the way the 6→7 work was
(commit `0cc25d4`). No `src/` code was changed; every fix below was tried in a
scratch copy only.

## Method

- Production build of HEAD (`0cc25d4`) with the `?step` DEV gate removed,
  built without minification, served statically. Headless Chromium at a 4× CDP CPU
  throttle, on a real clock. Each press was recorded as rAF intervals.
- Two profiles: 390×844 at DPR 3 and 375×667 at DPR 2. Each of the 54 presses
  ran twice per profile, 216 runs in all, with no failures.
- Gated steps were advanced with the arrow key. On a gated step, Next presses
  the step's own control (`onnext`), so no button clicks were needed. A
  `skipback` step is passed over going back, so 8←, 10←, 20← and 25← land two
  steps back.
- For the top transitions: a CDP trace with the v8 profiler, and per-phase
  canvas raster timed with `getImageData` after trails, edges and dots.
  Per-frame dot statistics: count drawn, distinct pixel spots, buckets and area.
- The harness, raw results and the instrumentation diff are in
  `~/.cache/claude-scratch/kevin-bacon/tween-perf/` (outside the repo).

"Lost ms" is the time per run lost to frames longer than 16.7ms, summed over 2s
and averaged over runs.

## Ranked table (4× throttle, the mean of 2 runs)

| #   | Press                      | 390×844@3 fps | worst ms | >50ms | lost ms | 375×667@2 fps | worst ms |
| --- | -------------------------- | ------------- | -------- | ----- | ------- | ------------- | -------- |
| 1   | **25→23**                  | see note      | **3467** | —     | —       | see note      | —        |
| 1   | **24→23**                  | see note      | **3500** | —     | —       | see note      | —        |
| 3   | 20→21 raceGenz→careerTrio  | 15.8          | 133      | 16    | 1452    | 16.0          | 117      |
| 4   | 22→23 careerBacon→Many     | 18.2          | 83       | 13    | 1376    | 17.0          | 83       |
| 5   | 21→22 careerTrio→Bacon     | 18.5          | 83       | 13    | 1368    | 16.5          | 117      |
| 6   | 3→2 (sky)                  | 21.5          | 217      | 2     | 1267    | 26.2          | 183      |
| 7   | 4→3 (sky)                  | 22.8          | 100      | 7     | 1217    | 26.0          | 83       |
| 8   | 2→3 (sky)                  | 25.0          | 167      | 1     | 1129    | 25.0          | 217      |
| 9   | 22→21                      | 27.5          | 100      | 12.5  | 1093    | 26.8          | 100      |
| 10  | 23→22                      | 28.0          | 100      | 13    | 1077    | 27.2          | 117      |
| 11  | 3→4 (sky→hopBands)         | 26.2          | 150      | 1.5   | 1104    | 27.5          | 167      |
| 12  | 6→7 (accepted 2026-10-09)  | 33.0          | 250      | 6.5   | 918     | 34.2          | 217      |
| 13  | 20→18                      | 38.2          | 133      | 10    | 745     | 38.0          | 117      |
| 14  | 7→8                        | 38.0          | 150      | 9     | 753     | 39.5          | 100      |
| 15  | 19→18                      | 38.8          | 100      | 10.5  | 728     | 39.2          | 133      |
| 16  | 18→17, 17→18, 17→16, 16→17 | 40–41         | 100–117  | ~10   | ~670    | 39–41         | 100–150  |
| 20  | 8→6, 7→6                   | 42.2          | 183–200  | 4     | 608     | 46–47         | 167–217  |
| 22  | 13→14, 14→13, 14→15, 15→14 | 46–47         | 100–117  | 7     | ~470    | 46–48         | 83–100   |

Note: in the sweep, 25→23 and 24→23 read as "9fps, worst 50ms". Their 2s
window closed inside a single long frame that hadn't ended yet. With a 5s
window, the worst frame is 3.5s, and it starts about 350ms after the press.

Everything else runs at 44–60fps. The rest of the table is in
`results-2026-10-10/` (`agg.py` prints it). Without throttling, every press is near
60fps except 25→23 (650ms) and 24→23 (817ms).

## Cause 1: one canvas raster of seconds on 25→23 and 24→23 (the worst press)

- **Trace:** one task of 6460ms at 4×, of which 6437ms is `Commit`
  (`LayerTreeHost::DoUpdateLayers`). Script is about 100ms in total. This is
  the 2D canvas raster.
- **Per frame:** the first frame that brings careerMany's crowd on draws
  15,477 dots, 12,812 of them on one pixel, (54,606), and almost all the rest
  on its neighbours. That frame takes 3.9–4.8s to raster. The next frame
  draws the same 15,477 dots spread over 1,702 spots, in about 50ms.
- **Sheet** (`npm run sheet -- 23 25 --dir back`): the crowd comes out of the
  sim chart's dot at the origin and fans out into the career grid. Rule 14's
  hidden spot is a single point here. On a real clock in Chromium the reader
  never sees the fan. The first frame after the block arrives at about 4.3s,
  with the fan already over.
- **Engines:** the cost depends on how the canvas is drawn to pixels.
  - Headless WebKit shows no freeze (worst frame 56ms).
  - Chromium on GPU raster (Metal, M4 Pro) has a worst frame of 67ms
    without throttling.
  - Chromium on CPU raster freezes for 650–817ms without throttling and 3.5s at 4×.
  - Real phones are unmeasured. Android Chrome normally rasters canvas on the
    GPU, which is much weaker than an M4 Pro. Worth one try of 25→23 on a
    phone over remote devtools.

## Cause 2: stacked dots make every career frame expensive (#3–5, #9–10)

The career charts sit on an integer grid of career age by film count. Every
career frame draws about 15,475 circles onto about 1,700 distinct pixels, up
to 98 circles per spot. The raster takes 45–60ms per frame at 4× and is
idle at rest. One bucket's dots fill as a single `Path2D`, so a circle exactly
on top of an identical one adds nothing to the image, but it still costs
raster time.

**Ablation:** skip an exact duplicate (`x`, `y`, `r`) within its bucket in
`addDot`.

| Press                | Raster per frame (4×) | fps, 5s window (4×)          |
| -------------------- | --------------------- | ---------------------------- |
| 21→22                | 45 → 7ms              | 30 → 58                      |
| 22→23                | —                     | 26 → 54                      |
| 22→21                | —                     | 47 → 58                      |
| 23→22                | —                     | 47 → 57                      |
| 25→23                | 3.9s → 14ms           | worst 3467 → 33ms            |
| 24→23                | —                     | worst 3500 → 50ms            |
| 20→21                | —                     | 32 → 51 (2s window: 15 → 33) |
| 7→8                  | 48 → 14ms             | barely changes (cause 3)     |
| 6→7 (converged tail) | 45 → 14ms             | —                            |
| 13→14                | 52 → 39ms             | —                            |

- **Fan-out:** with the duplicates skipped, the fan plays on 25→23: 5, 19, 54,
  182 and 465 spots over the first five frames.
- **Canvas still moves:** the dot count and spot count per frame were checked
  for every ablation above.
- **Image:** the resting canvas is byte-identical with and without the dedupe
  on steps 4, 13, 17, 18, 21, 22, 23 and 26. Step 6 differs between two plain
  runs as well, so it's noise there. Step 8 differs in 16 pixels, by at most
  3/255, where stacked dots' anti-aliased edges summed. That's invisible.
- **Unaffected:** 17→18 and 20→21's mid-flight frames, where the arrival's
  stagger spreads the stack before it lands.

## Cause 3 (7→8): an invisible canvas re-aim, and RankBars rows mounting

- **Trace:** each frame for about 900ms costs about 55ms of `Commit` plus
  40–60ms of script, style and layout.
- **Canvas:** the scroll to #1 publishes a new `focusBar`, and the canvas
  re-aims all 22,530 collapsed dots. The canvas changes for about 700ms, then
  holds. All of its ink stays inside the rank panel's opaque box (background
  `rgb(19, 5, 29)`), so the redraw is work nobody sees.
- **Script, after the dedupe:** about 200ms at 4× of Svelte `each` blocks and
  `create_effect`/`barsOf`. These are the windowed rows (`drawn`) mounting
  their strips as the smooth scroll moves the window, frame by frame. My
  dedupe's string key added another 119ms of `addDot` self time. A real
  version needs a numeric key.

## Cause 4: the sky is slow at rest too, not only after a press (#6–8, #11)

- **At rest:** steps 2, 3 and 27 run at the same rate as their transitions. It
  is about 31ms of raster per frame for about 4.7k visible dots in 10 buckets.
  The rates measured at rest read low (16–17fps) because `getImageData` forces
  a synchronous raster. Uninstrumented, the sky runs at 22–25fps at 4×.
- **The press:** one task of 124–163ms at 4×. It is spread across the layout
  functions (`flowSpot`, `seatOrder`, `layoutHopBands`, `departureColumn`),
  GC (16ms) and Svelte `fade` (8ms).
- **Why sky dots cost more** per dot than career dots (4.7k in 33ms, against
  15k in 44ms) isn't established.

## Cause 5: the scatters' raster (#13, #15–16, #22)

- 13,235 dots in 2–4 buckets take 52–58ms per frame at 4×.
- 375×667@2 gives the same fps as 390×844@3, so the cost follows circle
  count, not pixels. A DPR cap would not help.
- The dedupe helps 13→14 only (52 → 39ms).

## Ruled out: drawing dots as sprites

Drawing each dot with `drawImage` from a cached circle cut the `getImageData`
time (55 → 11ms on the scatters, 44 → 4ms on the careers). End to end, it is
worse. The careers fell from 17.5fps to 9, 7→8 from 36 to 30, and the sky held
around 20fps.

The variant that keeps the merge-not-darken look composites each translucent
bucket as one layer at its alpha. It is worse again: 5–10fps on the sky, and a
worst frame of 667ms on 6→7. The raster moves into `drawImage`, outside what
`getImageData` times.

**Lesson:** confirm every raster saving on end-to-end frame intervals.

## Fix options

1. **Skip exact-duplicate circles per bucket in `addDot`.** This fixes cause 1
   and cause 2, and most of 7→8's raster, with no design change.
   - What it changes: anti-aliased edges where identical dots stacked, within
     3/255 in the pixels measured.
   - Cost: a per-dot hash lookup. It needs a numeric key on the float bits,
     not a string, to stay cheap.
   - Goldens and contracts would be unaffected: the layouts don't change.
2. **On 25→23, don't start the arrivals stacked on one exact point.** For
   example, start them hidden until they've separated, or seed a sub-pixel
   jitter. This is a design change to rule 14's spot, so it's yours to make.
   Option 1 makes it unnecessary for performance.
3. **On 7→8, stop re-aiming the canvas while the opaque panel covers it.** For
   example, hold `rankReveal`'s bar params once the panel is up.
   - Risk: the race handoff reads `listRows`, not `focusBar`, so check
     8→9/9→8. Option 1 already cuts this redraw to 14ms a frame.
   - For the row mounting: let `drawn` follow `scrollend` during a
     programmatic smooth scroll, or pre-draw the destination's window. Rows
     the scroll passes would then show without strips, which is a visible
     trade-off.
4. **Scatters and sky:** no cheap fix found. The remaining lever is WebGL,
   which must keep the per-bucket merge look. The sky is a steady-state cost,
   not a transition cost.

## Caveats

- Headless canvas raster runs on the CPU and overstates absolute canvas cost.
  The ranking between steps holds within Chromium. WebKit doesn't show the
  25→23 freeze at all.
- 19→ and 24→ start the draw-on and the sim, and advance only when those
  land, after the 2s window. Their transitions are 20→21 and 25→26, measured
  separately.

## Implemented (2026-10-11): option 1

`src/components/scrolly/circle-set.js` is an allocation-free open-addressing
set keyed on (bucket id, x, y, r). `addDot` skips any circle its bucket
already holds in the current pass. It is cleared with the buckets
(`clearBuckets`), once per `drawDots` and per late layer.

HEAD against the working tree: scratch production builds, 390×844@3, 4×
throttle, fps over a 5s window, the mean of 2 runs.

| Press | HEAD fps | HEAD worst | New fps | New worst |
| ----- | -------- | ---------- | ------- | --------- |
| 25→23 | 6.5      | 3867ms     | 56.4    | 50ms      |
| 24→23 | 4.2      | 4200ms     | 56.8    | 50ms      |
| 20→21 | 29.0     | 150ms      | 51.9    | 117ms     |
| 21→22 | 28.9     | 100ms      | 59.8    | 33ms      |
| 22→23 | 25.1     | 100ms      | 57.8    | 50ms      |
| 22→21 | 46.2     | 117ms      | 59.1    | 50ms      |
| 23→22 | 46.0     | 117ms      | 59.1    | 50ms      |

6→7, 7→8, 13→14, 17→18, 3→4 and 2→3 are unchanged within run-to-run noise.

- **Resting canvas:** byte-identical to HEAD on steps 4, 13, 17, 18, 21, 22,
  23 and 26. Step 8 differs in 33 values, by at most 3/255. One step-13
  comparison of four differed; its three reruns matched, so that was a
  settle flake.
- **Sheets:** 25→23 shows the same canvas Δ as HEAD from 545ms on, and 21↔22
  reads cleanly in both directions.
- **Gates:** lint, svelte-check, vitest (628) and the contrast scan (56 scans,
  0 violations) all pass. The only Prettier warning is on the uncommitted
  `next-session.md`.

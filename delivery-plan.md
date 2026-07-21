# Delivery Plan: Race-chart path animation + scrub/snap in the scrolly framework

> Successor to `next-session.md`. Tackled one **stage** at a time in fresh sessions — point the new session at this file and name the stage.

## Context

The race chart in the "Past" chapter (`raceRecent`/`raceTrades`/`raceFull`) currently renders as static windowed states. We want to bring in the pudding-post race-chart's hard-won "time machine" animation — actors draw their lines, then travel _back in time along those lines_ — and let the reader drag/select through years. See `next-session.md` for the full brief.

The core incompatibility (established last session): the framework's generic tweener lerps each value straight-line start→target (`tween.js:47`), so a state-to-state morph makes each dot cut a _chord_. Pudding's feel is a per-frame parametric sweep — the domain re-centres on a **playhead year** each frame so a dot stays pinned centre-x and moves _vertically_ along its own curve. That is fundamentally not a two-endpoint tween. The unifying insight: pudding's chart is a **pure function of a playhead year**; autoplay, drag-scrub, and snap-to-year are the same render path with three different clocks. We build one path animator and swap its input.

**Intended outcome:** the race chapter plays a drawLine→rewind entry choreography on arrival, and the reader can scrub/select years — all driven by a single chapter-scoped path animator, integrated cleanly into the one persistent canvas without violating the framework's single-writer discipline.

This is delivered in **6 stages**, each sized for a fresh session. Stages 1→4 are strictly ordered (each depends on the previous). Stage 5 depends on 3. Stage 6 is independent polish, deliberately sequenced **last** (the animator reshapes axes/y-scale per frame, so furniture should settle against the animator's final per-frame rendering rather than be redone).

## Decisions locked (from planning)

- **Furniture fixes come last** (Stage 6), after the animator, not before.
- **Full interactivity scope**: autoplay entry + drag-scrub + select-a-year snap all in.
- Pinned-centre "time machine" feel — one render path, no second static-axis mode.
- bits-ui `Slider` as the year control (sidesteps the Wizard's ArrowLeft/ArrowRight step-nav collision); Pointer Events + `touch-action: pan-y` for the drag surface.
- `scrubYear` feeds the **path animator's playhead** (per-frame curve eval), NOT `tweener.to()` — the one deviation from standard param-driven interactivity.

## Reference implementation (read-only, external to this repo)

The pudding-post race-chart is the reference for Stages 1–5. It is **not** consumed as a submodule (avoids CI/CD issues). Read it from a **local clone of the pudding-post repo** — path provided at session start:

- `<PUDDING_POST_PATH>/design/stories/components/race-chart.js` — `reset` (~L205), `_animate` (~L220), `drawLine` (~L241), `rewind` (~L253); smoothing `monotoneSegments`/`splitCubic`/`clipMonotone` (~L45–123); `visibleYRange` (~L132); `_easeLabelOffsets` (~L323).
- `<PUDDING_POST_PATH>/design/stories/components/RaceChart.stories.js` — phase sequence, `from=2026, to=2006, trailLen=20`.

It is a reference only — read, port, and adapt; nothing in this repo should depend on it at build time.

## Framework contracts every stage must respect

(Confirmed against the code; sources in `notes/scrolly-framework.md` + the files themselves.)

- **Single-writer discipline.** The canvas has exactly two rAF writers today: the dot `tweener` and the `trailTweener`, both created in `ScrollyVisual.svelte` (~L58/L61) and both calling the shared `drawScene`. `to()` snapshots `current` on retarget, so a _second competing writer corrupts tween starts_ (`scrolly-framework.md` "Annotations"). The path animator must `stop()` the generic tweeners while it owns the rAF, and on completion write its final frame into `tweener.current` (and the trail buffer) so the next normal tween snapshots continuously.
- **Next is always clickable; every interaction is skippable.** No interaction may gate Next. Mashing Next must jump to the final windowed state.
- **`prefers-reduced-motion` → instant jumps**, never disabled functionality. Detected live in `ScrollyVisual.svelte` (~L206–212, `reducedMotion` `$state` + matchMedia listener); `ms <= 0` path in `tween.js` is the jump.
- **One persistent canvas.** Do not split into per-chapter canvas instances (object constancy is the premise). Over-canvas HTML UI goes through the `<Step>` `panel` snippet (the `RankBars.svelte` pattern), passing the _same snippet reference_ across steps so it survives step changes.
- **`revealFrom` scoping.** A state's authored `delays` choreography plays only when arriving from listed prior states (`STATE_REVEAL_FROM` in `ScrollyVisual.svelte` ~L268–273); any other arrival is one plain tween.

## Key files (shared across stages)

- `src/components/scrolly/tween.js` — generic tweener. `createTweener(size, draw, stride)` → `{ current, to, stop }`. Linear lerp at L47. `current`/`start` are Float32; layout `target`s are Float64.
- `src/components/scrolly/ScrollyVisual.svelte` — canvas host. Tweeners ~L58/L61; `drawScene` ~L123–204 (trails L129–142, tracked-coord copy L196–203); main `$effect` ~L214–301 (entry/stateChange/paramChange/reduced-motion branches); overlay + notes render ~L334–391 (notes loop L362–371); cleanup `stop()` ~L303–306.
- `src/components/scrolly/layouts/race.js` — `raceLayout(windowYears, tickStep, minEraYears, yCap)` factory; window baked as closure constant at L38; states at L162–178; notes loop L106–122; ticks L123–130; yTicks L131–134.
- `src/components/scrolly/layout-shared.js` — `setTrail` (L202, linear resample), `collapseTrail` (L220), `clipSeries` (L230, linear cut-ends); `TRAIL_POINTS=48`, `TRAIL_STRIDE`, `TRAIL_META`/`RACE_SLOT`/`RACE_IDS`, `set`, `raceRGB`, `lin`.
- `src/components/scrolly/story.svelte.js` — shared interaction `$state` (`story`). Add `scrubYear`/`scrubbing` here (Stage 5).
- `src/components/scrolly/Step.svelte` + `RankBars.svelte` — `panel` snippet pattern for HTML-over-canvas.
- `src/components/ui/Slider.svelte` — thin bits-ui single-value wrapper; `value` is `$bindable`; `min`/`max`/`step`/`onValueChange` pass through `...restProps`; bits-ui handles arrow-key stepping on the focused thumb.

There is no test suite. Verify each stage by running `npm run dev` and stepping through the race chapter; check reduced-motion via DevTools emulation. Run `npm run lint` before wrapping each stage.

---

## Stage 1 — Monotone-cubic smoothing (foundation for curved motion) — ✅ DONE (commit `6967fc8`)

**Outcome:** `layout-shared.js` now exports `monotoneSegments(points)`, `splitCubic(seg, t)`, and a new `curveYAt(segs, x)` evaluator (the reference's `clipMonotone` builds an SVG path string — we ported the _idea_ as a `y = f(x)` sampler for the Float32 vertex buffers, not a path builder). `setTrail` resamples its 48 vertices off the curve; `clipSeries` interpolates cut-ends on the curve. Signatures/return shapes unchanged. Verified: curve passes through every data point exactly (dots don't move), monotone → no overshoot, out-of-range clamps to endpoints, 2-point prediction diagonal stays straight; `npm run build` + svelte-check clean.

**Handoff notes for later stages:**

- **Full-series-tangent trap (Stage 3):** `setTrail` builds monotone segments from the `pairs` it's handed. For race that's the _clipped_ series, so window-edge tangents come from the clipped set. Invisible for Stage 1's static windows, but it will "snap" once the window animates. Stage 3's per-frame animator must build segments from the **full** series once, then clip/sample those (there's a comment on `setTrail` flagging this).
- **Commit hygiene gotcha:** the pre-commit lint-staged hook re-adds the **whole** file, so a partially-staged file commits _all_ its working-tree changes (and `--no-verify` is disallowed). To commit one concern in a multi-concern file, the other concern must be **absent from the working tree** at commit time (reverse-apply its hunks as a patch, commit, re-apply). Relevant because the tree still carries unrelated scatter-scale + furniture WIP.

**Why first:** the dots-ride-their-own-curve effect needs a smooth path. Today `clipSeries`/`setTrail` are linear (straight segments between data points). Porting the smoothing is a self-contained change with immediate visual payoff and no orchestration risk.

**Scope**

- Port `monotoneSegments` / `splitCubic` / `clipMonotone` from the reference `race-chart.js` (~L45–123) into `layout-shared.js`.
- Make `setTrail` (L202) resample along the smooth monotone-cubic curve instead of linear segments; make `clipSeries` (L230) interpolate cut-ends on the curve.
- Keep the `TRAIL_POINTS=48` resampling contract and all existing signatures/return shapes intact.

**Files:** `src/components/scrolly/layout-shared.js` (add smoothing helpers; update `setTrail`, `clipSeries`).

**Verify:** race trails render as smooth curves in all three race states; dot endpoints unchanged; no regression in non-race trails (career/cohort/prediction slots still render).

---

## Stage 2 — Parameterize the race layout by window + domain — ✅ DONE (commit `c6dc8a6`)

**Outcome:** `layoutRace` now takes `(nodes, w, h, _edges, params)` and resolves **two** ranges instead of one baked `windowYears`: `window` (`params?.window ?? windowYears`) clips the data (`clipSeries`, era-note filter/clamp); `domain` (`params?.domain ?? params?.window ?? windowYears`) drives the x-scale (`xS`) and the x-tick loop. When `window === domain` (all three static states, and the no-params default) rendering is byte-identical. The three states keep the `raceLayout(...)` factory calls unchanged and gained a shared `params: (s) => s.raceView` selector; a nullable `raceView` (`{ window, domain }` | null) field was added to `story.svelte.js`. `ScrollyVisual.svelte` needed **no change** — its generic `STATE_PARAMS → layoutParams → tween` path carries the override. Emitted contract unchanged.

**Verified:** a headless-Chrome CDP test imported the live module and confirmed `layout(...,null)` is byte-identical (`attrs`/`trails`/`trailDelays`) to passing the baked window as both `window` and `domain` for all three states; a split `{window:[2000,2026.2], domain:[2010,2026.2]}` renders with no crash and x-ticks that follow the **domain** (start at 2010), proving the split. `npm run lint` + `npm run build` (svelte-check) clean.

**Handoff notes for later stages:**

- **Stage 3 must bypass the reactive path.** The animator must NOT drive per-frame frames through `story.raceView`/`STATE_PARAMS`: that routes through the straight-line `tweener` (the exact motion we can't use) and leaks a `layoutFor` cache entry per frame (cache keys on `JSON.stringify(layoutParams)`, `ScrollyVisual.svelte:77`). Instead call `STATES.raceX(nodes, w, h, edges, { window, domain })` **directly** each frame and write into the Float32 buffers. `raceView` is the **Stage 5** scrub/snap seam (and was this stage's live-verification handle), not Stage 3's per-frame input.
- **Keep race states factory-based, not `params`-static.** Moving each state's window into a static `params` object would make `paramsKey` non-null and reclassify race step transitions as `paramChange` (drops the reveal/jitter choreography). The idle selector returning `s.raceView` (null while stepping) keeps them on the `stateChange` path.
- **Full-series-tangent trap still open (Stage 3):** unchanged from Stage 1 — `setTrail` builds monotone segments from the _clipped_ pairs, so window-edge tangents come from the clipped set and will "snap" once the window animates. Stage 3's per-frame animator must build segments from the **full** series once, then clip/sample those.
- **Commit-hygiene update:** the working tree now carries a _coherent_ prediction-scatter refactor (single "co-star insights" toggle → `predictInsights`) touching `prediction.js`/`PredictToggles.svelte`/`story.svelte.js`; it was committed separately as `7a531bc` to keep Stage 2 clean. Remaining uncommitted WIP: a labels/scatter concern (`states.js` `STATE_LABEL_DIRS`, `scatters.js`, `layout-shared.js`) + furniture (`ScrollyVisual.svelte`) + `Index.svelte`/`career.js`/`next-session.md`. The pre-commit gate runs svelte-check on the **whole working tree**, so a subset commit is fine only while the tree stays consistent — reverting one file's half of a cross-file rename fails the gate (learned the hard way this session).

---

## Stage 3 — Path animator core (the hard one) — ✅ DONE

**Outcome:** a chapter-scoped third rAF writer in `ScrollyVisual.svelte` plays a `drawLine → rewind` sweep, evaluated per frame at a moving playhead year. It's **allocation-free**: instead of re-running `raceLayout` per frame (which would leak a 644 KB `layoutFor` cache entry every frame — ~300 MB over an 8 s sweep — since the cache keys on `JSON.stringify(raceView)`), a new `writeRaceSweepFrame(attrsBuf, trailBuf, w, h, frame)` in `race.js` writes only the ~15 race dots + trails straight into the live Float32 tweener buffers (verified heap-flat: 0 MB growth across a full sweep). DRY: the scale/curve logic is shared with the static `layoutRace` via `raceYFit`/`raceScales` (race.js) and `sampleTrail`/`curveYRange` (layout-shared.js); `RACE_SEGS` builds each actor's monotone segments **once at module load**, which also **fixes the full-series-tangent trap** for the static states (both now sample the full-series curve, pixel-identical at the same window). Trapezoidal ease (R=0.18) ported from the reference `_animate`; two self-contained phases chained by callback (drawLine e=1 ≡ rewind e=0). Rewind's domain is symmetric about the playhead, so dots stay pinned at plot-centre (x=404 on an 800px canvas, confirmed) and move only vertically. Per the locked decision **all 15 actors stay visible** through the sweep (no yCap filter, dots clamp to curve ends); the target state's `yCap` re-applies on landing so non-contenders fade out over one param-tween.

**Single-writer discipline:** `playRaceSweep()` pre-rolls the wide chart into the `e=0` frame (500 ms), then `stop()`s both generic tweeners before the sweep owns the rAF; on completion it pins the chart via `story.raceView = finalFrame` (one param-tween settle). A guard at the top of the render `$effect` (`if (sweeping)`) steps aside for the sweep and abandons it on a genuine state change (Next stays live). A separate ordered `$effect` drops `raceView` on any `stateName` change (untracked read) so a freshly-entered race state uses its baked window — this is also the Stage-5 scrub-exit seam. Cleanup effect `stop()`s the sweep. Reduced motion gates at the first line of `playRaceSweep` (snap to `finalFrame`, no rAF).

**Dev trigger:** press `r` on a race step (`$app/environment` `dev`-gated keydown). Stage 4 replaces this with arrival wiring.

**Verified** (headless-Chrome CDP against the live dev server): dots pinned centre-x in both phases and moving vertically between playheads; no NaN; trails finite; static layout still valid (attrs/trails/5 x-ticks/3 y-ticks, no NaN); full live sweep lands on `{window:[1986,2006], domain:[1986,2026]}` and re-shows furniture with **zero console errors**; Next mid-sweep cancels + clears `raceView`; reduced-motion snaps instantly; heap flat. `npm run lint` + `npm run check` (svelte-check) clean on the three touched files (the 43 pre-existing errors are all unmigrated `migrate/`/`future/` starter templates); `npm run build` green.

**Handoff notes for Stages 4/5:**

- **Stage 4 (arrival):** call `playRaceSweep(from, to)` from a `revealFrom`-scoped arrival branch instead of the dev keydown. The exact `from`/`to`/`trailLen` (=from−to → domain half-width) and which race step the sweep lands on are the story-choreography decisions — the rewind lands on `finalFrame`, held via `raceView`, so pick `to` to match the intended landing window. Mashing Next mid-sweep already jumps to the final state (the effect guard); reduced-motion already jumps.
- **Stage 5 (scrub):** `writeRaceSweepFrame` + the `raceScales`/`raceYFit` helpers **are** the per-frame scrub inputs — drive `frame` from `scrubYear` instead of the eased clock, same code path. The `raceView`-clears-on-state-change effect already handles scrub-exit. Add `scrubYear`/`scrubbing` to `story.svelte.js`.
- **Furniture during the sweep** is hidden (`{#if !sweeping}` on x/y ticks + notes), snapping back on landing — Stage 6 owns per-frame animated furniture.

**Why:** this is the real motion fix — a per-frame parametric sweep that no two-endpoint tween can produce.

**Scope**

- Add a chapter-scoped **third animator** alongside `tweener`/`trailTweener` in `ScrollyVisual.svelte`. Port pudding's `_animate` / `drawLine` / `rewind` + the trapezoidal ease.
- Each frame: evaluate the parameterized race layout (Stage 2) at the current **playhead year** — window/domain re-centred on the playhead — and write the ~15 race dots' x/y and their clipped trail vertices into the existing Float32 buffers, then call `drawScene`. (The other ~11.5k dots are written once at sweep start and left — cost is fine.)
- `drawLine` = grow the clip window leftward (progressive draw-on), NOT the current `collapseTrail`/`trailDelays` vertex-stretch. `rewind` = pan the domain so dots ride their curves.
- **Single-writer discipline:** `stop()` the generic dot + trail tweeners while the path animator owns the rAF; on completion write the final frame into `tweener.current` (and the trail buffer) for continuous handoff into the next normal tween (e.g. `raceRecent → raceTrades` zoom). Stop the animator in the cleanup effect (~L303–306).
- **Per-frame furniture:** y-scale refit per frame (port `visibleYRange`) and x year-label pan. Decide which furniture animates vs stays static; extend the tracked-coord copy path (`drawScene` L196–203) so overlay furniture can follow the sweep. (Furniture _polish_ is Stage 6; here just make it not break during the sweep.)

**Files:** `ScrollyVisual.svelte` (new animator, wire into `$effect` + `drawScene` + cleanup); `layout-shared.js` and/or `race.js` (per-frame eval helpers, `visibleYRange` port).

**Verify:** manually trigger a `drawLine(2026→2006)` then `rewind` on the race chapter; dots stay pinned centre-x and travel vertically along their own smooth curves (pinned-centre "time machine" feel matches pudding); on completion the chart sits on a clean static frame and a subsequent normal state tween starts without a jump/glitch.

---

## Stage 4 — Entry choreography (orchestration)

**Why:** the sweep should play as interruptible _entry_ choreography, not a static state the reader waits on.

**Scope**

- Fire the drawLine→rewind sequence as a `revealFrom`-scoped entry when arriving at the race chapter (e.g. `rankReveal → raceRecent`), reusing the `revealFrom` mechanism (`STATE_REVEAL_FROM`).
- Mashing Next jumps straight to the final windowed state (interrupt the animator, write final frame).
- Honour `prefers-reduced-motion`: jump, no sweep.
- Next stays clickable throughout.

**Files:** `ScrollyVisual.svelte` (arrival branch wiring), `race.js` states / `STATE_REVEAL_FROM` config.

**Verify:** stepping into the race chapter normally plays the sweep; mashing Next during the sweep jumps to the final state and stays responsive; reduced-motion emulation shows an instant jump (no sweep); backwards navigation into the chapter behaves per `revealFrom` (plain tween, no reveal).

---

## Stage 5 — Interactive scrub + snap

**Why:** delivers the reader interaction pre-agreed at `scrolly-framework.md:217` ("exploring the race-chart timeline"). Same animator, playhead driven by pointer/slider instead of a clock.

**Scope**

- Add `scrubYear` (+ `scrubbing`) to `story.svelte.js`.
- Host a bits-ui `Slider` (year control) + a pointer drag surface over the canvas as a `<Step>` `panel` snippet (RankBars pattern; same snippet reference across race steps). Slider `value` = playhead year and doubles as select-a-year.
- Drag surface: Pointer Events, `touch-action: pan-y` so horizontal drag scrubs without fighting vertical page scroll. Drag winds the reel (pinned-centre, domain pans, dots move vertically) — **same code path as autoplay**, no second render mode.
- **Wiring deviation:** race states read `scrubYear` but feed it to the **path animator's playhead** (per-frame curve eval), NOT `tweener.to()`.
- **Snap:** era handovers (`notes`) and the three zoom presets are natural snap points; snapping animates the playhead via the same ease; reduced-motion snaps instantly.

**Files:** `story.svelte.js` (`scrubYear`/`scrubbing`); `ScrollyVisual.svelte` (playhead ← scrubYear; snap logic); a new panel component + its wiring in `Step.svelte`/`Index.svelte`; reuse `ui/Slider.svelte`.

**Verify:** dragging left/right scrubs through years with the time-machine feel; the Slider scrubs and its arrow keys step years _without_ triggering Wizard step-nav; selecting/snapping to a year (and to era/zoom presets) animates smoothly; reduced-motion snaps instantly; Next remains clickable; touch drag doesn't hijack vertical page scroll.

---

## Stage 6 — Chart furniture & correctness fixes (polish, last)

**Why last:** the animator reshapes axes and the y-scale per frame, so furniture should settle against its final rendering rather than be built twice. Batches the independent side-fix from `next-session.md` with the `race-chart-feedback.md` items.

**Scope**

- **Era-note clip fix:** "Samuel L. Jackson · 2006" is a centre-aligned handover note anchored near the window's left edge, so its left half clips off the plot. Add edge-aware alignment in the `race.js` notes loop (L106–122): emit `align:"left"`/`"right"` when the anchor year is within ~half a label-width of `year0`/`year1`. (Render loop already honours `note.align` at `ScrollyVisual.svelte` L362–371.)
- **Name clipping:** actor name labels are clipped. Widen the plot (≈2/3 width) or compute the left/right margin from the widest name; adjust `xS` range in `race.js` (L56) accordingly.
- **X-axis density:** stretch the x-axis to show every year; experiment with `'YY` two-digit labels (ticks loop L123–130 + overlay tick rendering).
- **Y-axis:** more granular Y tick marks (yTicks currently just `[vMin, mid, vMax]`, L131–134).

**Files:** `src/components/scrolly/layouts/race.js` (notes loop, `xS` range, ticks, yTicks); `ScrollyVisual.svelte` overlay tick/label rendering if `'YY` formatting or density needs render-side support.

**Verify:** the SLJ·2006 note no longer clips at the left edge across raceRecent/raceTrades; no actor name is clipped; x-axis shows every year legibly (check narrow screens); Y ticks are denser and readable; no regression to the animator's per-frame furniture from Stages 3–5.

---

## Dependency graph

```
Reference clone available (local path)
  └─ Stage 1 (monotone-cubic) ✅ ─ Stage 2 (parameterize) ✅ ─ Stage 3 (path animator core) ✅
                                                                 ├─ Stage 4 (entry choreography) ⬅ NEXT
                                                                 └─ Stage 5 (scrub + snap)
Stage 6 (furniture polish) ── independent; sequenced last
```

## Global verification (end-to-end, after all stages)

Run `npm run dev` and, in the race chapter: (1) arrive from the rank chapter → drawLine→rewind sweep plays; (2) mash Next mid-sweep → jumps to final state, stays responsive; (3) drag + use the Slider to scrub years, snap to a year/era/zoom preset; (4) enable DevTools "emulate prefers-reduced-motion: reduce" → all motion becomes instant jumps, everything still reachable; (5) confirm no clipped names/notes and legible axes; (6) confirm continuity — no jump/glitch handing off from the sweep into the `raceRecent→raceTrades→raceFull` zoom tweens.

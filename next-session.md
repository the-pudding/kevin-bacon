# Handoff: Port pudding-post race-chart line/rewind animation into kevin-bacon's scrolly framework — with interactive scrub/snap

## Starting Prompt

> I want to bring the pudding-post race-chart animation — where the actors draw their lines and then travel back in time _along_ those lines — into this project's canvas scrolly framework, **and** let the reader drag left/right through the years or select a year to snap to it. The pudding animation is hard-won and I want to preserve its exact feel.
>
> **Reference (do not modify):** `references/pudding-post/design/stories/components/race-chart.js` and its driver `.../components/RaceChart.stories.js`. The animation is `reset()` → `drawLine(2026, 2006, 4000)` → `rewind(2026, 2006, 4000)`.
>
> **Target framework:** `src/components/scrolly/` — read `notes/scrolly-framework.md` first, then `tween.js`, `ScrollyVisual.svelte`, `layouts/race.js`, `story.svelte.js`, `Step.svelte`, `RankBars.svelte` (panel pattern), `ui/Slider.svelte`, and the trail helpers in `layout-shared.js`. Note `scrolly-framework.md:217` already lists "exploring the race-chart timeline" as an agreed interaction/drop-off point — this work realizes it.
>
> **The key finding from last session:** the generic tweener (`tween.js:47`, `current[i] = start[i] + (target[i]-start[i])*eased`) lerps each value straight-line from start→target, so a state-to-state morph makes each dot cut a _chord_ across the plot — it cannot make a dot ride its own trajectory. Pudding's effect is a per-frame parametric sweep (dot pinned at centre-x, domain re-centres on the playhead each frame, dot's y read off its own curve), which is fundamentally not a two-endpoint tween. The current `race.js` "unspool" (`collapseTrail` + `trailDelays[t]=250`) is also NOT pudding's `drawLine`: it stretches 48 vertices out of a dot, whereas `drawLine` grows the clip window leftward (a progressive draw-on).
>
> **The unifying idea:** pudding's chart is a pure function of a _playhead year_. Autoplay, drag-scrub, and snap-to-year are the same render path with three different clocks driving the playhead (ease clock / pointer-x / ease-to-target). Build one path animator; swap the input.
>
> **Three tasks, in order:**
>
> **1. Path animator (motion) — the core.** Add a chapter-scoped animator (port pudding's `_animate`/`drawLine`/`rewind` + trapezoidal ease) that re-evaluates a _parameterized_ race layout each frame — window `[xStart,xEnd]` and domain `[domainStart,domainEnd]` as inputs, not the baked `windowYears` constants in today's `raceLayout`. Each frame it writes the ~15 race dots' x/y and their clipped trail vertices into the existing Float64Arrays and calls the existing `draw()`. Reuse the trail polyline as the prescribed path.
>
> - **Single-writer discipline:** `stop()` the generic dot + trail tweeners while the path animator owns the rAF; on completion write the final frame into `tweener.current` so the next normal tween (e.g. `raceRecent → raceTrades` zoom) snapshots continuously. `scrolly-framework.md` ("Annotations") warns a second canvas writer corrupts tween starts — respect that.
> - **Port monotone-cubic** (`monotoneSegments`/`splitCubic`/`clipMonotone` from race-chart.js) into `layout-shared.js` so `setTrail`/dot placement ride the smooth curve. Today `clipSeries`/`setTrail` are linear; the dots-ride-curve effect needs the smooth path. (Also closes the earlier "#1 linear vs monotone-cubic" gap.)
> - **Per-frame chart furniture:** y-scale refits per frame (port `visibleYRange`) and x year-labels pan; the overlay (axes/notes/labels) is currently crossfaded per _state_, not per _frame_. `draw()` already copies tracked label coords per frame — extend that path so axes/notes update during the sweep, or decide which furniture stays static.
> - **Cost is fine:** only ~15 race dots + their trails recompute per frame; the other ~11.5k dots are written once at sweep start and left.
>
> **2. Early / interruptible entry (orchestration).** Fire the drawLine→rewind sequence as a `revealFrom`-scoped entry choreography when arriving at the race chapter (e.g. `rankReveal → raceRecent`), not as a static state the reader waits on. Mashing Next must jump to the final windowed state; honour `prefers-reduced-motion` (jump, no sweep); Next must always stay clickable.
>
> **3. Interactive scrub + snap.** Let the reader drag left/right through years and select a year to snap to it, driving the _same_ path animator's playhead.
>
> - **Feel:** keep pudding's pinned-centre "time machine" — drag winds the reel (dot stays centre-x, domain pans, dots move vertically along their curves). Same code path as autoplay; do NOT add a second static-axis render mode.
> - **Control:** use `ui/Slider.svelte` (bits-ui) as the year control — it brings focus-scoped arrow keys (avoids the Wizard's ArrowLeft/ArrowRight step-nav collision), ARIA, and a visible affordance; its value = the playhead year and doubles as select-a-year. Add a drag surface over the canvas for direct scrubbing (Pointer Events, `touch-action: pan-y` so horizontal drag doesn't fight vertical page scroll).
> - **Wiring:** add `scrubYear` (+ `scrubbing`) to `story.svelte.js`; host the Slider/scrub surface as a `<Step>` `panel` snippet (RankBars pattern). Race states read `scrubYear` via `STATE_PARAMS`, **but** feed it to the path animator's playhead (per-frame curve eval), NOT `tweener.to()` — this is the one deviation from the standard param-driven interactivity flow.
> - **Snap targets (optional polish):** era handovers (the `notes`) and the three zoom presets are natural snap points; snap animates the playhead via the same ease; reduced-motion snaps instantly.
>
> **Batched side fix (independent):** the era-note clip bug — "Samuel L. Jackson · 2006" is a centre-aligned era-handover note anchored near the window's left edge, so its left half clips off the plot. Fix with edge-aware alignment in `race.js`'s notes loop (emit `align:"left"`/`"right"` when the anchor year is within ~half a label-width of `year0`/`year1`).
>
> Start by validating the direction against the framework, then propose the concrete integration point in `ScrollyVisual`'s `$effect`/`draw` (how the path animator coexists with the two generic tweeners) before writing code.

## Relevant Files

- `references/pudding-post/design/stories/components/race-chart.js` — **reference impl.** Animation: `_animate` (L220), `drawLine` (L241), `rewind` (L253), `reset` (L205). Smoothing: `monotoneSegments`/`splitCubic`/`clipMonotone` (L45–123). Y-refit: `visibleYRange` (L132). Label swap-slide: `_easeLabelOffsets` (L323).
- `references/pudding-post/design/stories/components/RaceChart.stories.js` — phase sequence + `from=2026,to=2006,trailLen=20`; shows the domain-centres-playhead trick.
- `src/components/scrolly/tween.js` — generic tweener. L47 = the straight-line lerp that makes a state-morph insufficient; `to()` snapshots `current` (L72); `onDone` chaining hook (L60) is useful for phase sequencing.
- `src/components/scrolly/layouts/race.js` — current race layout. `raceLayout(windowYears,…)` bakes the window as a constant → parameterize by an animation clock. Emits `attrs/trails/trailDelays/notes/axes`. Also the era-note clip fix lives in its `notes` loop.
- `src/components/scrolly/layout-shared.js` — `clipSeries` (L230, linear), `setTrail` (L202, linear resample), `collapseTrail` (L220), `TRAIL_META`/`RACE_SLOT`/`RACE_IDS`. Where monotone-cubic should land.
- `src/components/scrolly/ScrollyVisual.svelte` — owns dpr/resize/reduced-motion, the `$effect` reacting to state, per-frame tracked-coord copy in `draw()`, overlay rendering of axes/notes (~L358–371). Integration point for the path animator.
- `src/components/scrolly/story.svelte.js` — shared `$state` for interactions; add `scrubYear`/`scrubbing` here.
- `src/components/scrolly/Step.svelte` + `RankBars.svelte` — the `panel` snippet pattern for HTML UI layered over the canvas (host the scrub Slider here).
- `src/components/ui/Slider.svelte` — bits-ui slider; the accessible year control that sidesteps the Wizard arrow-key conflict.
- `notes/scrolly-framework.md` — framework contracts; esp. "Tween timing", "Trails", "Annotations" (second-writer hazard), `revealFrom` choreography scoping, and L217 (race-timeline interaction already planned).

## Key Context

- **Two problems, three tasks.** "Animate along a prescribed path" fixes _motion_ (the real incompatibility). "Tween early to the next section" fixes _orchestration_ of a long multi-phase sequence in a step-flip UI (reframed as interruptible entry choreography). Scrub/snap is _interactivity_ — and it's the same animator with the playhead driven by pointer/slider instead of a clock.
- **Why a state-morph fails:** the tweener lerps each vertex linearly → dots cut chords instead of following trajectories. Pudding's feel = per-frame playhead sweep with the domain re-centring on the playhead so dots stay centre-x and move _vertically_ along their own curves. Confirmed against `tween.js:47`.
- **Current unspool ≠ pudding drawLine:** `collapseTrail` + `trailDelays[t]=250` stretches vertices out of a dot; pudding grows the clip window leftward (progressive draw-on). Replicate the window-grow, not the stretch.
- **The unification:** the path animator is a pure function of the playhead year; autoplay/drag/snap only differ in what sets it. Build once.
- **Main integration risks:** single-writer discipline (path animator vs the two generic tweeners) and clean continuity handoff into/out of the sweep. Hard framework constraints: reduced-motion → jumps, Next always clickable, interactions skippable.
- **Scrub-specific decisions locked:** pinned-centre "time machine" feel (no second render mode); bits-ui Slider for the year control to avoid the Wizard ArrowLeft/ArrowRight collision; Pointer Events + `touch-action: pan-y` for drag; `scrubYear` feeds the path animator, not `tweener.to()`.
- **This was pre-planned:** `scrolly-framework.md:217` already names "exploring the race-chart timeline" as an agreed interaction/drop-off point — the scrub/snap task delivers it.
- **Batched side fix:** era-note clip (edge-aware alignment in `race.js` notes loop) — independent of the animation work.

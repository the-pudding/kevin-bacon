# Handoff: an entry animation for `raceClose` — draw the projections out of the present

## Starting Prompt

Give the story's closing step (`raceClose`, PRD P-27-1) an arrival animation: the
lines and dots start at the PRESENT — the axis break at `RACE_DATA_END` — and
travel out across the future block to 2030, instead of the whole projection
appearing at once the way it does today.

Read `notes/scrolly-framework.md` (the "Core contracts" y-scale section and the
`raceClose` section near the Gen-Z one) and the header comments in
`src/components/scrolly/layouts/race.js` before writing code. The step was built
last session and its arrival was deliberately left as the plain state tween —
that decision is written down in the state's own comment, so **this change has to
replace that reasoning, not sneak past it.** What it was protecting is real and
must survive:

**The 99 contenders keep the `SIM_SLOT` trail block their win-count climbs occupy
on the simulation chart three steps earlier.** That is why stepping 26 → 27 today
morphs a line into a line. An entry animation that starts every line collapsed at
the break throws that away unless it is staged as two beats: the arrival tween
lands on the animation's FRAME 0, and the draw is chained off its `onDone`.
`raceGenzArrival` in `ScrollyVisual.svelte` (~line 2218) is exactly that pattern
and is the one to copy — note it does NOT call `landOffChart`, which is what makes
it safe here. Every other race arrival branch does call it, and `landOffChart`
preserves only `RACE_CAST` dots and `RACE_TRAIL_SLOTS`, so it would snap all 99
sim slots onto the arriving layout before the first frame and destroy the morph.

Decide first, because it changes the shape of the work: does the **morph** happen
and then the draw, or does the draw REPLACE the morph? "Nodes start animating from
the present day" reads like the latter (everything gathers at the break, then
travels), but the object constancy the slots were shared for is the former. My
read is that both are wanted in sequence — tween the sim lines into a column
standing on the break, then sweep them out to 2030 — but that is the one thing to
settle with Owen before building.

Then, in order:

1. **Turn `proj` into a progress value.** It is a boolean on `RaceFrame` today
   (`race.js`, the typedef ~line 1245, read in `writeRaceSweepFrame` and declared
   on `RACE_CLOSE_STEP`). Make it 0..1 the way `genz` already is, and have
   `writeProjectionLines` clip each curve's right-hand end to
   `RACE_DATA_END + (RACE_FUTURE_END - RACE_DATA_END) * proj`, with the dot riding
   that end. `writeGenzLines` (~line 1502) is the model: it sweeps an arrival
   playhead, clamps each dot to the actor's own data range, and gets its fade-in
   free from the same pixel edge ramp the race pass uses.
2. **Keep the resting contract.** `raceLayout` (~line 1990) must still default
   `proj` from the step (`params?.proj ?? step.proj ?? 0` — mirror the `yOpen`
   line directly above it), and `RACE_CLOSE_STEP` must declare the RESTED value,
   so a cold mount, a resize and the reduced-motion snap all land on the finished
   frame with no animation having run. That contract is the reason the step works
   on a deep link today; do not move it into the animator.
3. **Write the animator in `ScrollyVisual.svelte`,** beside the other race ones
   (~line 966-1130), driven by `runSweepPhase` with a frame builder that ramps
   `proj` — `futureOpenFrame` (~line 247) is the closest existing shape, since it
   also animates a value with the camera parked. Gate it on
   `revealFrom: ["simRace"]` so only the forward arrival from step 26 plays it.
4. **Check the two steps that share the state.** `raceClose` is registered on BOTH
   step 27 and step 28 (`Index.svelte:964` and `:977`), so moving between them is
   not a state change and must not replay anything. Stepping back from `outro`
   (29 → 28) IS a state change into `raceClose` — make sure it does not replay the
   draw, the same way `revealFrom` keeps the other race arrivals from firing on
   the wrong edge.

Constraints: no backward-compat shims or fallbacks; the y rule stays a pure
function of the camera; `cam.xS` is still not rerouted past `RACE_DATA_END` (see
point 3 under Key Context); don't commit anything without asking.

## Relevant Files

- `src/components/scrolly/layouts/race.js` — the chapter, and everything the new
  step added last session: `RACE_CLOSE_STEP` / `RACE_CLOSE_SLJ_END` /
  `RACE_CLOSE_TAIL_YEARS`, `writeProjectionLines`, `CLOSE_PROJ_SEGS` /
  `CLOSE_PROJ_FROM` / `CLOSE_SLJ_SEGS` / `CLOSE_LEAD` / `CLOSE_MARKED`, the
  `yDrop` arm of `raceWindowYFit`, `raceYTicks`, and the `raceClose` + `outro`
  states at the bottom. The module-load asserts are near `RACE_CLOSE_YCAP`.
- `src/components/scrolly/ScrollyVisual.svelte` — canvas host and every race
  camera animation; `raceGenzArrival` (~2218) is the pattern to copy,
  `playRaceFutureOpen` (~999) the closest frame-ramp animator, `landOffChart` the
  trap. Also holds `racePlotCullRight`, which this step needed because its marks
  sit at `fullRight`.
- `src/components/scrolly/layout-shared.js` — `SIM_SLOT` / `SIM_TRAIL_SLOTS` /
  `SIM_LABEL_IDS`, `sampleTrail` (takes its x scale as a function, which is what
  the strip mapping rides), and the shared `dissolve()` the outro uses.
- `src/components/scrolly/layouts/sim-race.js` — the chart the reader arrives
  from; the other writer of the `SIM_SLOT` block.
- `src/components/Index.svelte` — the step registry; `raceClose` is on steps 27
  (`:964`) and 28 (`:977`), `outro` on 29.
- `notes/scrolly-framework.md` — framework contracts, and the `raceClose` section
  written last session (why there is no animator today).
- `notes/prd.md` — P-27-1, ticked, with the two authored-not-modelled caveats.
- `src/components/scrolly/RaceYBandDev.svelte`, `RacePxPerYearDev.svelte`,
  `RaceSpeedDev.svelte` — dev-only live editors. `RaceSpeedDev` is the one that
  matters here: draw the timing by eye rather than guessing a constant.

## Key Context

- **The step exists and is finished as of this session.** It is `raceFuture`'s
  camera with a year of measured history behind the present (`tailYears: 1`), the
  future strip open to 2030, no x axis (`xTicks: false`), the block's wash on and
  its label inside its top-left corner. SLJ's line descends across the block while
  the 99 contenders rise to their simulated medians.
- **Two numbers on this chart are AUTHORED, not modelled**, and any animation must
  not make them look more computed than they are. SLJ has no projection in the
  data at all — `RACE_CLOSE_SLJ_END` (2.55) is the chapter's own claim drawn on the
  axis, asserted at module load to sit behind every contender. And the bootstrap's
  horizon is each contender's CAREER AGE 40, not 2030 — which is why the step has
  no year ticks. A draw-on that sweeps left to right across the block is a
  statement about time passing; that is fine, but nothing should start labelling
  the years it crosses.
- **`cam.xS` is not rerouted past `RACE_DATA_END`, and must stay that way.**
  `writeProjectionLines` composes a LOCAL piecewise scale (`cam.xS` up to 2025, the
  strip's fitted pitch beyond) and hands it to `sampleTrail` alone. The reasoning
  is in `raceFutureScale`'s header; an animator that needs the strip's scale should
  take the same local, not widen `cam.xS`.
- **The projections are one monotone spline through the break**, not a straight
  chord — that changed this session when the year of history was added, so a line
  carries on through the break instead of restarting at it. Owen has an open
  choice between that and the dead-straight version ("reads as continuous" vs
  "reads as unknown"); a draw-on makes the continuous reading stronger, so it is
  worth raising again if this lands.
- **A regression this step already caused once:** the draw pass culls race dots
  against the data plot's right edge, and this step's marks sit at `fullRight`.
  `racePlotCullRight` handles it, but note the cull is armed whenever the previous
  and current states are both race states — which includes a RESIZE on this step.
  Any new animator should be tested by rotating mid-animation.
- **Open copy question, Owen's call, not a bug:** the chart title still reads
  "Where the center of Hollywood could be in 2030", which is now the only year
  claim on a step with no year axis.
- Verified last session at 1200/390/320px, on deep-linked cold mounts to 27/28/29,
  under `prefers-reduced-motion`, on resize, and with next/previous mashed across
  steps 25-29. `npm run lint` and `npm run build` green; the module-load asserts
  run at build time (confirmed they fail loudly). Nothing is committed.

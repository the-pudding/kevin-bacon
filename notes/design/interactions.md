# Interactive steps

> Design notes for the agreed interaction rules (2026-07-05, revised 2026-09-11) and the rank → race handoff, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

The story has moments where the reader pauses on a step and interacts (guessing
the #1 actor on the rank ladder, exploring the race-chart timeline, the
scatter-pair quiz). These are handled **on the one persistent canvas** — do not
split the story into one canvas instance per chapter. Object constancy is the
framework's premise, and every canvas unmount is a seam where the entry
animation re-runs and dot identity is lost — chapter transitions (e.g. Present→
Past: rank line → race chart) are exactly where constancy pays off most.

Three rules:

1. **Interactive steps.** The step card hosts the UI (buttons/input); the result
   writes into shared state consumed by the layout function. Implementation
   path: consume the per-step `params` that Step.svelte already registers (see
   "Step → state" above) — a param change re-runs the _current_ layout with a
   short tween, so e.g. panning the rank ladder to the reader's guess is a param
   update, not a step change. The interruption-safe `to()` already covers a
   reader who interacts then immediately steps away.
2. **A gated question owns the way out of its step** (revised 2026-09-11;
   this replaces "every question is skippable / Next must always be
   clickable"). Five steps ask the reader to do something and are followed by a
   step that reads out the answer. Carrying the reader across that boundary
   untouched leaves them reading an answer to a question they never saw put —
   and with the control behind them, no way back to it but Prev. So the
   boundary is closed: on those five steps the reader's Next (tap gutter or
   ArrowRight) is **refused**, and the right-hand gutter goes disabled so the
   step reads as held rather than as a dead tap.

   The step after an interaction still reveals its answer unconditionally (SLJ
   is revealed however the reader got there; a quiz pair the reader never
   picked is still highlighted) — what changed is that they cannot arrive there
   without answering or conceding, not what they are shown when they do.

   Three props on `<Step>` carry this (`Step.svelte` → `stepConfigs` →
   `Index.svelte`'s registry `go()`):
   - **`gate: () => boolean`** — asked before a reader-driven FORWARD move
     leaves the step; while it returns false the press does nothing at all.
     Exposed as the registry's `nextBlocked` for TapNav's disabled gutter.
   - **`skipback: boolean`** — a reader-driven BACKWARD move that would land on
     this step passes through it to the step before. Without this, stepping
     back off the answer drops the reader onto the controls that produced it,
     with the answer still on screen. It is a separate prop and **not derived
     from `gate`**: the quiz has a gate and must not skip back, and step 6's
     gate would evaluate as open on the way back (the guess-reset effect runs
     after `navigate`).
   - **`advanceon: () => boolean`** — the step carrying the reader on itself.
     Index watches it for the active step only, so a reader who steps away
     mid-wait disarms it by leaving; there is no pending flag to clear.

   `advance()` on the `"scrolly-steps"` context deliberately bypasses `go()`,
   which is exactly what lets a gated step's own control out through its own
   gate.

3. **Which five, and what opens each.**
   - **Step 6, the rank guess** (`gate` never opens; `skipback`). Naming #1 or
     pressing Give up calls `advance()` (`GuessRank`). Give up is always on
     screen, so the step can never strand a reader. Stepping back off the
     reveal lands on step 5, and the existing effect in `Index.svelte` clears
     `rank.guesses`/`rank.gaveUp` on the way out of the chapter, so walking in
     again re-asks the question with the gate shut.
   - **Step 8, the race rewind** (`gate` never opens; `skipback`). Start asks
     for the pan and advances with it — the rewind is choreographed to play
     _across_ the step change onto the view the next step describes. If the
     camera has no travel left ScrollyVisual drops the ask, but the button
     advances regardless, so a dropped ask is never a dead end. Stepping back
     off the payoff lands on step 7; re-entering `raceRecent` from another
     state resets `renderPlayhead` to the present, so the pan has its full
     travel again.
   - **Step 19, the pair quiz** (`gate` opens on completion; **no** `skipback`).
     The one gate the reader's own Next walks through: the quiz has no single
     completing press, so answering the last pair is what unblocks it. Prev
     stays open throughout, and `states.js`'s `quizDone` is the single
     predicate both the gate and `PairQuiz`'s own starting cursor read — a
     panel with nothing left to ask must be a step the gate lets the reader
     leave, or a reader who reloaded past the quiz and stepped back into it is
     stuck.
   - **Step 25, the simulation** (`gate` never opens; `skipback`; `advanceon`).
     Start asks for the run; the run _is_ the payoff and the next step names
     the winner, so the story waits and then moves on by itself once
     `story.sim.runs` is published (the run's single end-of-run write, and the
     reduced-motion path's only one). Walking back into the chapter calls
     `resetSimRace()` from `navigate()` — `sim.runs` **and** `sim.names`
     together, because the label selectors fall back to `sim.names` below the
     run threshold and zeroing the playhead alone would draw all five winners
     on a chart collapsed to the origin.
   - **The Gen Z race step** (`gate` never opens; `skipback`; `advanceon`). The
     same shape as the simulation, one chapter earlier: "Show Gen Z actors" asks
     for the draw-on, the draw _is_ the payoff, and the story moves on by itself
     once `story.race.genzLinesShown` is published (the run's single end-of-run
     write, and the reduced-motion path's only one). Walking into it calls
     `resetGenzLines()` from `navigate()`, so a reader who came back gets the
     empty plot and a live button rather than the finished chart. Unlike the
     simulation it is one step rather than a chapter, so the reset is keyed on
     the step's own state and needs no "from outside" test — `skipback` means
     the only arrival there is a forward one.

4. **The progress bar merges a gated pair into one dot.** A gated step and its
   payoff are one move to the reader, so they share a dot and the bar does not
   tick twice for it. `Index.svelte` derives `dotSteps` (no `chapter`, no
   `skipback`) and `dotStep` (the gated step lights its successor's), and
   `StepProgress` renders those — it never counts steps by hand. 24 dots today
   (the Gen Z step is gated and `skipback`, so it shares its payoff's dot and
   adding it moved the count by nothing).

Exception: a visual that abandons the dot metaphor entirely gains nothing from
the shared canvas — layer a plain HTML component over (or beside) the canvas
for those states instead of forcing a canvas layout. Declare it as a `panel`
snippet on the `<Step>`s that use it (Step registers it alongside
state/params; `Index.svelte` renders the active step's panel over the canvas)
so the markup lives next to the step that owns it. Steps sharing one visual
must pass the same snippet reference — that's what keeps the component alive
across the step change. `RankBars.svelte` (the rank chapter's scrollable
"everyone else" bar list, shown during `rankFocus`/`rankReveal`) is the built
example. Its rows are hop-bands charts turned on their side, drawn as
individual dots: `rank-geometry.js`'s `hopDotSlots` generates the dot lattice
both sides draw — the panel as one path per hop band, the canvas as the spot
each converging actor lands on — so the frame the arrival tween settles into is
the frame the panel then fades over. The panel owns the geometry and the canvas
follows it: RankBars measures its focused row live and publishes the box to
`story.rank.focusBar`, which `layouts/rank.js` reads as a param.

Everything about a row's strip therefore lives in `rank-geometry.js`, not in the
panel — including the whitespace between the hop bands (`RANK_BAND_GAP`, reserved
inside `hopBandBoxes` before the shares are struck, the horizontal twin of
`hop-bands.js`'s `BAND_GAP`). Gap the panel's `<path>`s alone and the two sides
disagree about where a dot is, which breaks both the `hopBands → rankFocus`
convergence and the collapse below. A second, less obvious rule: **every row must
keep the same height.** The handoff places all 250 canvas copies from one measured
`pitch` (see `story.rank.listRows` below), so a row that is taller than its
neighbours scatters every copy below it. That is why the per-band share labels
under each bar are absolutely positioned into a lane the row's own bottom padding
reserves, rather than laid out beneath the strip.

**The chapter handoff out of it (rankReveal → raceRecent)** is the reverse trick,
and the panel outlives its own chapter for it: `raceRecent`'s `<Step>` passes the
same `rankPanel` snippet, so RankBars is still mounted for one step past the rank
chapter and runs the handoff in three beats.

1. **Collapse** (HTML, `RANK_COLLAPSE_MS`, all bars at once). `collapse` goes true
   and every row's dot lattice contracts to its own centre (`transform: scale(0)`
   on the svg) while the single node it becomes grows in there; the names, avg
   distances, footnote and the list's edge mask go with them. The node is not an
   approximation of the chart's dot, it IS one: its radius, colour and alpha come
   from `raceDotSpec` in `layouts/race.js` — the same function `writeRaceSweepFrame`
   places canvas dots with — read against `RACE_RECENT_SUBJECT`, so SLJ and Hackman
   already carry their emphasis and everyone else the grey field treatment.
2. **Swap** (one frame). The timer sets `story.rank.collapsed`, which both unmounts
   the whole overlay (`Index.svelte`'s `showRankPanel`) and releases the canvas.
   Nothing moves: the canvas is already holding an identical copy of those nodes,
   snapped there under the opaque panel when the step changed.
3. **Flight** (canvas, `TWEEN_MS`). The nodes travel from their list rows to their
   chart positions — same top-to-bottom order, new spacing — and hand over to the
   4s draw-on and the rewind's first leg as before.

`story.rank.listRows` (`{ cx, top, pitch }` — the horizontal centre a bar collapses
to, row #1's bar centre at the current scroll, and the row-to-row pitch) is what
puts the canvas copy on the right row, with `ORDER_OF`; ranks below the panel
(most of the 131-strong cast — the list shows 250 rows and ~20 fit) start just off
the bottom edge and stream up. The previous step being HTML costs nothing — its
rows have positions in the canvas's own coordinate space, which is all a departure
point needs. Unlike the focus box, nothing reads this during the rank chapter
(rank.js's selector takes only `rank.focusBar`), so it is safe to republish on
scroll — and ScrollyVisual reads it `untrack`ed, so it can never retarget a tween.

Three things the handoff depends on:

- **The panel owns the clock.** It is the only party that knows when its own
  transitions have landed, so it publishes the one moment (`story.rank.collapsed`)
  and ScrollyVisual only waits — its flight is _held_ by the arrival (the
  entry's `hold`, parked in `pendingArrival`) and released by the flag, so the
  canvas can never be moving while the HTML the reader is watching is not. Every
  render pass disarms it, so a reader who steps on mid-collapse skips the flight
  like any other choreography.
- **The panel's box is frozen for it.** `.rank-bars-panel` is sized off
  `stepsHeight`, and raceRecent's prose is shorter than rankReveal's, so
  `Index.svelte` holds the last height a rank step measured (`rankPanelBottom`).
  Without it every row shifts a few px at the exact moment it collapses, away from
  what the reader was looking at and away from where the canvas is aimed.
- **Only the forward step out of the rank chapter gets it** (`rankHandoff`, set in
  `navigate`). A reload straight onto raceRecent, or a step back to it from
  raceFull, must not flash the list up over a chart that is already drawn.
  Stepping back off raceRecent's second step lands on `rankReveal` (the Start
  step is `skipback`), which hands the panel back and remounts `RankBars` with
  `collapse` false — so walking forward again replays the fold, where a step
  back onto the Start step would have left `rank.collapsed` stuck true.

Two rules come with a measured hand-off like that, both learned the hard way:
publish from a **pre-effect**, so the box is set before ScrollyVisual's layout
effect runs in the same flush and the arrival is one collapse rather than a
tween retargeted mid-flight; and **never re-publish an unchanged value** — that
re-runs the layout effect with an identical params key, which lands in its
catch-all and snaps the very reveal the measurement exists to aim.

Also required before publish: a step-visibility analytics beacon — fire on
`value` changes in `Index.svelte` (the step-driver equivalent of the old per-step
IntersectionObserver) so real reader drop-off is measurable — cheap now,
impossible to retrofit meaningfully after launch.

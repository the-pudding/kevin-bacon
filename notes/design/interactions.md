# Interactive steps

> Design notes for the agreed interaction rules (2026-07-05, revised 2026-09-11,
> 2026-09-19 and 2026-09-20) and the rank → race handoff, moved out of `notes/scrolly-framework.md` on
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

   The three `StartButton`s (the rewind, the Gen Z draw-on, the simulation)
   were floated over the canvas as `panel` snippets until 2026-09-19, pinned
   above the card by `layout.overlayHeight`. That put "Press 'Start' to begin"
   at one end of the screen and Start at the other, and made the button read as
   chart furniture. They are in the card now, under the sentence that names
   them, which is what this rule asked for and what `GuessRank` had always
   done. `PairQuiz` followed them on 2026-09-20 — it was the last control still
   over the canvas, and it carried a blurred wash over the scatter as well, so
   the reader could not see the chart they were being asked about. The cost is
   the one every card-hosted control pays: the tap halves cover the card's full
   width, so the control has to take its presses back with `pointer-events:
auto` under the card's own `--z-card` lift — see `GuessRank.svelte`'s note on
   why a `z-index` lift on the control itself cannot escape a step wrapper that
   forms a stacking context. It also keeps `margin-inline: var(--control-inset)`,
   which is no longer a layering measure: it is the strip a thumb reaching for
   the next step lands in.

   A card-hosted control that ANIMATES takes one more rule with it: it must not
   change the card's height while it runs. The card is measured (`stepsHeight` →
   `overlayHeight`) for half the canvas's bottom clearances, so a control that
   grows or collapses walks the prose and the x-axis title up the screen. That
   is why `PairQuiz` reserves its chips' box whether or not it is holding chips,
   keeps the block mounted past the last pair, and flies the chips on a
   transform rather than pinning them `position: fixed` and letting the flex
   column close up behind them. The transform is also the only safe frame: the
   step wrapper carries an `in:fly` transform for its first ~560ms, which makes
   it the containing block for any `fixed` descendant.

1b. **A search that nothing reads out is an easter egg, and belongs over the
canvas** (2026-09-21, revised the same day). The actor search
(`ActorSearch.svelte`) is on the four charts that can place an actor, and on
every step that draws one of them: the hop bands (5-6), the remoteness scatter
(14-18), the costar scatter (19), the pair quiz (20, the same scatter) and the
career chart (24-26). Twelve steps, and deliberately the whole run of each
chart rather than one step of it — the glyph is quiet enough that a reader may
only notice it on the third scatter, and it would be a poor joke to have taken
it away by then. All seven states already carried `withSearchParams` /
`withSearchLabel`, so this is a mounting question and not a layout one. It
declares no `gate`, no `skipback` and no `advanceon`: it is the one interaction in the
story a reader can walk straight past, because nothing later reads out its
answer. There is nothing to be carried to.

That is also what makes it the one control rule 1 does not govern. It sat in
the card for half a day, as a full-width combobox carrying the placeholder
"Search for an actor…" with a persistent readout under it, and the objection
was that it was
"too in your face": every other control in the story is in the card because
the prose has just ASKED the reader to press it, and this one has no such
sentence to sit under. Rule 1 puts a control under the sentence that offers
it; a control nothing offers has nowhere to be. So the way in is now a
magnifying glass at the right of the chart's own title, opening a small box
over the canvas — no input in the prose, no placeholder sentence, and **no
call to action anywhere**. A reader who never presses it has missed nothing,
which is the whole intent.

Being out of the card is the point rather than a cost, and three things follow:

- **Nothing over the canvas is measured.** The reserved-height apparatus the
  card version needed (`MAX_PATH_STEPS` → a `min-height` in reserved lines,
  with a second number below 375px) is deleted rather than re-derived. Measured
  2026-09-21 at 320/375/390/430 through glyph-open, menu-open, flight and
  settle: `.scrolly-visual` moves **0.0px**, and it is identical on step 6 and
  on step 5, which has no search at all.
- **It can be lifted over the tap halves**, so it needs neither the
  `--control-inset` a card control keeps nor the card's own `--z-card` lift. The
  lift goes on the component's own root: `.panel-layer` carries a `z-index` but
  is statically positioned, so that z-index is inert and every panel that must
  beat the halves lifts itself (RaceScrubber's `.control` spells this out).
  Without it the half swallows every press on the glyph and the reader steps
  forward instead — measured, not reasoned about.
- **The flier is never portalled and never inside the step wrapper's
  `in:fly`** — the two things `flyToDot` cannot survive. The chip is an
  absolutely positioned element in the panel, which is neither.

The pick is **sticky** — no `arrivals.js` entry clears it — because the reading
is one actor carried through four different questions, and a reader who named
somebody on the hop chart should find them again on the scatters rather than be
re-asked three times. Opening the glyph once a pick exists offers `Clear`
beside the input, which is the only way back to no actor at all. The searched
id is also the only tracked label the framework cannot know at build time
(~1,400 candidates, one at a time), which is why `ScrollyVisual`'s
`TRACKED_IDS` is derived rather than a constant.

It reaches the canvas exactly as `PairQuiz` does, and off the same code: the
picked name marks as a chip where the box was, flies onto the plot and lands as
the dot (`fly-to-dot.js`, extracted from the quiz on the same day so the two
cannot drift). **What is left behind is a canvas label** — the dot takes the
actor's name the way every other named dot in the story does (`withSearchLabel`,
de-collided by the same label stacker), and there is no readout block at all.
The reader's mark is ink, the same black the story marks its own subjects in. It
was purple for half a day, on the reasoning that purple is the one category
colour no chart spends and that ink would read as Bacon's; neither worried the
eye in practice, and the mark is unambiguous without it — a marked dot is the
only ink in a band of red/blue/cyan/grey, it is nowhere near Bacon's dot at the
top of the stack, and it is the only dot on any of the four charts carrying a
name the reader chose.

The hop chart alone adds a caption, because a distance in movies is what that
chart is about and the scatters' axes are not. It hangs off the reader's dot,
under the name the canvas already draws below it, so the three read as one
stacked annotation:

    ●  (purple)
    Tom Hollander        ← the canvas label, as on any named dot
    two movies away      ← the caption; "two movies" opens the films

The count is an `InfoTerm` opening `RouteFilms`, so the chain of films is one
press away instead of five lines of text over a 22,530-dot chart. The two
captions cannot share a data source (step 1 walks the 18 curated intro edges;
the search walks the corpus path exported for the 1,449-actor pool), so
`RouteFilms` takes resolved `routes` and neither caller knows about the other's
graph.

Two things about it were measured rather than chosen. It **follows the dot**
(positioned by transform off `locate()`, re-read on a pick, on the arrival
settling and on a resize) because there is no strip to park it in: the hop
stack's ink runs 64px→469px inside the canvas box at every width, the step card
covers the last 34px of the chart at 320px and leaves 10.7px at 375px, and the
gap above the stack is 26.4px — one line of this type and not two. And it
**carries no name**, unlike step 1's, which names its actor because nothing else
on screen does; here the label is directly above it and the name would land
twice in two stacked lines. Its halo is heavier than `.node-label`'s five stops
for the same reason its position is dynamic: a caption inside the crowd has dots
behind every letter, where a name at the edge of a cloud mostly does not.

2. **A gated question owns the way out of its step** (revised 2026-09-11;
   this replaces "every question is skippable / Next must always be
   clickable"). Five steps ask the reader to do something and are followed by a
   step that reads out the answer. Carrying the reader across that boundary
   untouched leaves them reading an answer to a question they never saw put —
   and with the control behind them, no way back to it but Prev. So the
   boundary is closed: on those five steps the reader's Next (tap half or
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
   - **Step 20, the pair quiz** (`gate` opens on completion; **no** `skipback`).
     The one gate the reader's own Next walks through: the quiz has no single
     completing press, so answering the last pair is what unblocks it. Prev
     stays open throughout, and `states.js`'s `quizDone` is the single
     predicate both the gate and `PairQuiz`'s own starting cursor read — a quiz
     with nothing left to ask must be a step the gate lets the reader
     leave, or a reader who reloaded past the quiz and stepped back into it is
     stuck. Because the gate opens silently — the right-hand gutter simply
     stops being disabled — the block stays on screen past the last pair to say
     so; it is the only signal the reader gets.
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

4. **The progress bar merges a gated pair into one line.** A gated step and
   its payoff are one move to the reader, so they share a line and the bar does
   not tick twice for it. The registry derives `dotSteps` (every step but the
   title card and the `skipback` ones) and `dotStep` (the gated step lights its
   successor's), groups them by chapter (`chapters`), and `StepProgress` renders
   those — it never counts steps by hand.

Exception: a visual that abandons the dot metaphor entirely gains nothing from
the shared canvas — layer a plain HTML component over (or beside) the canvas
for those states instead of forcing a canvas layout. Declare it as a `panel`
snippet on the `<Step>`s that use it (Step registers it alongside
state/params; `Index.svelte` renders the active step's panel over the canvas)
so the markup lives next to the step that owns it. Steps sharing one visual
must pass the same snippet reference — that's what keeps the component alive
across the step change. Two panels are left (`RankBars` and `RaceScrubber`);
the pair quiz was the third until 2026-09-20, and it was never really an
exception — its chips are a control, not a visual, and rule 1 above is what
actually governs them. `RankBars.svelte` (the rank chapter's scrollable
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

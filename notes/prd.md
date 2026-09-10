# PRD — feedback backlog

Single place to manage everything raised in Matt's **9/8 step-by-step**

**walkthrough** in the editorial feedback doc

([Feedback: Kevin Bacon](https://docs.google.com/document/d/1mksHA4zYMw0sdsegPHGCzgUvR6qwhpgydn5Y3ZDhopw/edit),

owner: [matt@polygraph.cool](mailto:matt@polygraph.cool)).

**Not everything here needs doing.** Each item is a decision as much as a task.

- `- [ ]` open · `- [x]` done · append `— **won't do:** <reason>` to kill one
- Step numbers are Matt's, from his walkthrough. The **state** in parentheses is

  the `<Step state="…">` in `src/components/Index.svelte` the item maps to —

  matched by description, since the wizard shows no step counter and Matt's

  numbering is off by one against the current build from step 12 on.

- Copy items are Owen's call; they are listed, not drafted.

Related backlogs, deliberately **not** merged in here:

`notes/review-triage.md` (unreviewed build decisions),

`notes/prototype-fidelity-gaps.md` (impl vs design sandbox).

---

## 1. Hop layers — step 4 (`hopBands`)

- [ ] **P-04-1 · Chart title.** The hop-band chart has none.
- [ ] **P-04-2 · Actor search.** Let the reader look up an actor and see which
  ```
  layer they land in. Matt: "might be neat" — biggest build of the four.
  ```
- [x] **P-04-3 · Narrative annotation.** Annotate that the 4th layer is the
  ```
  deepest, and/or that 2 degrees covers X% of Hollywood, so the chart says
  something rather than just showing rows. **Shipped:** the percentage half
  only — each band label now carries its corpus share ("2 movies away — 70%
  of actors"). The 4th layer being the deepest is still unsaid; fold it into
  the copy pass or split it out. Wording is placeholder, for Owen.
  ```
- [x] **P-04-4 · Degree separation.** Colours may blend for some readers — push
  ```
  more separation between degrees, or put a dashed line between bands.
  **Shipped:** whitespace, not a rule — a 12px gap reserved between bands
  before the shares are struck (`BAND_GAP` in `layouts/hop-bands.js`).
  ```

## 2. Rank ladder — steps 5–6 (`hopBands` → `rankFocus`)

- [ ] **P-06-1 · Chart title.** e.g. "ranking of actors by average distance,
  ```
  2025".
  ```
- [x] **P-06-2 · Legend for the colour sections.** Currently unexplained.
  ```
  **Shipped:** not a legend — every row prints its own four shares of the
  corpus under the bands themselves. A standing key could not have carried
  the numbers anyway (each actor has a different split), and per row they
  earn their place twice over: read down the ladder and they are the story,
  hop 2 giving way to hop 3 as the actors get more remote, and they correct
  for `RANK_SEG_MIN` painting hop 1 and hop 4 several times wider than they
  are. The canvas bar underneath still carries no key (`layouts/rank.js`) —
  it is only on screen for the arrival tween. Wording is placeholder, for
  Owen.
  ```
- [x] **P-06-5 · Degree separation, and density.** The horizontal twin of P-04-4:
  ```
  `RANK_BAND_GAP` reserved between the bands inside `hopBandBoxes`, so both
  the panel and the canvas inherit it. The strip is also ~3× denser (5 dot
  rows on a 3px pitch) with the jitter re-based on the lattice cell rather
  than the slack around a dot — the old nudge was ±0.08px vertically, which
  is what made the bars read as a stamped grid.
  ```
- [x] **P-06-3 · Stacked bar instead of dots.** The ladder condenses the corpus,
  ```
  so one dot ≠ one actor — Matt suggests a stacked bar chart instead.
  Depends on P-06-4. **Parked:** Owen chose to keep the dots and invest in
  the strip's density instead (P-06-5), so this would now throw that away.
  ```
- [x] **P-06-4 · Make the preceding step a stacked bar too**, to ease the
  ```
  transition into P-06-3. Only worth doing if P-06-3 goes ahead. **Parked**
  with it.
  ```

## 3. Race chart — steps 8–9 (`raceRecent`)

- [ ] **P-08-1 · Fixed y-axis range.** Hold y at a static range for
  ```
  readability. **Open thread in the doc** — Matt confirmed he means literal
  constant bounds, no animation, and is "not convinced this would be an
  upgrade"; Owen's counter is to stagger it so only the lines _or_ the axis
  scale animate at once. Decide before building.
  **To look at it:** `npm run dev` has a "fixed y" panel on the race steps
  (`src/components/scrolly/RaceFixedYDev.svelte`, dev builds only) that swaps
  the camera fit for two constant bounds, seeded top 2.05 / bottom 2.40.
  Off is the chart as it ships.
  ```
- [ ] **P-08-2 · Chart title — and on every subsequent line chart.**
- [x] **P-09-1 · Auto-rewind.** If the reader never pressed "start", the chart
  ```
  should animate back to 2001–2006 on its own. **Shipped:** on Next rather
  than on a timer — pressing Next on the Start step asks for the same rewind
  the button does and steps forward with it, so the pan can't be skipped and
  the reader is never left reading "back to where SLJ took the crown in 2006"
  off a chart still parked on 2025. A timer would have to fire while the
  reader is still reading the step (there is no scroll position to key it
  off), which is the one thing the chapter's consent gate exists to avoid.
  The simulation's Start button (step 25) was the same trap and got the same
  treatment, except that the move waits for the 10,000 runs to play before
  advancing — see `beforenext` in `notes/scrolly-framework.md`.
  ```

## 4. The future band — step 11 (`raceFuture`)

- [x] **P-11-1 · Stop graying the items out.** Keep dots and labels visible;
  ```
  the gray-out reads as confusing. **Shipped:** by moving the camera, not by
  special-casing the alpha. The grey was `edgeFade` in
  `writeRaceSweepFrame` — a one-year ramp that fades a line whose data is
  about to scroll off the left edge — and the step used to park the camera
  with 2030 on the right edge, leaving only 0.12 of a year of data inside it
  on the widest canvas the 700px container allows, and none at all below a
  654px one. So the whole cast rendered at ~12% opacity at best, and a phone
  got an empty plot. Two changes fix it. The step now pans forward until the
  present sits a short stub in from the plot's LEFT edge
  (`RACE_FUTURE_TAIL_PX`, 24px) instead of five years off the right; and the
  ramp is now measured in PIXELS off that edge rather than in years off the
  camera, which is what the fade was always about — where the line's end
  actually sits — and what lets the tail be a fraction of a year without the
  greying returning. Every dot and every name rests at full strength at
  every width. `race.js` also now asserts at module load that all 224 series
  end on the same year, since `RACE_DATA_END` is where three separate things
  meet: the historical axis stops there, the strip starts there, and every
  step's extent ends there.
  ```
- [x] **P-11-2 · Label the future.** Highlight 2027–2030 as a block (Matt:

  ```
  "a big yellow box") labelled "the future". **Shipped:** 2025–2030 rather
  than 2027–2030 (the data ends in 2025, so that is where the future
  starts), and it opens rather than appearing — a second leg chained off the
  pan advances a frontier across the plot width the pan left over, growing
  the block and bringing each future tick in behind it. Those years carry
  their own FITTED px-per-year, the only one in the chapter: ~63px on a
  desktop but ~36px even at 320px, because the strip runs out to the full
  inner width rather than stopping at the data plot's right edge — the
  name-gutter third is dead space on this step, since the dot column is at
  the left. Every year 26–30 therefore shows at every width, and they fade
  toward the horizon with the block above them rather than staying crisp
  under a dissolving right edge. Years are written in two digits everywhere
  on the race chart now, not just here (`raceTickLabel`), so the axis reads
  the same either side of the scale break; ticks carry a numeric `year`
  because the label is lossy, which is what the 1980 popover keys off. The
  tail year needs no suppressing — a 24px tail puts the camera on a
  fractional year, so the historical axis emits the present alone. Yellow is
  the
  chapter's first hue and stays inside the monochrome-plus-ink rule because
  it colours a region, not an actor; the block carries a 13% wash as well as
  its dashed outline, which is why it sits in the annotations layer rather
  than the overlay — the ten names now rest inside it, and a fill in the
  overlay would have painted over every one of them.

  Two consequences worth a look before this is called finished. The name
  column has moved off the right-hand gutter and onto the plot, so the names
  read across the inside of the block — defensible ("the actors whose
  futures we are asking about, standing in the future"), but it is a real
  change to how the step reads. And the ten names pack into the bottom of a
  ~0.037-tall band, which overflowed onto the x-axis row once the column
  moved left; the fix lifts the whole de-collided stack as a body, which
  keeps every gap but also pulls SLJ's name ~30px off its dot onto a leader.
  A bottom-up de-collide sweep would leave him alone and is the better fix
  if that reads badly — it needs a direction flag in `label-decollide.js`,
  which is shared with every other beside-dot state.
  ```

## 5. Films scatter — step 12 (`scatterCenters`, `showFilms`)

- [ ] **P-12-1 · Label the x-axis** as film count.

## 6. Gen Z hand-off — steps 21–22 (`scatterGenZ`)

- [ ] **P-21-1 · Return to the future line chart** (the step-11 chart) with SLJ
  ```
  on it, instead of the scatter.
  ```
- [ ] **P-22-1 · Choose the second Gen-Z visual:** either repeat whatever
  ```
  P-21-1 lands on, or put the Gen-Z actors onto the step-11 chart. Matt
  prefers the latter — its x-axis is already years, so the hand-off into
  `careerTrio` becomes trivial. P-21-1 and P-22-1 resolve together.
  ```

## 7. Simulation payoff — step 27 (`simRace`)

- [ ] **P-27-1 · Close on the future line chart, 2025–2030**, showing SLJ
  ```
  receding from #1.
  ```

## 8. Out of scope

Matt's doc closes these off explicitly: no text edits (all prose is

placeholder), no new points or data rabbit holes, no new sections.

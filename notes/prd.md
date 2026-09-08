# PRD — feedback backlog

Single place to manage everything raised in Matt's **9/8 step-by-step
walkthrough** in the editorial feedback doc
([Feedback: Kevin Bacon](https://docs.google.com/document/d/1mksHA4zYMw0sdsegPHGCzgUvR6qwhpgydn5Y3ZDhopw/edit),
owner: matt@polygraph.cool).

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
      layer they land in. Matt: "might be neat" — biggest build of the four.
- [x] **P-04-3 · Narrative annotation.** Annotate that the 4th layer is the
      deepest, and/or that 2 degrees covers X% of Hollywood, so the chart says
      something rather than just showing rows. **Shipped:** the percentage half
      only — each band label now carries its corpus share ("2 movies away — 70%
      of actors"). The 4th layer being the deepest is still unsaid; fold it into
      the copy pass or split it out. Wording is placeholder, for Owen.
- [x] **P-04-4 · Degree separation.** Colours may blend for some readers — push
      more separation between degrees, or put a dashed line between bands.
      **Shipped:** whitespace, not a rule — a 12px gap reserved between bands
      before the shares are struck (`BAND_GAP` in `layouts/hop-bands.js`).

## 2. Rank ladder — steps 5–6 (`hopBands` → `rankFocus`)

- [ ] **P-06-1 · Chart title.** e.g. "ranking of actors by average distance,
      2025".
- [ ] **P-06-2 · Legend for the colour sections.** Currently unexplained.
- [ ] **P-06-3 · Stacked bar instead of dots.** The ladder condenses the corpus,
      so one dot ≠ one actor — Matt suggests a stacked bar chart instead.
      Depends on P-06-4.
- [ ] **P-06-4 · Make the preceding step a stacked bar too**, to ease the
      transition into P-06-3. Only worth doing if P-06-3 goes ahead.

## 3. Race chart — steps 8–9 (`raceRecent`)

- [ ] **P-08-1 · Fixed y-axis range.** Hold y at a static range for
      readability. **Open thread in the doc** — Matt confirmed he means literal
      constant bounds, no animation, and is "not convinced this would be an
      upgrade"; Owen's counter is to stagger it so only the lines _or_ the axis
      scale animate at once. Decide before building.
      **To look at it:** `npm run dev` has a "fixed y" panel on the race steps
      (`src/components/scrolly/RaceFixedYDev.svelte`, dev builds only) that swaps
      the camera fit for two constant bounds, seeded top 2.05 / bottom 2.40.
      Off is the chart as it ships.
- [ ] **P-08-2 · Chart title — and on every subsequent line chart.**
- [ ] **P-09-1 · Auto-rewind.** If the reader never pressed "start", the chart
      should animate back to 2001–2006 on its own.

## 4. The future band — step 11 (`raceFuture`)

- [ ] **P-11-1 · Stop graying the items out.** Keep dots and labels visible;
      the gray-out reads as confusing.
- [ ] **P-11-2 · Label the future.** Highlight 2027–2030 as a block (Matt:
      "a big yellow box") labelled "the future".

## 5. Films scatter — step 12 (`scatterCenters`, `showFilms`)

- [ ] **P-12-1 · Label the x-axis** as film count.

## 6. Gen Z hand-off — steps 21–22 (`scatterGenZ`)

- [ ] **P-21-1 · Return to the future line chart** (the step-11 chart) with SLJ
      on it, instead of the scatter.
- [ ] **P-22-1 · Choose the second Gen-Z visual:** either repeat whatever
      P-21-1 lands on, or put the Gen-Z actors onto the step-11 chart. Matt
      prefers the latter — its x-axis is already years, so the hand-off into
      `careerTrio` becomes trivial. P-21-1 and P-22-1 resolve together.

## 7. Simulation payoff — step 27 (`simRace`)

- [ ] **P-27-1 · Close on the future line chart, 2025–2030**, showing SLJ
      receding from #1.

## 8. Out of scope

Matt's doc closes these off explicitly: no text edits (all prose is
placeholder), no new points or data rabbit holes, no new sections.

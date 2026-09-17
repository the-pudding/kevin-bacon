# Tween sign-off checklist

Manual visual inspection of every step transition. One row per step in the

`Index.svelte` registry, in document order.

## How to run it

`npm run dev`, then jump straight to a step with `?step=N` (the index in the

first column) and step **into** it from the neighbour named in the Notes so the

tween actually plays — landing on a step by URL paints it without a transition.

- **Fwd** — arrive forwards (Next / ArrowRight / the step's own control).
- **Back** — arrive backwards (Previous / ArrowLeft). `n/a` where the step is

  `skipback`: a backward move passes straight through it, so that arrival can

  never happen.

- **Mobile** — 375×667 emulation, forwards. Check the dots stay inside the plot,

  labels don't collide, and the step card doesn't cover what the copy points at.

Watch for, on every arrival: dots travel rather than snap; nothing pops in at

full opacity before the tween lands; text gated on `story.settled` appears after

the motion, not during; mashing Next/Previous retargets mid-flight without

snapping back.

## Marks

| Mark  | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| `[ ]` | not yet checked                                          |
| `[x]` | checked and signed off                                   |
| `[!]` | **stale** — the visual changed since sign-off, re-verify |
| `n/a` | this arrival cannot happen                               |

## Marking steps stale

When a visualisation changes, every step that renders through it goes back to

`[!]` — including steps whose own code was untouched. Work out the blast radius

from what changed:

- a **layout function** in `layouts/*.js` → every step using that state, plus the

  step either side of each of them (a tween has two ends).

- **shared machinery** — `tween.js`, `layout-shared.js`, `ScrollyVisual.svelte`,

  `states.js` → the whole table.

- a state's **entry / revealFrom / delays / ambient / camera** → that state's

  steps and the step before each one.

- an **over-canvas panel** (`RankBars`, `RaceScrubber`, `SimRunner`,

  `GenZMovers`, `PairQuiz`, the Start buttons) → the steps that mount it and the

  step it hands off to.

- **step registry** changes (adding, removing or reordering a `<Step>`) → renumber

  the table and stale the neighbours of the edit.

## Steps

| #   | State                                         | Fwd                                                                                                                         | Back                                                                                               | Mobile | Notes                                                                                                                                                                                                       |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `lone`                                        | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Cold start (no `?step`) must play the pop-in; a refresh on `?step=0` must not. Back arrives from 1.                                                                                                         |
| 1   | `networkIntro`                                | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Network grows out of `lone`. Tour caption appears only once settled; tap an actor to pin.                                                                                                                   |
| 2   | `hopSeed`                                     | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Constellation pulls back; the bands' crowd parks behind it invisibly.                                                                                                                                       |
| 3   | `chapterCenters` — "The centers of Hollywood" | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Chapter card. Picture should hold still while the title fades in; title must be gone before 4 starts sorting.                                                                                               |
| 4   | `hopBands`                                    | [x]                                                                                                                         | [x]                                                                                                | [ ]    | Crowd sorts into bands. Prose waits for `story.settled`.                                                                                                                                                    |
| 5   | `hopBands`                                    | [x]                                                                                                                         | [x]                                                                                                | [ ]    | Same state — text only, no dot tween. Back arrives from **6 and 7** (7 skips through 6); check both.                                                                                                        |
| 6   | `rankFocus` (gate, skipback)                  | [x]                                                                                                                         | n/a                                                                                                | [ ]    | Bands collapse to Bacon's bar; rank panel fades in only once the retarget lands. Guess or give up to leave.                                                                                                 |
| 7   | `rankReveal`                                  | [x]                                                                                                                         | - [ ] bug (gets worse with &gt; 1 visit)                                                           | [ ]    | Fwd via `GuessRank`'s own advance (not `go()`, so `navigate()` does not run). Back arrives from **8 and 9**.                                                                                                |
| 8   | `raceRecent` (gate, skipback)                 | [ ]                                                                                                                         | n/a                                                                                                | [ ]    | The rank→race handoff: bars collapse into the chart's dots over a parked canvas. Press Start — the rewind plays _across_ the step change into 9.                                                            |
| 9   | `raceRecent`                                  | [ ]                                                                                                                         | - [ ] bug (resumes at 2025 rather than 2004)                                                       | [ ]    | Same state; the camera choreography from 8 lands here. Rank panel must stay up until `story.rankCollapsed`.                                                                                                 |
| 10  | `raceFull`                                    | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Scrubber panel. Drag and slider on mobile; check the control clears the tap gutters.                                                                                                                        |
| 11  | `raceFuture`                                  | - [ ] bug (lines visible)                                                                                                   | [ ]                                                                                                | [ ]    | Fixed camera, no scrubber.                                                                                                                                                                                  |
| 12  | `chapterCenters` — "The makings of…"          | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Chapter card off a chart: the plot must dissolve into the full-bleed field.                                                                                                                                 |
| 13  | `scatterCenters` `{showFilms}`                | - [ ] bug: label suffix immediately disappears rather than fades out with the name (check elsewhere)                        | [ ]                                                                                                | [ ]    | Field sorts into the scatter.                                                                                                                                                                               |
| 14  | `scatterCenters` `{showPair}`                 | [ ]                                                                                                                         | [ ] bug: label suffix immediately disappears rather than fades out with the name (check elsewhere) | [ ]    | Portman/Kendrick pair reveal.                                                                                                                                                                               |
| 15  | `scatterCenters` `{showPair}`                 | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Text only — the canvas must not move at all.                                                                                                                                                                |
| 16  | `scatterCenters` `{showPair, showCostars}`    | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Costar overlay arrives.                                                                                                                                                                                     |
| 17  | `scatterCenters` `{showPair, showCostars}`    | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Text only — canvas must not move.                                                                                                                                                                           |
| 18  | `degScatter`                                  | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Axis swap: dots re-plot against costar film count.                                                                                                                                                          |
| 19  | `scatterQuiz` (gate: quiz complete)           | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Blurred overlay over the live scatter. Fwd arrival re-arms the question; back arrival reveals every pair instead of re-asking — check both.                                                                 |
| 20  | `chapterCenters` — "Predicting the next…"     | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Back arrives from **21 and 22**.                                                                                                                                                                            |
| 21  | `raceGenz` (gate, skipback, advanceon)        | [ ]                                                                                                                         | n/a                                                                                                | [ ]    | Camera pans down off the crown; SLJ leaves through the top. Must arrive with an empty plot and a live Start (`resetGenzLines`). The draw-on carries the reader to 22.                                       |
| 22  | `raceGenz`                                    | [ ]                                                                                                                         | [ ]                                                                                                | [ ]    | Same state; arrives on its own once the draw-on lands.                                                                                                                                                      |
| 23  | `careerTrio`                                  | - [ ] lines shrink down?In general. We should fade the lines away first, followed by the node tween.                        | [ ]                                                                                                | [ ]    | Sweeney/De Niro/Chase trio. Its `revealFrom` points at `raceGenz`.                                                                                                                                          |
| 24  | `careerMany`                                  | [ ]                                                                                                                         | - [ ]                                                                                              | [ ]    | Trio fans out to the many. Back arrives from **25 and 26**.                                                                                                                                                 |
| 25  | `simRace` (gate, skipback, advanceon)         | - [ ] the dots tween towards top left, but they should go to where the origin of the simulation race graph is (bottom left) | n/a                                                                                                | [ ]    | Must arrive at zero runs with a live Start (`resetSimRace`) on a forward arrival from outside the state. The run carries the reader to 26.                                                                  |
| 26  | `simRace`                                     | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Settled chart — must keep the result, not re-run.                                                                                                                                                           |
| 27  | `raceClose`                                   | - [ ] lines translate to the bottom left, which looks weird. They should fade out                                           | [!]                                                                                                | [ ]    | Race chart's future view returns; SLJ's line falls away, contenders land on their medians.                                                                                                                  |
| 28  | `outro`                                       | [!]                                                                                                                         | [!]                                                                                                | [ ]    | Lines fade where they stand, then a 4s pull-back carries the six dots into the full-bleed crowd, greying them into it. No `race` descriptor: no labels, no cull, no pan. Fwd exits one-way into `#credits`. |

## Cross-cutting passes

| Check                                                                                  | Status |
| -------------------------------------------------------------------------------------- | ------ |
| Mash Next/Previous through the whole story — dots retarget mid-flight, no snap-back    | [ ]    |
| Refresh on a mid-story `?step=N` — lands painted, no `lone` flash, no replayed pop-in  | [ ]    |
| 320px emulation, whole story                                                           | [ ]    |
| Rotate to landscape on a phone viewport                                                | [ ]    |
| DevTools "emulate `prefers-reduced-motion: reduce`" — no ambient drift, no panel fades | [ ]    |
| `npm run build` green                                                                  | [ ]    |

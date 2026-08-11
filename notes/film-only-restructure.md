# Film-only restructure

Decision from editorial discussion (2026-08-11), following feedback from Matt and
the doc reviewers (Russell, Jacque, Alvin) — see `content-feedback.md` for the
original review this responds to.

## The change

- **Cut the formalisation of concurrency and costar average degree.** No more
  `concurrenceScatter` steps, `degScatter`, `predictionScatter`/`PredictToggles`,
  or the metric definitions ("concurrency of 0.28", "top-50 costar degree").
  These don't change who wins the Monte Carlo (the simulation runs purely on
  career-age vs. film-count trajectory, confirmed in `layouts/career.js` — it
  never reads `conc` or `top50`), so formalising them was proof-of-work with no
  payoff.
- **Keep the concrete examples, demoted to narrative colour.** Julie Walters
  (franchise-heavy, British ensembles) and Theron/Rogen (Jonah Hill anecdote)
  stay, but as anecdotes inside the film-count section — no separate
  metric-defining steps or scatters behind them.
- **Nod to "same/right people" qualitatively**, without naming a formula. This
  checked out against real data: Moretz (conc 0.054, top50 7.56), Greenblatt
  (0.016, 7.48), and Fanning (0.064, 7.66) all show the same low-concurrency,
  high-costar-degree profile as the quiz's "right people" exemplars — so the
  aside is true, just not modelled.
- **Use the freed space for current female representation**, not just the
  closing stat. Nicole Kidman is #21 in the current full ranking (avg_distance
  2.19, 62 films) — the first woman, ahead of Susan Sarandon (#24) and Meryl
  Streep (#27), both already named elsewhere in the piece. Top 20 today are all
  men.

## Why

1. The "first female center" closer (77% of Monte Carlo wins going to women)
   currently lands with no setup — it's a fact dropped cold at the end. Kidman's
   #21 plants the seed early: "even now, it's 20 men before a woman shows up."
2. Steps 14–19 (concurrency/degree formalisation) were independently flagged as
   confusing by every reviewer on the doc (Matt, Russell, Jacque, Alvin) — see
   `content-feedback.md` L2/C4 and the doc feedback for specifics.

## Placement

- Kidman goes into the existing `scatterCenters` step (log films vs
  avg_distance, right after SLJ is crowned) — reuse that scatter, add her as a
  highlighted point alongside the Nicolas Cage film-count callout. No new
  chart.
- No new data pipeline work needed for this: `rank` and `avgDistance` for
  Kidman already exist in `scrolly-nodes.json`. She's added as a single named
  highlight, same pattern as `career.js`'s hardcoded Sweeney/De Niro/Chase
  points — not a new `gender` column in the data build.

## Open question, not yet decided

Whether the female angle stays a single named callout (Kidman) or grows into
an aggregate stat (e.g. "gender split of the top 50"). The former needs
nothing new; the latter requires adding an actual gender field to
`tasks/build-scrolly-nodes.js`'s data build. Decide before touching the
pipeline — this materially changes the scope of the work.

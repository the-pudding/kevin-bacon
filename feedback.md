# From Matt

Step numbers are the 0-based `?step=` index in the URL (`Index.svelte:164`), so
"step 11" is the 12th card — `raceFull` / "Now imagine us taking this into the
future" (`Index.svelte:592`).

## 5. Step 25: costar avg on the y-axis, or cut it

> "for step 25: yea i kinda want to see the costar avg on the y-axis" / "or you
> can just skip that whole part and say 'we'll do the same thing for costars'
> in text, and jump immediately to the simulation slide"

- [ ] Step 25 is the second `careerMany` card — the costar copy sitting on the
      _film-count_ chart it inherits from step 24 (`Index.svelte:703`,
      `career.js:340`). The complaint is real: nothing on screen changes while
      the text switches metric.
- [ ] **Option A (chart it).** A `careerCostars` state: same x (career age),
      y = costar film-count average. **Blocked on data** — `story.careers` only
      holds `[careerAge, films]` pairs (sweeney / deniro / chase / cohort), and
      `top50` exists only as a single present-day snapshot per node. Per-year
      costar trajectories would need a new export from the analysis repo plus a
      `npm run scrolly-data` rebuild before any of this can be built.
- [ ] **Option B (cut it).** Delete the step, fold "we do the same thing for
      costars — it's simpler, since it stabilises around career age 10" into
      step 24's copy, and go straight into the simulation. Zero data work, and
      removes a step that currently shows the reader nothing new.
- [ ] Recommend Option B unless the analysis repo can produce the trajectories
      cheaply. Owen's call, and Owen's copy either way.
- [ ] If B: check the step count downstream — `revealFrom: ["careerTrio"]` on
      `careerMany` (`career.js:346`) and `simRace`'s back-step path both assume
      the current ordering, and `?step=` links in any shared feedback shift by
      one.

# Stuff for nerds:

1. Search opportunities:

- vertical bar chart showing connection to KB
- Scatter plots, showing film count

2. "results" at the end to see how you did on the questions

3. Race chart indent the line with movies

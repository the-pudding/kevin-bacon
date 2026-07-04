# Components handover — "Gen Z's Kevin Bacon"

Agreed visual, chart, and data changes for the components repo (`kevin-bacon-components`).
Copy-only fixes are being handled in the story repo (`Index.svelte` / `storyboard.md`) and are **not** listed here — this page is only the work that lives on the charts side.

Component names and Storybook links are in `notes/storyboard.md`. Bracketed IDs (e.g. `[L2]`) are breadcrumbs back to the review notes.

---

## 1. Chart / visual changes

### V1 — Make average distance visible across the three film-count scatters `[L2]`

The three scatters — `distance-films-scatter`, `concurrence-films-scatter`, `top50-degree-films-scatter` — all share **X = log(films)** and only swap the Y axis (avg*distance → concurrency → costar degree). But the narrative claim is about **avg_distance vs concurrency/degree**, and avg_distance isn't on the axis in the 2nd and 3rd plots. As drawn, the reader can't \_see* "low-avg-distance actors have low concurrency / high costar degree"; they have to remember it from the first plot.

**Fix:** encode `avg_distance` as colour on all three plots, **or** persistently highlight the same benchmark actors (Portman / Theron / Robbie, plus Rogen as the counter-example) across all three so the eye tracks the relationship.

### V2 — Gender-label the centers timeline `[I3]`

The closing payoff is "our first female center of Hollywood." Nothing in the piece currently establishes that _every_ past center (1970–2026) was a man, so it reads as a claim dropped at the end rather than an observation the reader already made.

**Fix:** colour/label the timeline and race chart by gender so the all-male history is visibly obvious. Applies to `race-chart` and the timeline view.

### V3 — Prediction scatter: show the correlation number updating `[I6]`

The before/after correlation jump (starts at 82, rises when concurrency + costar degree are toggled on) is the money stat of the whole Past/analysis section. The dots already travel toward the diagonal — the correlation _value_ also needs to be visible and update live as each signal is toggled, so the improvement is legible.

Component: `prediction-scatter`.

### V4 — Crown reveal: show the spread `[I2]`

When SLJ is crowned we show #1 (2.09) and KB (#175, 2.28) but not the range. 2.09 vs 2.28 looks like a rounding error without context.

**Fix:** surface the distribution (best → typical → worst avg*distance) in the rank ladder / results view so the reader can see how \_compressed* the elite is and how large a ~0.19 gap really is. Components: `rank-ladder` / results.

### V5 — Wins bar chart: convey breadth, not just the top 3 `[I5]`

The three win-shares (25 / 10 / 10) sum to 45%, so 55% is a long tail. "No clear majority" only lands if the reader can see _how many distinct actors won at least one simulation_ — 25% is dominant if only a handful split the rest, unremarkable if 60 do.

**Fix:** in the wins chart, convey the number of distinct winners (or the length of the tail), and label CGM's actual current avg_distance so "well-clear" is anchored.

### V6 — Future model must project all three signals, not just film count `[C4]`

The whole analysis proves film count isn't enough (concurrency + costar degree matter). The simulation/career model must project **films + concurrency + costar degree** forward and re-run through the prediction model — not film count alone. The `career-age-scatter` (career age vs # films) is fine as the _illustration_, but the model behind the wins should not be, or appear to be, film-count-only.

---

## 2. Data values the copy needs

These numbers are referenced (or should be) in the story copy but must come from / be confirmed against the data. Please supply exact values:

- **Seth Rogen's actual concurrency** — copy currently disagrees with itself (0.2 vs 0.28). Need the real value to fix the sentence cleanly. `[C1]`
- **Julie Walters' rank + film count** — to replace the qualitative "under-performs drastically" with a hard number. `[I1]`
- **Percentile for "one film with SLJ → avg_distance 3.08"** — copy says "top 75%"; we want to restate as "better than X% of all actors." Need the true percentile. `[L3]`
- **Number of distinct actors who won ≥1 simulation** — for "no clear majority." `[I5]`
- **CGM's current avg_distance** — for "well-clear." `[I5]`
- **New correlation after adding concurrency + costar degree** — the "82 → ?" jump. `[I6]`

---

## 3. Naming consistency

The data field is `concurrence`; the story standardises on **concurrency**. Story copy is also standardising on **center** (not "anchor") and **average distance** (not "avg_dist" / "mean average distance"). Please match chart labels, legends, and tooltips to: **concurrency**, **center**, **average distance**. `[L6]`

---

## 4. Open question

- **5×-longer-reign on mobile `[I4]`** — "his reign has lasted 5× longer than anyone else" could be shown directly on the timeline (reign-length segments/bars), but it's unclear how to do this on mobile without clutter. Undecided — flag if the timeline component has room for it.

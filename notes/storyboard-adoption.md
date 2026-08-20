# Adopting the storyboard into the main post

## Context

`src/routes/storyboard/+page.svelte` is the live text outline of the story and has
been rewritten twice since the post was built — `db59eb8 simplify post to
film-count only` (which cut the concurrency/costar-degree/prediction machinery,
per `notes/film-only-restructure.md`) and `896d8ae feat: new wording with more
emphasis on women` (which brought the costar signal back qualitatively and added
three female-representation beats).

Neither commit touched `src/components/Index.svelte`. The built post still runs
27 steps including four `concurrenceScatter` steps, `degScatter`,
`predictionScatter` and the Julie Walters beat — all of which the storyboard has
dropped. The storyboard is now 23 steps.

This plan brings the storyboard copy and step structure into `Index.svelte`,
annotates every step with what still blocks it, and lists the visualisations that
fall out of scope as a result. **Visualisation changes are out of scope here** —
the deletion list is a list, not a work item.

### Decisions taken

- Storyboard steps with **no visual designed** ("Dunno - dotted race chart",
  "XXX", "top 250 AK/NP overlap", "career age vs top50") are **omitted** from
  `Index.svelte` until a visual exists. They stay recorded below.
- The gender statistics are **derived and asserted, not hardcoded**, settling
  the open question at the bottom of `notes/film-only-restructure.md` in favour
  of the aggregate-stat option. In practice this is smaller than it sounds: the
  gender data already exists upstream and every figure is already derivable or
  published — see "Pipeline work" below. The one exception is Sarandon's #9 in
  2012, confirmed real and carried as prose.
- On the costar metric (SB15), **migrate to the existing film-count metric and
  keep the log.** `top50` moves off the legacy log-degree measure onto
  `costar_top50_log_films`, which upstream already uses everywhere else.
  Dropping the log to match the copy's "taken as an average" literally is
  **rejected** — it would change the Monte Carlo's simulated winners, including
  the 65% female win-share SB23 quotes. The residual wording nuance is an open
  question, with two zero-cost display fixes noted under SB15.

### Authoritative sources

- Copy + visual intent: `src/routes/storyboard/+page.svelte` (HEAD). Supersedes
  `notes/storyboard.md`, which predates the restructure and is now stale.
- Framework contracts: `notes/scrolly-framework.md` — read before touching
  `src/components/scrolly/`.
- Editorial rationale: `notes/film-only-restructure.md`,
  `notes/content-feedback.md`.

---

## How steps are edited

There is no config array. A step is a `<Step>` element inside `<Wizard>` in
`src/components/Index.svelte` (lines 144–387); `Step.svelte` self-registers in
document order via the `"scrolly-steps"` context. Add, remove or move the
element and the index follows.

```svelte
<Step state="scatterQuiz" params={{ revealed: true }} panel={quizPanel}>
	<p>copy…</p>
</Step>
```

Two side effects of reordering:

- The active index is persisted as `?step=N` (`Index.svelte:16,22–26,80–82`), so
  existing shared links will land on different steps.
- `Index.svelte:85–96` resets the rank guess on backing out of
  `rankFocus`/`rankReveal`; that logic is keyed on state name, not index, so it
  survives reordering.

---

## Step-by-step adoption map

Dispositions: **Adopt** (copy-only, visual already supports it) · **Blocked**
(copy asserts something the visual or data does not yet show) · **Omit** (no
visual designed) · **Delete** (implemented step the storyboard dropped).

| SB  | State                | Current step | Disposition | Summary                                                  |
| --- | -------------------- | ------------ | ----------- | -------------------------------------------------------- |
| 1   | `lone`               | 0            | Adopt       | unchanged                                                |
| 2   | `networkIntro`       | 1            | Adopt       | reworded; edge-label visual is a gap                     |
| 3   | `hopSeed`            | 2            | Adopt       | unchanged; visual note conflicts with the seed pattern   |
| 4   | `hopBands`           | 3            | Adopt       | unchanged                                                |
| 5   | `rankFocus`          | 4            | Adopt       | unchanged                                                |
| 6   | `rankReveal`         | 5            | Blocked     | new female-representation sentences, unsourced           |
| 7   | `raceRecent`         | 6            | Adopt       | unchanged                                                |
| 8   | `raceTrades`         | 7            | Blocked     | adds Frank Welker to the named cast                      |
| 9   | `raceFull`           | 8            | Blocked     | rewritten; "no female center" needs gender               |
| 10  | —                    | —            | Omit        | "Now imagine us taking this into the future" — no visual |
| 11  | `scatterCenters`     | 9            | Adopt       | rewritten, much shorter                                  |
| 12  | `scatterCenters`     | 10           | Blocked     | needs Portman/Kendrick highlighted                       |
| 13  | —                    | —            | Omit        | "better costars" beat — visual is `XXX`                  |
| 14  | —                    | —            | Omit        | top-250 AK/NP overlap — no visual                        |
| 15  | `degScatter`         | 18           | Blocked     | copy stands; `top50` must be recomputed                  |
| 16  | `scatterQuiz`        | 12, 13       | Blocked     | quiz question changes from distance to costars           |
| 17  | `scatterGenZ`        | 20           | Adopt       | rewritten; step 21 deleted                               |
| 18  | `careerTrio`         | 22           | Adopt       | lightly reworded                                         |
| 19  | `careerMany`         | 23           | Adopt       | sim-count sentence moves to SB21                         |
| 20  | —                    | —            | Omit        | career age vs top50 line — no visual, no data            |
| 21  | `winBars`            | 24           | Blocked     | rewritten; adds a play control                           |
| 22  | `sljFan`             | 25           | Blocked     | redesigned chart + a new toggle                          |
| 23  | `sljFan`             | 26           | Blocked     | 77% → 65%, unsourced                                     |
| —   | `scatterWalters`     | 11           | Delete      | Julie Walters dropped                                    |
| —   | `concurrenceScatter` | 14–17        | Delete      | concurrency formalisation dropped                        |
| —   | `predictionScatter`  | 19           | Delete      | prediction scatter dropped                               |

Net: 27 steps → **16 steps** adopted now, 7 of them blocked, 4 more waiting on a
visual.

---

## Gap analysis per step

### SB2 — `networkIntro` (step 1)

Copy: "so prolific and well-known" replaces "so prolific, genre-spanning, and
timeless". Adopt as-is.

**Visual gap.** The storyboard now wants edges highlighted one at a time as the
narration cycles actors, with **edge labels naming the shared film**. Two
blockers: edges in `scrolly-nodes.json` are bare `[a, b]` pairs with no film
title, so the film name needs adding in `tasks/build-scrolly-nodes.js`; and
ScrollyVisual's label overlay is node-anchored (`STATE_LABELS` keys are node
ids), so an edge-anchored label channel is new work. The per-edge tween group
that the highlight sequencing needs already exists (`edgeIndex(e)` slot 0 =
draw progress) — see `notes/scrolly-framework.md`, "Attr array".

### SB3 — `hopSeed` (step 2)

Copy unchanged. Adopt as-is.

**Visual conflict, needs a decision.** The storyboard describes a visible beat:
"Zoom out. Edges and labels fade as more nodes appear. KB becomes styled like the
rest of them." `hopSeed` is deliberately an _empty canvas_ — the seed-state
pattern documented in `notes/scrolly-framework.md` ("Empty-canvas beats via a
seed state"), which exists so `hopBands` always fades in identically regardless
of how fast the reader steps. Making this step visible means either replacing
the seed pattern here or splitting the beat across two steps.

### SB6 — `rankReveal` (step 5) — **blocked**

Adds: "Female actors are under-represented here, occupying only 16 of the top 100
most connected actors. Nicole Kidman is the first female in at #21."

**Data gap.** No gender field exists anywhere — confirmed across `tasks/`,
`src/components/` and both data files. `notes/review-triage.md` already flagged
this against the old 77% claim: "no gender field in any dataset; the claim stands
only in your copy." Both figures need deriving and asserting in
`tasks/build-scrolly-nodes.js`.

**Placement note.** `notes/film-only-restructure.md` put Kidman on
`scatterCenters`; the newer storyboard puts her here, on the rank reveal. The
storyboard wins — and it fits better, since `RankBars.svelte` already renders the
top 250 rows, so marking her row is a smaller change than a new scatter
highlight. `notes/components-handover.md` V2 asks for the same gender labelling
on the timeline.

### SB8 — `raceTrades` (step 7) — **blocked**

Copy adds Frank Welker alongside De Niro and Hackman. Note the storyboard's
"changed heads" is a typo — keep "changed hands".

**Gap.** `raceTrades` names its cast outright via `raceStepCast`'s `only` list
(`RACE_TRADES_HOLDERS` in `layouts/race.js`). Confirm Welker is in that cast and
in the 15 `raceSeries` anchors before adopting, or the copy names an actor with
no line on the chart.

### SB9 — `raceFull` (step 8) — **blocked**

Rewritten, and it fixes the existing stray-word defect ("…in 1970. data.").

**Contradiction.** The new copy says "every center since 1980" while `raceFull`'s
extent is `[1970, 2025]` and the previous wording said 1970. Pick one.

**Data gap.** "No female actor has ever been the center" falls out of the gender
field applied to `story.eras` (43 handovers) — derive and assert it.

"Susan Sarandon in at #9 in 2012" is **confirmed correct by Owen** and adopted
as authored. It is not reproducible from the shipped data (`raceSeries` covers 15
anchors, `eras` covers handovers — neither gives a per-year full ranking), so it
stands as a hardcoded figure in the prose, same pattern as `career.js`'s
Sweeney/De Niro/Chase callouts. No pipeline work.

**Matching design ask.** `notes/components-handover.md` V2 — gender-label the
centers timeline so the all-male history is visible, not just asserted.

### SB10 — omitted

Copy: "Now imagine us taking this into the future. How might we predict who will
take the crown…" Visual is `Dunno - dotted random race chart into future?`.

**Cost of omitting.** This is the Past → Future bridge. Without it the reader
goes from the full race timeline straight into a scatter with no transition. If
the omission reads badly when walking the built post, the cheapest fix is folding
this copy onto `raceFull` or `scatterCenters` rather than inventing a chart.

Note also that the `<h2>Future</h2>` boundary moves: in the storyboard it sits
before the film-count scatter, whereas `Index.svelte`'s `<!-- FUTURE -->` comment
currently sits before `predictionScatter`. Move the comment when the steps move.

### SB11 — `scatterCenters` (step 9)

Rewritten and much shorter — the old step carried four rhetorical questions.
Adopt. Fix "Nicholas Cage" → "Nicolas Cage" (flagged in
`notes/content-feedback.md`).

### SB12 — `scatterCenters` (step 10) — **blocked**

Replaces "Just because you're in loads of films…" with the Portman/Kendrick
contrast.

**Visual gap.** `layoutScatterCenters` highlights only SLJ. The copy says the two
are "shown here at the two extremes of the data", so it cannot land before they
are highlighted. This is a small change: both ids already exist as quiz pair 2
(`story.quiz[1]`, ids 10210 / 11355) and already have `QUIZ_LABEL_DIRS` entries.
A `params`-driven highlight map on `scatterCenters` is the natural shape — no
data work.

### SB13, SB14 — omitted

SB13 ("XXX") carries the "better costars / it's not what you know" argument;
SB14 wants the top 250 actors re-shown with AK/NP's overlap marked. Both are the
narrative core of the new costar section, so omitting them leaves SB15's metric
definition without its setup. `RANK_TOP_N = 250` and `BY_RANK` in
`layout-shared.js` already give SB14 its cast when someone designs it.

### SB15 — `degScatter` (step 18) — **blocked on pipeline**

**Resolved: switch to the existing film-count metric, keep the log.** The copy
describes the measure as "an actor's 50 most prolific costars **by number of
films**, taken as an average". The `top50` column in `scrolly-nodes.json` is
`top50_log_degree` — the log mean **degree** of the 50 most-_connected_ costars
(KB = 7.6896). Wrong on both counts: wrong ranking key and wrong quantity.

A film-count metric already exists upstream. `costar_top50_log_films` —
`mean(log(f + 1))` over the 50 costars with the most films — replaced the
degree version across the regression, prediction scatter and Monte Carlo in
June 2026. Only the design scatter this repo consumes was left behind on the
legacy metric. So the change is a **migration onto an existing metric**, not a
new computation:

- Upstream, re-export the scatter artefact keyed on `costar_top50_log_films`
  instead of `top50_log_degree`.
- Here, update the join in `build-scrolly-nodes.js:195-200` (currently reads
  `p.top50_log_degree`) and the `nodes.js:22` JSDoc.
- Values move from ~7.2–7.9 to ~4.1, so `layoutDegScatter`
  (`layouts/scatters.js:167`) needs an explicit `tickStep` — it currently falls
  back to `0.5`, tuned for the old range.
- `story.genz.candidates[].top50` carries the legacy metric too. Nothing reads
  it today; recompute in the same pass so the two never disagree.
- The axis title "Stronger co-stars →" still reads correctly; no overlay change.

**Explicitly not doing: dropping the log.** Taken literally, "taken as an
average" means an arithmetic mean of film counts, which the metric is not.
Removing the log is rejected because the Monte Carlo fits OLS directly on this
feature and propagates additive deltas in feature space, so it would change the
simulated winners — including the 65% female win-share SB23 quotes — and
invalidate a tuned constant in the prediction scatter plus five published
findings. Not worth it for a wording nuance.

That leaves the copy slightly ahead of the data, which is **an open wording
question for Owen**. Two cheap ways to close it if it matters, neither touching
the pipeline: drop the y tick labels entirely (the x-axis in this same chart
family already does exactly that — `scatters.js:78`, "the log scale is
described, not quantified"), or label ticks as `exp(v) - 1` so they read in
films (SLJ's 4.1199 shows as ~61) while the plotted positions stay on the log
scale. The second makes the sentence true of a geometric mean. Either folds
into the tick-step work above for free.

### SB16 — `scatterQuiz` (steps 12, 13) — **blocked**

The question changes from _"who has the lower average distance"_ to _"who works
with more big dogs"_, over pairs matched on film count.

**Data gap.** `story.quiz`'s three pairs carry an `answer` keyed on average
distance, and `PairQuiz.svelte` reveals onto the avg-distance scatter. A costar
question needs its answers re-derived (and probably new pairs) in
`tasks/build-scrolly-nodes.js`, which already asserts "quiz answers re-derived".

**Framework constraint.** The storyboard collapses question and reveal into one
step. Keep both: `notes/scrolly-framework.md` requires that every interaction is
skippable and that the step _after_ it reveals the answer unconditionally — which
is what `params={{ revealed: true }}` on step 13 does.

### SB17 — `scatterGenZ` (step 20)

Rewritten to set up the prediction model. Adopt. Delete step 21, whose copy is
absorbed.

### SB18 — `careerTrio` (step 22)

"Films first." prefix; "at the same point"; "went on to have a brilliant career".
Adopt. The 87 / 27 figures already match the data (`notes/scrolly-framework.md`
records the 72→87 and 26→27 corrections).

### SB19 — `careerMany` (step 23)

Adopt. The "run this simulation 10,000 times" sentence moves out to SB21, so the
step now ends on the weighted-selection sentence.

### SB20 — omitted

"Line graph where x axis is career age, and y axis is top50." No such chart and
no such data: `story.careers` holds cumulative film counts by career age, not a
costar series. Needs both a layout and a pipeline addition.

### SB21 — `winBars` (step 24) — **blocked**

New copy is a single setup sentence. Two things to weigh before adopting:

- It **drops** "Tap a bar to see how that contender's stats compare" — the only
  signposting of a real built interaction (`hits` + `pick` in `win-bars.js`).
  Losing the line makes the interaction undiscoverable.
- It **adds** "User can press play to start the simulation", which does not
  exist. The bars render at their final win share immediately.

### SB22 — `sljFan` (step 25) — **blocked**

The visual becomes "Line chart, but the Gen Z actors move towards their projected
position", with a "current average distance" / "predicted average distance"
toggle (annotated `finding #25`). That is a redesign of `slj-fan.js`, not a copy
change.

The new copy also drops the "average winning score is 2.33" stat.
`notes/scrolly-framework.md` records that 2.33 is the _closest sourced statistic_
available (the storyboard's original 2.24 was never reproducible) — so dropping
it is fine, but do not reinstate 2.24.

### SB23 — `sljFan` (step 26) — **blocked**

77% → **65%** of simulation wins going to women. Same gender-field dependency as
SB6 and SB9; this is the figure `notes/review-triage.md` singled out as
unsourced. Both numbers are currently unverifiable.

---

## Visualisations that can be deleted

These fall out of the storyboard entirely. Listed for a follow-up; **not part of
this plan's edits**.

**1. `concurrenceScatter` — safe to delete.**

- `layoutConcScatter` + its `states` entry in `layouts/scatters.js`.
- The `conc` node column becomes unused: `layoutConcScatter` is its only reader
  (`win-bars.js:161` reads `focus.conc` from `story.genz.candidates`, a separate
  field, and stays).
- Frees the `conc` field in `tasks/build-scrolly-nodes.js`.

**2. `predictionScatter` — safe to delete, largest win.**

- `layouts/prediction.js` (130 lines) and its `states.js` import/spread.
- `PredictToggles.svelte` (42 lines) and `story.predictInsights`.
- The prediction diagonal trail slot in `TRAIL_META` (`layout-shared.js:222`).
- The four predicted-distance node columns (`predFilm`, `predFilmConc`,
  `predFilmDeg`, `predAll`) and their JSDoc in `nodes.js:23–26`.
- `story.corr` in `scrolly-story.json` — already read by nothing.
- Resolves the standing contradiction between
  `notes/prototype-fidelity-gaps.md` P0 (remove the correlation number) and
  `notes/components-handover.md` V3 (show it updating): the chart goes away.

**3. `scatterWalters` — safe to delete, but check the editorial call.**

- `layoutScatterWalters` + its `states` entry.
- The `WALTERS` constant (`layout-shared.js:135`) and her yellow highlight
  threaded through `layoutScatterQuiz`, `PAIR_HIGHLIGHTS`, `PAIR_LABELS` and
  `PAIR_LABEL_DIRS` in `scatters.js`, plus `prediction.js:77,116`.
- **Flag:** `notes/film-only-restructure.md` said to _keep_ Walters as narrative
  colour inside the film-count section. The newer storyboard drops her outright.
  Confirm that is intended before deleting the code.

**4. `degScatter` — do not delete the layout.** Its _step_ goes in phase 1 along
with the rest of the costar block, but SB15 brings the chart back — only its y
source changes, from the legacy log-degree metric to `costar_top50_log_films`
(see SB15 above). Leave `layoutDegScatter` and its `states` entry in place.

**5. `sljFan` — do not delete yet.** SB22 describes a redesign but SB23 still
says "the same fan chart", so it is ambiguous whether SB22 evolves `slj-fan.js`
or replaces it. Resolve when the SB22 visual is designed.

---

## Pipeline work: the gender figures

**Most of this already exists.** The scoping pass found three TMDB gender
fetchers upstream, each with a committed output, plus two published findings
built on them. TMDB's person endpoint carries a `gender` enum
(`0` unset, `1` female, `2` male, `3` non-binary) and it is already being
pulled — just into per-cohort side files rather than a joinable column. So this
is an **export-and-join job, not a new pipeline**.

Status of each figure the new copy needs:

| Figure                     | Step | Status                                                                        |
| -------------------------- | ---- | ----------------------------------------------------------------------------- |
| 16 of top 100 are female   | SB6  | **Derivable now** — top-250 gender file × the top-200 ranking export          |
| Kidman first female at #21 | SB6  | **Confirmed** — rank 21, avg distance 2.1933, first female in the ranking     |
| No female center, ever     | SB9  | **Confirmed** — all 43 eras male, 15 distinct anchors                         |
| 65% of sim wins to women   | SB23 | **Published** — 64.9% female win share; the sim output already carries gender |

Sarandon's #9 in 2012 is not in this table — it is confirmed real and stays a
hardcoded figure in the prose (see SB9). Note it also already exists upstream as
a dedicated counterfactual analysis, so it is sourced, just not from anything
this repo imports.

So the work reduces to getting gender across the boundary into `src/data`:

- Add gender to the ranking export upstream, so the top-200 artefact this repo
  already reads carries it. Watch the tie-break: the gender fetcher orders by
  `avg_distance, person_id` while the ranking export orders by `avg_distance`
  alone — make them identical or the two lists can disagree at a tie boundary.
- Join it onto node rows in `build-scrolly-nodes.js` and assert the derived
  figures there, the way the build already asserts KB rank 175, the SLJ podium,
  bucket totals, quiz answers and the career trio.
- The era timeline needs gender as a **post-hoc join on `person_id`**, not a
  regenerated timeline — that analysis takes 2+ hours of CPU and is
  parameter-sensitive. Only the 43 era anchors need gender.
- Gender is known for roughly 6,700 actors upstream, not the full 162k corpus.
  That is ample: these figures need ~175 distinct people (top 100, 43 anchors,
  the Gen Z candidates).

Also note that two of the figures point in opposite directions — no woman has
ever ranked above #9 historically, yet women take 65% of simulated future wins.
That tension is deliberate and flagged upstream as an editorial call, not a data
problem. The post should not quietly reconcile it.

Source note: the upstream `actor-metrics.sqlite` is not distributed, so
`npm run scrolly-data` only re-runs on a machine with the full analysis
checkout — which is why the generated JSON is committed.

---

## Working order

1. ~~**Copy-only pass**~~ — **DONE.** See "Phase 1 as landed" below. Adopt
   SB1–5, 7, 11, 17, 18, 19; delete steps 10, 11,
   12, 13, 14–17, 18, 19, 21. That is 11 deletions: the four
   `concurrenceScatter` steps, `predictionScatter`, `scatterWalters`, the
   duplicate `scatterCenters`/`scatterGenZ`/`sljFan` beats, and both
   `scatterQuiz` steps. Post drops to 16 steps and stays walkable end to end.
   Cutting the whole costar block is deliberate: leaving steps 10, 12, 13 and 18
   behind would leave four steps promising hypotheses and charts that no longer
   exist. SB12–16 get rebuilt as a block once the metric migration and the NP/AK
   highlight land. `degScatter` (18) goes with them and returns with SB15.
   Step 25 (`sljFan`) is _not_ deleted — SB22 is blocked on a redesign, and
   blocked steps keep their existing copy.
2. **Metric migration (SB15)** — upstream, re-export the costar scatter on
   `costar_top50_log_films`; here, update the join at
   `build-scrolly-nodes.js:195-200`, the `nodes.js:22` JSDoc, and
   `layoutDegScatter`'s tick step for the new ~4.1 range. Keeps the log.
3. **Gender join** — get gender across the boundary and assert the three derived
   figures, unblocking SB6, SB9 and SB23. Mostly export plumbing; see "Pipeline
   work".
4. **Small visual gaps** — SB12's Portman/Kendrick highlight; SB8's Welker cast
   check; SB21's copy decision on the tap/play affordances.
5. **Design work** — SB2 edge labels, SB3 zoom-out beat, SB16 quiz reframing,
   SB22 projected-position chart, and the four omitted steps.
6. **Deletions** — remove the visualisations listed above once their steps are
   gone.

Also worth folding in when you touch `src/routes/storyboard/+page.svelte`: it
imports `Page from "$routes/+page.svelte"` at line 2 and never uses it, and the
copy carries three typos to fix at the same time as adopting it — "changed heads"
(SB8), "the we've ever come" (SB9), "you almost definitely be closer" (SB15).

---

## Phase 1 as landed

16 steps: `lone` · `networkIntro` · `hopSeed` · `hopBands` · `rankFocus` ·
`rankReveal` · `raceRecent` · `raceTrades` · `raceFull` · `scatterCenters` ·
`scatterGenZ` · `careerTrio` · `careerMany` · `winBars` · `sljFan` × 2.

Also removed as their last consumers went: the `PairQuiz` and `PredictToggles`
imports, the `quizPanel` snippet, and the `bind:this={visual}` binding on
`ScrollyVisual` (it existed only for the quiz's `locate()` flight targets).
`PairQuiz.svelte` and `PredictToggles.svelte` are now unreferenced — they are
listed under "Visualisations that can be deleted" and left on disk because
SB16 may reuse the quiz.

### Deviations from the plan, and why

- **SB10's copy was folded onto `scatterCenters` as a leading paragraph** rather
  than dropped with its step. SB11 opens "The obvious one is film count", which
  has no antecedent once SB10 is omitted. This is the fallback the SB10 entry
  already recommended — it needs no new visual.
- **`raceFull`'s stray ". data." was fixed** without adopting the rest of SB9.
  That was a plain defect, independent of the blocked Sarandon content.
- **"Nicholas Cage" → "Nicolas Cage"** in the new SB11 copy, per
  `notes/content-feedback.md`.
- **SB8 turned out not to be blocked.** Frank Welker is already named in the
  shipped copy; the only storyboard change was the "hands" → "heads" typo, which
  was not adopted. No cast check needed.

### Two known incoherences this leaves, both resolved by phase 5

1. **SB17 references "costar data" that no longer has any setup.** Its copy
   promises "everything we need to predict an actor's current average distance
   using film count and costar data", but SB12–16 — which introduce the costar
   signal — are cut. Either accept the forward reference until they land, or
   temporarily revert this step to its previous self-contained wording ("Now,
   Samuel L. Jackson can't be the center forever…").
2. **The 10,000-run figure is no longer stated before the win bars.** SB19 drops
   that sentence because SB21 was meant to pick it up, and SB21 is blocked.
   `winBars` still says "wins in a quarter of simulations", so nothing is wrong —
   just unquantified.

---

## Superseded: all storyboard copy now landed

The "omit until a visual exists" decision above was **reversed** — Owen asked for
every step's text in now, with the data to follow. `Index.svelte` therefore
carries all 23 storyboard steps, mapping 1:1 onto SB1–SB23, and the per-step
dispositions in the table above should be read as _what still needs doing_
rather than _what was adopted_.

Steps sharing a state because their visual is not designed yet: SB12–SB14 all
sit on `scatterCenters` (10–13), and SB20 sits on `careerMany` (19). The reader
clicks through those with no visual change.

### Outstanding: SB16 needs a reveal row in the storyboard

`notes/scrolly-framework.md` requires that the step _after_ an interaction
reveals its answer unconditionally, so a reader who skips still learns it:

> Every interaction is skippable. The step _after_ an interaction reveals the
> answer unconditionally… No interaction may gate the Next button.

`PairQuiz` only reveals a pair the reader actually picks, so as it stands the
quiz breaks that rule — click past SB16 and no answer is ever shown. A reveal
step was tried and removed: the storyboard has no row for it, and inventing the
copy produced a sentence that answered the wrong question (the quiz asks who
works with more "big dogs"; `story.quiz`'s answer key resolves average
distance).

**Fix: add a reveal row to `src/routes/storyboard/+page.svelte` after SB16**,
with copy that answers the big-dogs question, then add the matching
`params={{ revealed: true }}` step here. Do it alongside the quiz's data work —
the answer key has to be re-derived for the new question anyway.

### Copy parity with the storyboard

The post now matches `src/routes/storyboard/+page.svelte` **word for word** across
all 23 steps. Verified by diffing the two files, not by eye — worth re-running
after any copy change, since silent drift between them is what created this whole
exercise.

Four slips were fixed **in the storyboard** and mirrored here, keeping the
storyboard as the single source of truth rather than letting the post diverge:

- "every center since 1980" → **1970** (SB9). The first era starts 1971-12-14 and
  `raceSeries` spans 1970–2025.
- "the we've ever come" → **"the closest we've ever come"** (SB9).
- "Nicholas Cage" → **"Nicolas Cage"** (SB11).
- "you almost definitely be closer" → **"you'll almost definitely be closer"**
  (SB15).

"the crown changed **heads**" (SB8) is deliberate — Owen's wording, kept.

### Two interaction gaps this leaves

- **`winBars`' tap is unsignposted.** The bars are tappable (`hits` + `pick` in
  `win-bars.js`) but no copy says so; SB21 instead promises a play control that
  does not exist. Resolve in the storyboard.
- **The quiz has no unconditional reveal** — see the SB16 note above.

---

## Verification

- `npm run dev`, then walk every step with Next / ArrowRight and back with
  Previous / ArrowLeft. Every step must render prose and a visual; no step may
  reference an actor or figure that is not on screen.
- Mash Next/Previous through the deleted-step boundaries (old steps 9–20) —
  dots must retarget mid-flight without snapping back.
- `?step=N` links from before the restructure will land on different content;
  confirm out-of-range indices still clamp (`Index.svelte:70–78`).
- Check 375px and 320px emulation and DevTools "emulate
  prefers-reduced-motion", per `notes/scrolly-framework.md`'s verify section.
- `npm run lint` and `npm run build` must stay green. There is no test suite.
- After the pipeline change: `npm run scrolly-data` must re-run clean with its
  new assertions passing, and the regenerated JSON must stay byte-stable on a
  second run.

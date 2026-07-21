# Prototype fidelity gaps — spot-the-difference

Audit of every **not-ready** scrolly state (`ready={false}` in `Index.svelte`)
against its pudding-post prototype. **pudding-post/design is the source of
truth** — its design decisions were hard-fought and win every disagreement; the
tables below catalog where this repo's implementation diverges so it can be
brought into line.

Method: one subagent per prototype↔implementation pair. Substrate differences
(Lit-in-isolation vs one shared persistent canvas, web-component vs Svelte,
tween engine, object-constancy parking) are **expected and not flagged** —
only design/behaviour divergences are.

Coverage: `race*`, `scatter*` (distance family), `concurrenceScatter`,
`degScatter`, `predictionScatter`, `careerTrio/Many`. `winBars` and `sljFan`
are also not-ready but have **no prototype** — see the last section.

---

## The one cross-cutting theme (fix these first)

**The implementation keeps adding "helpful" quantitative UI that the
prototype's hard-fought design deliberately omits, and drops the prototype's
directional axis copy that makes the charts legible.** Three of five audits
independently flagged this. These are the highest-severity items because they
directly contradict explicit design decisions, not just polish gaps.

### Blockers — impl shows what the prototype forbids

| where         | prototype says                                                                    | impl does                                         | evidence                                                                                           |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Prediction    | "No correlation number is shown … the convergence on the diagonal is the message" | renders `correlation: NN` as a strong note        | proto `prediction-scatter.js:7`, `PredictionScatter.stories.js:28` → impl `prediction.js:71,84-86` |
| Distance quiz | neutral reveal, "no right/wrong UI; the dots' height tells the story"             | card prints `✓/✗ {name} — {avgDist} vs {avgDist}` | proto `distance-films-quiz.js:6` → impl `PairQuiz.svelte:23-30`                                    |

### Majors — impl drops the prototype's directional axis titles

The prototype encodes the reading _in the axis label_ (esp. because the y-axis
is inverted "lower distance = better"). The impl replaces these with bare metric
names, so the inverted/relative axes become unexplained.

| chart            | prototype title             | impl title            | evidence                                                           |
| ---------------- | --------------------------- | --------------------- | ------------------------------------------------------------------ |
| Distance scatter | "Closer to centre →"        | "Avg distance"        | proto `distance-films-scatter.js:229-234` → impl `scatters.js:224` |
| Concurrence      | "More recurring co-stars →" | "Concurrence"         | proto `concurrence-films-scatter.js:235` → impl `scatters.js:255`  |
| Top-50 degree    | "Stronger co-stars →"       | "Costar degree (log)" | proto `top50-degree-films-scatter.js:234` → impl `scatters.js:263` |

---

## Priority-ranked fix list

**P0 — contradicts an explicit design decision**

1. Prediction: remove the correlation number. (`prediction.js:71,84-86`)
2. Quiz: remove ✓/✗ verdict + raw distances; go neutral. (`PairQuiz.svelte:23-30`)

**P1 — wrong reading / broke the prototype's core gesture** 3. Prediction: restore ONE binary toggle (film↔all); hide the two intermediate predictors the SOT keeps hidden. (`PredictToggles.svelte:12-18`, `prediction.js:22-27`) 4. Prediction: fixed shared domain across toggles + square plot so dots slide onto a _fixed_ 45° diagonal. (`prediction.js:37-45`) 5. Scatters (all): compute y-domain from the **shown (≥10-film) subset**, not the whole corpus — currently sub-threshold actors stretch the domain and misposition every dot & mark. (`scatters.js:47-51`) 6. Career: clip De Niro/Chase (and cohort) lines to career-age ≥ Sweeney's (15) so they diverge from a shared point. (`career.js:71-77`) — pure layout, doable today. 7. Career: at "all futures", demote De Niro/Chase into the gray cohort (fade labels, gray lines) instead of keeping them highlighted. (`career.js:118`) 8. Restore directional axis titles (table above).

**P2 — divergent encoding / marks** 9. Prediction: axis assignment X=Actual / Y=Predicted (impl has them swapped). (`prediction.js:52,112-113`) 10. Quiz marks uniform blue, not alternating blue/red — the impl even contradicts its own neutral-reveal note. (`scatters.js:179-186`) 11. Single-subject highlight discipline: prototype rings exactly one subject; impl adds supporting-cast dots (Cage/Bacon in centers; Oldman/Kidman/Streep in Walters). (`scatters.js`) 12. Career colour: prototype = red hero + blue marks + gray comparisons; impl reinvented as RED/BLUE/YELLOW identity colours. (`career.js:64-65,187-189`) 13. Degree ticks contradict their own "(log)" title — impl exps them to raw counts ("1,808"). Either show log units or drop "(log)". (`scatters.js:200,263`) 14. Prediction finale: restore SLJ red ring + pair-contrast marks + Walters. (`prediction.js:98-116`)

**P3 — tick strategy, padding, copy, cosmetics** 15. Y-ticks: nice even steps (0.1 conc / 0.5 degree / 0.5 distance) vs impl's 3 raw-edge ticks. (`scatters.js:91-94`) 16. Drop x-axis tick numbers — prototype deliberately shows none. (`scatters.js:82-89`) 17. Add 6% y-padding so dots don't kiss plot edges (race + scatters). (race `race-chart.js:382-384`) 18. Remove impl-added on-canvas callouts the prototype lacks (see per-component "impl-only additions").

---

## Per-component detail

### Race chart — `race*`

Data, actor set, monotone-cubic smoothing, focus-actor colour wiring are
faithfully ported. The animation-mechanics gap (drawLine→rewind playhead sweep)
is already owned by `delivery-plan.md` — **not re-listed here.** New static-
fidelity gaps:

| #   | area               | prototype                                                                                                 | impl                                                                                  | severity | in delivery-plan?                 |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | --------------------------------- |
| R1  | series per window  | all 15 anchors always shown, y just refits (`race-chart.js:455`)                                          | `yCap` drops non-contenders (2.3/2.25/∞) (`race.js:47`)                               | major    | no                                |
| R2  | colour mapping     | all 15 coloured (8-colour ramp, α0.85) (`race-chart.js:10-12`)                                            | only 4 focus coloured; other 11 grey (`layout-shared.js:175-184`)                     | major    | no                                |
| R3  | labels             | every terminal dot labelled, de-collision + leader stubs + eased swap-slide (`race-chart.js:323,510-516`) | only 1–4 STATE_LABELS, no de-collision/leaders/slide (`ScrollyVisual.svelte:338-355`) | major    | partial (Stage 6 = clipping only) |
| R4  | right label gutter | `M.right=155` reserved (`race-chart.js:15`)                                                               | inset 26px; names clip (`race.js:56`)                                                 | major    | yes (Stage 6)                     |
| R5  | y-padding          | 6% top+bottom (`race-chart.js:382-384`)                                                                   | none; dots on plot edges (`race.js:58`)                                               | major    | no                                |
| R6  | year labels        | along **top**, edge-fade, width-aware thinning (`race-chart.js:424-446`)                                  | along **bottom**, fixed step, no fade (`race.js:123-140`)                             | minor    | partial                           |
| R7  | era annotations    | textless bookmark rects, only with `coronation` (never set → none render) (`race-chart.js:406-410`)       | **impl invents** text callouts "Name · Year" + the left-clip bug (`race.js:106-122`)  | major    | clip only (Stage 6)               |

Impl-only additions: text era callouts, `yCap` filtering, focus/crowd two-tier
styling, axis titles. Confirm whether the dense-15-line prototype or the
1–4-line highlight is the intended editorial direction — that's an editorial
call, not a bug.

### Distance scatters + quiz — `scatterCenters/Walters/Quiz/GenZ`

Quiz pairs match the prototype exactly. Top items are the **P0 quiz neutrality**
and **P1 domain** fixes above. Also:

- scatterCenters: impl adds Cage + Bacon highlights + "{n} films" note (proto = SLJ only, no callouts).
- scatterWalters: impl makes Walters **red** + adds Oldman/Kidman/Streep blue; prototype = Walters as the single **blue** highlight. Role swap.
- scatterQuiz: impl drops SLJ's underlying ring the prototype keeps.
- Quiz cadence: prototype reveals one pair at a time (guess-before-you-see); impl shows all three as button rows (framework-driven, but changes intent).
- **scatterGenZ has no prototype** — impl-only Future-chapter state; internally palette-consistent, nothing to audit against.

### Concurrence + Top-50 degree — `concurrenceScatter/degScatter`

Both from one `filmsScatter()` factory, so the shared-factory gaps (P1 domain,
directional titles, tick strategy, x-ticks) hit both. Specific:

- Degree "(log)" title vs exp'd raw-count ticks — internal contradiction (P2 #13).
- Quiz marks alternate blue/red vs prototype's uniform blue (P2 #10).
- **Julie Walters** ringed+labelled highlight on the concurrence prototype is **absent** in impl — _plausibly intentional_ (impl narrative runs quiz→conc→degree, highlighting the six quiz actors). Editorial confirm rather than blind restore.

### Prediction — `predictionScatter`

The most-diverged component. See P0 #1, P1 #3–4, P2 #9, P2 #14. Summary: impl
inverts axes, splits the binary toggle into two (exposing hidden intermediate
predictors), lets the domain shift per toggle (breaking the fixed-diagonal
convergence), and prints the forbidden correlation number. Also adds a "perfect
prediction" diagonal label and colours the cloud blue (proto = neutral grey).
Note: `prediction-scatter.js:1-5` header comment is stale/self-contradictory —
the code + axis titles + aria say X=Actual/Y=Predicted; trust those.

### Career — `careerTrio/careerMany`

Right actors, right axis metric (**X=career age, Y=cumulative films** — the pair
name "distance" is a misnomer). See P1 #6–7, P2 #12. Also:

- careerMany cohort size **40 vs prototype's 145** lines (`story.careers.cohort` vs `cohort-16-at-15-trajectories.json`).
- Cohort lines lack terminal dots; comparison lines unclipped.
- Impl adds "all three: 16 films by career age 15" note; prototype has no annotation (fact lives in prose).

---

## Data-pipeline gap (not just layout)

**Career background cloud can't be built from current data.** The prototype
draws ~48,180 actor dots in career-age×films space (`career-age-scatter.json`);
`scrolly-nodes.json` rows carry **no career-age / first-film-year column** (12
cols: pid, name, hop, films, avgDistance, rank, concurrence, top50-deg, 4
predicted distances). The impl parks the cloud at the _distance_-scatter spot at
alpha 0 (invisible, wrong axis). Restoring the cloud (`career.js:56-61`)
requires adding career-age to whoever owns `tasks/build-scrolly-nodes.js` — flag
upstream before treating it as a layout bug.

---

## Not-ready, but no prototype exists

`winBars` (`win-bars.js` + `BarPicker.svelte`, Gen Z win-simulation waffle) and
`sljFan` (`slj-fan.js`, SLJ trajectory + outcome fan) are `ready={false}` but
have **no pudding-post counterpart**, so there's nothing to spot-the-difference
against. They are net-new visuals authored only in this repo. Options: (a) build
the prototypes first so they get the same hard-fought treatment before this repo
finalizes them, or (b) audit them against the design _principles_ in
`pudding-post/design/CLAUDE.md` (minimal, mobile-first 320px, width-aware
labels, no gridlines/chart-junk) instead. Recommend (a) given the theme above —
this repo has a habit of adding UI the design layer would have removed.

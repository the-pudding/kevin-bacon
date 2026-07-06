# Review triage — full-story visualisation build (2026-07-05)

Everything below was built in one autonomous session (commits `160f24a`,
`0b56dbe`, `e1cb321`, `92a9e06`) and **none of it has been seen by Owen**.
Treat every item as unreviewed. Assumptions are tagged:

- **[copy]** — I changed prose in `Index.svelte` (your voice, your call)
- **[data]** — a dataset/statistic choice with alternatives
- **[design]** — a visual/interaction judgement call
- **[scope]** — storyboard feature simplified or deferred

Verify recipe: `npm run dev`, walk all 28 steps (`.claude/skills/verify/SKILL.md`
has the Playwright drive; it was run at 900×800, 390×844, 320×568 with zero
console errors).

## Step-by-step review checklist

### Present

- [ ] **Step 2 `network` (dwell)** — labels/edges removed, crowd contracts
      inward from a pre-spread park (zoom-out read), per-node stagger inside
      each hop wave. Implements feedback items 2 & 3. **[design]** feedback
      item 3 ("'never has, never will' can be the first dwell step") was read
      as: make this step a dwell (2× height, pinned card). KB keeps his pulse
      ring here even though the copy says he's not the center — kept for
      object constancy; drop it if it reads wrong.
- [ ] **Step 3 `hopBands`** — rows per hop, KB labelled on top. **[design]**
      band _thickness_ follows the on-screen sample; the right-edge _notes_
      cite the true corpus totals (1,581 / 113,396 / 47,119 / 133). Mixing
      those two scales is a judgement call.
- [ ] **Step 4 `hopCalc`** — same rows, notes become `count × hops` plus
      `÷ 162,229 actors = 2.2823` (verified against the sqlite exactly).
- [ ] **Step 5 `rankFocus` (dwell)** — fisheye ladder (all 2,347 dots in one
      line, ±3 window magnified with `#rank name` callouts). **[scope]** the
      storyboard's free-text guess with "guess again / give up", and the
      "row-based graph becomes stacked horizontal bars showing distance-3
      proportion shrinking" idea, were **not built** — the guess is 4
      multiple-choice buttons (SLJ / Hanks / Streep / De Niro; picking pans
      the ladder). **[design]** those four names are my picks.
- [ ] **Step 6 `rankReveal`** — pans to SLJ #1; window notes name Dafoe #2,
      De Niro #3. **[scope]** no free exploration of the full ranking beyond
      the window (storyboard wanted explorable names). **[copy]** I appended
      "Willem Dafoe is second, Robert De Niro third." to your step copy.

### Past

- [ ] **Steps 7–9 race chart** — **[data]** lines are the 15 era anchors from
      `actor-trajectory-anchors.json`; era boundaries from
      `time-machine.json`. **[design]** window choices: 2004–2026, 1998.5–2007,
      1970–2026; zoomed steps hide actors who never come within a y-cap of
      the lead (2.3 / 2.25); era callouts only for reigns ≥ 3y / 0.4y / 4y
      respectively (2.5× stricter under 480px). Colors: SLJ purple, Hackman
      blue, De Niro green, Welker yellow, rest gray.
- [ ] **[scope]** storyboard's per-handover "deep dive breakdown" opt-ins and
      the tap-a-timeline-point exploration are **not built** — annotations are
      static. The dwell on step 9 exists but there's nothing extra to explore
      yet (needs the canvas hit-test from "Known gaps").

### Scatter chapter

- [ ] **Steps 10–11 `scatterCenters`** — **[design]** every films-scatter
      shares one log-films x-scale (dots only travel vertically between
      metrics); avg-distance y is _inverted_ (lower = better = up) to match
      the race chart, and clamped to ≤ 3.2 with the long tail faded at the
      edge. SLJ note "116 films — 20 more than Nicolas Cage" derived from
      data.
- [ ] **Step 12 `scatterWalters`** — JW red, Oldman/Kidman/Streep blue, note
      "same films as far better-connected actors" (my phrasing, on-canvas).
- [ ] **Steps 13–14 `scatterQuiz` (dwell)** — 3 pairs from
      `distance-quiz.json`; answers re-derived from sqlite at build.
      **[design]** after each pick: correct actor turns green; the other actor
      blue if you were right, red if you were wrong; verdict line shows both
      avg distances. **[copy]** step 13 copy tweaked to "who in each pair do
      you think has the lower average distance?".
- [ ] **Steps 15–18 `concurrenceScatter`** — Rogen/Theron labelled, all six
      quiz actors tinted. **[copy]** "concurrency of 0.2 … 28%" corrected to
      "0.28 … 28% of the cast" (data: 0.2758). **[scope]** step 17 ("one film
      with SLJ → 3.08") has no bespoke visual — storyboard had it TODO'd as
      "needed?".
- [ ] **Step 19 `degScatter`** — y ticks converted from log units to actual
      costar counts. Same six highlights.
- [ ] **Step 20 `predictionScatter` (dwell)** — toggles swap the predictor
      (film → +concurrence → +degree → all); dots slide toward the diagonal.
      **[data]** correlation shown is Pearson r × 100 computed at build over
      the 1,447-actor prediction cohort: film = **86** (storyboard said 82),
      +concurrence 88, +degree 95, all 98.

### Future

- [ ] **Steps 21–22 `scatterGenZ`** — CGM red + pulse, all 32 sim candidates
      green, SLJ purple for contrast.
- [ ] **Step 23 `careerTrio`** — trio lines from `actor-trajectories.json`
      (all hit 16 films at career-age 15 — asserted). **[copy]** De Niro
      "totalling 72" → **87** and Chase "26" → **27** to match that data.
- [ ] **Step 24 `careerMany`** — **[data caveat]** the 40 gray cohort lines
      come from `actor-year-rows.json` (the sim's sampling table) whose
      film-count definition differs from the trio's design data (its De Niro
      shows 11 films at age 15, not 16). Two sources on one chart — visually
      fine, definitionally inconsistent. Alternatives: draw cohort from the
      exhaustive trajectory file, or drop the named trio onto the same source.
- [ ] **Step 25 `winBars` (dwell)** — **[data]** sim results are
      `genz-mc-knn-bootstrap.json` (10,000 runs) — the only version matching
      the storyboard podium (CGM 24.65%, Greenblatt 9.7%, Fanning 9.7%).
      v6–v11 sims have different winners (v11: Awkwafina). **[design]**
      dot-waffle bars **on the shared canvas** (1 dot ≈ 25 runs, top 6
      candidates only) instead of the inline standalone component the
      framework notes suggested — constancy won the argument; cheap to swap.
      **[scope]** the storyboard's per-candidate narrative blurbs (Greenblatt
      "she's 14…", Fanning "projected to keep what she has") are reduced to a
      one-line stats note per pick.
- [ ] **Steps 26–27 `sljFan`** — **[scope]** the storyboard's "10,000
      simulation lines" fan is simplified to: SLJ's trajectory line + each
      candidate's projected-median dot at the age-40 horizon + a
      winning-score marker. A real fan needs per-sim paths that were never
      persisted. **[data]** "average winning score" is **not reproducible**:
      per-run winner scores aren't in the sim output. Shown (and quoted in
      step 26 copy, was 2.24) is **2.33** = win-weighted mean of winners'
      projected medians. **[copy]** step 26 edited accordingly. Step 27 (77%
      female winners) has **no visual and no sourcing** — no gender field in
      any dataset; the claim stands only in your copy.

## Cross-cutting decisions to sanity-check

- [ ] **[data]** Node set grew 1,008 → 2,347 (prediction cohort + quiz +
      Gen-Z + race anchors + Julie Walters appended, sorted by pid; block-1
      ids byte-stable). The scatter crowd = everyone; the concurrence/degree/
      prediction states show only actors with that metric (others park
      invisibly at their distance-scatter spot).
- [ ] **[data]** Hop for appended actors comes from
      `hop-tree-kevin-bacon-10000.json`; ~781 appended actors have **no known
      hop** (`hop: -1`) and are therefore _absent from_ `lone`/`networkIntro`/
      `network`/`hopBands` — including Julie Walters, Seth Rogen, Sweeney,
      Greenblatt. Their first appearance is the scatter chapter.
- [ ] **[design]** Palette: crowd gray, KB ink, SLJ purple, focus red,
      secondary blue, Gen-Z green, Chase/Welker yellow — my assignments from
      the category tokens.
- [ ] **[design]** Plot area capped at top 66% of the viewport (was 72%) so
      axis ticks clear the step card; win bars baseline rises to 50% and race
      callouts thin out under 480px. The 320×568 card still occludes chart
      bottoms on text-heavy steps (pre-existing issue, unresolved).
- [ ] **[design]** `Step.svelte` now wraps slot content in a `.card` div
      (needed so buttons share the card background) — subtly changes every
      step card's box/shadow geometry, including steps 0–1 you'd already
      reviewed. Dwell steps pin the card sticky at the viewport bottom.
- [ ] **[design]** New chart furniture (HTML ticks/callouts/caption) crossfades
      per state rather than tweening; captions render top-centre small-caps.
- [ ] Interaction plumbing: shared `story` state + `STATE_PARAMS` selectors;
      param changes re-run the current layout in 450ms with no choreography.
      All four interactions are skippable (next step reveals regardless).
- [ ] Renames for the spellcheck gate: two states renamed to
      `concurrenceScatter`/`predictionScatter` (their abbreviated names failed
      the gate); added dictionary words
      (unspool, toggleable, crossfaded, genz); `scrolly-story.json` added to
      `.prettierignore` + cspell ignore (byte-stable generated file).
- [ ] Committed straight to `main` (repo pattern — no branches to date).

## Not built (deliberately deferred)

- Chapter title dividers (Present / Past / Future) — TODOs removed from
  markup; decide treatment.
- Canvas tap-to-inspect (nearest-node hit-test) for dwell steps — race
  timeline and rank exploration are static without it.
- Step-visibility analytics beacon (framework notes: "required before
  publish").
- Label edge-clamping (SLJ's dot label clips at the right canvas edge on the
  scatters; a couple of quiz labels can collide at 390px).
- Backwards network → networkIntro still replays the reveal stagger
  (pre-existing cosmetic).

# Prototype → implementation map

Maps the Storybook prototypes in `../pudding-post/design` (Lit / vanilla web
components, the design sandbox) to their shipping implementation in this repo
(`src/components/scrolly/`, SvelteKit + a single canvas tween engine).

The relationship is **one story, two substrates**: each prototype is a
standalone Storybook story with its own data JSON; here the same visual is a
`layout` function that emits canvas frames, registered as one or more _states_
in `states.js` and driven by `ScrollyVisual.svelte`. High-cardinality dots that
the prototype draws per-story are, here, all the same ~10k-dot canvas cloud
tweening between states (object constancy).

## Tokens & primitives

| pudding-post/design                                                                                                               | this repo                                                                                    | notes                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `stories/primitives/actor-dot.js` (`HOP_RGB`, `DOT_RADII`, `DOT_ALPHA`, `colorForHop`, `fillStyle`, `drawDot`, `LABEL_TARGET_PX`) | `scrolly/layout-shared.js` (`HOP_RGB`, dot radii/alpha, colour helpers) + `scrolly/nodes.js` | Single source of truth for a dot's appearance on both sides.     |
| `stories/primitives/era-marker.js` (`<era-marker>`, `drawEraMarker`, `ERA_MARKER`)                                                | era-timeline overlay drawn in `scrolly/layouts/race.js` + rendered by `ScrollyVisual.svelte` | Bookmark markers annotating handover years on the race chart.    |
| `stories/experimental/graph-colours.js` (distance colour ramp)                                                                    | colour constants in `scrolly/layout-shared.js` (`RED`/`BLUE`/`GREEN`/`PURPLE`/`INK`…)        | Placeholder hop/distance ramp; kept identical across substrates. |

## Rendering engine & transitions

| pudding-post/design                                                                                                      | this repo                                                                                                          | notes                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stories/transitions/ng-hg-transition.js` (NG→HG canvas transition, arc/reshape/raindrop stages)                         | `scrolly/ScrollyVisual.svelte` + `scrolly/tween.js`                                                                | The prototype demos one hand-authored transition; here the tween engine generalises it to _every_ state→state move (seed frames, delays, trails). |
| `stories/experimental/graph-canvas.js`, `graph-canvas-y.js` (d3-force beeswarm skeleton precompute over `data/layout/*`) | offline layout prep feeding `src/data/scrolly-nodes.json`; consumed by `layouts/intro.js` & `layouts/hop-bands.js` | Force-sim seeding is a build-time step upstream of this repo, not runtime code here.                                                              |
| `stories/experimental/graph-colours.js` `GraphColours` story                                                             | —                                                                                                                  | Exploration only; folded into the ramp above.                                                                                                     |

## Chapter visuals

| pudding-post/design story (data)                                                                                                         | this repo layout → state(s)                                               | interactive step-card                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `NetworkGraph` — `NetworkGraph.stories.js` / `network-graph.js` (`intro-bacon-network.json`)                                             | `layouts/intro.js` → `lone`, `networkIntro`                               | —                                                     |
| `HopGraph` — `hop-graph.js` (`hop-tree-shared.json`)                                                                                     | `layouts/hop-bands.js` → `hopSeed`, `hopBands`                            | —                                                     |
| `RankLadder` — `rank-ladder.js` (`closeness-ranking-top200.json`)                                                                        | `layouts/rank.js` → `rankFocus`, `rankReveal`                             | `scrolly/RankBars.svelte`, `scrolly/GuessRank.svelte` |
| `RaceChart` — `race-chart.js` (`actor-trajectory-anchors.json`)                                                                          | `layouts/race.js` → `raceRecent`, `raceTrades`, `raceFull`                | —                                                     |
| `DistanceFilmsScatter` — `distance-films-scatter.js` + `distance-films-quiz.js` (`distance-films-scatter.json`, `distance-quiz.json`)    | `layouts/scatters.js` → `scatterCenters`, `scatterWalters`, `scatterQuiz` | `scrolly/PairQuiz.svelte`                             |
| `ConcurrenceFilmsScatter` — `concurrence-films-scatter.js` (`concurrence-films-scatter.json`)                                            | `layouts/scatters.js` → `concurrenceScatter`                              | —                                                     |
| `Top50DegreeFilmsScatter` — `top50-degree-films-scatter.js` (`top50-degree-films-scatter.json`)                                          | `layouts/scatters.js` → `degScatter`                                      | —                                                     |
| `PredictionScatter` — `prediction-scatter.js` (`prediction-scatter.json`)                                                                | `layouts/prediction.js` → `predictionScatter`                             | `scrolly/PredictToggles.svelte`                       |
| `CareerAgeScatter` — `career-age-scatter.js` (`career-age-scatter.json`, `actor-trajectories.json`, `cohort-16-at-15-trajectories.json`) | `layouts/career.js` → `careerTrio`, `careerMany`                          | —                                                     |

## Implemented here, no prototype yet

These ship in this repo but have no counterpart story in `pudding-post/design`:

- `layouts/win-bars.js` → `winBars` + `scrolly/BarPicker.svelte` — Gen Z win-simulation waffle bars (10k sims ≈ 1 dot / 25).
- `layouts/slj-fan.js` → `sljFan` — Samuel L. Jackson trajectory + projected outcome fan (`sweeney-trajectory.json` / `story.slj`).
- `layouts/scatters.js` → `scatterGenZ` — Gen Z highlight state on the shared scatter (extends `DistanceFilmsScatter`).

## Orchestration & infra (this repo only)

No prototype equivalent — Storybook renders stories in isolation; the story here
is a driven wizard.

- `scrolly/states.js` — merges every layout's `states` into the `STATES`/`STATE_LABELS`/`STATE_PARAMS`/… registry `ScrollyVisual` consumes.
- `scrolly/story.svelte.js` — shared interaction store the quiz/toggle/rank cards write and layouts read via `STATE_PARAMS`.
- `scrolly/Step.svelte`, `helpers/Wizard.svelte` — prev/next step driver and per-step card wrapper.
  </content>

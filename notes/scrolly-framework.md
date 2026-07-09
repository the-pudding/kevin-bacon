# Scrolly visual framework (object-constancy PoC)

Status as of 2026-07-05: all storyboard visuals implemented end-to-end on real
data (28 steps, 21 states across Present/Past/Future) and awaiting Owen's
review pass. This documents the framework in `src/components/scrolly/` so a
fresh session (or collaborator) can pick it up.

## What it is

A scroll-driven visual for the sticky `.scrolly-visual` container in
`src/components/Index.svelte`. ~2,300 dots ("actors") with **stable identities**
live on one canvas for the whole story; as the reader scrolls between steps, the
dots tween seamlessly between per-step layout **states** (object constancy — dots
travel, they don't fade out/in wholesale). A second tweener does the same for
**trails** (polylines: race-chart lines, career curves, the prediction
diagonal), so lines morph/unspool rather than popping. Interactive steps
(rank guess, pair quiz, prediction toggles, win-bar picker) re-run the current
layout via params — see "Interactivity" below.

## Files

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/nodes.js`             | Real data: `makeNodes()` → `{ nodes, edges }` decoded from `src/data/scrolly-nodes.json` (built by `npm run scrolly-data`). 1,008 `ActorNode`s (`id, pid, name, hop, films, avgDistance, rank`); node 0 is the anchor (Kevin Bacon), ids 0–14 are the curated intro network in reveal order (`INTRO_IDS`), edges are the 18 intro edges. Also exports `ANCHOR_ID`, `INTRO_LAYOUT` (baked 860×680 planar intro coords), `NETWORK_LAYOUT` (baked force-directed full-graph coords in the same units, intro actors pinned in place; `xy[id]` null for hop -1) and `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders). |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/scrolly/layout-shared.js`     | Geometry/color constants, attr/trail helpers (`set`, `setEdge`, `setTrail`, `collapseTrail`, `clipSeries`), named-actor id lookups (`SLJ`, `HANKS`, …), and the `LayoutFn`/`LayoutResult`/`Note`/`Tick` JSDoc typedefs — everything shared across more than one chapter.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/components/scrolly/layouts/*.js`         | One module per story chapter (`intro`, `hop-bands`, `rank`, `race`, `scatters`, `prediction`, `career`, `win-bars`, `slj-fan`). Each exports a `states` object mapping state key → `{ layout, labels?, params?, pulse?, revealFrom?, overlay? }` (`revealFrom` scopes the layout's `delays` choreography to specific prior states — arriving from any other state is one plain tween) — everything about one state colocated in one object, instead of spread across parallel top-level maps.                                                                                                                                                                                                     |
| `src/components/scrolly/states.js`            | Thin aggregator: merges every chapter's `states` object into one registry and derives the public `STATES`/`STATE_LABELS`/`STATE_PARAMS`/`STATE_PULSE`/`OVERLAYS` exports from it, plus `STATE_TRACKED`, `INTERACTIVE_IDS`, and the `nodeName`/`nodeRank`/`nodeAvgDistance` lookups. This is still the only module other files import from.                                                                                                                                                                                                                                                                                                                                                        |
| `src/components/scrolly/Step.svelte`          | One scrolly step: prose in the slot, visual state declared on the tag (`<Step state="network">…</Step>`). Registers `{ state, params }` in document order with the `"scrolly-steps"` context provided by `Index.svelte`, and derives its own active styling — no hand-numbered step indices anywhere.                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

JSDoc typedefs (`ActorNode`, `Edge`, `LayoutResult`, `LayoutFn`, `Tweener`) are in
`nodes.js` / `layout-shared.js` / `tween.js` — VS Code type-checks them without any
build config. If the framework graduates to production, converting the folder to
`.ts` is mechanical.

## Core contracts

**Attr array.** All render state is one `Float64Array(ATTR_SIZE)`:
`STRIDE = 7` values per node — `x, y, radius, red, green, blue, alpha` — indexed by
`node.id * STRIDE`, then one STRIDE-sized group per edge starting at `EDGE_BASE`
(`edgeIndex(e)` slot 0 = draw progress 0–1 from the lower-hop endpoint, slot 1 =
alpha; remaining slots unused). Giving each edge a full tween group means the
tweener staggers/draws edges individually for free — `networkIntro` uses this for
the prototype's dash-draw-outward effect. Alpha carries visibility: hidden nodes
get `alpha 0` but still get _positions_, so later fade-ins don't teleport.

**Layout function.** `(nodes, w, h, edges) => { attrs, delays? }` — pure, computed
in actual pixel dimensions (no vh anywhere; the parent is pixel-sized by
`useWindowDimensions`). `delays` is optional: `Float64Array(DELAY_SIZE)` of
per-node start delays in ms (index = node id; `NODE_COUNT + e` for edge e).

**Annotations (labels + pulse).** `states.js` exports two per-state maps:
`STATE_LABELS` (state → node ids whose names render as 11px HTML labels over the
canvas) and `STATE_PULSE` (state → the "center actor" id, which gets a breathing
CSS ring — the reusable highlight established on Kevin Bacon in `lone`). The
union of all ids in those maps is tracked: `draw()` copies their live
`x/y/r/alpha` out of the attr array into a small `$state` array each frame, so
the HTML annotations stay glued to their dots mid-tween. Label/ring opacity
follows node alpha × state membership with a CSS opacity transition — labels
fade while still tracking the moving dot. The pulse is deliberately a DOM ring,
not a canvas rAF writer: the tweener snapshots `current` on retarget, so a
second canvas writer would corrupt tween starts.

**Tween timing.** `tweener.to(attrs, ms, jitter, delays)`:

- `delays` provided → choreographed reveal (e.g. `network` fades its edges
  while the crowd pops in inner-first on a distance-from-Bacon ramp, each dot
  parked where the network is drawn at the moment it starts fading; the intro
  cluster holds until the inner crowd is visibly filling in, then everything
  contracts together — the zoom-out reads as a reaction to the growth).
- no `delays` → each node starts after a deterministic hashed delay in
  `[0, ms * jitter]` (currently `TWEEN_JITTER = 0.5` in ScrollyVisual) so nodes
  start/finish at different times.
- `ms <= 0` → instant jump, delays ignored. Used for resize/orientation change
  and `prefers-reduced-motion`.
- First paint is a one-time entry animation (`ENTER_MS = 900` in ScrollyVisual):
  positions are seeded instantly with radius/alpha zeroed, then tweened to the
  first state so visible dots grow in place instead of popping.
- Interruption-safe by construction: `to()` snapshots the live `current` array,
  so flick-scrolling retargets dots from wherever they are mid-flight.

**Step → state.** Declared per step in `Index.svelte` markup: each
`<Step state="…">` registers itself (in document order) with the
`"scrolly-steps"` context, which builds the `stepConfigs` array —
`{ state: string, params?: Object }` per step. `Index.svelte` passes the
active step's `state` and `params` to `ScrollyVisual`; the props are
`undefined` for a beat on first client render (the visual mounts before the
steps register), so ScrollyVisual guards on them. Steps needing _different
visuals_ get _distinct state keys_ (networkIntro vs network); `params` is for
variation within one layout. `<Step dwell>` doubles the step height and pins
the card (free-exploration steps).

Current states, in story order: `lone` · `networkIntro` · `network` (zoom-out
dwell) · `hopBands`/`hopCalc` (degree rows, then the ×-hops calc) ·
`rankFocus` (fisheye ladder + guess) · `rankReveal` (SLJ) · `raceRecent`/
`raceTrades`/`raceFull` (avg-distance-by-year race, three zooms) ·
`scatterCenters`/`scatterWalters`/`scatterQuiz` (films-vs-distance scatter
family) · `concurrenceScatter` · `degScatter` · `predictionScatter`
(toggleable predictors) · `scatterGenZ` · `careerTrio`/`careerMany`
(films-by-career-age trails) · `winBars` (dot-waffle sim wins; each dot ≈ 25
of 10k runs) · `sljFan` (SLJ trajectory vs projected winners).

**Trails.** `states.js` exports `TRAIL_META` (fixed slots: 15 race anchors,
the career trio, 40 cohort career lines, 1 prediction diagonal) and a second
tweener in ScrollyVisual morphs `TRAIL_POINTS`-vertex polylines between
states with the same interruption-safe semantics as dots. A layout returns
`trails` (vertices + per-trail alpha) or omits it — omission fades the last
trails out in place; `collapseTrail` parks a trail's vertices on its owner
dot so lines unspool out of dots and retract back into them.

**Chart furniture.** A layout can also return `axes` (`x`/`y` tick arrays +
`xBase`) and `notes` (positioned callouts, `nowrap` by default) — rendered as
HTML in the overlay and crossfaded per state. `OVERLAYS[state].caption`
renders top-centre in small caps.

**Interactivity.** `story.svelte.js` holds shared `$state` (rankGuess,
quizPicks, prediction toggles, winFocus) written by the step-card components
(`GuessRank`, `PairQuiz`, `PredictToggles`, `BarPicker`). `STATE_PARAMS`
selectors pluck the fields a state consumes and merge them with the step's
static params; a change re-runs the _current_ layout with a short
choreography-free tween (`PARAM_TWEEN_MS`). Every interaction is skippable —
the following step reveals its answer unconditionally. `STATE_LABELS` values
may be functions of the current params (dynamic labels, e.g. answered quiz
pairs); their possible ids are declared in `STATE_TRACKED` for per-frame
tracking.

## How to add a state

1. Pick the chapter module it belongs to under `layouts/` (or add a new one for
   a new chapter). Write `layoutFoo(nodes, w, h)`: fill a `Float64Array(ATTR_SIZE)`
   via the `set()` helper from `layout-shared.js`, return `{ attrs }` (plus
   `delays` if choreographed).
2. Add one entry to that module's exported `states` object:
   `foo: { layout: layoutFoo, labels?, params?, pulse?, revealFrom?, overlay? }` — everything
   about the state lives in this one object (no need to touch `states.js`).
3. Use it from `Index.svelte`: `<Step state="foo"><p>…</p></Step>`.

Use `hash01(n.id, <new salt>)` for any per-node scatter/jitter — pick an unused
salt integer (used so far: 3–8 across layouts and layout-shared, 9 in tween.js).

## Data

`src/data/scrolly-nodes.json` + `src/data/scrolly-story.json` are generated by
`npm run scrolly-data` (`tasks/build-scrolly-nodes.js`) — deterministic (no
RNG; byte-identical re-runs; both files are in `.prettierignore` to stay
byte-stable), asserting its own correctness (KB rank 175, SLJ/Dafoe/De Niro
podium, derived ranks reproduce `closeness-ranking-top200.json`, bucket totals
reproduce KB's 2.2823, quiz answers re-derived, career trio hits 16 films at
age 15, CGM tops the 10k-run sim with the lowest current avg distance).

Node rows: ids 0–14 curated intro graph, then the hop-stratified network crowd
(ids < `NETWORK_COUNT` = 1,008 — stable vs. earlier builds), then appended
actors the later chapters plot (prediction cohort, quiz pairs, Gen-Z
candidates, race anchors, Julie Walters…), 2,347 total. Each row joins sqlite
films/avgDistance/rank with concurrence, top-50 costar log-degree and the four
predicted-distance variants (null when a metric doesn't exist for that actor;
layouts hide non-participants at their distance-scatter park spot). `hop` is
-1 when unknown — those nodes are hidden in hop-coloured states.

`networkLayout` is a build-time d3-force graph layout of the full top-10k
corpus. Structure comes from the **real costar edges** (`top10000-edges.json`,
~1.09M weighted edges), capped to each node's top-`NETWORK_EDGE_CAP` by
shared-film count (~71k links) and fed to `forceLink`, so connected actors pull
into genre/era communities; `forceManyBody` (charge) + `forceCollide` keep dots
apart and a weak `forceX`/`forceY` to the crowd centroid bounds the graph
without flattening structure — an organic core-plus-filaments shape, not a disc.
The prototype beeswarm (`saved-layout-x.json`) is only the SEED (initial
positions). A second **pull-in pass** then tightens the mass: the settled layout
is grid-binned to detect its **spatial islands** (everything outside the dense
central blob — filaments and detached community clumps), then those islands are
dragged toward the core centroid by a short second force sim (`forceX`/`forceY`
on the islands only + `forceCollide` so they pack into gaps + their real costar
links retained, so connected filaments retract along their edges), with the core
and pinned intro actors held fixed (`fx`/`fy`). The handful of graph-severed
islands are first wired to their strongest real costar in the core so links pull
them in too. This settles to a stable, still-organic mass (Bacon off-centre, a
plumed/clumpy silhouette) that fills the frame instead of a tiny dense core lost
in a sprawl of strays. The 15 intro actors are pinned
(`fx/fy`) in their `networkIntro` burst arrangement — scaled down
(`INTRO_BURST_SCALE`) and anchored off-centre (`INTRO_BURST_OFFSET`, up-left of
the centroid) — so they hold a recognisable constellation and Bacon lands ≈68%
of the radius from centre (the "not the centre" caption is shown, not
asserted); the ~10k crowd relaxes around them. Output `xy[id] = [x, y]` in
translated relaxed units (min → 0), `null` for the ~600 later-chapter actors
outside the 10k corpus. Every 10k actor not already sampled is appended as a
minimal "crowd" row (`hop -1`, so it appears only here, never in the hop
chapter); `networkCount` marks the boundary between metric-carrying rich nodes
and the crowd. `networkPosition()` in `layout-shared.js` renders it as a camera
(`networkCamera`): `cameraT 0` frames Bacon's neighbourhood at `graphCenter`
(continuous with `networkIntro`, where Bacon sits there too), `cameraT 1` fits
the full extent centred on the canvas so Bacon drifts to his off-centre spot —
the pull-back between the two is the zoom-out that reveals the whole dataset
(`feedback.md`: "add more and more actors as the graph zooms out"). Every dot
renders one size (`networkRadius` → `NETWORK_DOT_R`); the crowd holds a faint
alpha (`NETWORK_CROWD_ALPHA`) so Bacon (dark + pulsing) and the intro
constellation read. Hidden crowd nodes park on the entry gradient (`parkHidden`
→ `networkEntryPosition`): each waits at the zoom level its reveal delay lands
on, so it materialises at the current pull-back and rides it in, dispersing back
out on the way up. Deterministic: seeded positions, fixed tick count,
d3-force's internal LCG, no RNG. Force params (`NETWORK_CHARGE`,
`NETWORK_LINK_D`/`_STRENGTH`, `NETWORK_CENTER`, `NETWORK_EDGE_CAP`,
`NETWORK_TICKS`) and the pull-in tunables (`NETWORK_PULL`,
`NETWORK_PULL_TICKS`, `ISLAND_CELL`, `ISLAND_MIN`) are at the top of the bake's
layout block. The pull-in converges to a stable equilibrium (links + collision
balance the centroid spring), so its exact strength is not sensitive within a
broad range.

`scrolly-story.json` carries the non-dot data: `bacon` bucket totals, `corr`
(prediction correlations), `quiz` pairs, race `eras` + `raceSeries`
(time-machine anchors), `careers` (trio + 40-line cohort), `genz` (10k-run
k-NN bootstrap winners) and `slj` (his avg-distance trajectory by career age).

Submodule sources: `design/data/` (intro network, hop tree, top-200,
prediction/concurrence/top50 scatters, quiz, actor-trajectories,
actor-trajectory-anchors) and `data/` (actor-metrics.sqlite — **gitignored in
the submodule**, so the generated JSON is committed and the script only
re-runs on machines with the data — plus hop-tree-kevin-bacon-10000,
time-machine, actor-year-rows, genz-mc-knn-bootstrap).

Ranks are corpus-global (up to ~162k), so ranked layouts must plot by _sampled
rank order_ (see `layoutRank`), never by raw rank vs `nodes.length`. Hop-band
_notes_ cite the true corpus `bucket_totals` (1,581/113,396/47,119/133) while
band thickness follows the on-screen sample.

Known copy/data gaps (flagged 2026-07-05, for editorial): the storyboard's
"average winning score 2.24" isn't reproducible from the persisted sim outputs
(per-run winner scores weren't saved) — the closest sourced statistic is 2.33
(win-weighted mean of winners' projected medians), which the step copy now
cites; De Niro's career totals 87 films in the design data (storyboard said 72) and Chevy Chase 27 (storyboard 26); prediction correlation from films
alone is 86, not the storyboard's 82.

## Rendering / mobile notes

- Canvas is dpr-scaled (capped at 2 for mobile fill-rate) via `ctx.setTransform`.
- Sizing comes from `bind:clientWidth/clientHeight` on the wrapper; a dimension
  change re-runs the layout with duration 0 (jump, no tween).
- `prefers-reduced-motion: reduce` (live matchMedia listener) forces all
  transitions to jumps and disables the overlay fade (CSS media query).
- Perf headroom: 1k nodes is trivial; if node count approaches 10k, bucket dots
  by color instead of an `rgba()` string per dot in `draw()`.

## Required: interaction / drop-off points (agreed 2026-07-05; patterns 1–3 now built — see "Interactivity")

The story has moments where the reader stops scrolling and interacts (guessing
the #1 actor on the rank ladder, exploring the race-chart timeline, the
scatter-pair quiz). These are handled **inside the single Scrolly** — do not
split into one Scrolly per chapter. Object constancy is the framework's premise,
and every Scrolly boundary is a seam where the canvas unmounts, the entry
animation re-runs, and dot identity is lost — chapter transitions (e.g. Present→
Past: rank line → race chart) are exactly where constancy pays off most.

Three patterns to build:

1. **Interactive steps.** The step card hosts the UI (buttons/input); the result
   writes into shared state consumed by the layout function. Implementation
   path: consume the per-step `params` that Step.svelte already registers (see
   "Step → state" above) — a param change re-runs the _current_ layout with a
   short tween, so e.g. panning the rank ladder to the reader's guess is a param
   update, not a step change. The interruption-safe `to()` already covers a
   reader who interacts then immediately flick-scrolls away.
2. **Every interaction is skippable.** The step _after_ an interaction reveals
   the answer unconditionally (SLJ is revealed whether or not the reader
   guessed; quiz answers get highlighted regardless). No interaction may gate
   scroll progress.
3. **Dwell steps for free exploration** (race-chart timeline, full ranking): one
   extra-tall step where the canvas accepts pointer events via the planned
   nearest-node hit-test (see "Known gaps"). Reader explores as long as they
   like; scrolling on advances naturally. Prefer taps/buttons over drag gestures
   on the canvas — drag-to-explore fights drag-to-scroll on touch and needs
   fragile `touch-action` juggling. Keep the bottom quarter clear (step card).

Exception: a section that abandons the dot metaphor entirely (e.g. the Future
chapter's win-count bar chart) gains nothing from the shared canvas — use an
inline standalone component _between_ Scrolly blocks there ("Scrolly + inline
interlude + Scrolly"), never one Scrolly per chapter.

Also required before publish: a step-visibility analytics beacon (the step
IntersectionObserver already fires per step) so real reader drop-off is
measurable — cheap now, impossible to retrofit meaningfully after launch.

## Known gaps / next steps

- Step cards are bottom-anchored (Step.svelte `align-items: flex-end`) so the
  visual's center stays clear on mobile; real visuals should still avoid the
  bottom quarter where the card sits.
- Overlay label swap uses `{#key}`: new label fades in, old one is removed
  instantly (no crossfade). Fine for PoC; use Svelte transitions later.
- Tap support for annotations: nearest-node hit-test on canvas click (~40
  lines) — the tracked-coords mechanism it needs is built (see "Annotations").
- Reference implementations the patterns were adapted from:
  `references/pudding-post/design/stories/components/hop-graph.js`
  (`transitionTo`) and `.../primitives/actor-dot.js` (color/alpha tokens). The
  canvas hop colors in states.js are hardcoded rgb of the tokens in
  `src/styles/variables.css`.

## Verify

`npm run dev`, scroll steps 0–10: dots travel between states; flick-scroll fast —
dots retarget mid-flight (no snap-back). Check 375px and 320px emulation, rotate,
and DevTools "emulate prefers-reduced-motion". `npm run build` must stay green.

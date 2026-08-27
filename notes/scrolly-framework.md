# Scrolly visual framework (object-constancy PoC)

Status as of 2026-07-05: all storyboard visuals implemented end-to-end on real
data (28 steps, 20 states across Present/Past/Future) and awaiting Owen's
review pass. This documents the framework in `src/components/scrolly/` so a
fresh session (or collaborator) can pick it up.

> **Naming note (2026-07-12).** The story is no longer scroll-driven: the
> Scrolly mechanism was replaced by a headless prev/next **Wizard**
> (`helpers/Wizard.svelte` — buttons + arrow keys) that advances the same
> 0-based step index. Only the mechanism setting the active step changed; the
> visual framework below is driven purely by that index. The "scrolly" in
> folder/file/context names is historical and kept to avoid churn.

## What it is

A step-driven visual filling the `.scrolly-visual` container in
`src/components/Index.svelte`. ~11,500 dots ("actors") with **stable identities**
live on one canvas for the whole story; as the reader advances between steps, the
dots tween seamlessly between per-step layout **states** (object constancy — dots
travel, they don't fade out/in wholesale). A second tweener does the same for
**trails** (polylines: race-chart lines, career curves, the prediction
diagonal), so lines morph/unspool rather than popping. Interactive steps
(rank guess, pair quiz, prediction toggles, win-bar picker, the Gen Z number
line's P50/P10 toggle) re-run the current layout via params — see
"Interactivity" below.

## Files

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/nodes.js`             | Real data: `makeNodes()` → `{ nodes, edges }` decoded from `src/data/scrolly-nodes.json` (built by `npm run scrolly-data`). 11,486 `ActorNode`s (`id, pid, name, hop, films, avgDistance, rank`); node 0 is the anchor (Kevin Bacon), ids 0–14 are the curated intro network in reveal order (`INTRO_IDS`), edges are the 18 intro edges. Also exports `ANCHOR_ID`, `INTRO_LAYOUT` (baked 860×680 planar intro coords) and `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders). |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                                                                                                                                                                                                               |
| `src/components/scrolly/layout-shared.js`     | Geometry/color constants, attr/trail helpers (`set`, `setEdge`, `setTrail`, `collapseTrail`, `clipSeries`), named-actor id lookups (`SLJ`, `HANKS`, …), and the `LayoutFn`/`LayoutResult`/`Note`/`Tick` JSDoc typedefs — everything shared across more than one chapter.                                                                                                                                                                                                                                                                                      |
| `src/components/scrolly/layouts/*.js`         | One module per story chapter (`intro`, `hop-bands`, `rank`, `race`, `scatters`, `prediction`, `career`, `sim-race`, `genz-line`). Each exports a `states` object mapping state key → `{ layout, labels?, params?, pulse?, revealFrom?, entry?, overlay? }` (`revealFrom` scopes the layout's `delays` choreography to specific prior states — arriving from any other state is one plain tween) — everything about one state colocated in one object, instead of spread across parallel top-level maps.                                                       |
| `src/components/scrolly/states.js`            | Thin aggregator: merges every chapter's `states` object into one registry and derives the public `STATES`/`STATE_LABELS`/`STATE_PARAMS`/`STATE_PULSE`/`OVERLAYS` exports from it, plus `STATE_TRACKED`, `INTERACTIVE_IDS`, and the `nodeName`/`nodeRank`/`nodeAvgDistance` lookups. This is still the only module other files import from.                                                                                                                                                                                                                    |
| `src/components/scrolly/Step.svelte`          | One story step: prose in the slot, visual state declared on the tag (`<Step state="lone">…</Step>`). Registers `{ state, params, panel? }` in document order with the `"scrolly-steps"` context provided by `Index.svelte`; renders its prose only while active — no hand-numbered step indices anywhere. `panel` is an optional snippet rendered over the canvas while the step is active (see "Exception" under interaction patterns).                                                                                                                      |
| `src/components/helpers/Wizard.svelte`        | The step driver: headless Previous/Next buttons + ArrowLeft/ArrowRight advancing a bindable 0-based `value`, which `Index.svelte` maps through `stepConfigs` to the active state/params.                                                                                                                                                                                                                                                                                                                                                                      |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                                                                                                                                                                                                         |

JSDoc typedefs (`ActorNode`, `Edge`, `LayoutResult`, `LayoutFn`, `Tweener`) are in
`nodes.js` / `layout-shared.js` / `tween.js` — VS Code type-checks them without any
build config. If the framework graduates to production, converting the folder to
`.ts` is mechanical.

## Core contracts

**Attr array.** All render state is one `Float64Array(ATTR_SIZE)`:
`STRIDE = 7` values per node — `x, y, radius, red, green, blue, alpha` — indexed by
`node.id * STRIDE`, then one STRIDE-sized group per edge starting at `EDGE_BASE`
(`edgeIndex(e)` slot 0 = draw progress 0–1 from the lower-hop endpoint, slot 1 =
alpha, slot 2 = highlight 0–1, which blends the stroke from grey toward
`EDGE_HIGHLIGHT` and thickens it — `networkIntro` uses it to pick a route out of the
constellation; remaining slots unused). Giving each edge a full tween group means the
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

- `delays` provided → choreographed reveal (e.g. `lone`'s path-walk pop-in:
  each edge/node starts on an authored clock).
- no `delays` → the state arrival falls back to `EDGE_LAG_DELAYS`: dots retarget
  in unison, edges hold back until the dots have mostly landed
  (`TWEEN_MS * 0.75`). Edges are drawn toward their endpoints' _final_ spots, so
  fading them in any earlier strings lines between mid-flight dots and
  far-away destinations. A state whose links are fading _out_ over a frame where
  nothing moves wants the opposite and returns an all-zero clock of its own
  (`hopSeed`). Outside a state change — an interaction retarget — no delays are
  passed and each node starts after a deterministic hashed delay in
  `[0, ms * jitter]` (`TWEEN_JITTER = 0.5`).
- The **names an arrival introduces** wait out that same `EDGE_LAG_MS`
  (`heldLabels`), so the whole annotation layer — links and names together —
  arrives once the dots have mostly landed instead of gliding along beside them.
  Only names the previous state didn't have are held: blanking one already on
  screen would blink it off and back on.
- `ms <= 0` → instant jump, delays ignored. Used for resize/orientation change
  and `prefers-reduced-motion`.
- First paint is a one-time entry animation (`ENTER_MS = 900` in ScrollyVisual):
  positions are seeded instantly with radius/alpha zeroed, then tweened to the
  first state so visible dots grow in place instead of popping.
- Interruption-safe by construction: `to()` snapshots the live `current` array,
  so mashing Next/Previous (or arrow keys) retargets dots from wherever they
  are mid-flight.

**Step → state.** Declared per step in `Index.svelte` markup: each
`<Step state="…">` registers itself (in document order) with the
`"scrolly-steps"` context, which builds the `stepConfigs` array —
`{ state: string, params?: Object }` per step. `Index.svelte` passes the
Wizard-selected step's `state` and `params` to `ScrollyVisual`; the props are
`undefined` for a beat on first client render (the visual mounts before the
steps register), so ScrollyVisual guards on them. Steps needing _different
visuals_ get _distinct state keys_ (lone vs networkIntro); `params` is for
variation within one layout.

**Seeding the next reveal.** A state can park the nodes a _later_ layout wants
at exactly their eventual positions with alpha 0, so nothing of them renders and
the following step reveals from that shared frame as a pure fade-in — no
teleport and, crucially, the same animation however fast the reader steps. That
is what `hopSeed` does with the ~11.5k crowd (paired with `hopBands`'s
`revealFrom: ["hopSeed"]`) while its own visual, the intro network pulling back,
holds the frame in front of them. Prefer seeding over letting a crowd fly in
from wherever a previous chapter parked it.

**Entry choreographies (`STATE_ENTRY`).** When a state's arrival needs an
animation the tweener can't express — a draw-on, a fan opening, a slow camera
pull-back — it declares `entry: { phases, frames, labelsAfter? }` and
ScrollyVisual's `playEntry` runs the legs back to back on its own rAF, each leg
writing its animated slots straight into the live tween buffers. Three contracts:
frame 0 of leg 0 is what the ordinary arrival tween lands on (so anything the
choreography draws must already be right, or invisible, there); the last leg's
frame 1 must reproduce the static layout call for call, so the settle has nothing
to move; and it must be skippable — a reader who steps on mid-flight supersedes
the arrival tween, whose `onDone` is then dropped, so the choreography never
starts. Reduced motion and resize bypass it via the snap branch. Examples:
`careerTrio`/`careerMany`'s line draw-ons (`layouts/career.js`) and `hopSeed`'s
zoom-out (`layouts/hop-bands.js`).

One renderer rule follows from this. `drawScene` draws a live edge's far endpoint
at its **target** position, so a line points where its actor is going and the
actor slides onto it. That target is the **tweener's** target (`tweener.target`,
the last frame handed to `to()`), not the state's static layout: a choreography
arrives onto its own frame 0 first, and through that arrival the static layout is
not where the dots are heading — aim at it and every link detaches from its dots.
While the choreography itself owns the frame (`sweeping`) it writes positions
straight into `current` and its target is stale, so edges track both **live** dots.

Current states, in story order: `lone` (the intro constellation grows out of
Bacon here, as the step's own entry pop-in) · `networkIntro` (the grown
constellation; every actor is selectable and their shortest route(s) to Bacon
light up, captioned with the distance) · `hopSeed`
(the "not the centre" beat — the same actors, with the camera slowly pulling
back from them; every link and every name, Bacon's included, goes out on
arrival, leaving the unlabelled cast the bands are about to sort, over that
crowd parked invisible) · `hopBands`
(degree rows, with a bottom legend keying each hop's color) ·
`rankFocus` (Bacon's hop bar dissolves; the HTML `RankBars` panel + guess
take over) · `rankReveal` (SLJ) · `raceRecent`/
`raceTrades`/`raceFull` (avg-distance-by-year race, three fixed-scale cameras) ·
`scatterCenters`/`scatterWalters`/`scatterQuiz` (films-vs-distance scatter
family) · `scatterCostars` (the same scatter framed on the top 250 by rank,
coloured by which of the two named actors has worked with each — the one
films-scatter state that fits its own x domain, see below) ·
`concurrenceScatter` · `degScatter` · `predictionScatter`
(toggleable predictors) · `scatterGenZ` · `careerTrio`/`careerMany`
(films-by-career-age trails) · `simRace` (reader-run replay of the 10k
recorded simulations, cumulative wins per contender) · `genzLine` (vertical
number line of average distance: SLJ alone at the top, the whole Gen Z field
as a dot plot below him, on a fixed scale the reader can re-place at the
simulation's P50 or P10).

**Trails.** `states.js` exports `TRAIL_META` (fixed slots, in order: one per
race actor (`RACE_IDS`), the career trio, one per cohort career line, one per
simulation-race line (`SIM_SERIES`), 1 reference rule (the prediction diagonal,
the Gen Z number line) — every slot constant is derived from those lengths, so
the race cast and the cohort can grow without touching an index) and a second
tweener in ScrollyVisual morphs `TRAIL_POINTS`-vertex polylines between
states with the same interruption-safe semantics as dots. A layout returns
`trails` (vertices + per-trail alpha) or omits it — omission fades the last
trails out in place; `collapseTrail` parks a trail's vertices on its owner
dot so lines unspool out of dots and retract back into them.

**Race camera (fixed x scale).** The race chapter's x axis is `PX_PER_YEAR`
(38) pixels per year on every race step and every viewport — it never fits a
domain to the plot width, so nothing zooms and every visible year carries its
own label. Each step therefore holds more years than fit on screen and is a
_camera_ over its data. Three concepts stay separate (`layouts/race.js`):

- **content extent** `[e0, e1]`, baked per state in `race: { extent }`
  (`STATE_RACE`) and width-independent: it drives the cast, era candidacy and the
  reader's pan bounds, so panning never changes who is on the chart. It does _not_
  drive the axis — see below.
- **camera**, one `playhead` year at the plot's RIGHT edge (`xS(playhead) ===
right`, which is what keeps "dots ride the right end of their line" true).
  `raceCamera` is a pure function of `(playhead, width)` with no clamping — that
  is what makes an animated frame and the static layout it settles onto
  pixel-identical even when a choreography pans a step past its own extent (the
  rewind takes raceRecent back to `RACE_REWIND_WAYPOINT_YEAR`). Both axes are
  derived from it, so that purity covers the whole frame rather than just x.
  Reader input is clamped at its source via `racePanBounds`.
- **reveal** `0..1`, the entry draw-on only.

**The race y axis.** One record, shared by every step: `RACE_ANCHOR` in
`layouts/race.js` holds the avg-distance of whoever was the centre of Hollywood,
per year, built at module load from `story.eras` × `story.raceSeries`. It is
derived here rather than baked into `scrolly-story.json`, so changing it never
needs an `ANALYSIS_REPO` rebuild. `buildRaceAnchor` throws on a gap.

`raceWindowYFit(camLeft, camRight)` is the whole rule: the record's range over the
years **on screen**, raised to at least `RACE_Y_FLOOR` (0.45) tall, padded 6%.
`writeRaceSweepFrame` calls it with its own camera, so:

- **No step owns an axis and no animator carries one.** There is no `STATE_YFIT`,
  no `fixedYFit` parameter, and nothing to hand across a step transition. An
  animated frame and the static settle it lands on agree because both are the same
  pure function of `(playhead, width, height)` — a type-level guarantee, not a
  review property. This is what let `raceRewindYFit`, `lerpYFit`, `liveYFit` and
  `raceExit.yFit` all be deleted: leg 2's "axis pans with the camera" behaviour is
  now simply what the axis does everywhere.
- **The y scale is near-fixed**, 0.504–0.635 tall anywhere in 1970–2025 (1.26×,
  measured across viewports 360–700px), so a vertical distance means the same thing
  on every step — the y counterpart of `PX_PER_YEAR`. Y ticks therefore sit on round
  tenths and _slide_, exactly as the x ticks travel with their years; spacing them
  evenly across the domain instead would pin them to fixed rows and roll their
  digits on every frame of a pan.
- **Reader panning moves the axis**, and must: the settle it hands off to derives
  its own fit from the same playhead.

Two properties of the record make it the right thing to hang the axis on. It is
the chart's exact **floor** — no actor in the cast sits below the crown holder in
any year (measured deficit 0.0000 across all 224 series) — so the low end needs no
guesswork and nothing clips off the bottom. And it is read **interpolated**
(`raceAnchorAt`), not sampled on whole years: sampled discretely the fit would be a
step function of the camera and the axis would visibly tick every time a year
crossed the plot edge mid-pan. That trades in one risk — a monotone cubic sagging
below the straight line between two record points — which measures at most 0.021
against the fit's ~0.030 of bottom padding.

`RACE_Y_FLOOR` is the one dial, and it is derived: 0.411 is the measured minimum
that keeps every labelled dot on the plot at every reachable playhead and viewport
width, so 0.45 carries margin. Raising it flattens every step's lines; lowering it
risks a clipped dot. Verified at 0 clipped of 2963 labelled-dot samples.

The accepted cost of one shared scale: raceRecent's SLJ/Hackman handover occupies
~42% of the plot height rather than filling it. Lines that run off the top are
ended at the plot edge by `curveEntry`/`curveExit`, entering and leaving through it
as in any line chart.

**Who a step shows** is a separate question from the axis, and still
width-independent so it can be computed at module load. `raceStepCap(step)` is the
centre at the step's resting year plus one chapter-wide `RACE_YCAP_REACH` (0.213).
Expressing the reach _from the centre_ rather than as an absolute avg-distance is
load-bearing: the crown itself moves from ~2.82 in 1971 to ~2.09 in 2025, so a
single absolute cap cannot mean the same thing on two steps a decade apart —
raceRecent's old hand-picked 2.3 would have shown raceTrades just 16 of its 224
lines, emptying out the field it is meant to sit behind. 0.213 is that same 2.3
read against the 2025 centre, so raceRecent's field is unchanged at 131 lines and
raceTrades' is now derived the same way (137) instead of falling out of a y-fit
constant. raceFull has no cap; it shows the whole cast by design.

Two consequences of the shared axis, both load-bearing:

- **`raceStepVisible`** is the single source of who is on a step: everyone whose
  line dips to its `yCap` somewhere in its extent. Anything reading a visible set
  must go through it, never `raceContenders` directly, or an actor a step drops
  fades back in at the settle. Which actors a step _emphasises_ is separate again —
  its `highlight` (raceTrades lists the centres of its window, from `story.eras`).
- **`SHOWN_DEPART_END`** (ScrollyVisual) retires a departing actor over the first
  third of a phase rather than all of it. This is now purely how it reads — the
  modern crowd drops away first, leaving the actors the step is about. It used to be
  a correctness rule as well, when the axis was fitted per step and a line still
  fading at the end of a pan could be drawn outside the plot the leg was landing
  on.

`writeRaceSweepFrame` is the single placer of race dots and trails — the static
layout delegates to it, so settles are byte-identical by construction rather
than by review. Trails sample the camera's interval, not the extent, so all 48
vertices land on screen (sampling 55 years would leave ~5 in a phone's ~6-year
viewport and turn the curve into a polyline); actors whose data has scrolled off
camera fade to alpha 0 over their last visible year, which is also what keeps
every vertex inside the plot with no canvas clip region. Panning is
`RaceScrubber`, mounted on `raceFull` only (the other two race steps are carried
by their own camera choreography): a relative pointer drag plus a bits-ui year
Slider, both writing only `story.scrubYear`/`scrubbing`, with bounds read from
`story.raceCam` (published by ScrollyVisual, the only component that knows the
canvas width). It renders nothing when the whole extent already fits on screen.

**The simulation race (`simRace`), a reader-driven animation.** The one
choreography a reader starts rather than an arrival: `SimRunner` (a `panel`
snippet) bumps `story.simRunNonce`, and `ScrollyVisual`'s `playSimRun` replays
the 10,000 recorded simulation runs over `SIM_MS` (3s) on the shared `runPhase`
rAF spine, writing `writeSimFrame` straight into the live tween buffers under
the same single-writer discipline as `startScrub` (land each tweener's target
first, `sweeping = true`, so a state change's `stopSweep` abandons the run for
free — and clears `story.simRunning`, or the buttons would stay disabled for a
reader who steps back).

Unlike the race chapter there is no camera: `[0, nSims]` is mapped to the plot
width, so the whole simulation fits any viewport with nothing to pan, and the y
axis is fixed to the tallest line's final count for the whole step. That also
means the lines GROW at their tip instead of sliding under a camera, so their
vertices sit on a grid fixed in run-space (`GRID_RUNS`) and are written with
`setTrailPoints`, not resampled per frame: a widening sample window puts every
interior vertex on different runs each frame, which slides each line's real
run-to-run wobble backwards through it and makes the whole field shimmer. With
the grid fixed, only the tip segment moves — everything behind the playhead is
already at its final position, which is directly testable (successive mid-run
frames are pixel-identical left of the playhead). The frame
writer is the settled layout's only path too, so a run's last frame IS the state
it settles onto — the end of a run just publishes `story.simRuns`,
with nothing left to move. The playhead is deliberately NOT published per frame:
`simRuns` is a layout param, so a per-frame write would retarget the tweener
mid-run. `simRunning` is a param as well, purely so the labels can come in for a
replay whose playhead the layout never sees.

The data behind it is the real per-run winner sequence (`story.genz.runs`), not a
resample: `tasks/build-scrolly-nodes.js` recovers it from the analysis repo's
simulated-MAD matrix and asserts it reproduces every published win count exactly.
So pressing Start again replays the same race, and the lines land on the
percentages the story quotes. Every contender gets a line (`SIM_SERIES` in
`layout-shared.js`); `SIM_LABEL_N` of the leaders carry a name and their win
share, arriving one at a time from 5,000 runs on (`SIM_NAMES_AT` +
`SIM_NAME_STAGGER`, via `simNamesDue`) once the field has pulled apart. Names sit
to the LEFT of their dots, so the plot needs no gutter and takes the canvas's
full width; `story.simNames` (how many are due) is the one thing a run publishes
while it is in flight, because the layout never sees the live playhead — and it
is written only on the runs a name is actually due, not per frame.

One control, `SimRunner`: Start, then Replay, which winds back to zero and
re-runs. Nothing around it is conditional on the run, deliberately: a panel's
`bottom` is measured from the step card's height, so a line of copy that
disappears when the reader presses the button shortens the card, moves the
panel's bottom edge down, and takes the button with it — mid-press. Content that
must come and go belongs inside the panel, below a `justify-content: flex-end`
anchor, where it cannot move the controls.

**Chart furniture.** A layout can also return `axes` (`x`/`y` tick arrays +
`xBase`), `notes` (positioned callouts, `nowrap` by default), and `legend`
(color swatch + label pairs, pinned to the bottom of the chart) — all
rendered as HTML in the overlay and crossfaded per state. `OVERLAYS[state].caption`
renders top-centre in small caps. A layout can also return `hits` — rectangles
over the chart, rendered as transparent `<button>`s (so a pick is keyboard- and
screen-reader-reachable, no canvas hit-testing) whose value is handed to the
state's `pick` handler (`STATE_PICK`) to write into `story`; that write feeds
back through the state's `params` selector. `networkIntro` puts one over every
actor in the intro constellation (armed
as soon as the step is reached — the path-walk reveal that grows the
constellation plays earlier, on `lone`'s own entry pop-in).

**Waiting for a reveal.** `story.settled` names the state whose arrival tween has
just landed (`ScrollyVisual`'s `settle()`, attached to the arrival's `onDone`,
which the tweener only fires once every delayed group has finished — so it is the
true end of an authored reveal, and a superseded tween drops it, meaning a reader
who steps on mid-reveal never settles). A layout can gate an interaction on it —
returning no `hits`, or ignoring a pick, until `story.settled === theOwnState` —
for a state whose own authored reveal must land before it makes sense to
interact with. It is **set-only, never cleared** — it names a state, so stepping
away un-arms every gate by itself. Clearing it would write state the render
effect derives its params from, re-running that effect with an unchanged params
key, which lands in its catch-all and snaps the very reveal the gate was
waiting for.

**Interactivity.** `story.svelte.js` holds shared `$state` (rankGuess,
quizPicks, prediction toggles, simRuns, introFocus) written by the step-card components
(`GuessRank`, `PairQuiz`, `PredictToggles`) and by on-chart picks. `STATE_PARAMS`
selectors pluck the fields a state consumes and merge them with the step's
static params; a change re-runs the _current_ layout with a short
choreography-free tween (`PARAM_TWEEN_MS`). Every interaction is skippable —
the following step reveals its answer unconditionally. `STATE_LABELS` values
may be functions of the current params (dynamic labels, e.g. answered quiz
pairs); every id such a function can return **must** be listed in
`STATE_TRACKED` — `TRACKED_IDS` is built from the static label arrays plus that
list, so an id missing from it has no `<p>` to render into and its name silently
never appears.

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
salt integer (used so far: 3–8 across layouts, 9 in tween.js).

## Data

`src/data/scrolly-nodes.json` + `src/data/scrolly-story.json` are generated by
`npm run scrolly-data` (`tasks/build-scrolly-nodes.js`) — deterministic (no
RNG; byte-identical re-runs; both files are in `.prettierignore` to stay
byte-stable), asserting its own correctness (KB rank 175, SLJ/Dafoe/De Niro
podium, derived ranks reproduce `closeness-ranking-top200.json`, bucket totals
reproduce KB's 2.2823, quiz answers re-derived, career trio hits 16 films at
age 15, CGM tops the 10k-run sim with the lowest current avg distance).

Node rows: ids 0–14 curated intro graph, then the full shared hop tree (every
reachable actor, best-connected first), then appended actors the later chapters
plot (prediction cohort, quiz pairs, Gen-Z candidates, race anchors, Julie
Walters…), 11,486 rows total. Each row joins
sqlite films/avgDistance/rank with concurrence, top-50 costar log-degree and
the four predicted-distance variants (null when a metric doesn't exist for that
actor; layouts hide non-participants at their distance-scatter park spot —
`parkHidden` in `layout-shared.js`). `hop` is -1 when unknown — those nodes are
hidden in hop-coloured states.

`scrolly-story.json` carries the non-dot data: `bacon` bucket totals, `corr`
(prediction correlations), `quiz` pairs, race `eras` + `raceSeries`
(time-machine anchors), `careers` (trio + 40-line cohort), `genz` (10k-run
k-NN bootstrap winners) and `slj` (his avg-distance trajectory by career age).

**This repo contains no data analysis.** Every metric is computed in a separate
data-analysis repo and arrives here as pre-exported files, which
`build-scrolly-nodes.js` reads from a base path configured at the top of that
script. Two source directories are expected: `design/data/` (intro network, hop
tree, top-200, prediction/concurrence/top50 scatters, quiz, actor-trajectories,
actor-trajectory-anchors) and `data/` (actor-metrics.sqlite, plus
hop-tree-kevin-bacon-10000, time-machine, actor-year-rows,
genz-mc-knn-bootstrap).

The analysis repo's location comes from the required `ANALYSIS_REPO`
environment variable (`ANALYSIS_REPO=<path> npm run scrolly-data`); the script
never guesses it, because a stale path would silently rebuild the committed data
from the wrong inputs. The sqlite is not distributed with that repo either, so
this only re-runs on a machine with the full analysis checkout. That is why the
two generated JSON files are committed — the app builds and deploys without any
of the above.

`data/top-250-hop-bands-with-hop-counts.csv` feeds `rankHopBands` (the rank
chapter's per-actor hop breakdown for the top 250). It was missing for a while,
so a full rebuild could not complete; it is present in the analysis repo now and
every one of the build's inputs resolves.

`rankHopBands` is **full-corpus**: the counts sum to 162,229 (matching the
sqlite's `reachable`) and their hop-weighted mean reproduces each actor's
`avg_distance` exactly — Bacon's 1,581/113,396/47,119/133 gives 2.2823. Note
`data/actor-bfs-summaries.json` looks like a match but is **not** usable: its
per-actor `distribution` is over a 20,000-actor sample, so its avg distances
differ in the second decimal and would fail the build's own check.

Columns the build reads (`rawCsv`, one row per actor):

    rank, pid, name, hop1_count, hop2_count, hop3_count, hop4_count, avgDistance_diff

`avgDistance_diff` is the residual between the hop-weighted mean and the
sqlite's `avg_distance`; the build asserts it is under 1e-3, and separately that
`rank` matches its own derived rank.

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
- Perf: ~11.5k dots per frame is fine because `draw()` buckets dots into
  one `Path2D` per quantised (rgb, alpha) pair — a handful of fills, not a
  fillStyle per dot.

## Required: interaction / drop-off points (agreed 2026-07-05; both patterns now built — see "Interactivity")

The story has moments where the reader pauses on a step and interacts (guessing
the #1 actor on the rank ladder, exploring the race-chart timeline, the
scatter-pair quiz). These are handled **on the one persistent canvas** — do not
split the story into one canvas instance per chapter. Object constancy is the
framework's premise, and every canvas unmount is a seam where the entry
animation re-runs and dot identity is lost — chapter transitions (e.g. Present→
Past: rank line → race chart) are exactly where constancy pays off most.

Two patterns:

1. **Interactive steps.** The step card hosts the UI (buttons/input); the result
   writes into shared state consumed by the layout function. Implementation
   path: consume the per-step `params` that Step.svelte already registers (see
   "Step → state" above) — a param change re-runs the _current_ layout with a
   short tween, so e.g. panning the rank ladder to the reader's guess is a param
   update, not a step change. The interruption-safe `to()` already covers a
   reader who interacts then immediately steps away.
2. **Every interaction is skippable.** The step _after_ an interaction reveals
   the answer unconditionally (SLJ is revealed whether or not the reader
   guessed; quiz answers get highlighted regardless). No interaction may gate
   the Next button — Next must always be clickable. An interaction _may_
   auto-advance on completion (e.g. guessing SLJ or giving up on the rank
   ladder calls the `scrolly-steps` context's `advance()`, the same step-index
   bump Next performs) as long as that never removes the reader's own ability
   to skip via Next/ArrowRight.

Exception: a visual that abandons the dot metaphor entirely gains nothing from
the shared canvas — layer a plain HTML component over (or beside) the canvas
for those states instead of forcing a canvas layout. Declare it as a `panel`
snippet on the `<Step>`s that use it (Step registers it alongside
state/params; `Index.svelte` renders the active step's panel over the canvas)
so the markup lives next to the step that owns it. Steps sharing one visual
must pass the same snippet reference — that's what keeps the component alive
across the step change. `RankBars.svelte` (the rank chapter's scrollable
"everyone else" bar list, shown during `rankFocus`/`rankReveal`) is the built
example. Its rows are hop-bands charts turned on their side, drawn as
individual dots: `layout-shared.js`'s `hopDotSlots` generates the dot lattice
both sides draw — the panel as one path per hop band, the canvas as the spot
each converging actor lands on — so the frame the arrival tween settles into is
the frame the panel then fades over. The panel owns the geometry and the canvas
follows it: RankBars measures its focused row live and publishes the box to
`story.rankFocusBar`, which `layouts/rank.js` reads as a param.

**The chapter handoff out of it (rankReveal → raceRecent)** is the reverse trick,
and the panel outlives its own chapter for it: `raceRecent`'s `<Step>` passes the
same `rankPanel` snippet, so RankBars is still mounted for one step past the rank
chapter and runs the handoff in three beats.

1. **Collapse** (HTML, `RANK_COLLAPSE_MS`, all bars at once). `collapse` goes true
   and every row's dot lattice contracts to its own centre (`transform: scale(0)`
   on the svg) while the single node it becomes grows in there; the names, avg
   distances, footnote and the list's edge mask go with them. The node is not an
   approximation of the chart's dot, it IS one: its radius, colour and alpha come
   from `raceDotSpec` in `layouts/race.js` — the same function `writeRaceSweepFrame`
   places canvas dots with — read against `RACE_RECENT_SUBJECT`, so SLJ and Hackman
   already carry their emphasis and everyone else the grey field treatment.
2. **Swap** (one frame). The timer sets `story.rankCollapsed`, which both unmounts
   the whole overlay (`Index.svelte`'s `showRankPanel`) and releases the canvas.
   Nothing moves: the canvas is already holding an identical copy of those nodes,
   snapped there under the opaque panel when the step changed.
3. **Flight** (canvas, `TWEEN_MS`). The nodes travel from their list rows to their
   chart positions — same top-to-bottom order, new spacing — and hand over to the
   4s draw-on and the rewind's first leg as before.

`story.rankListRows` (`{ cx, top, pitch }` — the horizontal centre a bar collapses
to, row #1's bar centre at the current scroll, and the row-to-row pitch) is what
puts the canvas copy on the right row, with `ORDER_OF`; ranks below the panel
(most of the 131-strong cast — the list shows 250 rows and ~20 fit) start just off
the bottom edge and stream up. The previous step being HTML costs nothing — its
rows have positions in the canvas's own coordinate space, which is all a departure
point needs. Unlike the focus box, nothing reads this during the rank chapter
(rank.js's selector takes only `rankFocusBar`), so it is safe to republish on
scroll — and ScrollyVisual reads it `untrack`ed, so it can never retarget a tween.

Three things the handoff depends on:

- **The panel owns the clock.** It is the only party that knows when its own
  transitions have landed, so it publishes the one moment (`story.rankCollapsed`)
  and ScrollyVisual only waits — its flight is _armed_ by the arrival
  (`raceFlight`) and fired by the flag, so the canvas can never be moving while
  the HTML the reader is watching is not. Every render pass disarms it, so a
  reader who steps on mid-collapse skips the flight like any other choreography.
- **The panel's box is frozen for it.** `.rank-bars-panel` is sized off
  `stepsHeight`, and raceRecent's prose is shorter than rankReveal's, so
  `Index.svelte` holds the last height a rank step measured (`rankPanelBottom`).
  Without it every row shifts a few px at the exact moment it collapses, away from
  what the reader was looking at and away from where the canvas is aimed.
- **Only the forward step out of the rank chapter gets it** (`rankHandoff`, set in
  `navigate`). A reload straight onto raceRecent, or a step back to it from
  raceTrades, must not flash the list up over a chart that is already drawn.

Two rules come with a measured hand-off like that, both learned the hard way:
publish from a **pre-effect**, so the box is set before ScrollyVisual's layout
effect runs in the same flush and the arrival is one collapse rather than a
tween retargeted mid-flight; and **never re-publish an unchanged value** — that
re-runs the layout effect with an identical params key, which lands in its
catch-all and snaps the very reveal the measurement exists to aim.

Also required before publish: a step-visibility analytics beacon — fire on
`value` changes in `Index.svelte` (the wizard equivalent of the old per-step
IntersectionObserver) so real reader drop-off is measurable — cheap now,
impossible to retrofit meaningfully after launch.

## Known gaps / next steps

- Step prose and the wizard nav overlay the bottom of the full-height canvas
  (`.scrolly-steps` in Index.svelte); layouts should keep essential marks out
  of the bottom quarter where they sit.
- Known and accepted: a step card that grows can cover a layout's `hits`, and
  the card wins the tap. `networkIntro`'s route caption is the one case — the
  intro constellation's lowest dots sit at ~0.84 of its baked box, inside the
  card's zone. Measured with the longest caption (Margot Robbie, three routes):
  fine at 390×844 and up, covers the four lowest actors at 390×667, and seven
  including Bacon at 360×640, where nothing is left to clear the selection with.
  Deliberately left as is — the fixes all cost either the caption's detail or
  the constellation's size. Revisit if small-phone traffic matters.
- Overlay label swap uses `{#key}`: new label fades in, old one is removed
  instantly (no crossfade). Fine for PoC; use Svelte transitions later.
- The dot-transition and color/alpha patterns were adapted from Storybook
  prototypes that lived in the (now removed) reference checkout; they are no
  longer available in this repo. The canvas hop colors in states.js are
  hardcoded rgb of the tokens in `src/styles/variables.css`.

## Verify

`npm run dev`, step through with Next/ArrowRight: dots travel between states;
mash Next/Previous quickly — dots retarget mid-flight (no snap-back). Check
375px and 320px emulation, rotate, and DevTools "emulate
prefers-reduced-motion". `npm run build` must stay green.

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

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/nodes.js`             | Real data: `makeNodes()` → `{ nodes, edges }` decoded from `src/data/scrolly-nodes.json` (built by `npm run scrolly-data`). 11,486 `ActorNode`s (`id, pid, name, hop, films, avgDistance, rank`); node 0 is the anchor (Kevin Bacon), ids 0–14 are the curated intro network in reveal order (`INTRO_IDS`), edges are the 18 intro edges (`[sourceId, targetId, [[title, year], …]]` — **every** corpus film linking the pair, newest first; two of the eighteen have more than one). Also exports `ANCHOR_ID`, `INTRO_LAYOUT` (baked 860×680 planar intro coords) and `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders). |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/components/scrolly/layout-shared.js`     | Geometry/color constants, attr/trail helpers (`set`, `setEdge`, `setTrail`, `collapseTrail`, `clipSeries`), named-actor id lookups (`SLJ`, `HANKS`, …), and the `LayoutFn`/`LayoutResult`/`Note`/`Tick` JSDoc typedefs — everything shared across more than one chapter.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/components/scrolly/layouts/*.js`         | One module per story chapter (`intro`, `hop-bands`, `chapters`, `rank`, `race`, `scatters`, `prediction`, `career`, `sim-race`, `genz-line`). Each exports a `states` object mapping state key → `{ layout, labels?, params?, pulse?, revealFrom?, entry?, overlay? }` (`revealFrom` scopes the layout's `delays` choreography to specific prior states — arriving from any other state is one plain tween) — everything about one state colocated in one object, instead of spread across parallel top-level maps.                                                                                                                                                                                       |
| `src/components/scrolly/states.js`            | Thin aggregator: merges every chapter's `states` object into one registry and derives the public `STATES`/`STATE_LABELS`/`STATE_PARAMS`/`STATE_PULSE`/`OVERLAYS` exports from it, plus `STATE_TRACKED`, `INTERACTIVE_IDS`, and the `nodeName`/`nodeRank`/`nodeAvgDistance` lookups. This is still the only module other files import from.                                                                                                                                                                                                                                                                                                                                                                |
| `src/components/scrolly/Step.svelte`          | One story step: prose in the slot, visual state declared on the tag (`<Step state="lone">…</Step>`). Calls `register({ state, params, panel })` in document order on the `"scrolly-steps"` context provided by `Index.svelte`; renders its prose only while active — no hand-numbered step indices anywhere. `panel` is an optional snippet rendered over the canvas while the step is active (see "Exception" under interaction patterns).                                                                                                                                                                                                                                                               |
| `src/components/scrolly/Chapter.svelte`       | A chapter card: a step whose whole content is a title (`<Chapter state="chapterCenters" title="…" />`). Registers `{ state, chapter: { title } }` the same way, but renders **nothing** — see "Chapter cards" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/components/helpers/Wizard.svelte`        | The step driver: headless Previous/Next buttons + ArrowLeft/ArrowRight advancing a bindable 0-based `value`, which `Index.svelte` maps through `stepConfigs` to the active state/params.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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
teleport and, crucially, the same animation however fast the reader steps.
`hopSeed` still does this with the ~12k crowd while its own visual, the intro
network pulling back, holds the frame in front of them. Prefer seeding over
letting a crowd fly in from wherever a previous chapter parked it.

The rule the seed is protecting is **a deterministic departure frame**, not the
fade itself. `hopBands` no longer reveals from that park: the `chapterCenters`
card sits between the two, and the card is an authored departure frame of its own
— the crowd is visible and spread across the plot, so `hopBands`'s hop 1→4 clock
staggers _travel_ instead of a fade, and the reader watches the universe sort
itself into degrees of separation. The determinism still holds, because the card's
static layout is where the crowd is (its ambient drift is bounded at a few px, far
inside what the arrival tween absorbs). Letting a crowd fly in is only a problem
when where it flies from is arbitrary.

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

**Ambient loops (`STATE_AMBIENT`).** What an entry choreography is to an arrival,
this is to the pause after it: a state declares `ambient: { frames }` and, once its
arrival has settled, `ScrollyVisual`'s `playAmbient` runs the writer on `runLoop`
— `runPhase`'s unbounded twin, no duration, no easing, no `onDone` — writing
straight into the live tween buffers under the same single-writer discipline.

`STATE_ENTRY`'s pair of contracts collapses to one here, because there is no last
leg to land: **at t = 0 the writer must reproduce the static layout call for
call**, so the loop's first tick redraws exactly the frame the arrival landed on
and the join moves nothing. Express the motion as an offset that is zero at t = 0
and that holds by construction rather than by review — `chapters.js` writes its
drift as `cos(ωt + φ) − cos φ`, which is identically zero at t = 0.

Two more things follow from it having no end. The offset must be measured from a
**stored base**, never read back out of the buffer it is writing, or the motion
accumulates and the field wanders off the canvas. And a **resize must interrupt
it**: a frame writer closes over the canvas box it was built for, and unlike a
finite leg an ambient loop never gets a chance to recover — which is why the
render effect's `sweeping` guard lets a resize through (it used to swallow one,
leaving any sweep drawing stale geometry for the rest of its life).

**`sweeping` is not `$state`, and must not become it.** It says who owns the rAF,
which is not something the story is showing — the render effect reacts to state,
params and canvas size only. As a `$state` it was a dependency of the very effect
that clears it, so abandoning a choreography on a step change re-ran the effect a
beat later; `prevState`/`prevParamsKey` were already updated by then, so
`stateChange` and `paramChange` were both false and it fell into the catch-all
`to(attrs, 0)` — snapping the arrival tween it had started microseconds earlier.
Same trap as the one documented for `story.settled` below. It stayed hidden while
every sweep was finite and optional (the race animators re-set `sweeping` within
the same run, so their re-run hits the early-return guard); an ambient loop is
always in flight when you leave its step, so it surfaced on the first chapter card.

It is hooked on `settle()` rather than at each arrival branch, which covers every
path into a state at once — a plain state tween's `onDone`, the cold-start and
first-paint branches, and the reduced-motion/resize snap. Under reduced motion
`playAmbient` returns immediately and the static layout is the still frame.
Example: `chapterCenters` in `layouts/chapters.js`.

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
`raceFull`/`raceFuture` (avg-distance-by-year race, three fixed-scale cameras;
the last rests past the end of the data, see below) ·
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

`raceWindowYFit(camLeft, camRight)` is the whole rule. The **top** of the plot is
the record's low point over the years on screen; the **bottom** is that same
record at the camera's right edge plus the band `raceBandAt` gives that year;
both ends are then padded by `RACE_Y_PAD` (12% of the plot's height, floored at
`RACE_Y_PAD_MIN`). `writeRaceSweepFrame` calls it with its own camera, so:

- **No step owns an axis and no animator carries one.** There is no `STATE_YFIT`,
  no `fixedYFit` parameter, and nothing to hand across a step transition. An
  animated frame and the static settle it lands on agree because both are the same
  pure function of `(playhead, width, height)` — a type-level guarantee, not a
  review property. This is what let `raceRewindYFit`, `lerpYFit`, `liveYFit` and
  `raceExit.yFit` all be deleted: leg 2's "axis pans with the camera" behaviour is
  now simply what the axis does everywhere.
- **The band is a function of the playhead year and nothing else**, so the same
  year fits the same axis on a phone and on a desktop. Fitting over the visible
  window instead would give two viewports two different charts.
- **Reader panning moves the axis**, and must: the settle it hands off to derives
  its own fit from the same playhead.

The record is the right thing to hang the top on because it is the chart's exact
**ceiling** — no actor in the cast sits below the crown holder in any year
(measured deficit 0.0000 across all 224 series) — so that end needs no guesswork
and nothing clips off the top. It is read **interpolated** (`raceAnchorAt`), not
sampled on whole years: sampled discretely the fit would be a step function of the
camera and the axis would visibly tick every time a year crossed the plot edge
mid-pan. That trades in one risk — a monotone cubic sagging below the straight line
between two record points, at most 0.0019 over the reachable playheads — which is
what `RACE_Y_PAD_MIN` sizes the padding to absorb.

**The band is a curve over the years**, held as eleven control points in
`RACE_Y_BAND_POINTS` (1980–2025 — exactly the years a camera can rest on, since
`raceFloorPlayhead` clamps every step and the band is read at the right edge only)
and read through `raceBandAt`, which runs them through the same monotone cubic
(`monotoneSegments`/`curveYAt`) the chart's own lines use. Two things follow from
that shape. It is continuous in `year` for free, which the axis needs for exactly
the reason `raceAnchorAt` is interpolated. And it is EDITABLE: a decade moves when
one handle moves, which a value-per-year table isn't.

A _count_ of lines cannot do this job, which is what the band used to be
(`RACE_Y_LINES = 6`, guarded by a min and max): the field's density around the
record changes completely across the chapter — 0.068 of avg-distance holds six
lines in 2025, where SLJ has pulled clear, but fifty in the mid-2000s, where a
dozen actors were trading hundredths. Fitting to a count therefore tracked the
crowd's noise rather than the story, and made the plot breathe on every pan. The
points are drawn by eye against the live chart instead.

**Tuning it.** `RaceYBandDev.svelte` is a dev-only curve editor (dynamically
imported in `Index.svelte` under `import.meta.env.DEV`, so a build drops the chunk
entirely — a static import survives tree-shaking, which is why it isn't just an
`{#if}`). It is a full-width strip hung under the plot: drag a control point to
reshape the curve, click to add one, alt-click to drop one, with the shipped curve
behind as a dashed ghost and the chart's live playhead year riding along as a
marker. It hands the points to `race.js` through `setRaceDevBands` (a plain module
variable, so nothing reactive lands in the per-frame draw path) and bumps
`story.raceYBandsRev`, which is `ScrollyVisual`'s cue to drop its cached layouts
and redraw. "copy" puts a replacement `RACE_Y_BAND_POINTS` on the clipboard; edits
persist in `localStorage` between reloads, and "reset" goes back to the shipped
curve.

The accepted cost of a band this tight: the chart holds the leaders and lets the
rest of the field run off the bottom edge. Lines that leave the plot are ended at
its edge by `curveEntry`/`curveExit`, entering and leaving through it as in any
line chart, and a dot whose value has left the scale is hidden outright.

**The leader's ink.** The field is monochrome, but the actor in FRONT at the
camera's right edge is drawn in ink — `INK` dot at r 4 and alpha 1, their line
blended to `INK` and thickened — so who holds the crown is visible without
reading the gutter, and the crown visibly changes hands as the reader pans across
the takeover. Nobody is identified BY a colour; one is identified as being in
front, and it is a property of the CAMERA rather than of the actor or the step
(`highlight` still buys a name and nothing else).

`writeRaceSweepFrame` picks it: the lowest dot it is actually showing, reusing
the `dotM` it already computed so "inked" and "on the plot" cannot disagree. That
is the same order as the crown, because the axis hangs under the record and no
actor sits below the crown holder. Reading it off the drawn dots rather than off
`story.eras` is what puts the handover on the crossing the reader can see — the
same ~0.9yr discrepancy `solveTakeover` exists for, so the ink changes hands
exactly where the takeover ring sits, at the pixel where the two dots meet.
`raceLeadAt` is the same rule with no frame, for the rank handoff's collapsed
nodes (`RACE_RECENT_LEAD`, so the #1 row is already inked as HTML).

The dot rides the attr buffer as any dot does. The LINE needs a channel, because
a trail's colour and width otherwise come from the static `TRAIL_META`: hence
`TRAIL_STRIDE = TRAIL_POINTS * 2 + 2`, the last slot a 0–1 highlight that
`drawScene` blends toward `INK` — the same idiom edge slot 2 uses for a
highlighted link. Being in the buffer is what makes it tween, so ink gained or
lost between two states crossfades. Every other trail writer ZEROES it, so ink
survives only while its writer keeps asserting it; inked lines are stroked in a
second pass so the crown is never buried under a grey neighbour.

**Who a step shows** is a separate question from the axis, and still
width-independent so it can be computed at module load. `raceStepCap(step)` is the
centre at the step's resting year plus one chapter-wide `RACE_YCAP_REACH` (0.213).
Expressing the reach _from the centre_ rather than as an absolute avg-distance is
load-bearing: the crown itself moves from ~2.82 in 1971 to ~2.09 in 2025, so a
single absolute cap cannot mean the same thing on two steps a decade apart. 0.213
is raceRecent's old hand-picked 2.3 read against the 2025 centre, so its field is
unchanged at 131 lines. raceFull has no cap; it shows the whole cast by design.

Two consequences of the shared axis, both load-bearing:

- **`raceStepVisible`** is the single source of who is on a step: everyone whose
  line dips to its `yCap` somewhere in its extent. Anything reading a visible set
  must go through it, never `raceContenders` directly, or an actor a step drops
  fades back in at the settle. Which actors a step _emphasises_ is separate again —
  its `highlight`.
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
`RaceScrubber`, mounted on `raceFull` only (the `raceRecent` steps are carried by
their own camera choreography, and `raceFuture` is a fixed camera by design): a
relative pointer drag plus a bits-ui year
Slider, both writing only `story.scrubYear`/`scrubbing`, with bounds read from
`story.raceCam` (published by ScrollyVisual, the only component that knows the
canvas width). It renders nothing when the whole extent already fits on screen.

**The future strip (`raceFuture`).** The chapter's last step is raceFull's chart
with the camera carried past the end of the data: the axis runs on to 2030 while
every series still ends in 2025, so the right of the plot is empty ground — the
future its copy asks the reader to imagine. It costs one field.
`maxPlayhead` (the mirror of `minPlayhead`, read through `raceMaxPlayhead` and
defaulting to the extent's end) is the last year a step's camera may rest on, and
so is its resting playhead, its pan ceiling and its last x tick all at once. The
content extent stays raceFull's, because who the step shows and how far its lines
run are still questions about 1970–2025.

Nothing caps the lines to keep them off the strip, and that is the point:
`writeRaceSweepFrame` already ends every line at `Math.min(cam.playhead, de, e1)`
and parks every dot at `de`, the actor's own last data year. Push the camera past
the data and the lines simply stay where they ended. Only the ticks and the
camera follow `maxPlayhead`.

Declaring `minPlayhead === maxPlayhead` is how a step **fixes its camera**:
`racePanBounds` is left with nothing between its two ends, so it reports the step
as offering the reader no pan at all. That is the honest
half of the step having no controls; the enforcing half is `Index.svelte` not
mounting `RaceScrubber` on it. Arrival and departure are `playRaceFuture` /
`playRaceFutureReverse` — the rewind legs run forwards, since `rewindFrame` only
interpolates `fromP → toP` and a fixed px-per-year makes either direction a pure
translation.

One consequence to know before retuning `pxPerYear`: the strip is five years
wide, so a plot narrower than 5 × `pxPerYear` has no room for data beside it. At
the shipped 76px that is ~1050px, below which this step shows progressively less
of the field and, on a phone, none of it. That is a deliberate, accepted
trade-off for holding the axis to 2030 at every width, not an oversight.

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
`xBase`), `notes` (positioned callouts, `nowrap` by default — nothing emits
them; see the takeover callout below for why prose on the race chart goes
through the frame writer instead), and `legend`
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

**The takeover callout.** The chapter's whole claim happens at one intersection,
so the claim is set on the plot: an 11px ring where SLJ's line crosses
Hackman's, a sentence of prose, and a curved leader tying the two together
(`raceTakeoverCallout`, `layouts/race.js`; `TakeoverCallout` in
`layout-shared.js`). It was a click-to-open `InfoTerm` — with a diverging bar
spark inside it — until review feedback that the insight should not be behind a
click; the popover and the spark are both gone, and the ring is now plain
decoration with the note carrying the crossing to AT.

The crossing is solved at module load by bisecting the two actors' curves
against the same monotone segments the chart draws (`solveTakeover`) — **not**
read off `story.eras`, because `raceSeries` is sampled on whole years, so the
drawn lines cross at 2005.11 while the era record's handover date is 2006-02-17,
~68px further right. The whole payload rides `writeRaceSweepFrame`'s per-frame
return next to `axes` rather than the layout result, which is what keeps the
note glued to the crossing through a scrub instead of freezing (see "Chart
furniture" above), and it culls itself off-camera on the x ticks' own rule.

The note sits BELOW the ring, never beside it, and that is a rule rather than a
default. The ring is not parked — it enters at the plot's LEFT edge as the
rewind pans back and slides right until it rests ~68px from the right edge, so a
note held left of it is behind it for most of the pan and the leader points
backwards. On a narrow canvas beside is unreachable at any playhead: the plot's
left margin plus a legible box plus a leader's worth of gap already overshoots
where the ring rests. Below is one rule at every width and every playhead, and
it keeps the leader vertical-dominated, which is what stops it ever reading as
reversed. Two clamps carry the variation instead: the box is held inside the
plot (backing off the right edge by the dot column's radius, since every dot is
pinned there at the playhead), and the drop shortens so the last line clears the
x-axis row on a landscape phone. The payload also carries an `alpha`, ramped
over the last px of travel at each plot edge — a 220px block of prose blinking
off at the cull reads as a bug where an 11px ring merely reads as culled, and
`{#if}` gives no out-transition to lean on.

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
never appears. (`networkIntro` labels dynamically — only the focused actor and
their route — and needs no `STATE_TRACKED` entry because `lone` still declares
the same `INTRO_IDS` as a static array.)

**Step 1's tour and its route panel.** `networkIntro` does not wait to be tapped.
Index.svelte walks `CYCLE_ORDER` (exported from `layouts/intro.js`) every
`TOUR_MS`, writing `story.introFocus`, so the step demonstrates the game on its
own; the card reads one line, "X is _two movies_ away from Kevin Bacon". A tap
sets `story.introPinned` and the tour stands down. It is a plain toggle, so every
tap does exactly one visible thing: tapping the highlighted actor again — or
Bacon, who has no route to himself — clears the highlight and leaves the
constellation neutral (no caption, all fifteen names back), and the tour picks up
on its next beat, one past where the reader left it. A release bumps
`story.introReleases`, which the tour effect watches to know the highlight was
dismissed rather than carrying on mid-turn: `touring` alone doesn't change when a
reader clears an actor the tour was already showing.

**The tour effect must never read `story.introFocus`.** It writes it, so reading
it too makes the effect invalidate itself on its own write — each tick re-runs
it, fires a second `showNext` and restarts the interval, and the tour skips an
actor on every tap. That is why the release signal is a counter in `story` rather
than an `introFocus == null` test inside the effect. Auto-advancing text is motion the reader did not ask
for, so under `prefers-reduced-motion` the tour seeds the first actor and stops
there. The films behind each hop live in a `ui/InfoTerm` panel behind "two
movies" (`RouteFilms.svelte`), not in the card — see the note in "Known gaps"
about a growing card covering the layout's `hits`. The caption itself is the
step's `panel` snippet, not card prose: it is naming a dot, so it is set in the
same mono at the same size as `.node-label` and floated a fixed 12px under the
constellation's lowest name. That y comes from `introBottom(w, h)` (exported from
`layouts/intro.js`), off the layout's own geometry rather than a fraction of the
canvas — the intro fit is width-limited on a tall phone, so the graph stops well
short of its band and any fixed fraction leaves a hole under it. Index measures
the canvas box and the caption's own height to clamp it off the step card, which
only binds around 360×640. It is `pointer-events: none` apart from the term
inside it, so it can lie over the layout's `hits` without swallowing taps.

## Chapter cards

A chapter card is a step with no prose: a title over the canvas, declared as
`<Chapter state="…" title="…" />` and registered in document order like any other
step, so `Next` stays live and every later step's index shifts by itself. The
first is `chapterCenters` ("The centers of Hollywood"), which follows the "never
will" step; `feedback.md` has the four-chapter plan the rest will join.

Three things about it are deliberate.

**`Chapter.svelte` renders nothing.** The title has to play an _out_-transition as
the reader moves on, and content rendered from the active step's registration —
the way `panel` is, via `{@render stepConfigs[value]?.panel?.()}` — is destroyed
the instant the index changes, with no chance to transition out. So `Index.svelte`
renders the card from `stepConfigs[value].chapter` inside a stable `{#if}` block,
which Svelte can transition both ways. That is the whole reason a chapter is not
just a panel.

**The card opens on the frame before it.** `chapterCenters` reuses
`writeFieldCrowd` at `PULLBACK_ZOOM` — hopSeed's landed camera — so the field is
byte-identical to the frame the reader was already looking at and nothing in it
moves on arrival. The only actors that travel are the intro fifteen, dissolving
out of the constellation into the crowd on the same `fieldSpot`, radius and grey
as everyone else, Bacon included: the visual form of the line the reader has just
read. Reusing the writer is what makes the identity true by construction; that is
also why `fieldSpot`/`fieldEdgeAlpha` are extracted in `layout-shared.js` rather
than the placement being written out twice.

**The handoff out is vertical.** `hopBands` takes each dot's x from the same
`fieldSpot` the card places it at, so the band decides only its row. Both are a
uniform scatter over the same span — the chart is unchanged from any other
arrival (deciles stay 9.7–10.4%) — but from the card an independent x would send
twelve thousand dots off on twelve thousand unrelated diagonals, which reads as
static rather than as sorting. Sharing the x makes it fall: measured max |dx| is
0 across all 12,066 visible dots, mean |dy| 160px. If a future layout wants to
receive that crowd the same way, share the x the same way.

**The title is centred on the field's box, not the canvas's.** The crowd occupies
the plot area (`plotBottom`), so a canvas-centred title would sit half over the
empty ground below the universe it is meant to be inside. Same "position off the
layout's own geometry" rule as step 1's caption and `introBottom`.

## How to add a state

1. Pick the chapter module it belongs to under `layouts/` (or add a new one for
   a new chapter). Write `layoutFoo(nodes, w, h)`: fill a `Float64Array(ATTR_SIZE)`
   via the `set()` helper from `layout-shared.js`, return `{ attrs }` (plus
   `delays` if choreographed).
2. Add one entry to that module's exported `states` object:
   `foo: { layout: layoutFoo, labels?, params?, pulse?, revealFrom?, entry?, ambient?, overlay? }`
   — everything about the state lives in this one object (no need to touch
   `states.js`, unless the module itself is new: then spread it into `REGISTRY`).
3. Use it from `Index.svelte`: `<Step state="foo"><p>…</p></Step>`.

Use `hash01(n.id, <new salt>)` for any per-node scatter/jitter — pick an unused
salt integer. Taken so far: 3–8 across layouts, 9 in `tween.js`, 10–14 in
`writeFieldCrowd`, 15–19 in `layouts/chapters.js`.

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

Everything about a row's strip therefore lives in `layout-shared.js`, not in the
panel — including the whitespace between the hop bands (`RANK_BAND_GAP`, reserved
inside `hopBandBoxes` before the shares are struck, the horizontal twin of
`hop-bands.js`'s `BAND_GAP`). Gap the panel's `<path>`s alone and the two sides
disagree about where a dot is, which breaks both the `hopBands → rankFocus`
convergence and the collapse below. A second, less obvious rule: **every row must
keep the same height.** The handoff places all 250 canvas copies from one measured
`pitch` (see `story.rankListRows` below), so a row that is taller than its
neighbours scatters every copy below it. That is why the per-band share labels
under each bar are absolutely positioned into a lane the row's own bottom padding
reserves, rather than laid out beneath the strip.

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
  raceFull, must not flash the list up over a chart that is already drawn.

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
- A step card that grows can cover a layout's `hits`, and the card wins the tap.
  `networkIntro` used to be the one case: its caption walked every route in
  prose, which ran to several sentences and covered the four lowest actors at
  390×667 and seven including Bacon at 360×640. Closed by moving the films into
  the route panel (see "Step 1's route panel" below) — the caption is now one
  line and every dot clears the card at 360×640. Any future caption that can run
  past two lines reopens it.
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

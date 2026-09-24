# Scrolly visual framework

The story's visual is one canvas of ~12,000 dots with stable identities that
tween between per-step layout **states** (object constancy: dots travel, they do
not fade out and in wholesale), plus a second tweener doing the same for
**trails** (polylines). This is the architecture map for
`src/components/scrolly/`: what each module owns, the contracts between them,
and where each contract is tested. The reasoning behind individual charts —
and the measurements that were taken — lives in `notes/design/`.

> "Scrolly" is historical. The reader advances by tap halves (below 1200px),
> edge notches (side by side, ≥ 1200px) and arrow keys (`TapNav.svelte`), never
> by scroll; only the mechanism setting the active step
> has ever changed, and the framework below is driven purely by that index.

## Design notes

| Note                              | Covers                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/design/sky.md`             | The flowing sky the title card, `hopSeed` and `outro` share, and the title card's highlight beat.                                         |
| `notes/design/side-by-side.md`    | The side-by-side layout above 1200px and the canvas bleed the full-bleed states rest on.                                                  |
| `notes/design/title-card.md`      | The title card (step 3), its sky carried on from `hopSeed`, and the nav cue on step 0.                                                    |
| `notes/design/race-chart.md`      | The race chart: fixed x scale, the camera, the y axis's two regimes, the future strip, the Gen Z field, the closing chart.                |
| `notes/design/simulation-race.md` | The simulation replay.                                                                                                                    |
| `notes/design/motion.md`          | The motion rules every transition is held to (2026-09-19), what each looks like on a contact sheet, and the open questions.               |
| `notes/design/interactions.md`    | The agreed interaction rules (2026-07-05, revised 2026-09-11 and 2026-09-19), the five gated steps and the rank → race handoff in detail. |
| `notes/tween-checklist.md`        | The manual sign-off record for every step transition, and the rules `npm run stale` applies to it.                                        |

## Files

| File                                                                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/Index.svelte`                                        | The story: the `<Splash>` and the `<Step>` list with its prose (Owen's), grouped into `<Chapter>`s, the panel snippets each step names, the intro tour and the credits. Creates the step registry and hands the steps to `Stage`.                                                                                                                                                                                                                                                                                            |
| `scrolly/Stage.svelte`                                               | The layout shell: the canvas box, the rank ladder's placement and fade-in latch, the active step's panel, the title card with its fade, the nav cue on step 0, the dev tuners' mount, the prose column, `StepProgress` and `TapNav`. Renders the steps as `children(layout)`.                                                                                                                                                                                                                                                |
| `scrolly/step-registry.svelte.js`                                    | `createStepRegistry({ navigate })`: the wizard. Registrations in document order, the step index (kept in `?step=N`, dev only), `go`/`advance`/`skip`/`next`/`prev`/`exit`, gate (with `onnext`) and `skipback` resolution, the bar's `chapters`/`currentChapter`/`dotSteps`/`dotStep`, and the `advanceon` watcher.                                                                                                                                                                                                          |
| `scrolly/arrivals.js`                                                | `prepareArrival(move)`: what a move does to the story before the destination renders — un-landing the beat, the rank panel's handoff, the reset on leaving the rank chapter backwards, and per-state arrival rules (the hop chart's anchor, quiz, simulation, Gen Z draw-on).                                                                                                                                                                                                                                                |
| `scrolly/story.svelte.js`                                            | The shared interaction state, grouped by interaction (`intro`, `hops`, `rank`, `race`, `quiz`, `search`, `sim`) under four framework fields (`settled`, `settledStep`, `request`, `running`); `request(kind)`, `resetSimRace()`, `resetGenzLines()`, `resetHopAnchor()`.                                                                                                                                                                                                                                                     |
| `scrolly/Step.svelte`, `Chapter.svelte`, `Splash.svelte`             | `Step` and `Splash` register one step each with the `"scrolly-steps"` context in document order. `Step` renders its prose while active; `Splash` renders nothing — `Stage` draws the title card from the registry so it can transition out. `Chapter` takes no step: it wraps a run of `<Step>`s and puts its `title` in the `"scrolly-chapter"` context, which each `Step` registers as `chapter`.                                                                                                                          |
| `scrolly/TapNav.svelte`, `StepProgress.svelte`                       | The step driver (tap halves stacked, edge notches beside the prose, arrow keys always; all through `go()`) and the chapter progress bar (indicator only).                                                                                                                                                                                                                                                                                                                                                                    |
| `scrolly/ScrollyVisual.svelte`                                       | The canvas host: the two tweeners, the render effect (below), dpr scaling, resize and bleed, reduced motion, the HTML overlay and annotation layer, the scrub loop and the request player.                                                                                                                                                                                                                                                                                                                                   |
| `scrolly/render.js`                                                  | One frame of the buffers onto a 2D context: `clearCanvas`, `drawTrails`, `drawEdges`, `drawDots`, `drawLabelLeaders`. Pure over (ctx, buffers).                                                                                                                                                                                                                                                                                                                                                                              |
| `scrolly/annotations.js`                                             | The annotation layer's per-frame decisions: `raceLabelCut`, `trackLabels`, `createLabelStacker`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scrolly/choreographer.js`                                           | `createChoreographer({ ease, draw, onStop })`: the one owner of the choreography rAF — `phase`, `loop`, `legs`, `stop`, `active`. Knows nothing about states.                                                                                                                                                                                                                                                                                                                                                                |
| `scrolly/race-camera.js`                                             | `createRaceCamera(story)`: the race chapter's live camera, its `reset` on a state change, `publish` of the pan bounds (`story.race.cam`), the `hold` a settled chart rests at (`story.race.view`) and the reader's `glide`.                                                                                                                                                                                                                                                                                                  |
| `scrolly/tween.js`                                                   | `createTweener(size, draw, stride)` → `{ current, target, to, stop, reframe }`: one rAF lerping a flat buffer from the currently rendered values to a target, with per-slot delays.                                                                                                                                                                                                                                                                                                                                          |
| `scrolly/attr-buffer.js`                                             | The dot buffer's layout (`STRIDE`, `EDGE_BASE`, `ATTR_SIZE`, `DELAY_SIZE`), the writers `set`/`setEdge`, and `dissolve`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `scrolly/trails.js`                                                  | Trail slots (`TRAIL_META`, `RACE_SLOT`, `SIM_SLOT`, …) and writers over a monotone-cubic curve (`monotoneSegments`, `curveYAt`, `clipSeries`, `sampleTrail`, `setTrail`, `setTrailPoints`, `collapseTrail`, `setTrailHighlight`).                                                                                                                                                                                                                                                                                            |
| `scrolly/plot.js`, `palette.js`, `cast.js`                           | Plot geometry (`MARGIN`, `TITLE_BAND`, `plotBottom`, `lin`, `Bleed`); the canvas palette as rgb of the CSS tokens; who is who (named actors, `BY_RANK`, every chart's cast list).                                                                                                                                                                                                                                                                                                                                            |
| `scrolly/rank-geometry.js`, `scatter-scales.js`, `intro-geometry.js` | The rank bar's dot lattice shared by canvas and HTML; the films scatters' shared scales and `parkHidden`; the intro constellation's fit and pull-back camera.                                                                                                                                                                                                                                                                                                                                                                |
| `scrolly/sky.js`, `galaxy-highlight.js`                              | The sky's volume and flow (`flowSpot`, `fieldSpot`, `writeFieldCrowd`, `makeFlight`, `galaxyBox`) and its one live clock; the title card's highlight beat (`withGalaxyHighlight`).                                                                                                                                                                                                                                                                                                                                           |
| `scrolly/nodes.js`                                                   | `makeNodes()` → `{ nodes, edges }` from `src/data/scrolly-nodes.json`; `ANCHOR_ID`, `INTRO_IDS`, `hash01(id, salt)` and `dotHash` — deterministic per-node randomness, never `Math.random`.                                                                                                                                                                                                                                                                                                                                  |
| `scrolly/layouts/*.js`                                               | One module per chart: `intro` (`networkIntro` — the constellation, two steps on it), `hop-bands` (`hopSeed`, `titleGalaxy` — the title card's sky, hopSeed's carried on — `hopBands` and `hopAnchor`, the cycling anchor), `rank`, `race`, `scatters`, `career`, `sim-race`. Each exports a `states` object; everything about one state is in its entry.                                                                                                                                                                     |
| `scrolly/states.js`                                                  | Merges every module's `states` into the registry and derives the per-state maps (`STATES`, `STATE_LABELS`, `STATE_PARAMS`, `STATE_ENTRIES`, `STATE_REQUESTS`, `STATE_AMBIENT`, `STATE_RACE`, …), `entryFor`, `isRankState`, `quizDone` and the typedefs below.                                                                                                                                                                                                                                                               |
| `scrolly/layout-types.js`                                            | JSDoc only: `LayoutFn`, `LayoutResult`, `Tick`, `Note`, `RaceCallout`, `FutureBand`, `LegendItem`, `Hit`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scrolly/RankBars.svelte`, `RaceScrubber`, `RouteFilms`              | The over-canvas panels (see "Panels").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scrolly/GuessRank.svelte`, `StartButton`, `PairQuiz`, `ActorSearch` | The step controls: they live in the step card, in the prose flow, under the sentence that asks for the press (see "Interactive steps"). `PairQuiz` and `ActorSearch` also fly an element out of the card onto the canvas, off `layout.visual`'s `locate()`.                                                                                                                                                                                                                                                                  |
| `scrolly/fly-to-dot.js`                                              | That flight, shared: `flyToDot({ el, rect, target, fill })` plus its beats (`MARK_MS`, `FLIGHT_MS`, `HOLD_MS`) and `prefersReducedMotion()`. WAAPI over a transform off the element's own box, so nothing leaves flow and the card's height never moves.                                                                                                                                                                                                                                                                     |
| `scrolly/search.js`                                                  | The actor search's index: `SEARCH_POOL` (the recognisable actors plus the story's own cast, narrowed at build time to whoever also has a `rankHopBands` breakdown — the one pool all four searchable steps, including the hop chart's anchors, share), `RANK_POOL` (the ranked 250 — the rank guess's own, narrower pool, since that's all `RankBars` renders a row for), `searchActors`, and the one highlight rule the three searchable layouts share (`SEARCH_RGB`, `searchedId`, `withSearchLabel`, `withSearchParams`). |
| `scrolly/dev/`                                                       | DEV only, dynamically imported by `Stage`: the race tuners (`RaceYBandDev`, `RacePxPerYearDev`, `RaceSpeedDev`) behind `Tuners.svelte`, writing `raceTuning` in `layouts/race.js` and bumping `tuning.rev` (`tuning.svelte.js`) so the visual drops its layout cache; and `TapZonesDev.svelte`, a HUD button fixed to the viewport that tints `TapNav`'s prev/next halves (see "Tap-zone debug tint" below).                                                                                                                 |
| `scrolly/__tests__/`                                                 | The vitest suite (see "Verify").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/stale-checklist.js`                                         | Marks the tween checklist's rows stale from a diff (`npm run stale`), and checks them in the pre-commit gate.                                                                                                                                                                                                                                                                                                                                                                                                                |

### Tap-zone debug tint

`TapNav`'s prev/next halves carry no marking by design (see the component's
own doc comment) — this is a DEV-only way to see their extent anyway (stacked
only: beside the prose there are no halves to tint, just the notches), e.g.
while checking they still cover the whole viewport at an odd width. It caught
exactly that: the halves used to be sized off `#scrolly`'s own box (`50% +
--column-gutter`), which is capped by `--column`, so any viewport wider than
the active cap left the excess dead on both sides — fixed by sizing them
against the viewport directly (`50vw`, `position: fixed`) instead.

- `scrolly/dev/tapZones.svelte.js` holds the one signal: `tapZonesDev`
  (`$state({ visible })`, restored from and persisted to `localStorage` under
  `kb-tap-zones-visible`) and `toggleTapZones()`.
- `scrolly/dev/TapZonesDev.svelte` is the HUD control: a small button fixed to
  the viewport bottom-left, `position: fixed` (not anchored to
  `.scrolly-visual` like the race tuners) so it stays reachable on every step,
  not just one chapter. Dynamically imported by `Stage.svelte` under
  `import.meta.env.DEV`, next to `devTuners` — same tree-shaking reasoning:
  the import is conditional so a production build never references the chunk.
- `TapNav.svelte` imports `tapZonesDev` directly (a static import, unlike the
  dynamically-imported dev components — it just reads a boolean, so there's no
  chunk to shake out) and toggles a `debug-visible` class on each half, tinting
  `prev` and `next` two different low-opacity colours so they read apart.

To replicate this pattern for another debug toggle that has to reach across
the whole post rather than one chapter: a `*.svelte.js` module for the shared
`$state` signal (read by whatever component needs to react to it), a
`position: fixed` HUD control dynamically imported by `Stage` under
`import.meta.env.DEV`, and a static import of the signal (not the control)
wherever the effect actually renders.

## Core contracts

### The buffers

All dot state is one flat `Float64Array(ATTR_SIZE)`: `STRIDE = 7` values per node
— `x, y, radius, r, g, b, alpha` — at `node.id * STRIDE`, then one group per edge
from `EDGE_BASE` (slot 0 = draw progress 0–1, from the lower-hop end; slot 1 =
alpha; slot 2 = how much of the line a highlighted route covers, 0–1, drawn from
the OUTER end in, so a route reads as a walk to Bacon). Alpha carries
visibility: hidden nodes get alpha 0 but still get _positions_, so a later fade-in never teleports. Trails are a second buffer of
`TRAIL_STRIDE = TRAIL_POINTS * 2 + 2` per slot — 48 vertices, alpha, and a 0–1
ink channel the renderer blends toward `INK`. Every slot constant derives from
the cast lists, so a cast can grow without touching an index.

### Layouts and the state registry

A layout is `(nodes, w, h, edges, params, bleed) => { attrs, trails?, delays?,
axes?, notes?, legend?, band?, hits?, … }` — pure, in pixels. Each `layouts/*.js`
exports a `states` object; `states.js` merges them and derives the per-state
maps, so adding a state means adding one entry (see "How to add a state"). A
state entry may carry:

- `labels`, `labelDirs`, `labelText`, `pulse`, `title`, `overlay` — annotations;
- `params: (story, stepParams) => Object` — the interaction fields it reads,
  merged with the step's static params; a change re-runs the current layout with
  a `PARAM_TWEEN_MS` tween, or as the layout's `paramWalk` where it returns one
  — a tween to its `clear` frame, then the walk (`networkIntro`'s route walk,
  `routeWalk` in `layouts/intro.js`);
- `pick: (story, value) => void` — what a `hits` button writes;
- `revealFrom` — the prior states its authored `delays` (and entry) play from;
- `entry`, `requests`, `ambient` — the choreographies below;
- `race` — the race chapter's per-step camera descriptor (`STATE_RACE`).

`ScrollyVisual` caches layouts by `(state, params, box, plot fraction)` and drops
the cache when `tuning.rev` moves.

### Arrivals

Four ways a state's frame comes to be on screen, all landing on the same
`settle()`:

- **A state tween.** `tweener.to(target, ms, jitter, delays)`. Without `delays`
  the arrival uses `EDGE_LAG_DELAYS`: dots in unison, edges held back until the
  dots have mostly landed (`EDGE_LAG_MS`), because edges are drawn toward their
  endpoints' _final_ spots. The names an arrival introduces wait out the same
  lag (`heldLabels`). `ms <= 0` is a jump (resize, reduced motion). `to()`
  snapshots the live buffer, so mashing Next retargets from mid-flight.
- **An entry choreography** (`EntryAnim`, `STATE_ENTRIES`, `entryFor`). Legs
  played on the choreographer's rAF, each writing straight into the live buffers
  and publishing a `FrameOutput` (decor, camera, story fields by group). Contracts:
  frame 0 of leg 0 is what the arrival lands on; the last leg's frame 1
  reproduces the layout it hands off to (the static layout, or the layout at the
  params its `finish` publishes); a reader who steps on mid-flight supersedes
  the arrival, so the legs never start. `labelsAfter` gates the
  names to a leg; `hold` waits for a story flag before the legs
  start (the rank handoff); `seed` shapes what the first frame shows;
  `ownsArrival` takes the rAF from the press with no arrival tween in front;
  `ownsFurniture` says the legs publish their own `axes`/`callout`/`band`, so
  within one scene those three keep what is on screen until the first leg tick
  rather than jumping to the arriving step's resting ones (`swapFurniture`).
- **A request** (`RequestAnim`, `STATE_REQUESTS`). The same legs, started by the
  reader: a `StartButton` calls `request(kind)`, ScrollyVisual runs the state's
  `requests[kind]` from the live camera and names it in `story.running`. The
  rewind, the Gen Z draw-on and the simulation replay.
- **An ambient loop** (`AmbientAnim`, `STATE_AMBIENT`). After the arrival
  settles, an unbounded writer on the same rAF. At t = 0 it must reproduce the
  static layout call for call, so the loop's first tick moves nothing; it must
  measure motion from a stored base, never from the buffer it writes; and a
  resize must interrupt it. Only the galaxy states use one (`makeFlight`).

`contracts.spec.js` asserts the frame equalities for every declared entry,
request and ambient; `goldens.spec.js` pins every state's static layout.

### The render effect

One `$effect` in `ScrollyVisual`, classify-then-execute: `dropStaleLayouts`,
`canvasReady`, `fitBox` (resize, or a bare move of the column, or step aside
while a choreography owns the frame), `unchanged` (a re-run that changes
nothing does nothing — see its comment for why that guard is load-bearing on a
cold start), then `arrivalKind` picks one of `ARRIVE`'s handlers: `cold`,
`popIn`, `snap`, `carry`, `entry`, `state` or `params`. `carry` is a sky
handed between two states on the same flight (`AmbientAnim.carryFrom`: hopSeed
and the title card): no tween, the step lands at once, and the arriving loop
starts at the departing flight's clock (`skyT0`), with whatever the departing
loop drew on top of the flight faded out as a residual (`carryResidual`). Who owns the rAF
(`choreo.active`) is deliberately not `$state`: the effect reacts to state,
params and canvas size only.

### Steps, the registry and the arrival rules

Every `<Step>` and `<Splash>` registers `{ state, params?, panel?, gate?,
onnext?, skipback?, advanceon?, hideBar?, chapter?, splash? }` in document order.
The registry resolves a move — `skipback` first, then the departing step's
`gate` on a forward move, whose refusal runs the step's `onnext` instead when it
has one — and calls `prepareArrival({ to, from, forward, back })`
with the destination's state _before_ the step changes, so a component that
mounts with the step reads the right story at mount. `advance()` bypasses the
gate: it is how a gated step's own control lets the reader out. `skip()` waives
it too but keeps the arrival rules: it is the pair quiz's Skip.
`step-registry.spec.js` covers the moves and the bar's derivations below.

### Chapters and the progress bar

A `<Chapter title="…">` wraps its `<Step>`s and is nothing else: it sets the
`"scrolly-chapter"` context and each `Step` inside registers that title as
`chapter`. It takes no index and renders nothing, so crossing a chapter is an
ordinary step change. Three chapters today — "The RKBs" (4–10), "The makings
of a RKB" (11–18) and "Predicting the next RKB" (19–27). The opening — the two
constellation steps, `hopSeed` and the title card (0–3) — sits outside all of
them: it is the story's prologue, and the bar neither shows nor counts it. The chapter cards that used
to open a chapter over the sky were removed on 2026-09-23.

`StepProgress` draws the steps as LINES across the top of the layout, and
reads everything off the registry rather than counting steps. `dotSteps` is
every step that owns a line — every step in a chapter bar a gated step
(`skipback`), which shares its payoff's line because the two are one move to
the reader. `dotStep` is the line the active step lights (a gated step
lights its successor's). `chapters` groups `dotSteps` by `chapter` into
`[{ title, steps }]` (`chaptersOf`) and `currentChapter` is the index of the
one holding `dotStep` (the screen-reader line names it; nothing visible does).
The bar is one full-width flex row with a line per step in `dotSteps`, each an
equal share. No text: the active line
is lit and the ones behind it greyed. The lines change by colour alone, so a
step change moves no layout.

It is hidden on a step outside every chapter (the opening) and on a step
declaring `hideBar` (the outro) — behind a
latch that keeps it up across ordinary step changes and brings it back off a
`hideBar` step only once the arriving prose has landed (`steps.held`), on its
own 300ms fade. It takes no pointer events: a tap over it steps the story like
anywhere else, and it is never a jump target, which would carry the reader
past the gated steps without their question ever being put.

### The story store

`story.svelte.js` is one `$state` object. Step controls and on-chart picks
write into its interaction groups; a state's `params` selector reads them; a
frame's `FrameOutput.story` publishes into them one group deep, each write
equality-checked (a write that changes nothing would still retarget the tweener).
The framework's own fields: `settled` names the STATE whose arrival has landed
(set-only — stepping away un-arms every gate on it by itself), `settledStep` the
STEP index, `request` is the reader's ask
and `running` the request in flight.

`settledStep` is the one almost everything that arrives with a step reads, via
`steps.held`: the chart furniture, the step's panel, its prose and the progress
bar. A state name cannot answer "has this step landed?", because eight steps
share a state with the step before them — the second `networkIntro` step (1),
the second `raceRecent` (9), four of the five `scatterCenters` steps (13–16),
the second `raceGenz` (20) and the second `simRace` (25) — so on the
second of any pair `settled` already reads that state before its arrival has
begun. It is written by `land()`, which fires when the dots reach their places:
a plain arrival's settle, an entry's arrival tween (its legs are the step's
authored reveal, and its prose describes them, so the words are not held for the
whole of a 4s sweep), and a step change that moves nothing at all. `settled` keeps its state-scoped meaning
for the three readers that genuinely ask a state question: the actor tour, its
caption and the rank ladder's latch.

`search` is the one interaction group no arrival rule touches. The reader's actor
is deliberately sticky across the three charts that can place one (the two films
scatters and `careerMany`), because the reading is one person carried through
three questions — clearing it on arrival would make the control three unrelated
lookups.

`hops` is the same control answering a different question and is therefore the
opposite: `hopAnchor`'s anchor is re-armed on every arrival (`resetHopAnchor`),
because a pick there pins a cycle rather than marking a dot, and a cycle found
already stopped explains nothing. Its pool is `SEARCH_POOL`, the same one every
other searchable step offers. Between
them these two groups hold the only ids the annotation layer cannot know at build
time: see below.

### Annotations and chart furniture

Labels and the pulse ring are HTML, glued to their dots each frame from the live
buffer (`trackLabels`); a name rides its dot's alpha and is stacked off its
neighbours by `createLabelStacker`. Every id a dynamic `labels` function can
return must be in `STATE_TRACKED`, or it has no element to render into — with two
exceptions, which is why `ScrollyVisual`'s `TRACKED_IDS` is `$derived` rather than
a constant: the searched actor and the hop chart's anchor are ~1,400 possible ids
between them and only ever one apiece at a time, so they are appended live
instead of declared, de-duplicated because either can land on somebody the story
already names. Declaring the pools would mean all of them walked every frame to
show one name. `locate(id)` reads
the attr buffer directly for the same reason — it has to answer for a dot at the
moment of the press, a tick before that dot is tracked.

The pulse ring is **one ring, played once on arrival** — not two rings repeating.
A target lock says "this one" and then stops; a ring that ripples forever is the
only thing still moving once the story is at rest, and ambient motion is the
sky's job alone (rule 9). A name whose TEXT changes crossfades with its own new
string on `--name-alpha`, a channel multiplied into the element's opacity against
the dot's live alpha — never a transition on `opacity` itself, which would
outrank the per-frame inline write for the length of the fade. A **pinned legend
item** rides both rules: its y is interpolated per frame on the tweener's own
easing and duration (`beginLegendGlide`) so it stays at the exact middle of the
band it names while that band resizes under it, and its text crossfades on
`--name-alpha` from an inner span. Only `hopBands`/`hopAnchor` pin a legend, and
it glides only within one scene — the two share `scene: "hops"`, so it glides
across the step between them as well; across a scene change the arriving legend
is held and fades in, and a resize snaps. The chart title is not scene
furniture: it is one `{#key}`ed element of its own (`titleState`), cleared by an
arrival whose title differs, so the old one fades out on the press, and set by
`land()`, so the new one fades in on the landing. A title that does not change
stays up, so a scene's states may differ on it. A layout's
`axes`, `notes`, `legend`, `band` and `hits` are rendered in the overlay; the race
chart's per-frame furniture (the live callout, the future block) rides the frame
writer's return so it stays glued through a pan. A race step may mark more than
one moment, but only ever shows ONE callout at a time — the most present of those
its camera has on plot (`raceCallout`, and `notes/design/race-chart.md`).

### The sky, in one paragraph

The galaxy states' layouts are the flow at t = 0 (`fieldSpot` is `flowSpot` with
the clock at zero), and everything about the flow is a pure function of
`(id, t)`, so the static layout, the per-frame writer and `hopBands`'s departure
columns all read one definition. The field is stationary by construction
(uniform phases); `GALAXY_SPREAD` is an entry box, not the sky's extent; the wrap
is the only seam and is hidden by `flightWindow`. The highlight beat is a
function of the flight's clock, rents edge slots for its spokes, and leaves no
trace at envelope 0. Reasoning and measurements: `notes/design/sky.md`.

### The race chart, in one paragraph

x is a fixed `raceTuning.pxPerYear` on every step and viewport, so every visible
year carries a label and nothing zooms; a step is a camera over its content
extent, and `raceCamera` is a pure function of `(playhead, w, h)` with no
clamping — which is what makes an animated frame and the settle it lands on
pixel-identical. The y axis is `raceWindowYFit(camLeft, camRight, yOpen,
yClose)`: a fixed window from 2004 on, a camera fit behind it ramped over
2000–2004, and two further degrees of freedom the Gen Z and closing steps rest
at. No step owns an axis. `writeRaceSweepFrame` is the single placer of race dots
and trails; `raceStepVisible` the single source of who is on a step; `restPlayhead`
on a step is where a cold mount, a resize and the reduced-motion snap land.
Everything else: `notes/design/race-chart.md`.

## Interactive steps

Five steps ask the reader to do something and are followed by a step that reads
the answer out, and each owns the way out of its step: the reader's Next is
refused (`gate`), a backward move passes through the step (`skipback`), and the
step's own control — or the animation it starts (`advanceon`) — moves the reader
on. None of them holds a reader who would rather not take part: on the Start
steps the reader's Next presses Start (`onnext`), and each quiz has a Skip. The
rank guess (`GuessRank` → `advance()`, Skip included), the race rewind (its
press advances), the pair quiz (the one gate the reader's own Next walks
through, on `quizDone`; Skip → `skip()`), the Gen Z draw-on and the simulation
replay (both `advanceon` on the field the run publishes). The progress bar merges a gated step and its payoff
into one line. The arrival rules re-arm each of them on the way back in
(`arrivals.js`). The full agreement, with its history: `notes/design/interactions.md`.

Every one of those controls lives **in the step card**, in the prose flow under
the sentence that asks for the press — not over the canvas. The tap halves cover
the card's full width, so the card itself is lifted to `--z-card` and made
`pointer-events: none` (`.scrolly-steps` in `Stage.svelte`): the prose goes on
giving its presses to the halves, and each control opts back in with
`pointer-events: auto` (`GuessRank`, `PairQuiz`, `StartButton`,
`.bits-infoterm`). The lift has to live there rather than on the control,
because a step wrapper forms a stacking context its children cannot escape. Each
control also keeps `margin-inline: var(--control-inset)` — not a layering
measure any more, just the strip a thumb reaching for the next step lands in. A control in the
card also makes the card taller, and `overlayHeight` is the card's measured
height, so the panels that ride its top edge sit that much higher on those
steps.

## Panels

A visual that abandons the dot metaphor is an HTML component over the canvas,
declared as a `panel` snippet on the `<Step>`s that use it, so the markup lives
next to the step that owns it (steps sharing one visual pass the same snippet
reference, which keeps it mounted across the step change). `Stage` renders the
active step's panel over the canvas and gives the prose `layout.overlayHeight`,
`layout.width`, `layout.height` and `layout.visual` to position by. `RankBars`
is the exception: `Stage` mounts it itself across the rank chapter and one step
past it (`story.rank.handoff`), because its bars collapse into the race chart's
dots on that arrival — the panel owns the clock (`story.rank.collapsed`) and the
canvas waits on it (the entry's `hold`). `rank-geometry.js` is the one source of
the bar's lattice for both the canvas and the HTML.

A CONTROL is not a panel, even one that draws on the canvas. `PairQuiz` was a
panel until 2026-09-20 on the strength of its blurred overlay; it is a step
control now (see "Interactive steps" rule 1), and it reaches the canvas the same
way any card-hosted control would — through `layout.visual`, which is handed to
the prose for exactly this.

## How to add a state

1. Pick the chart's module under `layouts/` (or add one for a new chart). Write
   `layoutFoo(nodes, w, h, edges, params, bleed)`: fill a
   `Float64Array(ATTR_SIZE)` through `set()`, return `{ attrs }` plus whatever
   furniture it needs.
2. Add one entry to the module's `states` object:
   `foo: { layout: layoutFoo, labels?, params?, revealFrom?, entry?, requests?, ambient?, overlay? }`.
   A new module is spread into the registry in `states.js`.
3. Use it: `<Step state="foo"><p>…</p></Step>` in `Index.svelte`.
4. `npx vitest run -u` writes its golden; add a row to `notes/tween-checklist.md`
   and run `npm run stale` for its neighbours.

Use `hash01(n.id, <salt>)` for per-node scatter or jitter, with an unused salt.
Taken: 3–8 across layouts, 9 in `tween.js`, 14 in `writeFieldCrowd`'s trickle,
17 for the highlight beat's spoke draw, 21 for a dot's phase in the sky's flow,
22 for the band column of a dot that is off canvas when it leaves hopSeed's sky.
The sky's entry spots and the beat's spoke picker use `dotHash`, whose counter
walks by one — stepping a sine hash's input by a constant steps its phase by a
constant, and a dot would re-enter on a slow march instead of somewhere new.

## Data

`src/data/scrolly-nodes.json` and `src/data/scrolly-story.json` are generated by
`ANALYSIS_REPO=<path> npm run scrolly-data` (`tasks/build-scrolly-nodes.js`) —
deterministic, byte-stable, and asserting its own correctness (Bacon's rank and
bucket totals, the podium, the quiz answers, the career trio, the simulation's
winner, every trajectory export being the same `top_n: 0` metric). Both files
are committed, so the app builds without the analysis repo present; the env var
is required because a stale path would silently rebuild from the wrong inputs.

Node rows: ids 0–14 the curated intro graph, then the full hop tree, then the
actors the later chapters plot; each row joins films, avg distance and rank with
the scatter metrics and predicted distances (null where a metric does not exist
— layouts park non-participants hidden, `parkHidden`). `scrolly-nodes.json` also carries `searchPool` (the actors the search offers:
everyone sdokb scores as recognisable — `data/recognizable-actors.json`, via
`npm run fetch-recognizable` — unioned with everyone the story itself names or
draws, minus anyone the charts cannot place. Fame has to be borrowed
because every measure this corpus has is a measure of how much an actor has
WORKED, and the story is largely about actors who have not worked much yet) and `searchPaths` (each one's route back to Bacon as
`[costar, film, year]` per hop, from `analysis/bacon-path-tree.py` — the
full-corpus BFS tree with its edges named, sliced here). Nothing reads
`searchPaths` since the hop chart's caption was dropped; it stays because the
build's assertion that each route's length equals that actor's `hop` is a real
check on the sample, and rebuilding without it needs the analysis repo. `scrolly-story.json`
carries the non-dot data: bucket totals, quiz pairs, race eras and series
(`raceSeries`, `genzSeries`, `backdropSeries`), careers, the 10,000 recorded
simulation runs and their winners. `data/top-250-hop-bands-with-hop-counts.csv`
(committed here; the name is no longer literal) feeds `rankHopBands`, the
per-actor hop split the rank ladder's bars are drawn from and `hopAnchor`'s
rows are scaled by — 1,268 actors as of the export that widened it beyond the
original 250, everyone the analysis repo could give an honest hop 1-4
breakdown to (an actor who only fully connects to Bacon's neighbourhood at
hop 5+ has no row and is excluded, Owen's call). The rank ladder's bars stay
scoped to the ranked 250 regardless — that's all `RankBars` renders — but
`search.js`'s `SEARCH_POOL` is now narrowed at build time to exactly
`rankHopBands`'s keys, so every searchable step, `hopAnchor` included, offers
the same actors. Ranks are corpus-global, so ranked layouts plot by sampled
rank order, never by raw rank against `nodes.length`.

## Rendering / mobile notes

- The canvas is dpr-scaled (capped at 2) via `ctx.setTransform`; a box change
  re-runs the layout with duration 0.
- `prefers-reduced-motion: reduce` forces every arrival to a jump, skips
  choreographies and ambients, and disables the overlay fades.
- `drawDots` buckets dots into one `Path2D` per quantised (rgb, alpha) pair, so
  ~12k dots are a handful of fills a frame; the sky's flight adds ~0.04ms.
- Beside the prose (≥ 1200px, `Stage`'s `beside`) the plot takes
  `PLOT_BOTTOM_BESIDE` of the column instead of `PLOT_BOTTOM_STACKED`, and the
  prose holds a column of its own on the left for the whole story
  (`notes/design/side-by-side.md`).

## Known gaps

- Step prose overlays the bottom of the canvas below 1200px (`.scrolly-steps` in
  `Stage.svelte`); layouts keep essential marks out of it. The tap halves cover
  the whole layout (stacked; beside the prose they give way to edge notches), so any control in a step card must take its presses back with
  `pointer-events: auto` under the card's `--z-card` lift, and anything over the
  canvas must beat both at `--z-tap-above`. A step card that grows can cover a
  layout's `hits`.
- A step's prose swaps sequentially rather than as a crossfade: 200ms out, a
  beat, 300ms in, both ends drifting 8px upward (`Step.svelte`). The two copies
  overlap in the DOM for that window, so
  `.scrolly-steps` is a single-cell grid — in normal flow the column would
  measure as tall as both steps at once and shove every clearance taken off
  `stepsHeight`.
- The canvas hop colours in `palette.js` are hard-coded rgb of the tokens in
  `src/styles/variables.css`.
- A race step's resting camera is declared per STATE (`restPlayhead`), but the
  two steps resting in `raceRecent` want two different ones: the first opens on
  the present and asks for a press, the second is where the rewind has parked.
  The choreographies put the camera right on every path the reader can walk —
  `holdCamera` forward, `landAt` backward, and a published hold now moves the
  camera so `publish` cannot overwrite it — but a COLD `?step=10` has run no
  choreography and rests on the present, under prose about 2006. Declaring the
  waypoint on the state instead is not the fix: the rewind's plan returns no
  legs when the camera is already at the year it pans to, so it silences the
  chapter's subject.

## Verify

`npm run gates` runs what CI runs: prettier and ESLint (with `complexity: 10`,
`max-depth: 4`, `max-lines-per-function: 100` and import cycles enforced),
svelte-check over `jsconfig.json`, and vitest. The pre-commit hook runs the same
through lint-staged, plus `scripts/stale-checklist.js --check`.

The suite under `src/components/scrolly/__tests__/`, by contract:

| Spec                                                                                    | Asserts                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `goldens.spec.js`                                                                       | A content hash of every state's layout at three canvas boxes and every interaction override, as snapshots. A refactor keeps every hash; an intentional change regenerates its golden in the same commit (`npx vitest run -u`). |
| `contracts.spec.js`                                                                     | An entry's last leg, a request's last leg and an ambient at t = 0 reproduce the layout they hand off to; a race step's resting frame is a fixed point of its writer; the simulation replay's frames are the settled layouts.   |
| `registry.spec.js`                                                                      | The state registry's invariants: every state has a layout, every `revealFrom` names a state, every dynamic label id is tracked, …                                                                                              |
| `tween.spec.js`                                                                         | The tweener's timing, supersede and reframe semantics.                                                                                                                                                                         |
| `render.spec.js`, `annotations.spec.js`, `choreographer.spec.js`, `race-camera.spec.js` | The visual's extracted modules.                                                                                                                                                                                                |
| `step-registry.spec.js`                                                                 | The wizard: document-order registration, gates, `skipback`, `advance`, the bar's chapters and lines, the move handed to the arrival rules.                                                                                     |
| `stale-checklist.spec.js`                                                               | The checklist script's blast-radius rules, and that the real table has one row per registered step in the registry's order.                                                                                                    |

What the tests cannot see — whether a tween reads as motion, whether a name
arrives with its dot, whether the sky twitches at the handover — is
`notes/tween-checklist.md`: one row per step, forwards, backwards and on a phone.
`npm run stale` marks the rows a change affects; only Owen marks one `[x]`.

Between the two sits `npm run sheet -- <from> <to>` (`scripts/tween-sheet.js`):
Playwright drives the dev server with the page's clock faked, so
`performance.now`, `Date` and `requestAnimationFrame` advance only when told
to, and the frames of one transition are captured at exact times and tiled into
a contact sheet with the pixel change between neighbours. It is how a transition
is _looked at_ before the checklist is asked to sign it off, and the rules it is
read against are `notes/design/motion.md`.

Some properties are cheap to measure and invisible in a frame — the sky's
stationarity over minutes, a writer's cost per frame, the beat's no-repeat
guarantee. Write those as a spec when they matter: `helpers.js` has `buildLayout`,
`layoutParamsFor`, `storyWith`, `arrivalContext`, `phasesOf` and the hash and
diff helpers the goldens and contracts use, and `notes/design/sky.md` lists what
was measured by hand.

# Scrolly visual framework

The story's visual is one canvas of ~12,000 dots with stable identities that
tween between per-step layout **states** (object constancy: dots travel, they do
not fade out and in wholesale), plus a second tweener doing the same for
**trails** (polylines). This is the architecture map for
`src/components/scrolly/`: what each module owns, the contracts between them,
and where each contract is tested. The reasoning behind individual charts —
and the measurements that were taken — lives in `notes/design/`.

> "Scrolly" is historical. The reader advances by tap gutters and arrow keys
> (`TapNav.svelte`), never by scroll; only the mechanism setting the active step
> has ever changed, and the framework below is driven purely by that index.

## Design notes

| Note                              | Covers                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/design/sky.md`             | The flowing sky the title card, chapter cards, `hopSeed` and `outro` share, and the chapter card's highlight beat.                        |
| `notes/design/chapter-cards.md`   | The chapter cards, the side-by-side layout above 1200px and the swap of the prose column.                                                 |
| `notes/design/title-card.md`      | The title card and the opening flight into `lone`.                                                                                        |
| `notes/design/race-chart.md`      | The race chart: fixed x scale, the camera, the y axis's two regimes, the future strip, the Gen Z field, the closing chart.                |
| `notes/design/simulation-race.md` | The simulation replay.                                                                                                                    |
| `notes/design/motion.md`          | The motion rules every transition is held to (2026-09-19), what each looks like on a contact sheet, and the open questions.               |
| `notes/design/interactions.md`    | The agreed interaction rules (2026-07-05, revised 2026-09-11 and 2026-09-19), the five gated steps and the rank → race handoff in detail. |
| `notes/tween-checklist.md`        | The manual sign-off record for every step transition, and the rules `npm run stale` applies to it.                                        |

## Files

| File                                                                 | Role                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/Index.svelte`                                        | The story: the `<Splash>`, `<Chapter>` and `<Step>` list with its prose (Owen's), the panel snippets each step names, the intro tour and the credits. Creates the step registry and hands the steps to `Stage`.                                                        |
| `scrolly/Stage.svelte`                                               | The layout shell: the canvas box, the rank ladder's placement and fade-in latch, the active step's panel, the chapter and title cards with their fades, the dev tuners' mount, the prose column, `StepProgress` and `TapNav`. Renders the steps as `children(layout)`. |
| `scrolly/step-registry.svelte.js`                                    | `createStepRegistry({ navigate })`: the wizard. Registrations in document order, the step index (kept in `?step=N`), `go`/`advance`/`next`/`prev`/`exit`, gate and `skipback` resolution, the bar's `dotSteps`/`dotStep`, and the `advanceon` watcher.                 |
| `scrolly/arrivals.js`                                                | `prepareArrival(move)`: what a move does to the story before the destination renders — the entry hold, the rank panel's handoff, the reset on leaving the rank chapter backwards, and per-state arrival rules (quiz, simulation, Gen Z draw-on).                       |
| `scrolly/story.svelte.js`                                            | The shared interaction state, grouped by interaction (`intro`, `rank`, `race`, `quiz`, `predict`, `sim`) under four framework fields (`settled`, `entryHeld`, `request`, `running`); `request(kind)`, `resetSimRace()`, `resetGenzLines()`.                            |
| `scrolly/Step.svelte`, `Chapter.svelte`, `Splash.svelte`             | Register one step each with the `"scrolly-steps"` context in document order. `Step` renders its prose while active; `Chapter` and `Splash` render nothing — `Stage` draws their cards from the registry so they can transition out.                                    |
| `scrolly/TapNav.svelte`, `StepProgress.svelte`                       | The step driver (tap gutters + arrow keys, through `go()`) and the chapter-segmented dot bar (indicator only).                                                                                                                                                         |
| `scrolly/ScrollyVisual.svelte`                                       | The canvas host: the two tweeners, the render effect (below), dpr scaling, resize and bleed, reduced motion, the HTML overlay and annotation layer, the scrub loop and the request player.                                                                             |
| `scrolly/render.js`                                                  | One frame of the buffers onto a 2D context: `clearCanvas`, `drawTrails`, `drawEdges`, `drawDots`, `drawLabelLeaders`. Pure over (ctx, buffers).                                                                                                                        |
| `scrolly/annotations.js`                                             | The annotation layer's per-frame decisions: `raceLabelCut`, `trackLabels`, `createLabelStacker`.                                                                                                                                                                       |
| `scrolly/choreographer.js`                                           | `createChoreographer({ ease, draw, onStop })`: the one owner of the choreography rAF — `phase`, `loop`, `legs`, `stop`, `active`. Knows nothing about states.                                                                                                          |
| `scrolly/race-camera.js`                                             | `createRaceCamera(story)`: the race chapter's live camera, its `reset` on a state change, `publish` of the pan bounds (`story.race.cam`), the `hold` a settled chart rests at (`story.race.view`) and the reader's `glide`.                                            |
| `scrolly/tween.js`                                                   | `createTweener(size, draw, stride)` → `{ current, target, to, stop, reframe }`: one rAF lerping a flat buffer from the currently rendered values to a target, with per-slot delays.                                                                                    |
| `scrolly/attr-buffer.js`                                             | The dot buffer's layout (`STRIDE`, `EDGE_BASE`, `ATTR_SIZE`, `DELAY_SIZE`), the writers `set`/`setEdge`, and `dissolve`.                                                                                                                                               |
| `scrolly/trails.js`                                                  | Trail slots (`TRAIL_META`, `RACE_SLOT`, `SIM_SLOT`, …) and writers over a monotone-cubic curve (`monotoneSegments`, `curveYAt`, `clipSeries`, `sampleTrail`, `setTrail`, `setTrailPoints`, `collapseTrail`, `setTrailHighlight`).                                      |
| `scrolly/plot.js`, `palette.js`, `cast.js`                           | Plot geometry (`MARGIN`, `TITLE_BAND`, `plotBottom`, `lin`, `Bleed`); the canvas palette as rgb of the CSS tokens; who is who (named actors, `BY_RANK`, every chart's cast list).                                                                                      |
| `scrolly/rank-geometry.js`, `scatter-scales.js`, `intro-geometry.js` | The rank bar's dot lattice shared by canvas and HTML; the films scatters' shared scales and `parkHidden`; the intro constellation's fit and pull-back camera.                                                                                                          |
| `scrolly/sky.js`, `galaxy-highlight.js`                              | The sky's volume and flow (`flowSpot`, `fieldSpot`, `writeFieldCrowd`, `makeFlight`, `galaxyBox`) and its one live clock; the chapter card's highlight beat (`withGalaxyHighlight`).                                                                                   |
| `scrolly/nodes.js`                                                   | `makeNodes()` → `{ nodes, edges }` from `src/data/scrolly-nodes.json`; `ANCHOR_ID`, `INTRO_IDS`, `hash01(id, salt)` and `dotHash` — deterministic per-node randomness, never `Math.random`.                                                                            |
| `scrolly/layouts/*.js`                                               | One module per chart: `intro`, `hop-bands`, `chapters`, `rank`, `race`, `scatters`, `prediction`, `career`, `sim-race`. Each exports a `states` object; everything about one state is in its entry.                                                                    |
| `scrolly/states.js`                                                  | Merges every module's `states` into the registry and derives the per-state maps (`STATES`, `STATE_LABELS`, `STATE_PARAMS`, `STATE_ENTRIES`, `STATE_REQUESTS`, `STATE_AMBIENT`, `STATE_RACE`, …), `entryFor`, `isRankState`, `quizDone` and the typedefs below.         |
| `scrolly/layout-types.js`                                            | JSDoc only: `LayoutFn`, `LayoutResult`, `Tick`, `Note`, `TakeoverCallout`, `FutureBand`, `LegendItem`, `Hit`.                                                                                                                                                          |
| `scrolly/RankBars.svelte`, `PairQuiz`, `RaceScrubber`, `RouteFilms`  | The over-canvas panels (see "Panels").                                                                                                                                                                                                                                 |
| `scrolly/GuessRank.svelte`, `StartButton`                            | The step controls: they live in the step card, in the prose flow, under the sentence that asks for the press (see "Interactive steps").                                                                                                                                |
| `scrolly/dev/`                                                       | DEV only, dynamically imported by `Stage`: the race tuners (`RaceYBandDev`, `RacePxPerYearDev`, `RaceSpeedDev`) behind `Tuners.svelte`, writing `raceTuning` in `layouts/race.js` and bumping `tuning.rev` (`tuning.svelte.js`) so the visual drops its layout cache.  |
| `scrolly/__tests__/`                                                 | The vitest suite (see "Verify").                                                                                                                                                                                                                                       |
| `scripts/stale-checklist.js`                                         | Marks the tween checklist's rows stale from a diff (`npm run stale`), and checks them in the pre-commit gate.                                                                                                                                                          |

## Core contracts

### The buffers

All dot state is one flat `Float64Array(ATTR_SIZE)`: `STRIDE = 7` values per node
— `x, y, radius, r, g, b, alpha` — at `node.id * STRIDE`, then one group per edge
from `EDGE_BASE` (slot 0 = draw progress 0–1, slot 1 = alpha, slot 2 = highlight
0–1). Alpha carries visibility: hidden nodes get alpha 0 but still get
_positions_, so a later fade-in never teleports. Trails are a second buffer of
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
  a `PARAM_TWEEN_MS` tween;
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
  the arrival, so the legs never start. `labelsAfter` and `cardAfter` gate the
  names and the prose to a leg; `hold` waits for a story flag before the legs
  start (the rank handoff); `seed` shapes what the first frame shows;
  `ownsArrival` takes the rAF from the press with no arrival tween in front.
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
`popIn`, `snap`, `entry`, `state` or `params`. Who owns the rAF
(`choreo.active`) is deliberately not `$state`: the effect reacts to state,
params and canvas size only.

### Steps, the registry and the arrival rules

Every `<Step>`, `<Chapter>` and `<Splash>` registers `{ state, params?, panel?,
gate?, skipback?, advanceon?, hideBar?, chapter?, splash? }` in document order.
The registry resolves a move — `skipback` first, then the departing step's
`gate` on a forward move — and calls `prepareArrival({ to, from, forward, back })`
with the destination's state _before_ the step changes, so a component that
mounts with the step reads the right story at mount. `advance()` bypasses the
gate: it is how a gated step's own control lets the reader out. `hideBar`,
`dotSteps` and `dotStep` are what `StepProgress` renders; `story.entryHeld`
hides the bar while a choreography holds the prose. `step-registry.spec.js`
covers the moves.

### The story store

`story.svelte.js` is one `$state` object. Step controls and on-chart picks
write into its interaction groups; a state's `params` selector reads them; a
frame's `FrameOutput.story` publishes into them one group deep, each write
equality-checked (a write that changes nothing would still retarget the tweener).
The framework's own fields: `settled` names the STATE whose arrival has landed
(set-only — stepping away un-arms every gate on it by itself), `settledStep` the
STEP index, `entryHeld` holds a step's prose back, `request` is the reader's ask
and `running` the request in flight.

`settledStep` is the one almost everything that arrives with a step reads, via
`steps.held`: the chart furniture, the step's panel, its prose and the progress
bar. A state name cannot answer "has this step landed?", because six steps share
a state with their neighbour — both `hopBands` steps, both `raceRecent` steps,
both `simRace` steps and three of the five `scatterCenters` steps — so on the
second of any pair `settled` already reads that state before its arrival has
begun. It is written by `land()`, which fires when the dots reach their places:
a plain arrival's settle, an entry's arrival tween (its legs are the step's
authored reveal, and its prose describes them, so the words are not held for the
whole of a 4s sweep), the `cardAfter` beat where an entry declares one, and a
step change that moves nothing at all. `settled` keeps its state-scoped meaning
for the three readers that genuinely ask a state question: the actor tour, its
caption and the rank ladder's latch.

### Annotations and chart furniture

Labels and the pulse ring are HTML, glued to their dots each frame from the live
buffer (`trackLabels`); a name rides its dot's alpha and is stacked off its
neighbours by `createLabelStacker`. Every id a dynamic `labels` function can
return must be in `STATE_TRACKED`, or it has no element to render into.

The pulse ring is **one ring, played once on arrival** — not two rings repeating.
A target lock says "this one" and then stops; a ring that ripples forever is the
only thing still moving once the story is at rest, and ambient motion is the
sky's job alone (rule 9). A name whose TEXT changes crossfades with its own new
string on `--name-alpha`, a channel multiplied into the element's opacity against
the dot's live alpha — never a transition on `opacity` itself, which would
outrank the per-frame inline write for the length of the fade. A layout's
`axes`, `notes`, `legend`, `band` and `hits` are rendered in the overlay; the race
chart's per-frame furniture (the takeover callout, the future block) rides the
frame writer's return so it stays glued through a pan.

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
on. The rank guess (`GuessRank` → `advance()`), the race rewind (`StartButton
advance`), the pair quiz (the one gate the reader's own Next walks through, on
`quizDone`), the Gen Z draw-on and the simulation replay (both `advanceon` on the
field the run publishes). The progress bar merges a gated step and its payoff
into one dot. The arrival rules re-arm each of them on the way back in
(`arrivals.js`). The full agreement, with its history: `notes/design/interactions.md`.

Every one of those controls lives **in the step card**, in the prose flow under
the sentence that asks for the press — not over the canvas. So each insets
itself past the tap gutters with `padding-inline: var(--tap-gutter)`
(`GuessRank`, `StartButton`), which the gutters would otherwise cover; a
`z-index` lift is the other way out (`.bits-infoterm` in `Stage.svelte`) but
cannot escape a step wrapper that forms a stacking context. A control in the
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
22 for the band column of a dot that is off canvas when it leaves a chapter card.
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
— layouts park non-participants hidden, `parkHidden`). `scrolly-story.json`
carries the non-dot data: bucket totals, quiz pairs, race eras and series
(`raceSeries`, `genzSeries`, `backdropSeries`), careers, the 10,000 recorded
simulation runs and their winners. `data/top-250-hop-bands-with-hop-counts.csv`
(committed here, full-corpus) feeds `rankHopBands`; ranks are corpus-global, so
ranked layouts plot by sampled rank order, never by raw rank against
`nodes.length`.

## Rendering / mobile notes

- The canvas is dpr-scaled (capped at 2) via `ctx.setTransform`; a box change
  re-runs the layout with duration 0.
- `prefers-reduced-motion: reduce` forces every arrival to a jump, skips
  choreographies and ambients, and disables the overlay fades.
- `drawDots` buckets dots into one `Path2D` per quantised (rgb, alpha) pair, so
  ~12k dots are a handful of fills a frame; the sky's flight adds ~0.04ms.
- Beside the prose (≥ 1200px, `Stage`'s `beside`) the plot takes
  `PLOT_BOTTOM_BESIDE` of the column instead of `PLOT_BOTTOM_STACKED`, and the
  prose swaps sides on every chapter card (`notes/design/chapter-cards.md`).

## Known gaps

- Step prose overlays the bottom of the canvas below 1200px (`.scrolly-steps` in
  `Stage.svelte`); layouts keep essential marks out of it. The tap gutters run the
  full height, so any control in a step card must clear them: lift it to
  `--z-tap-above` (the inline InfoTerm triggers) or inset it by `--tap-gutter`
  (GuessRank's controls). A step card that grows can cover a layout's `hits`.
- A step's prose swaps sequentially rather than as a crossfade: 200ms out, a
  beat, 300ms in, both ends drifting 8px upward (`Step.svelte`). The two copies
  overlap in the DOM for that window, so
  `.scrolly-steps` is a single-cell grid — in normal flow the column would
  measure as tall as both steps at once and shove every clearance taken off
  `stepsHeight`.
- The canvas hop colours in `palette.js` are hard-coded rgb of the tokens in
  `src/styles/variables.css`.
- A `RequestAnim` cannot declare `cardAfter`, so a reader-started run cannot
  release its step's words at a leg boundary the way an entry can. It does not
  bite today — a request's prose has already landed before the reader presses —
  but it is the missing half of the pair, and `runLegs` already calls the same
  `onBeat` for both.

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
| `step-registry.spec.js`                                                                 | The wizard: document-order registration, gates, `skipback`, `advance`, the bar's dots, the move handed to the arrival rules.                                                                                                   |
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

# Scrolly visual framework

The story's visual is one canvas of 22,530 dots with stable identities that
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

| File                                                                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/Index.svelte`                                        | The story: the `<Splash>` and the `<Step>` list with its prose (Owen's), grouped into `<Chapter>`s, the panel snippets each step names, the intro tour and the credits. Creates the step registry and hands the steps to `Stage`.                                                                                                                                                                                                                                                                                                                                                  |
| `scrolly/Stage.svelte`                                               | The layout shell: the canvas box, the rank ladder's placement and fade-in latch, the active step's panel, the title card with its fade, the nav cue on step 0, the prose column, `StepProgress` and `TapNav`. Renders the steps as `children(layout)`.                                                                                                                                                                                                                                                                                                                             |
| `scrolly/step-registry.svelte.js`                                    | `createStepRegistry({ navigate })`: the wizard. Registrations in document order, the step index (kept in `?step=N`, dev only), `go`/`advance`/`skip`/`next`/`prev`/`exit`, gate (with `onnext`) and `skipback` resolution, the bar's `chapters`/`currentChapter`/`dotSteps`/`dotStep`, and the `advanceon` watcher.                                                                                                                                                                                                                                                                |
| `scrolly/arrivals.js`                                                | `prepareArrival(move)`: what a move does to the story before the destination renders — un-landing the beat, the rank panel's handoff, the reset on leaving the rank chapter backwards, and per-state arrival rules (the hop chart's anchor, quiz, simulation, Gen Z draw-on).                                                                                                                                                                                                                                                                                                      |
| `scrolly/arrival-marks.js`                                           | What a state change does to the dots before anything travels: `parkLeavers` (a dot the arriving state hides fades where it stands) and `restateHidden` (a dot the departing state hides, and the reader cannot see, is moved onto its hidden spot there).                                                                                                                                                                                                                                                                                                                          |
| `scrolly/story.svelte.js`                                            | The shared interaction state, grouped by interaction (`intro`, `hops`, `rank`, `race`, `quiz`, `search`, `sim`) under four framework fields (`settled`, `settledStep`, `request`, `running`); `request(kind)`, `resetSimRace()`, `resetGenzLines()`, `resetHopAnchor()`.                                                                                                                                                                                                                                                                                                           |
| `scrolly/Step.svelte`, `Chapter.svelte`, `Splash.svelte`             | `Step` and `Splash` register one step each with the `"scrolly-steps"` context in document order. `Step` renders its prose while active, under an sr-only `<h2>` of its chapter (the focus target on a step change), and a hidden copy of its card at all times (`CardMeasure.svelte`) for the plot geometry below; `Splash` renders nothing — `Stage` draws the title card from the registry so it can transition out. `Chapter` takes no step: it wraps a run of `<Step>`s and puts its `title` in the `"scrolly-chapter"` context, which each `Step` registers as `chapter`.     |
| `scrolly/TapNav.svelte`, `StepProgress.svelte`                       | The step driver (tap halves stacked, edge notches beside the prose, arrow keys always; all through `go()`) and the chapter progress bar (indicator only).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scrolly/ScrollyVisual.svelte`                                       | The canvas host: the two tweeners, the render effect (below), dpr scaling, resize and bleed, reduced motion, the HTML overlay and annotation layer, the scrub loop and the request player.                                                                                                                                                                                                                                                                                                                                                                                         |
| `scrolly/render.js`                                                  | One frame of the buffers onto a 2D context: `clearCanvas`, `drawTrails`, `drawEdges`, `drawDots`, `drawLabelLeaders`. Pure over (ctx, buffers).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scrolly/annotations.js`                                             | The annotation layer's per-frame decisions: `raceLabelCut`, `trackLabels`, `createLabelFreezer` (below), `createLabelStacker`, `sameSides`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `scrolly/choreographer.js`                                           | `createChoreographer({ ease, loop, onStop })`: the one owner of the choreography, ticking on the shared frame loop — `phase`, `loop`, `legs`, `stop`, `active`. Knows nothing about states.                                                                                                                                                                                                                                                                                                                                                                                        |
| `scrolly/race-camera.js`                                             | `createRaceCamera(story)`: the race chapter's live camera, its `reset` on a state change, `publish` of the pan bounds (`story.race.cam`), the `hold` a settled chart rests at (`story.race.view`) and the reader's `glide`.                                                                                                                                                                                                                                                                                                                                                        |
| `scrolly/tween.js`                                                   | `createFrameLoop(draw)`: the one rAF every writer shares — both tweeners, the choreographer and the label relax — running each frame's ticks, then drawing once (a tween's `onDone` runs before that draw). `createTweener(size, loop, stride, fadeOffset)` → `{ current, target, to, stop, reframe }`: a tick on that loop lerping a flat buffer from the currently rendered values to a target, with per-slot delays, and — for a curved arrival — per-group `bows` that bend a group's x, y onto a cubic Bézier with the same endpoints, sweeping in at the end (`writeGroup`). |
| `scrolly/attr-buffer.js`                                             | The dot buffer's layout (`STRIDE`, `EDGE_BASE`, `ATTR_SIZE`, `DELAY_SIZE`, `BOW_SIZE`), the writers `set`/`setEdge`, and `dissolve`.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scrolly/drain.js`                                                   | The curved state tween's bows (motion.md rule 15): `bowsInto(live, target, w, h, sizeOf?, hand?)` — one bow per node, across its chord to one side of its heading (`RIGHT`/`LEFT`), `LEAN_CAP`/`LEAN_SHARE` — and `drain(hand)`, the plain drain a state's `curve` names.                                                                                                                                                                                                                                                                                                          |
| `scrolly/trails.js`                                                  | Trail slots (`TRAIL_META`, `RACE_SLOT`, `SIM_SLOT`, …) and writers over a monotone-cubic curve (`monotoneSegments`, `curveYAt`, `clipSeries`, `sampleTrail`, `setTrail`, `setTrailPoints`, `collapseTrail`, `setTrailHighlight`).                                                                                                                                                                                                                                                                                                                                                  |
| `scrolly/plot.js`, `palette.js`, `cast.js`                           | Plot geometry (`MARGIN`, `TITLE_BAND`, `plotBottom`, `plotTop`, the measured `PlotGeometry`, `lin`, `Bleed`); the canvas palette (the `mark.*` tokens as rgb, from `$styles/tokens.js`); who is who (named actors, `BY_RANK`, every chart's cast list).                                                                                                                                                                                                                                                                                                                            |
| `scrolly/rank-geometry.js`, `scatter-scales.js`, `intro-geometry.js` | The rank bar's dot lattice shared by canvas and HTML; the films scatters' shared scales (`scatterPosition`, `scatterY`, and `avgDistanceOf`, the remoteness the race's frontier column stands the crowd at); the intro constellation's fit and pull-back camera.                                                                                                                                                                                                                                                                                                                   |
| `scrolly/sky.js`, `galaxy-highlight.js`                              | The sky's volume and flow (`flowSpot`, `flowHeading`, `fieldSpot`, `writeFieldCrowd`, `makeFlight`, `galaxyBox`) and its one live clock; the title card's highlight beat (`withGalaxyHighlight`).                                                                                                                                                                                                                                                                                                                                                                                  |
| `scrolly/nodes.js`                                                   | `makeNodes()` → `{ nodes, edges }` from `src/data/scrolly-nodes.json`; `ANCHOR_ID`, `INTRO_IDS`, `hash01(id, salt)` and `dotHash` — deterministic per-node randomness, never `Math.random`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `scrolly/layouts/*.js`                                               | One module per chart: `intro` (`networkIntro` — the constellation, two steps on it), `hop-bands` (`hopSeed`, `titleGalaxy` — the title card's sky, hopSeed's carried on — `hopBands` and `hopAnchor`, the cycling anchor), `rank`, `race`, `scatters`, `career`, `sim-race`. Each exports a `states` object; everything about one state is in its entry.                                                                                                                                                                                                                           |
| `scrolly/states.js`                                                  | Merges every module's `states` into the registry and derives the per-state maps (`STATES`, `STATE_LABELS`, `STATE_PARAMS`, `STATE_ENTRIES`, `STATE_CURVE`, `STATE_REQUESTS`, `STATE_AMBIENT`, `STATE_RACE`, …), `entryFor`, `curveFor`, `isRankState`, `quizDone` and the typedefs below.                                                                                                                                                                                                                                                                                          |
| `scrolly/layout-types.js`                                            | JSDoc only: `LayoutFn`, `LayoutResult`, `Tick`, `Note`, `RaceCallout`, `FutureBand`, `LegendItem`, `Hit`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scrolly/RankBars.svelte`, `RaceScrubber`, `RouteFilms`              | The over-canvas panels (see "Panels").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scrolly/GuessRank.svelte`, `StartButton`, `PairQuiz`, `ActorSearch` | The step controls: they live in the step card, in the prose flow, under the sentence that asks for the press (see "Interactive steps"). `PairQuiz` and `ActorSearch` also fly an element out of the card onto the canvas, off `layout.visual`'s `locate()`.                                                                                                                                                                                                                                                                                                                        |
| `scrolly/fly-to-dot.js`                                              | That flight, shared: `flyToDot({ el, rect, target, fill })` plus its beats (`MARK_MS`, `FLIGHT_MS`, `HOLD_MS`) and `prefersReducedMotion()`. WAAPI over a transform off the element's own box, so nothing leaves flow and the card's height never moves.                                                                                                                                                                                                                                                                                                                           |
| `scrolly/search.js`                                                  | The actor search's index: `SEARCH_POOL` (the recognisable actors plus the story's own cast, narrowed at build time to whoever also has a `rankHopBands` breakdown — the one pool all four searchable steps, including the hop chart's anchors, share), `RANK_POOL` (the ranked 250 — the rank guess's own, narrower pool, since that's all `RankBars` renders a row for), `searchActors`, and the one highlight rule the three searchable layouts share (`SEARCH_RGB`, `searchedId`, `withSearchLabel`, `withSearchParams`).                                                       |
| `scrolly/__tests__/`                                                 | The vitest suite (see "Verify").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scripts/stale-checklist.js`                                         | Marks the tween checklist's rows stale from a diff (`npm run stale`), and checks them in the pre-commit gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### The plot geometry, in one paragraph

Each chart group (`plot` in a state's entry, or `card` for the three groups
with no axes: `intro`, `rank`, `hops`; `STATE_GROUP` in `states.js`) draws to
a floor and a top the DOM measured, never to a constant. Every step draws its
card a second time, hidden, at the stacked card's width (`CardMeasure`), and
`Stage` takes the tallest per group, capped at half the layout (the card's own
`max-height`, past which it scrolls) and plus the tour caption's band on the
opening, as the group's `reserves`. `ScrollyVisual` measures every chart
title the same way, against one line at the default type size, as `titles`.
Both go to `plot.js` through `setPlotGeometry` before anything builds a layout;
the stacked floor is `h - reserve - AXIS_ROOM` and the top is `MARGIN` plus the
group's title overrun. Nothing draws until both are in (after the web fonts),
and a later change — a width, the reader's text size — is a resize, so the
canvas snaps. Because every state in a group reads the group's numbers, a step
change inside a group never moves its plot (motion.md rule 7);
`contracts.spec.js` holds each plot state to its group's floor and top.

### The race chart, in one paragraph

x is a fixed `RACE_PX_PER_YEAR` on every step and viewport, so every visible
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
steps the reader's Next presses Start (`onnext`), and on each quiz it skips. The
rank guess (`GuessRank` → `advance()`, Skip included), the race rewind (its
press advances), the pair quiz (the one gate the reader's own Next walks
through, on `quizDone`; before that, Next → `skip()`), the Gen Z draw-on and the simulation
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
   furniture it needs. Place every dot it hides as deliberately as the ones it
   draws (see "Hidden spots"): inside the canvas, where the step either side
   should bring it on from. An entry's frames must place them the same way, or
   its last leg will not land on the layout.
2. Add one entry to the module's `states` object:
   `foo: { layout: layoutFoo, labels?, params?, revealFrom?, entry?, curve?, requests?, ambient?, overlay? }`.
   A new module is spread into the registry in `states.js`.
3. Use it: `<Step state="foo"><p>…</p></Step>` in `Index.svelte`.
4. `npx vitest run -u` writes its golden; add a row to `notes/tween-checklist.md`
   and run `npm run stale` for its neighbours. The hidden-spots walk in
   `contracts.spec.js` picks the new step up from `Index.svelte` and fails on
   any dot it brings in from off the canvas.

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
— a layout hides a dot it has no metric for, on its designed hidden spot). `scrolly-nodes.json` also carries `searchPool` (the actors the search offers:
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
  the whole crowd is a handful of fills a frame, and a dot wholly outside the
  cleared rectangle (`view`) is never added to a path. Measurements:
  `notes/perf/mobile-perf-review.md`.
- Beside the prose (≥ 1200px, `Stage`'s `beside`) the plot takes
  `PLOT_BOTTOM_BESIDE` of the column instead of its group's measured reserve, and the
  prose holds a column of its own on the left for the whole story
  (`notes/design/side-by-side.md`).

## Known gaps

- Step prose overlays the bottom of the canvas below 1200px (`.scrolly-steps` in
  `Stage.svelte`); every plot group's floor stops above the tallest of its
  cards (the measured reserve, above), so no chart text lies under the prose.
  Over the hop bands (`proseOver`) the prose lies over the chart by design, on
  its frosted plate: at 375 step 5's two paragraphs still cover the 1- and
  2-movie band labels. The tap halves cover
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
- The canvas colours in `palette.js` are the `mark.*` role tokens, generated
  as rgb into `src/styles/tokens.js` by `npm run style` (see
  `notes/design/tokens.md`).
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
svelte-check over `jsconfig.json`, vitest, and the rendered contrast scan
(`npm run a11y`). The pre-commit hook runs the same through lint-staged, minus
the contrast scan, plus `scripts/stale-checklist.js --check`.

The suite under `src/components/scrolly/__tests__/`, by contract:

| Spec                                                                                    | Asserts                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `goldens.spec.js`                                                                       | A content hash of every state's layout at three canvas boxes and every interaction override, as snapshots. A refactor keeps every hash; an intentional change regenerates its golden in the same commit (`npx vitest run -u`). |
| `contracts.spec.js`                                                                     | An entry's last leg, a request's last leg and an ambient at t = 0 reproduce the layout they hand off to; a race step's resting frame is a fixed point of its writer; the simulation replay's frames are the settled layouts.   |
| `registry.spec.js`                                                                      | The state registry's invariants: every state has a layout, every `revealFrom` and `curve.from` names a state, every dynamic label id is tracked, …                                                                             |
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

# Scrolly visual framework (object-constancy PoC)

Status as of 2026-07-05: all storyboard visuals implemented end-to-end on real
data (28 steps, 20 states across Present/Past/Future) and awaiting Owen's
review pass. This documents the framework in `src/components/scrolly/` so a
fresh session (or collaborator) can pick it up.

> **Naming note (2026-07-12, revised 2026-09-10).** The story is no longer
> scroll-driven: the Scrolly mechanism was replaced by a step index the reader
> advances themselves. That driver was briefly a prev/next Wizard; it is now
> **`scrolly/TapNav.svelte`** — tap gutters at the far left and right edges,
> plus ArrowLeft/ArrowRight — with **`scrolly/StepProgress.svelte`** showing
> position as a chapter-segmented dot bar. Only the mechanism setting the
> active step has ever changed; the visual framework below is driven purely by
> that index. The "scrolly" in folder/file/context names is historical and kept
> to avoid churn.

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

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/nodes.js`             | Real data: `makeNodes()` → `{ nodes, edges }` decoded from `src/data/scrolly-nodes.json` (built by `npm run scrolly-data`). 22,530 `ActorNode`s (`id, pid, name, hop, films, avgDistance, rank`); node 0 is the anchor (Kevin Bacon), ids 0–14 are the curated intro network in reveal order (`INTRO_IDS`), edges are the 18 intro edges (`[sourceId, targetId, [[title, year], …]]` — **every** corpus film linking the pair, newest first; two of the eighteen have more than one). Also exports `ANCHOR_ID`, `INTRO_LAYOUT` (baked 860×680 planar intro coords) and `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders).                                             |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/components/scrolly/layout-shared.js`     | Geometry/color constants, attr/trail helpers (`set`, `setEdge`, `setTrail`, `collapseTrail`, `clipSeries`), named-actor id lookups (`SLJ`, `HANKS`, …), and the `LayoutFn`/`LayoutResult`/`Note`/`Tick` JSDoc typedefs — everything shared across more than one chapter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/scrolly/galaxy-highlight.js`  | The chapter card's highlight beat: `withGalaxyHighlight(frames)` wraps a galaxy state's flight so that every `GALAXY_BEAT_MS` one prolific actor is inked, named and fanned with spokes. Owns the derived `GALAXY_CAST`, the beat schedule, the visibility gate that decides who can be lit, and the published `galaxyHighlight` / `galaxyLinks` the annotation layer and `edgeEnds` read. Draws nothing itself — the spokes rent the attr array's edge pool.                                                                                                                                                                                                                                                                                         |
| `src/components/scrolly/layouts/*.js`         | One module per story chapter (`intro`, `hop-bands`, `chapters`, `rank`, `race`, `scatters`, `prediction`, `career`, `sim-race`, `genz-line`). Each exports a `states` object mapping state key → `{ layout, labels?, params?, pulse?, revealFrom?, entry?, overlay? }` (`revealFrom` scopes the layout's `delays` choreography to specific prior states — arriving from any other state is one plain tween) — everything about one state colocated in one object, instead of spread across parallel top-level maps.                                                                                                                                                                                                                                   |
| `src/components/scrolly/states.js`            | Thin aggregator: merges every chapter's `states` object into one registry and derives the public `STATES`/`STATE_LABELS`/`STATE_PARAMS`/`STATE_PULSE`/`OVERLAYS` exports from it, plus `STATE_TRACKED`, `INTERACTIVE_IDS`, and the `nodeName`/`nodeRank`/`nodeAvgDistance` lookups. This is still the only module other files import from.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/components/scrolly/Step.svelte`          | One story step: prose in the slot, visual state declared on the tag (`<Step state="lone">…</Step>`). Calls `register({ state, params, panel, gate, skipback, advanceon })` in document order on the `"scrolly-steps"` context provided by `Index.svelte`; renders its prose only while active — no hand-numbered step indices anywhere. `panel` is an optional snippet rendered over the canvas while the step is active (see "Exception" under interaction patterns); the last three gate the step (see "Required: interaction / drop-off points").                                                                                                                                                                                                  |
| `src/components/scrolly/Chapter.svelte`       | A chapter card: a step whose whole content is a title (`<Chapter state="chapterCenters" title="…" />`). Registers `{ state, chapter: { title } }` the same way, but renders **nothing** — see "Chapter cards" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/components/scrolly/Splash.svelte`        | The title card: step 0, the piece's name and one line of how-to-move over the same sky the chapter cards rest on (`<Splash state="titleGalaxy">` with `title` / `cta` snippets). Registers `{ state, hideBar, splash: { title, cta } }` and renders **nothing**, for the same reason `Chapter.svelte` does not — see "Title card" below.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/scrolly/TapNav.svelte`        | The step driver: two tap gutters running the full height of the layout at its far edges, plus ArrowLeft/ArrowRight. Both call `go()` on the `"scrolly-steps"` context, so a tap gets exactly what a key does: the gated steps' refusal, the backward skip past them, and everything `navigate()` prepares on arrival. The next gutter is disabled while the active step's gate is shut. Gutters rather than a full-bleed tap split because the middle of the canvas carries the story's own interactions; anything that must stay tappable _through_ a gutter is lifted to `--z-tap-above` (the ladder is commented on `.scrolly-layout`). They carry no arrow or marking — the press tint is the only feedback, so nothing competes with the charts. |
| `src/components/scrolly/StepProgress.svelte`  | Position, as one dot per beat with the chapters divided by a hairline tick. A beat is not always a step: chapter cards claim no dot, and a gated interaction step shares its payoff's dot (`dotSteps` / `dotStep` on the registry). Indicator only — it takes no pointer events, so a tap over it falls through to the gutter beneath; jumping would land a reader past the gated steps. Segments derive from any registered step carrying a `chapter`, so adding a step or a chapter re-segments the bar with no edit.                                                                                                                                                                                                                               |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
`{ state: string, params?: Object, panel?: Snippet, gate?: () => boolean,
skipback?: boolean, advanceon?: () => boolean }` per step (a `<Chapter>`
registers `{ state, chapter: { title } }` the same way). `Index.svelte` passes the
active step's `state` and `params` to `ScrollyVisual`; the props are
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
itself into degrees of separation. The determinism still holds, because the sky's
flow is a pure function of the clock and the bands read that clock rather than
guessing where it left the crowd (`departureColumn`, see "Chapter cards").
Letting a crowd fly in is only a problem when where it flies from is arbitrary.

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
and the join moves nothing. Hold it by construction rather than by review — the
galaxy's static layouts are literally the flow at t = 0 (`fieldSpot` is
`flowSpot` with the clock at zero), so `makeFlight`'s first tick recomputes the
frame it is joining rather than nudging it.

The writer is handed the same arguments a layout call takes — `nodes, w, h,
edges, params, bleed` — precisely because rebuilding its own static layout is the
normal way to get that base, and any argument it rebuilt with a different value
would give it a different frame from the one the arrival landed on. (`EntryAnim`
takes no `edges`: a leg authors its frames from scratch rather than offsetting
one.)

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

**A re-run that changes nothing must DO nothing, and the render effect gets those
runs.** `layoutParams` is a `$derived` over the `story` proxy, and every arrival
branch paints synchronously — a `to()` with `ms 0` calls `draw()` on the spot —
so a paint that publishes into `story` invalidates that derived and hands the
effect back a params object with identical CONTENTS and a fresh identity. Svelte
re-runs on identity; `paramsKey` compares by value and rightly reports no change.

Without a guard, such a run falls the whole way down the arrival chain to its
final `else`, whose instant `to(attrs, 0)` cancels whatever tween is in flight
and, per `tween.js`, drops its `onDone` with it. On a COLD START that `onDone` is
the only call to `settle()` — so the 900ms entry tween was snapped away
microseconds after it started: no fade-up, the ambient never armed, and every
`story.settled` gate stayed shut. The story opened on a still, silent sky, and it
only became visible when the title card became the first step to own an ambient.

The guard sits just after `paramsKey`, so a no-op run also skips building a
layout it will not use. It has to carry `cacheDropped`: the two DEV revision
counters clear the layout cache and then need a rebuild at the SAME state, params
and box, so a bare "nothing changed" test would freeze both dev tuners. The
`sweeping` guard above it is the same intent but can only arm once a choreography
owns the rAF, which is too late for an arrival that is still tweening.

**A note on measuring this.** It cannot be verified with Chrome's
`--virtual-time-budget`: rAF timestamps there advance at a real ~17ms cadence
while virtual time races ahead, so no rAF-driven tween ever reaches its duration
and `settle` never fires in that harness whether the bug is present or not. The
clobber itself is what to test — instrument the final `else` and check it is not
reached on the second run — or test in a real browser.

The galaxy states are the only users, and they share one writer: `makeFlight`
(`layout-shared.js`) takes a state's own layout function and the ids to fly
and returns its `frames`. `chapterCenters` flies the crowd **and** the intro
fifteen, who have stopped being a diagram by then; `hopSeed` and `outro` fly
`FIELD_IDS` only, because `hopSeed` is still drawing the constellation as
something to find Bacon in and a diagram that drifts is not one — and holding it
still leaves it standing in front of a sky with parallax, the one place in the
story the constellation reads as foreground. Both of those also have an `entry`
leg — the ambient starts when the pull-back settles, because `settle()` is the
common terminus of both paths.

**The flight is a flow, not a displacement**, and that is the one way it departs
from the shape everything else here has. The sky is a volume and the camera moves
forward through it forever: a dot enters at the far plane, is carried outward
from the vanishing point by `SKY_FAR / z` as it comes toward the reader, growing
and darkening, passes the camera and enters again. That is what reads as flying
THROUGH something — a bounded lateral sway gives parallax, but nothing ever comes
past you, and it reads as looking around rather than travelling. It stays a
writer into the flat buffer, so tweening, object constancy, labels, edges,
culling and bucketing are all untouched and every non-galaxy state is unaffected
— `PULLBACK_ZOOM` was already a fake camera (a scalar scaling positions about
Bacon), and this is a real one beside it.

Everything about the flow is a pure function of `(id, t)` — `skyFrac`,
`entrySpot`, `flowSpot` — and it has to be, because two very different things
read it: the per-frame writer, and the layouts, which are the flow at t = 0 and
(for `hopBands`) at whatever t the reader stepped away on. One definition, two
readers.

Three things worth knowing before touching it:

- **The wrap is the only seam**, and it is hidden twice over: `flightWindow`
  takes a dot to nothing at both ends of its trip, and a dot at the near plane is
  four times further out than it entered, so most wraps happen off the canvas
  anyway. The window is applied to the static field as well, or the loop's first
  tick would brighten every dot that is mid-fade.
- **The field is stationary, and that is a property to preserve.** Phases are
  uniform, so the ensemble looks the same at every t: measured over three
  minutes, the on-canvas population holds within 2% and the centre-to-edge
  density within 5%. A naive recycle — wrapping a dot's depth without re-drawing
  its entry spot — is not stationary, and doubles the on-canvas count mid-cycle.
  Check it numerically after changing any of this; it is invisible in a single
  frame and obvious in motion.
- **`GALAXY_SPREAD` is an entry box, not the sky's extent.** The flow carries a
  dot out by up to `SKY_FAR / SKY_NEAR`, which spreads the crowd about half again
  on average, so the spread that leaves the right share of it off screen is much
  lower than the flat field's was. Retune it against the on-canvas count, not by
  eye on one frame.

Size and alpha both follow depth every frame, on the same square-root law, so one
`Math.sqrt` serves the pair — a thing coming toward you grows and darkens
together, and splitting the two laws makes it read as swelling instead. Entry
spots are re-drawn only on the frames a dot actually wraps, a few hundred hashes
a second rather than twelve thousand a frame; the whole writer costs 0.04ms a
frame on a desktop for 12,097 dots.

One renderer rule follows from this. `drawScene` draws a live edge's far endpoint
at its **target** position, so a line points where its actor is going and the
actor slides onto it. That target is the **tweener's** target (`tweener.target`,
the last frame handed to `to()`), not the state's static layout: a choreography
arrives onto its own frame 0 first, and through that arrival the static layout is
not where the dots are heading — aim at it and every link detaches from its dots.
While the choreography itself owns the frame (`sweeping`) it writes positions
straight into `current` and its target is stale, so edges track both **live** dots.

**The chapter card's highlight beat** (`galaxy-highlight.js`) rides on that last
sentence. Every `GALAXY_BEAT_MS` the card picks one prolific actor out of the
flowing crowd, inks and enlarges them, names them, and fans spokes from them
across the sky — more spokes for more films. It is an **illustration**: there is
no corpus co-star graph in this repo (the data carries eighteen baked edges, all
inside the intro constellation), so the spokes go to arbitrary dots and claim
nothing but the count. `withGalaxyHighlight(frames)` wraps the state's flight.

Four things are worth knowing before touching it.

**It is a function of the flight's clock, not a timer.** A `setInterval` writing
`story` — the way step 1's actor tour drives itself — cannot work here: the render
effect's `sweeping` guard returns early on a param change while an ambient loop
owns the frame, so nothing would move, and `sweeping` must not become `$state`
(above). The ambient writer already holds the rAF, the buffers and an elapsed
`t`, so the beat index is just `Math.floor(t / GALAXY_BEAT_MS)`. The t = 0
contract then holds by construction, because the beat's envelope opens at zero:
the card arrives anonymous, which is exactly what its static layout draws.

**Spokes rent edge slots.** `GALAXY_LINK_MAX` spare groups sit past the baked
edges in the attr array (`GALAXY_LINK_BASE` is the first), and `galaxyLinks.ends`
is their endpoint table, mutated per beat — `edgeEnds` in ScrollyVisual holds
those very arrays. So spokes are drawn by the same loop as the constellation's
links, with its progress draw-on, its alpha, its grey, and its habit of reading
both endpoints out of the live buffer, which is what makes them follow dots that
are moving. No second line-drawing path exists, and a departing card fades the
pool out through the ordinary state tween, since every other layout leaves those
slots at zero.

**The name is a per-frame label cut**, beside `raceLabelCut`. `chapterCenters`
declares `labels: () => []` — the resting card names nobody — and the cast goes in
`STATE_TRACKED`, so each has a label element. `drawScene` then reads the
published `galaxyHighlight.id` and shows that one. The name needs no opacity
plumbing of its own because a label already rides its dot's alpha, which the beat
raises; and it tracks the dot across the sky because `tracked` is rebuilt from
the buffer every frame. `stopSweep` clears the published beat, or a name would
outlive the flight that was showing it.

**Nothing may repeat, and that is not a nicety.** Eligibility persists: an
actor's usable window is ~13s against a 5s beat, so a well-placed actor stays
well-placed for two or three beats running. Take the first eligible one from a
start index that merely advances by one — the first build did — and the same
person is picked over and over; a reader really does get John Cusack three times
in a row, which reads as broken rather than as random. The start index is
therefore hashed per beat, and the last `GALAXY_NO_REPEAT` focuses are excluded
outright. The hash alone is not enough, because with only a few candidates a
random start still lands on one of the same few; the exclusion is what
guarantees a new face. It costs candidates, and so silence — see below.

**Who can be lit is a much narrower question than it looks**, and it is what
sizes `GALAXY_CAST_N`. A dot has to hold its place for the whole beat: inside the
flight's entry/exit window (or it fades or wraps mid-beat), and inside the frame
at both ends of the beat — which is checkable exactly rather than sampled,
because the flow is radial about `galaxyCentre`, so a dot's beat-end position is
its current one scaled by `beatGrowth`. A rectangle plus a straight radial
segment means both endpoints inside puts the whole trip inside. The **focus** is
held to the reading column, not the bled canvas, because its name is HTML in
`.annotations` (`inset: 0`, `overflow: hidden`) and a name belonging to a dot out
in the bleed is clipped away — while **targets** only have to hold the canvas,
which is most of what lets a spoke cross the whole frame. The flow spends most of
a trip carrying a dot past the column, so a given actor qualifies only ~4% of the
time. Ninety candidates bring the share of beats that find nobody to ~3% on a
desktop against the gate alone, and ~6% once the no-repeat window has taken its
cut (~1% on a phone, where there is no bleed and the column is the canvas). A
beat with no actor draws nothing, and that is a real answer rather than a
failure — there is deliberately no second-choice actor, because a name the reader
cannot see is worse than no name, and a quiet beat is only the card as it was
before any of this existed.

**What the beat weights is nodes, not lines.** The spokes stay the plain network
grey — `setEdge`'s highlight channel is left at zero on purpose, because a fan of
dozens of weighted lines becomes a black web over a chapter title. The emphasis
goes on the dots instead, in three tiers: the focus at full ink, opaque and
`GALAXY_FOCUS_R_MULT` times its flight radius; its connected dots part-way to ink
(`GALAXY_TARGET_INK`) at `GALAXY_TARGET_ALPHA`, deliberately unnamed, and
deliberately **the same size as they already were**; and the crowd as it was.
Measured mid-beat that reads as rgb 34 / rgb 156 / rgb 187 at alphas 1.0 / 0.75 /
~0.3, with the connected dots' radii sitting inside the crowd's own range.

Leaving a target's radius alone is the rule worth keeping, not a matter of taste:
radius is how this sky says DEPTH. `depthSize` spreads the crowd's radius by each
dot's own distance, so a dot swollen for being connected is a dot lying about
where it stands, and a whole fan of them pulls the volume flat exactly where the
beat is trying to show it off. Only the focus is exempt, because there is one of
it and it is the thing being pointed at.

Alpha is nudged relative to whatever the flight just wrote, which is safe because
the flight rewrites it every frame. **Colour is not**, and it is the one channel
with a bookkeeping cost: nothing resets a target's colour per
frame, so it is written absolutely from the constants (a relative blend would
darken the same dot again every tick until it went black), and the outgoing
targets are handed back to the crowd's grey on each beat change — the cast has a
standing per-frame reset, but a spoke's far end can be any dot in the sky.

**The fan draws at the speed of a crow flying through the volume** — one speed,
not one duration, and over REAL distance rather than screen distance. This is the
part that makes the sky's depth legible, so it is worth being precise about.

Three candidates, in the order they were tried. A shared 0–1 progress makes long
lines travel faster so they all land together, which reads as the fan being
inflated. A constant rate over screen distance fixes that but still flattens the
sky, because it treats a dot that merely _looks_ close as close. A constant rate
over the distance _through the volume_ is the one that says out loud what the
projection cannot: a spoke reaching from the near plane to the far one takes its
time however short it looks, and two dots that are genuinely neighbours are
joined at once even when the camera has flung them to opposite sides of the
frame.

`worldSpot` recovers those real positions. The flow is a perspective projection —
screen offset is lateral offset times `SKY_FAR / z` — so dividing that back out
gives the lateral offset, which is fixed for a dot's whole trip since it flies
straight at the camera, and the trip fraction gives the depth. All three axes end
up in entry-plane pixels. The consequence to hold on to is that **screen distance
stops predicting draw time**: two dots at the near plane on opposite sides of the
frame are only a quarter as far apart as two that look equally separated at the
far plane, because at four times the distance the same angular gap spans four
times as much. Measured, draw time correlates 0.9998 with real distance and only
0.52 with screen distance.

`GALAXY_DEPTH_SPAN` is the exchange rate between "far away" and "off to one
side" — effectively the camera's focal length, and the knob for how hard depth
bites. `GALAXY_DRAW_WIDTHS_PER_S` is the rate itself, given as a share of the
sky's width per second rather than in px/ms so that it means the same thing on
every viewport; the volume is about a third the width of a phone's frame, so a
fixed px rate would draw the same fan twice as fast there. Each spoke's length is
fixed at the moment its beat begins rather than re-measured as the flow pulls the
ends apart, which is what keeps every ramp monotone.

Everything the beat writes is scaled by its envelope, which is what leaves **no**
trace at e = 0: a constant anywhere in here — an alpha, a highlight, a colour —
puts a value into the resting frame that the static layout does not produce, and
the t = 0 contract is byte equality on the edge region rather than a claim about
pixels.

Measured, since none of it shows in one frame: the t = 0 contract lands at one
Float32 ULP for all three galaxy states with the edge region bit-identical; over
900 beats per card, on both a desktop and a phone viewport, there is not one
back-to-back repeat, not one repeat within four beats, and all ninety of the cast
get a turn; no focus is ever off canvas or faded, no spoke ever loses an end, no
target repeats within a fan, and spoke counts stay inside `[GALAXY_SPOKES_MIN,
GALAXY_LINK_MAX]`; 60,657 simulated strokes carry no non-finite coordinate, no
endpoint that is not a real node, and none rooted anywhere but the named actor;
after 200 beats not one dot in the field is left holding ink it was lent as a
spoke's far end; no spoke's draw progress ever goes backwards across a beat
(20,000 samples); the field is still stationary at 2,396–2,509 dots on canvas;
and flight plus beat costs 0.088ms a frame against the flight's own 0.04ms.

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
`raceFull`/`raceFuture` (avg-distance-by-year race; the first two are
fixed-scale cameras, the last runs forward to the present and opens a fitted
strip of future beside it, see below) · `raceGenz` (that same chart, a chapter
later, with the camera panned DOWN off the crown onto the stretch of remoteness
the Gen Z field lives on, and their 99 trajectories drawn in when the reader asks
— see below) · `raceClose` (the story's last chart: the same future view again,
its window widened to hold the crown and the field at once, with projected
segments drawn OUT on the strip — see below) ·
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
(76) pixels per year on every race step and every viewport — it never fits a
domain to the plot width, so nothing zooms and every visible year carries its
own label — in two digits, chapter-wide (`raceTickLabel`). That holds for every
year the DATA covers; past it, raceFuture's future strip is fitted instead (see
below), and it is the one exception. Each step therefore holds more years than fit on screen and is a
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

`raceWindowYFit(camLeft, camRight)` is the whole rule, and it has two regimes:
the **fixed window** from 2004 on (two constants — see below), and the camera fit
`raceCameraYFit` behind it, where the **top** of the plot is the record's low
point over the years on screen, the **bottom** is that same record at the
camera's right edge plus the band `raceBandAt` gives that year, and both ends are
padded by `RACE_Y_PAD` (12% of the plot's height, floored at `RACE_Y_PAD_MIN`).
`writeRaceSweepFrame` calls it with its own camera, so:

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

**The band is a curve over 1980–2004**, held as seven control points in
`RACE_Y_BAND_POINTS` and read through `raceBandAt`, which runs them through the
same monotone cubic (`monotoneSegments`/`curveYAt`) the chart's own lines use. Two
things follow from that shape. It is continuous in `year` for free, which the axis
needs for exactly the reason `raceAnchorAt` is interpolated. And it is EDITABLE: a
decade moves when one handle moves, which a value-per-year table isn't. It starts
at 1980 because that is the earliest year a camera can rest on
(`raceFloorPlayhead` clamps every step, and the band is read at the right edge
only) and stops at 2004 because that is where the fixed window takes over.

A _count_ of lines cannot do this job, which is what the band used to be
(`RACE_Y_LINES = 6`, guarded by a min and max): the field's density around the
record changes completely across the chapter — 0.068 of avg-distance puts three
lines on the plot in 1980, where the crown ran clear of a sparse field, and
twenty-four in the mid-2000s, where a dozen actors were trading hundredths.
Fitting to a count therefore tracked the crowd's noise rather than the story, and
made the plot breathe on every pan. The points are drawn by eye against the live
chart instead.

**The fixed window (2004 → the present) is PRD P-08-1.** Every camera whose right
edge sits at `RACE_Y_FIXED_FROM` or later is drawn on two constants —
`RACE_Y_FIXED_MIN` 2.05 at the top, `RACE_Y_FIXED_MAX` 2.2 at the bottom, taken
as the domain verbatim with no `RACE_Y_PAD` — so the axis on raceRecent and
raceFuture does not move at all. That is the point: raceRecent's rewind is the
chapter's one animated camera, and the fit cannot hold still through it at any
band height, because the record the fit hangs off falls 0.05 across those years,
57% of a plot. `RACE_RECENT_EXTENT` reads `RACE_Y_FIXED_FROM` for its own first
year, so the step's whole camera range is inside the window by construction.

What the window costs is the top of the plot: the record's best year inside it is
2.0839, so ~23% of the plot is always empty above the crown, and at the 2006 end
the crown rides 57% of the way down with the field spread under it (21 lines on
scale at 2006, 29 at 2025, all ten names on scale at every camera). That trade is
the one dial — `RaceYBandDev`'s "min y" slider moves the top edge live through
`setRaceDevFixedYMin` and touches nothing else. The takeover ring sinks to 60%
down the plot with it, which is what pushes its note (always below the ring, see
`raceTakeoverCallout`) onto the axis row on a landscape phone; accepted for now.

Below the window the fit takes back over, **ramped** over
`RACE_Y_FIXED_FADE`–`RACE_Y_FIXED_FROM` (2000–2004) rather than switched, because
raceFull's entry pans from 2006 back through 2004 to ~1980 and a hard swap would
tick the axis 0.08 — half a plot — in one frame mid-pan. Measured, the ramp moves
the plot's edges at most 2.3e-4 per 0.005 of a year of pan, which is less than the
fit's own motion through the mid-1980s, so the crossover is invisible. `raceFull`
below 2000 is untouched by all of this: its cameras fit exactly as they did.
Nothing anywhere clips off the top — no actor in the window comes closer to the
centre than 2.0839.

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
curve. The same strip carries the fixed window's **"min y"** slider, on the same
revision counter, and the playhead marker hides itself while the chart is inside
the window — the curve has nothing to say about those years, so the slider is the
only live control on raceRecent and raceFuture.

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

**The future strip (`raceFuture`).** The chapter's last step runs the camera
forward to the present and opens a strip of future ground beside it, in **two
legs** on one Next press. Leg 0 pans (at the ordinary fixed scale, so it is a
pure translation) until the present sits `RACE_FUTURE_TAIL_PX` in from the plot's
**left** edge: the lines slide away to the left and every dot comes to rest in a
column just inside the edge, with a short stub of its own trajectory behind it.
Leg 1 parks the camera and advances a `frontier` from 2025 to 2030 across the
width the pan left over, growing the future block and bringing its ticks in
behind it.

The camera is pinned by its LEFT edge, which is a second way to answer
`raceMaxPlayhead`. `tailPx` says how many px of history to keep behind the
data's end at the left instead of naming the year on the
right, so the resting playhead follows the viewport (precedent:
`raceFullRestPlayhead`) — the strip is anchored on where the data ends, not on
where the timeline does, so it gets whatever plot width is left over rather than
a fixed five years the plot may have no room for. It is also how the step
**fixes its camera**, by construction rather than by coincidence:
`raceFloorPlayhead` returns the same year as the ceiling, so `racePanBounds` is
left with nothing between its two ends and reports no pan at all. That is the
honest half of the step having no controls; the enforcing half is `Index.svelte`
not mounting `RaceScrubber` on it.

`maxPlayhead` used to mean a step's resting camera, its pan ceiling **and** its
last x tick, all off one field. Those have come apart. The historical axis now
stops where the DATA stops (`RACE_DATA_END`, in `raceAxes`) and the years past it
are ticked on the strip's own scale, so a step's camera ceiling and its last
label are no longer the same question.

**The strip carries the chapter's only fitted x scale** (`raceFutureScale`), and
its only branch on width. It has to: five years at 76px/yr need 380px of plot
before any data fits beside them — about 1050px of canvas, which the 700px
`#scrolly` container makes unreachable at _every_ viewport. Fitting the five
years to the leftover width is what lets the strip exist at 320px. It runs out
to `racePlot`'s `fullRight` — the whole inner width, gutter included — rather
than to the data plot's `right`: the right-hand third exists to keep right-edge
names off the canvas edge, and on this step the dot column is at the LEFT, so
that third is dead space and the strip is the one thing with any use for it.
Nothing about the data's own geometry reads `fullRight`; the camera, the y fit,
the dots and the trails all still stop at `right`. It is
deliberately **not** folded into `raceCamera.xS` as a piecewise branch:
`raceCamera` is pure in `(playhead, w, h)` and that purity is what makes an
animated frame and its settle pixel-identical, and every dot, trail, label and
the takeover ring read `xS` — a piecewise `xS` would silently reroute anything
that ever reached past the data (nothing does today; the Gen-Z steps are asking
to). Only `raceFutureTicks` and `raceFutureBand` read it.

Because the scale is fitted it cannot make the fixed scale's "every year gets a
label, no thinning" guarantee: the pitch is ~63px on a desktop, ~19px at a 375px
viewport, ~12px at 320px. Three things follow, all in `raceFutureTicks`.

**Every year on the race chart is written in two digits** (`26`, not `2026`),
through the one formatter `raceTickLabel` — the fixed-scale historical axis and
the strip's fitted one both go through it, so the axis reads the same either side
of the break and the strip's years are not a special case. Measured against a
real `.tick` — Atlas Typewriter at 0.65rem, monospaced at 7.68px a character —
four digits is 30.7px wide against 15.4px for two, and that is what buys the
strip its density: five 4-digit labels need ~170px in a strip only ~97px wide at
a 375px viewport with the old geometry.

The label is therefore **lossy**, so every tick also carries a numeric `year`
and anything keying off a particular one reads that. The 1980 `InfoTerm` is the
only such consumer, and it used to test the label text.

They **thin**, keyed off the computed pitch rather than the viewport (which keeps
it a pure function of the same geometry as everything else on the frame),
counting down from 2030 so the horizon always survives. The min-pitch constant
is deliberately tight — a 3px gap — because the 375px pitch is 19.33 and
anything above that flips the stride to 2 and drops the reader from four future
years to two. Separately, the FIRST strip year needs clearance from the
present's, which the stride knows nothing about because that label belongs to
the other scale: anything closer is dropped outright, since the present owns
that space and the block's own label already says what the ground to its right
is. With the strip now running out to `fullRight` the pitch is wide enough that
neither rule usually bites — they are the safeguard, not the normal case.

They also **fade toward the horizon** (1 to 0.45), so they recede with the block
above them rather than staying crisp under a dissolving right edge. Ticks carry
an optional `alpha` for it; the historical years set none and render flat. It is
applied to an inner `<span>` so it multiplies with `.fade-in`'s mount animation
instead of being outranked by it — that animation targets `opacity` on the `<p>`
with `fill-mode: both`, the same trap the takeover callout documents.

**The tail is measured in PX, not years** (`RACE_FUTURE_TAIL_PX`), and it is
short — 24px. A whole year of it (76px) left a visible gap between the plot's
left edge and the present, which reads as a missing label: the reader asks where
the year before this one went. A short stub of each actor's own curve is all the
tail is for.

Pixels also mean the camera lands on a FRACTIONAL year, which is what keeps the
historical axis to exactly one label — the present — with no special casing:
`Math.ceil` of a fractional `camLeft` is already the present, so the tail year is
simply off camera. Mid-pan, while the camera is still moving, that year is well
inside the plot and labelled like any other.

Nothing caps the lines to keep them off the strip, and that is still the point:
`writeRaceSweepFrame` already ends every line at `Math.min(cam.playhead, de, e1)`
and parks every dot at `de`, the actor's own last data year.

**`edgeFade` is a PIXEL ramp (PRD P-11-1).** It fades a line out over the last
`RACE_EDGE_FADE_PX` of its travel at the plot's left edge, so a series whose data
has scrolled off goes quietly instead of popping. It used to be measured in
YEARS off `camLeft` — one year long — and the two rules agree only at that
length. The old design parked the camera five years PAST the data, leaving 0.12
of a year of it inside the camera on the widest canvas the 700px container allows
and none at all below a 654px one, so the whole field rendered at ~12% opacity at
best and a phone got an empty plot. Measuring in px makes the fade a property of
where the line's end actually sits, which is what it was always about — and it is
what lets the tail be a fraction of a year without the greying coming back.

Every one of the 224 series ends on the same year, asserted at module load next
to `RACE_RANGE` so a rebuild that changed it fails loudly. That assertion is what
`RACE_DATA_END` rests on: the historical axis stops there, the strip starts
there, and every step's content extent ends there.

The block itself is `band` on the frame writer's payload, rendered as a DOM
`<span>` with a dashed border rather than canvas or SVG — it is an axis-aligned
rectangle, so it needs none of what put the takeover's leader in an `<svg>`. It
carries no `alpha`: unlike the callout it never travels and never culls, so it is
simply absent instead, and its two opacity concerns are both CSS (the mount fade
on the wrapper, the right-edge gradient masked onto the box, which deletes the
right wall along with the fade).

It is the one piece of chart furniture in the **annotations** layer rather than
the overlay, and that placement is what lets it carry a shaded fill
(`--category-yellow` at 13%). The names sit beside their dots to the right, so
with the column pinned at the left they render _inside_ the block — and
`.overlay` paints over `.annotations`, so a fill there hid every one of them.
Placed ahead of the node labels instead, the wash goes under the names and under
the ticks, and only over the canvas, whose ink to the right of the present is
nothing at all. Its label needs `position`/`margin` restated on a plain
`.band-label` class for the same reason: the `.overlay p` selector it used to
lean on no longer matches. Yellow is the chapter's first and only hue, and stays
inside the monochrome-plus-ink rule because it colours a region rather than an
actor.

Moving the column left also moved the name stack over the plot, where the
de-collider's downward overflow lands on the x-axis row instead of in the empty
gutter. `drawScene` lifts the whole de-collided set as a body when it overflows
the plot floor — scoped to `tailPx` steps, so no step whose names sit
safely in the gutter changes behaviour.

Arrival and departure are `playRaceFuture` / `playRaceFutureReverse`, the latter
retracing both legs in reverse order (the block closes, then the camera pans
back) and skipping the closing beat when `raceExitFrontier` says the strip was
never open. The frontier is snapshotted on the way out exactly as the playhead
is, so stepping back out of a half-open block closes it from there rather than
jumping to full width first. The legs run forwards, since `rewindFrame` only
interpolates `fromP → toP` and a fixed px-per-year makes either direction a pure
translation.

The step's resting frontier lives on `RACE_FUTURE_STEP` rather than only in the
animation, which is what makes a cold mount, a resize and the reduced-motion snap
all land directly on the fully-open state — the same contract a `STATE_ENTRY`'s
last leg has to meet, discharged by construction.

**The Gen Z field (`raceGenz`).** The prediction chapter opens by bringing this
chart back one more time and then leaving the crown behind. Three beats on one
step: the reader arrives from the chapter card onto the view they left
(`raceFuture`'s, with a few years of history on the plot); the camera pans DOWN
onto `[2.3, 3.0]`, where the 99 Gen Z contenders actually sit, and the whole race
cast retires as it goes; a **Show Gen Z actors** button draws their trajectories
in, and the draw carries the reader on to the next step.

**The camera gained a y degree of freedom for it, `yOpen`** — 0 at the chapter's
own window, 1 at the Gen Z one — and that is the whole design. The rule above
stands unchanged: `raceWindowYFit(camLeft, camRight, yOpen)` is still a pure
function of its arguments, still reads no step and no extent, so an animated
frame and the settle it lands on still agree by construction. A step declares
where it RESTS (`yOpen: 1` on `RACE_GENZ_STEP`), exactly as raceFuture declares
its frontier, which is what makes a cold mount, a resize and the reduced-motion
snap all land on the panned-down view with no animation having run. The
alternative — a domain on the step — is the one thing the axis rule exists to
forbid.

Everything the pan needs was already there. `curveEntry`/`curveExit` test
`[vMin, vMax]` symmetrically, so lines leaving through the **top** end at the plot
edge exactly as lines leaving through the bottom always have; an off-scale dot is
hidden outright; `raceLeadBy` picks from the dots the frame is showing, so with no
race dot on the plot nothing is inked from the race side; and the takeover callout
culls itself off camera.

**The race cast's departure is a STATIC fact, not something the animator
remembers.** The step's yCap is `-Infinity`, so `raceStepVisible` is empty and its
resting frame carries no race line at all — which is what the pan's last frame
lands on. The leg gets there through the ordinary `shown` mechanism
(`{from: the whole cast, to: ∅}`), so the crown fades out over the first third
while it is still on the plot rather than being cut off the moment the window
leaves it. As on every race step the 224 stay parked on their own curves at alpha
0, so nothing flies in from off the plot when the reader steps away.

**A backdrop fills the window the pan lands on.** Retiring the race cast leaves
the plot empty between the pan and the reader's press, which reads as a bug and
undersells the move: `[2.30, 3.00]` holds **17,722 of the corpus's 22,530
actors**. So a stratified sample of 279 working actors is drawn behind
everything (`backdropSeries`, `writeBackdropLines`).

It takes **no progress parameter**, and that is the whole trick: the lines are
always written and the CAMERA decides whether they are seen. At `yOpen` 0 the
window is the crown's `[2.05, 2.20]` and every one of them sits below it, so
`curveExit` finds nothing on scale and each collapses onto a hidden dot; as the
window opens downward they enter through the bottom edge on their own, exactly as
the race cast leaves through the top. Nothing to schedule, nothing for an
animator to carry, and a resize or reduced-motion arrival lands right because the
frame stays a pure function of the camera. Measured across the pan: 29 race
dots at `yOpen` 0, then 131 race + 38 backdrop, 120 backdrop, 205, 278. Never
empty.

Three depths on one monochrome chart, separated by alpha and radius alone —
backdrop at 0.3, the 92 unnamed contenders at `raceDotSpec`'s 0.55, the seven
named in ink. A hue for any of them would break the chapter's rule and would not
read as depth anyway.

**The closing chart (`raceClose`), its own window, and a draw-on.** The story
ends on this chart one more time (PRD P-27-1): SLJ's line descends across the
future block while the five contenders the simulation named rise to the medians
those 10,000 runs actually produced. It is `raceFuture`'s camera with a YEAR of
measured history behind the present instead of that step's 24px stub
(`tailYears: 1`), the strip open to 2030, plus two things. The history is what
lets each projection carry on through the axis break as one curve rather than
restarting at it — which is also why the block's "the future" label sits inside
its top-left corner here rather than above it: a year of plot in front of the
block pushes its left edge under the centred chart title.

**Five lines, not 99.** The chart used to draw the whole field, and every
projection ends at the same x, so 99 line-ends were not 99 positions but one
99-high wall at the strip's far edge — with the marks the step is about buried
inside it. The five are `SIM_LABEL_IDS`, the ones the simulation named and the
reader has just been watching, so the same people carry the same names across the
step change. The other 94 are not retracted: they stay on their own projection
curves at alpha 0, the rule every race step follows, so nothing travels across
the canvas when the reader steps back onto the chart. One consequence to know:
the five are chosen by WIN SHARE, and that is not the order of the projected
finish — id 10949 lands second-nearest the centre and is not drawn. It was
already unmarked before; the field standing behind the marks used to say so.

`yClose` is the second camera degree of freedom, and it composes with `yOpen`
rather than replacing it: `raceWindowYFit(camLeft, camRight, yOpen, yClose)`. At
`yClose: 1` the domain is the step's own window, `[2.17, 2.67]` —
`RACE_CLOSE_Y_MIN`/`MAX`, **read off the five it draws** rather than authored as
constants: the best projected landing over the most remote of them, padded. So
"the axis is floored by these five" is a statement about their data, and a
rebuild that moves them moves the axis. (The floor reads the years the step
DRAWS, not 2025 alone: there is a year of history on the plot, and Hechinger's
2024 sits below Hawke's 2025.) The rule is untouched: still a pure function of
the camera, still no step owning an axis.

**That window is what puts SLJ off the chart, and it is the step's best trick.**
He is at 2.087 today, above the top edge, so when the chart opens he is not on
it — no dot, no line, no name. As the draw crosses the years where his own curve
descends onto the window, the frame writer's ordinary clip (`curveEntry`) brings
him in through the top edge. Nothing schedules his entrance and no animator
carries it; it is a fact about the axis, asserted at module load so a data
rebuild that moves him inside the window fails the build rather than quietly
turning the arrival into a line that was always there.

`proj` is the other, and it is the first time anything on this chart draws PAST
the end of the data. `cam.xS` is still not rerouted — the refusal in
`raceFutureScale`'s header stands. Instead `writeProjectionLines` composes a
local piecewise scale (`cam.xS` up to 2025, the strip's fitted pitch beyond it),
hands it to `sampleTrail` as its x argument, and hands it to nothing else. It is
called from inside `writeRaceSweepFrame` for the same reason `writeGenzLines` is:
that function stays the single placer of everything on this chart.

`proj` is also the draw-on's progress, 0..1 — a playhead in YEARS, swept from the
present out to 2030, with each line clipped to it and each dot riding the end
(the same shape `writeGenzLines` uses for the field's arrival). It is **absent**
on every other step rather than defaulting to 0, and that distinction is
load-bearing: 0 is a real value here — the frame the draw begins on — so "is this
a projection frame" is `proj !== undefined` everywhere it is asked, never a
truthiness test. It rests at **1** on the step, which is the contract that makes
a cold mount, a resize and the reduced-motion snap all land on the finished frame
with no animation having run.

**It has no x axis** (`xTicks: false`, a separate switch from `futureTicks`,
which drops only the strip's years and keeps the historical ones). The
projections' horizon is each contender's career age 40, not a calendar year, so a
row of years under them would label the one thing on the chart that is not being
measured. The block's own label carries the direction of time instead. A draw-on
sweeping left to right across it is a statement about time passing, which is
fine; nothing labels the years it crosses.

**Two numbers on it are authored, not modelled**, and the code says so at both
definitions. The simulation projects the 99 contenders and nobody else, so SLJ's
2030 landing is `RACE_CLOSE_SLJ_END` — the chapter's own claim drawn on the axis,
asserted at module load to sit behind every contender it draws. And the
bootstrap's horizon is each contender's career age 40, not 2030; their endpoints
sit at the strip's far edge because that is where the chart's future ends. See
PRD P-27-1.

**Its arrival is two beats, and the first one is the plain tween.** The five keep
the `SIM_SLOT` trail block their win-count climbs occupy on the simulation chart,
so the state tween morphs a line into a line — the object constancy those slots
were shared for — landing on the draw's frame 0: every line standing on the
present, nothing yet out on the strip, the 94 already faded out. `playRaceCloseDraw`
is chained off that tween's `onDone`, so a reader who steps on mid-flight skips
the draw exactly as they skip any other choreography. Scoped `revealFrom:
["simRace"]`, so stepping back into this chart out of the outro does not replay
it.

The one thing that branch must NOT do is call `landOffChart`, which every other
race arrival does: it preserves the race cast's dots and `RACE_TRAIL_SLOTS` only,
so it would snap all 99 `SIM_TRAIL_SLOTS` onto the arriving layout before the
first frame and destroy the morph the slots exist for. `raceGenzArrival` is the
one existing branch that skips it, which is why it is the one this copies.

`outro` then dissolves this chart rather than the simulation's, through the
shared `dissolve()` helper in `layout-shared.js`, which zeroes every alpha and
returns the buffers ALONE — the axes and the block are HTML furniture with no
alpha to take down, so dropping them is what empties the canvas.

Two renderer details it needed. The draw pass culls race dots against the data
plot's right edge, and this step's marks sit out at `fullRight`, so the cull's
right edge follows the step's `proj` (without it SLJ's dot survives the step
change and vanishes on the first resize, where both states are this one) — read
off the STEP, whose `proj` is its resting 1, never off a frame. And the block
drops its 13% wash when it has marks inside it — the wash exists because empty
ground read as an empty frame, and with lines in there it would only tint the
data.

**One writer per node is what makes the three casts safe to overlay.** A dot
lives in one slot of the attr array and a line in one trail slot, so an actor in
two casts would have two writers fighting over the same dot. Twelve of the
sample's 291 were in another cast (seven race anchors — Stallone, Keaton, Frank
Oz — and five contenders including Jenna Ortega), and the build drops them,
leaving 279. The backdrop is a backdrop, so the other cast always wins. That
exclusion is asserted rather than assumed.

It is named BACKDROP and not FIELD because `layout-shared.js` already owns a
`FIELD_*` vocabulary for the pull-back crowd (`FIELD_IDS`, `fieldSpot`,
`FIELD_ALPHA`) — the hop 1–4 actors the chapter card and `hopBands` sort. Two
unrelated "fields" in one module is a collision that reads fine until someone
imports the wrong one.

**The lookback is three years, clamped.** `tailYears: 3` pins the camera by its
left edge the way raceFuture's `tailPx` does, and both resolve through one helper
(`raceTailPx`) — that the ceiling and the floor return the same year is what
makes the step unpannable by construction. But three years is 228px at the
chapter's fixed 76px/year, against a data plot of ~389px at 700px, ~173px at
375px and ~136px at 320px, so it is capped at `RACE_TAIL_MAX_FRAC` (60%) of the
plot: measured, the reader gets 3.00 years at 700px, 1.36 at 375px and 1.07 at
320px, and the future strip still labels all five of its years at every one. A
phone gets less history rather than the chart getting a second x scale — fitting
x to the span is the one thing the chapter refuses to do, because every visible
year carries its own label only while the scale never moves.

**Its seven names are inked, and that is not an exception to the ink rule.** The
chapter's rule is that no actor is identified BY a colour and the only ink belongs
to whoever leads at the camera. On this step no race actor is on the plot at all,
so nothing is being identified as "in front"; the seven are the ones the story
names, drawn exactly as `scatterGenZ` already draws them (`INK` at r 5). Who the
seven are lives in `layout-shared.js` as `GENZ_NAMED_IDS`, because both charts
read it and they must not be able to drift apart; what stays in `scatters.js` is
only each name's side, which is a fact about that frame's crowding (the race chart
puts every name in the right-hand gutter).

**It reuses the simulation's 99 trail slots** (`SIM_TRAIL_SLOTS`) rather than
allocating a second block for the same 99 actors: a contender's trajectory line
here becomes their win-count climb in `simRace` four steps later. `raceLayout`
therefore skips those slots instead of retracting them when `step.genz` is set.

**The field ARRIVES, it does not draw on.** The race chapter's own entry unspools
a line leftward from a dot pinned at the plot's right edge, because there the
camera is a time machine and the reader is being shown history that already
happened. Here the 99 dots enter at the LEFT edge and ride their own curves
rightward into the present, trailing their history behind them, all on one shared
arrival playhead so they cross as a cohort. A tail growing backwards out of a
stationary dot says the reverse of the beat, which is actors turning up.

Two things fall out of it rather than needing constants. The dot is clamped to
its own `[first, last]` year, so a contender who debuts inside the window waits at
their first year instead of sliding along a curve that does not exist yet, and
every dot stops dead on 2025 rather than running on with a camera this step parks
past the present. And `edgeFade` — the chapter's pixel ramp for a line whose end
is at the plot's left edge — becomes the entrance fade for free, because it
measures where the end actually sits and here that end is what is moving.

The trigger itself is `story.genzLinesShown`, a layout param written once at the
end of the run — the same shape as `simRuns`, and for the same reason. The step
rests with the field NOT on the chart, so the press is what puts it there, and a
resize or a reduced-motion arrival lands on whichever of the two frames the flag
says.

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
through the frame writer instead), `band` (raceFuture's future block — the
frame writer's payload again, and for the same reason: the frontier that sizes
it is animated), and `legend`
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

**The card drops the reading column, and so does the step that feeds it.** Every
state carrying a chart is drawn inside `#scrolly`'s 700px measure, because a
chart wider than the prose it belongs to stops being readable. The four states
that carry no chart — `titleGalaxy`, `hopSeed`'s pull-back, `chapterCenters` and
`outro` — author their crowd across `galaxyBox` instead: the viewport edge to
edge and from the top of the screen down, then inflated past it about its own centre by
`GALAXY_SPREAD`, so the reader gets the corpus as something too big for the page
exactly where the argument pauses. Nothing fades the crowd at the screen edges —
a vignette there would draw the boundary the full bleed exists to hide.

**Sparse and faint is the whole reading.** Most of the crowd is authored off the
canvas, which is the only sparsity lever available: the set cannot lose members,
because `hopBands` sorts this exact crowd and a dot missing from the sky would
have no row to fall into. What is left on screen is a scatter rather than a
ground of dots, and `FIELD_ALPHA` draws it well under 1 so a chapter title sits
in front of the sky rather than in it. Off-canvas dots cost a fill the context
clips and nothing else. Every galaxy writer takes its alpha from that one
constant — the crowd (`writeFieldCrowd`), the fifteen greying into it
(`chapters.js`) and the closing chart's cast (`race.js`) — so the three cannot
drift apart, and because alpha rides the tween buffer like position does, every
arrival into and out of a galaxy state interpolates it without being told to.

**The field carries its depth standing still.** `FIELD_ALPHA` and the crowd's
radius are what the field averages, not what every dot gets: all three writers
spread them about the dot's own `fieldDepth`, so a near dot is bigger and darker
and a far one smaller and fading toward white before anything moves. That is what
a reduced-motion reader gets in place of the flow, and it puts the depth cue on
**radius**, which `drawScene` does not quantise, rather than leaning on alpha,
which it buckets into 16. Banding is not a risk either way: a dot's depth is set
by its phase in the flow, which is an independent per-dot hash, so it is not
spatially correlated and the quantisation only makes the field's alphas discrete.

The spread is **weight-preserving by construction**. Ink goes as radius squared
times alpha, which is convex in the depth multiplier, so spreading about the
middle of the volume would otherwise add about a quarter again as much ink — the
opposite of what a sky a title sits in front of wants. `depthFade` divides the
spread's own mean weight back out, and the entry/exit window's with it, derived
in closed form rather than written down, so retuning the gamma, the depth range
or the window cannot leave a stale number behind.

`hopSeed` sharing the card's box is what makes the step onto the card a no-op.
Both write the same crowd through `writeFieldCrowd` at `PULLBACK_ZOOM` against
the same `galaxyBox`, and the fifteen are already at `cardSpot`'s
`introPosition(PULLBACK_ZOOM)`, so the arrival tween has nothing to carry: the
title fades up, the dot bar fades out, the fifteen shrink and grey, and not one
dot moves. The blooming-outward move belongs to the pull-back that precedes it —
`zoomOutFrames` expands the sky over 4s while the reader reads the line — rather
than to the card's arrival.

Anything drawn OVER a full-bleed state gets a halo rather than a plate: the
chapter title (`.chapter-card h2`), the step prose (`.scrolly-steps`) and the
progress bar's dots and ticks (`--bar-halo` in `StepProgress.svelte`) all hold
out the background colour with a stack of shadows. A solid background would be
the only rectangle punched out of the universe, and the halos cost nothing on a
boxed step, where the field stops at `plotBottom` and the marks sit on white.

The mechanism is `bleed`, threaded from `ScrollyVisual` as the last argument to
every `LayoutFn` (and to `AmbientAnim.frames`): how far the canvas extends past
`w`, as a `{ l, r }` PAIR. The canvas element is styled `100vw` and pinned to the
viewport's left edge, while the drawing origin is pushed back onto `.visual`'s
left edge by the render transform, so `w`/`h` still mean the column and **every
other layout is unaffected** — only one that deliberately authors outside
`[0, w]` sees any difference.

It is a pair rather than a scalar because the column is centred in the viewport
only in the stacked layout. Side by side with the prose (see below) the column is
one half of the screen, and a single number cannot say which side the rest of the
canvas is on. It is also MEASURED, off `.visual`'s own rect, rather than derived
from `canvasWidth - width`: that difference gives the total and never the split.
Only five places do arithmetic on it — `galaxyCentre`, `galaxyBox`,
`targetHolds`, and the render transform and clear rect — and every other layout
takes it as an opaque value and forwards it, which is what keeps the pair cheap.
Passing the old scalar where a pair is expected is silent and total: `bleed.l` on
a number is `undefined`, so `galaxyBox` returns a NaN x extent, every dot in a
galaxy state is placed at NaN and the sky renders empty while the y extent, the
title and every non-galaxy state look perfectly normal.

Four consequences worth knowing:

- `bleed` is part of the layout cache key, both halves of it. `w`/`h` are pinned
  to the column, so two different screen widths produce the same `w:h` and would
  otherwise share one cached sky.
- `bleed` is not `$state`, for the reason `sweeping` is not: it says where the
  canvas element sits, which is not something the story is showing. It is
  measured at the top of the render effect and the element's own `left` is
  written from it in the same place, so there is one reader and one writer and no
  reactive round trip. A move is folded into `resized`, so it re-fits the backing
  store exactly as a width change does.
- `drawScene` clears `[-bleed.l, w + bleed.r]`, not `[0, w]`.
- `.visual` is no longer `overflow: hidden` (the canvas has to escape it); the
  clipping moved to `.annotations`, which is what wanted it. `.visual` itself is
  untouched otherwise — it is still the box every panel, hit target and label is
  positioned against, and every hit test measures it.

**Beside, rather than over (>= 1200px).** The story is authored mobile first: the
prose is a card lying across the bottom of the canvas, and every chart keeps the
bottom 40% of the box clear for it (`plotBottom`). Past `BESIDE_MIN_W` in
`Index.svelte` there is room for the two abreast, so the prose takes a column of
its own on the LEFT, the canvas takes the right, and the charts take that 40%
back. The split is held on `.scrolly-layout` as two unitless numbers,
`--prose-frac` / `--visual-frac`, because three rules have to agree on it: the
visual's left inset, the prose's right inset, and the full-bleed cards, which
have to undo the first from inside a box only `--visual-frac` of the layout wide.

The width is not the point and is close to a wash — the visual column at this
breakpoint is about what the 700px measure was already giving a chart. **The
height is what the charts never had**, and it is the whole reason to do it.

Two things carry it, and they are deliberately in different places.
`PLOT_BOTTOM_BESIDE` (0.86, against 0.6 stacked) is a module variable in
`layout-shared.js` with a setter, rather than a seventh argument, because
`plotBottom(h)` is read from ten layout modules and from the render path and none
of them is handed the page's layout mode — the same idiom the dev band editor
uses. `ScrollyVisual` owns the setter, called at the top of the render effect
from its `beside` prop, AND puts the fraction in the layout cache key. The key is
what makes it a rule rather than a coincidence: `w` changes with the mode too, so
the key would usually miss anyway.

The breakpoint itself is stated twice — a `@media` rule and `BESIDE_MIN_W` — and
has to be kept in step by hand, because a breakpoint cannot be read back out of
CSS and the render path needs the boolean rather than the layout.

**A module variable is not a signal, and that is the trap this shape sets.** The
layout cache copes by naming the fraction in its key. A `$derived` cannot: one
that called `plotBottom()` held whatever fraction was current when its real
dependency — `height` — last changed, so the axis titles and the lower/higher
hints stayed pinned to the stacked plot for the whole of a beside layout while
every chart around them had moved. `ScrollyVisual` therefore keeps `plotFrac` and
`plotFloor` as derived values off `beside`, everything in that component reads
those,
and the setter is handed the same `plotFrac` — so there is one expression and two
readers rather than two sources of truth. Anything else in the component that
comes to depend on the plot's floor goes through them, never through
`plotBottom()`.

**`overlayHeight` is the same correction one layer out.** Half a dozen things are
measured off how much of the canvas's bottom edge the step card covers — the
over-canvas panels, the tour caption's floor, the x-axis title's clamp. Beside
the prose the card covers none of it, so `Index.svelte` derives `overlayHeight`
(0 when beside, the measured `stepsHeight` otherwise) and every one of those
clearances reads that. A chart that goes on dodging a card which is not there
leaves a band of empty canvas under it.

**THE SWAP.** Every chapter puts the prose on the other side, so the reader
crosses the screen as the argument turns over: right, centre, left and back, with
a full-bleed chapter card holding the middle beat each time. `chapterOrdinal`
counts the chapter cards the reader has reached and `flipped` is its parity;
because a card announces the chapter it OPENS, it counts as part of the new one,
which is what puts the side-change ON the card.

That placement is the whole trick rather than a nicety. A card is full-bleed and
carries no prose, so at the instant the column changes sides there is no chart
boxed in it and no words in it to move. The sky is authored about the middle of
the SCREEN (`galaxyCentre`), which the swap does not move, so the picture the
reader is looking at is the one thing in the frame that is already invariant.
Swapping anywhere else would slide a chart bodily across the viewport.

**The canvas makes up the difference, and must not take the snap branch.** The
column moves without changing size, so the backing store is already right and
only the ORIGIN has travelled — `dx` px along the canvas. `measureBleed` returns
that `dx`; the render effect re-pins the element and the transform by it and then
takes the same `dx` back out of the live frame through `tweener.reframe`, so
every mark the reader can see stays on the pixel it was on. The buffer holds
column coordinates and the column's zero has just moved.

Three things about that branch:

- **It is what keeps the arrival onto the card a tween.** The resize path re-fits
  and lands instantly, which is right for a rotate and would throw away the one
  transition the swap is hidden inside — a chart dissolving into the full-bleed
  sky.
- **`reframe` is handed `current` AND `start`**, and that pairing is the contract:
  `current` is what is on screen, `start` is where an in-flight tween is easing
  from, and a tween left with a start in the old coordinates drags every mark back
  across the delta as it runs. `target` is deliberately not offered — it is the
  layout's own array and is CACHED, so mutating it would poison the cache for
  every later visit. The state's layout is rebuilt against the new bleed
  immediately below, which is where a new target comes from.
- **A sweep cannot survive a bare move**, because a frame writer closes over the
  box it was built for. Nothing in the story does it — the swap lands on a card
  arrival, where the state change has already abandoned the previous sweep — so
  rather than carry a rebuild path that never runs, `dx !== 0 && sweeping` falls
  back to the snap.

Known, and not yet retuned: `raceFuture` and `raceClose` give the future strip
whatever plot width the pan leaves over, which was right when five years at
76px/yr could not fit at any viewport the 700px container allowed. On the wider
column the strip takes most of the plot and the chart reads as one large empty
block. The fix is a real design decision rather than a constant — at this width
the strip could finally carry the chapter's own fixed scale instead of being
fitted — so it is left for a pass of its own.

**`TITLE_BAND` is the same move upward.** `.scrolly-visual` sits `--title-band`
(26px) below the top of the window, to keep each chart's title clear of the dot
bar, so the canvas box stops short of the screen's top edge and a full-bleed
crowd stopped there with it. The canvas element is pulled up through the band
and grown by it (`top: calc(-1 * var(--title-band))`, `height: calc(100% +
var(--title-band))`), the backing store is `height + TITLE_BAND` tall, and the
transform pushes the origin back down by `TITLE_BAND` — the exact vertical twin
of `bleed`, with the same result: `h` still means the box, and only `galaxyBox`
reaches into the strip (`y0 = -TITLE_BAND`). `drawScene` clears from
`-TITLE_BAND` for the reason it clears from `-bleed`.

The band is a **constant**, defined once as `TITLE_BAND` in `layout-shared.js`
and set from there onto `.scrolly-layout` as `--title-band` by `Index.svelte` —
never measured, and never varied per state. `height` is bound to `.visual`'s
`clientHeight` and sits inside `resized`, which stops any sweep and takes the
instant-snap branch; a band that changed between states (say, only on states
that carry a title) would resize the canvas on exactly the transitions that
animate. That was tried, and it snapped outro's 4s pull-back on arrival from
`raceClose`. Nothing in the render path may make `width`, `height` or
`canvasWidth` depend on the band.

The intro fifteen are the exception that stays put: `cardSpot` gives them
`introPosition` at `PULLBACK_ZOOM` — hopSeed's landed camera — and only their
radius, grey and edge ramp change to the crowd's, Bacon included. So what
dissolves is the diagram, not their positions: the constellation becomes the
crowd where it stands rather than scattering into it, which is the visual form of
the line the reader has just read.

**The handoff out is a contraction, and the x ordering survives it.** `hopBands`
takes each dot's x from `cardSpot`, which is the **column** box (`fieldBox`) —
the card is the only caller that passes `galaxyBox`. So stepping off a card, a
dot moves horizontally as well as vertically: the sky funnels back into the
measure while the bands sort it. Because `galaxyBox` is the column box scaled
about the same centre, that contraction is uniform — every dot keeps its
left-to-right place and its neighbours — rather than twelve thousand unrelated
diagonals, which is what an independently-hashed x would give and what reads as
static rather than as sorting.

**And the sky it leaves is flowing, so the column it leaves from is the live
one.** The crowd streams outward the whole time the reader is on the card, so by
the time they tap, a dot can be most of the way across the screen from where the
static layout has it — take the resting column and the sort's first frame is
somewhere other than the crowd the reader is looking at. `departureColumn` in
`layouts/hop-bands.js` therefore contracts the dot's LIVE sky position. That is
the same contraction the resting position gets, and because the flow's
magnification is struck about the same centre the two commute: it is exactly
where the dot would be if the whole flow had been authored in the column. At the
flow's t = 0 it IS the resting column, which is what a cold `?step=4`, a backward
arrival and a reduced-motion read all get.

**A flowing sky has no outer edge**, which is the one thing that does not carry
over from the flat field. A dot is carried out by up to `SKY_FAR / SKY_NEAR`, so
about a third of the crowd sits further out than the plot is wide and no single
contraction holds all of it. Every one of those is off the canvas — measured, not
assumed: of the dots visible on the card, none lands outside the plot — so the
rule is simple. A dot the reader can SEE falls straight down from where they see
it; a dot they cannot takes a flat hashed column of its own. The crowd that does
land in the plot fills it evenly, so the bands come out uniform either way
(measured at ±5% across twelve columns). The intro fifteen are outside the flow
entirely (`isIntroActor`) and simply keep their column.

What is published is the flow's **clock** — one number, `skyFlight.t` — and not
the twelve thousand positions it implies, so there is still exactly one definition
of the flow and a reader of the sky cannot diverge from its writer. The cost is
real and is the only one in the framework: a layout that reads `skyFlight` is not
a pure function of `(state, w, h, bleed, params)`, so `stopSweep` drops the whole
layout cache whenever a flight stops. The cache is dropped rather than the key
made to carry a clock that moves every frame and would never hit, and `stopSweep`
runs before any layout is built on a state change — which is what makes the frame
the bands are struck against the frame the sky was showing at the instant the
reader tapped. `hopSeed`'s invisible seed park goes through the same layout and
so inherits the live column; it is alpha 0 and `hopBands` reveals from
`chapterCenters`, not from the seed, so nothing reads it.

Where the identity has to be exact is the OTHER side: `hopSeed` and the card both
author across `galaxyBox` at `PULLBACK_ZOOM`, so that handoff is byte-identical
by construction — both call the same `writeFieldCrowd` with the same box. The
box is struck once in `zoomOutFrames`, outside the per-frame closure, so the
leg's last frame and the static layout it settles onto cannot drift apart; a
frame built against a different `bleed` would snap the sky inward on settle,
which is why `EntryAnim.frames` takes `bleed` as well. `networkIntro` and `lone`
park the same crowd (invisible, at scale 1) through the same box, so stepping
back out of `hopSeed` zooms the camera in over that state's own geometry rather
than one that merely looks like it from behind alpha 0. The card shows
12,097 dots: `FIELD_IDS` (12,082 = hop 1–4 less the intro fifteen) plus the
fifteen. If a future layout wants to receive that crowd the same way,
share the x the same way, and pass no box.

**The title is centred on the field's box, not the canvas's.** On a card those are
now the same box — the crowd fills the whole canvas — so `chapterHeight` is just
`visualHeight`. The rule is unchanged and still worth keeping: position off the
layout's own geometry, as step 1's caption and `introBottom` do. Note the title
stays inside the reading column while the dots run past it on both sides; the sky
is full-bleed, the words are not.

## Title card

Step 0 is a title card: `<Splash state="titleGalaxy">`, the piece's name over the
corpus drawn as a sky, and one line naming the control that moves the story. It is
registered in document order like every other step, so leaving it is the reader's
first use of the very press the line has just taught them, and every later step's
index shifts by itself.

It borrows `Chapter.svelte`'s arrangement wholesale — the component registers and
renders nothing, `Index.svelte` renders the card from `stepConfigs[value].splash`
inside a stable `{#if}` so it can transition out, and it fades on the chapter
card's own timings (`chapterFade.js`) so opening the story and opening a chapter
are visibly the same move. Two things are its own:

**The copy arrives as snippets, and says a different thing per screen.** `title`
and `cta` are snippets rather than strings so the words live in `Index.svelte`
beside the story's other prose. The CTA carries both sentences and hides one by
width (`.on-narrow` / `.on-wide`, `display: none` rather than opacity, so the
reader is told one thing once): a thumb at the edge of a phone, an arrow key at a
desk. Both controls are always live — only the wording changes. The card also
MARKS the target: `.splash-cue` is an arrow filling the right-hand tap gutter,
sized off the same `--tap-gutter` `TapNav` sizes its button from, and it is the
only marking either gutter ever carries anywhere in the story. It is why the card
is the one thing measured off the gutters rather than the reading column
(`padding: 0 var(--tap-gutter)`) — a title running under that arrow would have
the reader reading the instruction through the word it points at.

**`titleGalaxy` is the sky with the story's opening beat withheld.** It is the
crowd every other galaxy state draws — `writeFieldCrowd` at the landed camera,
across `galaxyBox`, flying on `makeFlight` — and, like `outro`, it leaves the
constellation out: that is the opening BEAT, and a title card already carrying
Bacon's co-stars would spend it before the reader has tapped anything. It does
take the chapter cards' highlight beat, wrapping its flight in
`withGalaxyHighlight` and declaring `labels: () => []` exactly as
`chapterCenters` does, so the card rests anonymous and the names arrive only once
the sky is moving. That is safe against the park below without any coordination:
`GALAXY_CAST` is derived from `FIELD_IDS`, which excludes the fifteen by
construction, so the beat can never reach for a dot this state draws at zero
alpha — nor for Bacon, who it draws as an ordinary member of the crowd. The
flight itself is handed `FIELD_IDS` rather than the cards' `UNIVERSE_IDS` for the
same reason: flying the fourteen would move the seed, and flying Bacon would move
the target (see the opening flight below).

Its `castFrom` is 75, in the gap the cards' 0/30/60 leave. Worth knowing what
that does and does not buy: `pickFocus` starts at `(from + hash(beat) * n) % n`
and walks forward to the first ELIGIBLE actor, so while only a handful of the
cast are on canvas and clear of the flight's fade ramps, every offset converges
on the same opening actor — measured, 0 through 75 all open on Alfred Molina at
1280px and Harvey Keitel at 390px. The offsets separate the second beat onward,
once each card's no-repeat window has diverged. The three chapter cards have
always shared this; the checklist row asking whether a card opens on the same
actor as the last one is still the open question it was.

What the fourteen get instead is a park: their `lone` constellation marks at zero
radius and zero alpha, which is **exactly** the seed frame `ScrollyVisual` builds
on a first paint, edge slots included.

Bacon is not parked with them. He flies with the crowd, drawn as a plain member
of it — same grey, same size and alpha off his own depth, no name — because he
is the star the opening flies to and a fixed mark in a moving field reads as a
fixed mark long before the reader taps.

What is not hashed is where his trip runs. Every other dot takes its entry
offset from `entrySpot`, uniform over a box half again wider than the frame,
which is why the flow has any given dot off canvas about four fifths of the time.
He is the one dot the opening has to be able to find, name and fly to, so
`anchorSkyEntry` authors his offset and bounds it by `SKY_FAR`: magnified over
the whole trip it still lands inside the reading column, which is the box the
name under him is clipped to. `roomTo` picks the roomier side of the vanishing
point, because that point is the middle of the SCREEN while the column is not —
side by side with the prose the generous direction flips with the column.
Measured, his trip runs 211px on a phone and 288–403px on a desktop, entering
near the frame's middle and ending well inside the margin.

`withAnchorInSky` adds that trip to the card's flight — a wrapper rather than an
extra id for `makeFlight`, which re-hashes a dot's offset the moment it wraps,
which is the one thing his must not do. It holds the ambient contract the same
way the flight does: `layoutTitleGalaxy` writes him at the wrapper's own t = 0.

### The opening flight

The step off the card is the one arrival in the story that flies somewhere before
it draws anything. `lone` carries a five-leg `entry` (`loneEntryFrames`) that
takes the rAF at the instant of the tap — there is no arrival tween in front of
it (see `ownsArrival` below):

| leg        | ms   | what moves                                                              |
| ---------- | ---- | ----------------------------------------------------------------------- |
| `CLEAR`    | 400  | nothing but the sky; the card's own words fade out over it              |
| `LIGHT`    | 700  | the flying dot inks to `HOP_RGB[0]`, swells `GALAXY_FOCUS_R_MULT`×, α 1 |
| `LOCK`     | 700  | still flying, now lit; the name is up and can be read                   |
| `APPROACH` | 1600 | the flight — the camera banks onto him and runs the sky past            |
| `WALK`     | 8350 | the constellation grows, on the schedule a cold start runs              |

Six things hold it together.

**He never stops flying, and that is the premise, not a detail.** He is authored
as a member of the crowd so that he cannot be told from it before the tap; a dot
that halts the instant it is named was never really one of them. So `LIGHT` and
`LOCK` read `anchorSkyAt` at the leg's own clock and apply the light-up as an
ENVELOPE on that frame — radius and alpha nudged against whatever the flow just
wrote, colour written absolutely — which is exactly the idiom the chapter card's
highlight beat uses on a flowing dot, and why a tap that catches him deep in the
volume or part way through his entry fade lights the dot that is actually there.
Only the APPROACH takes his heading away.

Measured, at every point in his trip and on both viewports: he travels at least
as far over `CLEAR`+`LIGHT`+`LOCK` as the median crowd dot at his own screen
radius — 4.3–9.9px against 5.3–8.2px on a phone, 18–67px against 13–28px on a
desktop. The comparison has to be with dots at HIS radius: the flow is radial, so
the crowd's overall median (41px / 86px) is dominated by dots much further out
and says nothing about whether he is keeping up with his neighbours.

**His trip must not WRAP under the lit legs.** A wrap is a jump from the near
plane back to the far one, which the flow hides everywhere else behind
`flightWindow` — and the light-up has overwritten exactly that fade. So his clock
is clamped to `flightSpan`, one millisecond short of the end of his trip. In the
common case the bound never binds; a tap landing in the last ~8% of a trip coasts
him to a stop just short of it, which is what the old design did on every tap.
The millisecond is load-bearing: `skyFrac` is `u - Math.floor(u)`, so a clock
landing exactly ON the trip's end reads as the start of the next one and produces
the 300px teleport the clamp exists to prevent.

**The sky keeps flowing at a CONSTANT rate until the approach.** The writer
rebuilds the card's own `makeFlight` and drives it from the clock the tap found
(`skyFlight.t`), so the flight does not stop dead while the choreography owns the
frame. The approach then adds the warp (`warpClock`): the camera comes up to a
cruise over the leg's first third (`WARP_RAMP`) and then simply holds it, opening
at exactly the flow's own rate so the join with the lock moves nothing. It still
spends exactly `APPROACH_RUN_MS` — 0.6 of a trip through the volume — because the
cruise multiple is solved from the ramp rather than picked, so retuning the ramp
cannot quietly change how far the crowd travels. 65% of it passes the camera over
the leg and 99% of the rest streams outward, a median of +430px on a phone and
+950px on a desktop. That is what makes the approach read as flying THROUGH the
sky rather than dissolving it — there is no separate geometry, only the flow's
own clock run fast, so nothing can disagree with the static layout.

**Coming up to speed and then HOLDING it is what makes the leg one move.** The
first build accelerated across the whole leg, 1× to 20×, and it read as two: a
pan, then a zoom. The reason is that a rate climbing all the way is at its
slowest exactly while the turn is at its fastest, so the bank has no forward
travel to be part of and the rush arrives afterwards as a separate crescendo.
Measured on the old profile, the sky was doing 84–265 px/s through the first half
of the turn and 944 px/s by the end; on this one it is 490–690 px/s under the
turn and then flat at ~575 px/s to the end. The bank's share of the motion falls
from a 77% spike to a 20→35→5% swell that rises and falls with the speed, which
is one manoeuvre rather than two.

**Bacon is on that same real-time clock, and the approach is too.** Every leg
drives him from `ms`, never from the leg's eased `e`: `sweepEase` is trapezoidal
and opens from REST, so a path parametrised by it stalls him at the exact moment
the sky — driven by `ms` — carries on and accelerates. That mismatch is what read
as the camera flying straight past while he came to meet it. Measured across the
`LOCK` → `APPROACH` join his screen speed is now identical to the decimal
(38.1 → 38.1, 9.0 → 9.0, 3.9 → 3.9 px/s at three different tap instants).

**The camera AIMS at him, and that is what makes it a flight TO him rather than
past him.** Running the sky fast is only half of it: the flow's vanishing point
is the direction of travel, so a sky expanding about the middle of the screen
says the camera is going straight on however hard it accelerates, and the target
reads as coming to meet it. `cameraSlide` ramps the camera's own lateral position
in the sky from zero onto `anchorSkyEntry` — Bacon's heading — while the frame is
carried, on the flight's own progress, from the sky's centre onto the
constellation's anchor mark.

The pair is what makes the ending exact. At the end of the ramp the camera is
aimed along his line of sight and the frame sits on the mark, so he is on the
mark — and he STAYS there with nothing holding him, because a dot dead ahead
projects to the vanishing point at every depth. He goes on closing, so he goes on
growing, without moving a pixel. There is no curve to pick anywhere in here: his
path IS the camera's, which is why the earlier hand-struck Bézier is gone.

Two things about the shape of it, both measured off the frames rather than
reasoned about — the estimator recovers the point the crowd's motion rays
converge on, which is what a reader's eye is doing:

- **The turn is applied BEFORE the magnification, not after.** Taking the shift
  off each dot's offset is what a camera moving sideways does; translating the
  finished picture is not. It buys the two properties that matter: the shift is
  multiplied by each dot's own magnification, so near dots sweep further than far
  ones and the turn carries the sky's depth with it, and a dot whose offset
  matches the camera's lands on the vanishing point whatever its depth.
- **The turn runs to the END of the leg, and that is not a detail.** It is the
  only thing in the frame that says we are going to Bacon rather than going
  forwards: once the camera is aimed he is AT the vanishing point, so flying at
  him and flying straight ahead are the same picture. Any leg left over after the
  swing has landed has therefore stopped saying anything, and it reads as a zoom
  bolted onto the end of a pan. Two earlier builds made exactly that mistake in
  opposite ways — one accelerated the rush across the whole leg so the bank
  happened while the sky was crawling, one finished the bank at 0.7 to buy a beat
  of "pure expansion about Bacon" — and both split into two moves. The second is
  the instructive one: that bought beat was the part that read as filler.
- **Ending together costs nothing**, because smoothstep closes at rest. While the
  camera is turning the flow is an expansion plus a sideways sweep, and a
  sideways sweep displaces the apparent focus — true of any turn, and what
  turning looks like. Letting the swing decay instead of stopping it means the
  flow settles into a pure expansion about him at the very moment the frame
  empties and the constellation starts to grow. Measured on all three viewports,
  over the last third of the leg the focus converges on him monotonically
  (307 → 46px on a desktop, 448 → 42px side-by-side) while the swing decays
  24% → 2%, with ~2,100 dots still lit to show it.

The turn is a real bank rather than a nudge, but it is spread across the whole
leg rather than spiked: the median dot's sideways share swells to about 21% and
decays away, riding a forward rush doing 490–690 px/s underneath it. The first
build concentrated it into a third of the leg and got a 77% spike, and a spike is
exactly what separates out as a "pan" beat. The side-by-side layout turns
furthest, since the mark is 330px off the sky's centre there.

**His SIZE is the sky's own depth law, not a lerp onto a target.** It used to be
`lerp(litRadius, NETWORK_INTRO_RADIUS[0], e)` — a straight line, and measurably
so: its worst departure from a straight line was 0.3% of its range, against 27.9%
for a true perspective curve. Worse, the size was claiming a journey nobody was
making. Measured three ways over the same leg: the camera really travelled ~1.5
depth units, his own clock closed 0.185 (he was on the plain flow clock while the
crowd was on the warped one, ~10x faster), and his drawn size implied 3.1. Three
numbers that should have been one.

Now his depth closes from where his trip had him to `APPROACH_Z_END`, and both
his radius and his position come off that depth through `depthSize` and `skyMag`
— the same two functions every dot in the field obeys. `APPROACH_Z_END` is
SOLVED by inverting `depthSize` for `NETWORK_INTRO_RADIUS[0]`, with a module-load
assertion that the inversion round-trips, so he lands on exactly the radius the
constellation draws him at. The rendered curve now departs from a straight line
by 34.9% — slightly more than a true 1/z, because the sky's law is a softened
square root and a weak law needs a lot more depth travel to make the same size
change.

That end depth lands INSIDE the near plane, and that is the honest answer rather
than a problem: the volume tops out at 9.5px for a lit dot against a 16px target,
so the constellation's anchor is simply nearer than the crowd is ever allowed to
get. The near plane is where the CROWD recycles; the thing we are flying at does
not recycle, it arrives. `APPROACH_RUN_MS` went to 0.7 of a trip to keep the
camera's own travel in the same range as his closing.

**The sideways slide is solved BACKWARDS from the screen**, and getting that
wrong is what made the leg split a second time — into a zoom followed by a pan.

Setting the slide equal to the depth progress is what a straight-line flight does
in WORLD terms, and it is wrong on screen. His screen offset is
`offset * (1 - slide) * SKY_FAR / z`: the slide shrinks it while the approach
magnifies it, and once the approach magnified by 8.6x (which is what putting his
size on the depth law did) the two nearly cancelled. Measured, 85% of his offset
was still there at `p = 0.6` and 68% at `p = 0.8`, and then it collapsed in the
last fifth. The pan had not gone anywhere — it had all been deferred to the end.

So the slide is derived from the screen instead: say what his offset should do —
shrink on a plain smoothstep, `panEase` — and `cameraSlide` is the one line that
delivers it, `1 - (1 - panEase(u)) * z / zStart`. His screen offset then comes out
as exactly `offset * m(zStart) * (1 - panEase(u))`, with the magnification
cancelled clean out of it. Measured, the pan is now the same even sweep at all
three viewports and at every depth he might have been tapped at:
1.00 · 0.90 · 0.65 · **0.50 at the halfway point** · 0.35 · 0.10 · 0.

It is still ONE camera — the crowd is drawn under this same slide, so near dots
still sweep further than far ones and the turn still carries the sky's depth —
and it is still monotone, both terms of its derivative being non-negative, so the
path to the mark cannot backtrack (measured: 0.00px worst per-frame backtrack,
three viewports x three tap instants).

`panEase(u)` drives it rather than the closing `p`, though the two agree within
7%, for what happens at the ends. `p` has to open at the flow's own rate, so the
slide inherited a nonzero opening and stepped the crowd's speed at the join by
5.5 px/s. A smoothstep opens from rest, leaving the slide to open only through
its depth term: measured worst step 2.3 px/s on a phone (resting 21) and 4.5 px/s
on a wide viewport (resting 44).

The leg's last job is to empty the frame the walk grows into: crowd alpha is
scaled by `crowdFade`, which holds full to `APPROACH_HOLD` and smoothsteps to
exactly zero at the end. `playEntry`'s closing snap onto the static layout then
moves them to a different park under alpha 0, which is invisible, and `WALK`
never touches those slots again.

**The walk is replayed, not re-authored.** `buildIntroDelays` is struck once at
module load (nothing in it depends on the viewport), `lone` hands that array to
the tweener on a cold start, and the `WALK` leg runs `tween.js`'s own per-group
arithmetic against the very same array. One schedule, so the two arrivals cannot
tell different stories, and `INTRO_WALK_MS` falls out of it rather than being
guessed. This is the one writer in the story that wants a leg's LINEAR elapsed
ms — `runPhase` hands every writer both, because easing a schedule authored in
real time would stretch its ends and compress its middle.

**The step card waits for the landing, and so does the dot bar.**
`cardAfter: APPROACH` raises `story.entryHeld` for the choreography's first four
legs, and `Index.svelte` gates step 1's paragraph on it — and, on the same flag,
the registry's `hideBar`, so `StepProgress` stays down until the words it sits
above are on screen. A bar reports a POSITION, and the reader has not been given
one until the card speaks; without that it was up for three seconds over an empty
card. It costs one `||` and generalises: any later step with a `cardAfter` gets
the same treatment with no edit.

**The flag has to be up before the step renders**, which is why `navigate()`
raises it as well as ScrollyVisual. ScrollyVisual only learns there is a
choreography from its render effect, one flush AFTER the step index changed — and
in that flush the bar mounts on an un-held step, starts its fade in, and is then
told to leave again. The reader sees it flash for a second. `navigate()` runs
BEFORE `value` changes (it exists for exactly this class of problem — see
PairQuiz), so it raises the flag for any forward arrival whose destination state
declares a `cardAfter`. If that arrival then turns out not to play a choreography
— reduced motion, a resize — ScrollyVisual drops the flag on the same flush and
the hold lasts a frame. The prose names Bacon, and a paragraph naming him
while the reader is still watching a dot cross the frame answers the question the
motion is asking. It is a separate signal from `settled` on purpose: `settled`
marks the END of a reveal, which here is eight seconds of constellation later,
and which a cold start does not reach for just as long. The gate is dropped by
every later arrival as well as by its own leg, so a choreography the reader taps
through can never leave the next step silent.

Four contracts in `EntryAnim` carry this. `edges` is passed to entry writers as
it already was to ambient ones. `ms` rides alongside `e`. `cardAfter` holds the
prose the way `labelsAfter` holds a name. And `ownsArrival` says the
choreography's first leg reproduces the frame the reader is LEAVING, so there is
nothing for an arrival tween to carry and the legs take the rAF straight from the
step change.

`ownsArrival` exists for the rate. An arrival tween eases its own 700ms
(`easeCubicInOut`), so a sky flowing at one constant speed either side of it
stalls, runs at twice speed through the middle and stalls again — a forward surge
through a starfield, which reads as a slight zoom. No choice of TARGET can fix
that; only not having the tween can. It is the same t = 0 contract an
`AmbientAnim` holds, one step earlier, and it is discharged the same way:
`layoutLone` writes the crowd's colours, `flySky` at `t0` writes their positions,
sizes and alphas, `hold` parks the fourteen and their links at nothing, and
`writeAnchor` at zero envelope draws Bacon as the crowd draws him. Measured, the
seed matches the ambient's last frame to 0.0px in position and 0.0 on the anchor
at every viewport and every tap instant; the only slots that differ are the
highlight beat's own — its inked focus and its spoke targets, which clear in one
frame rather than fading over the tween. That is `stopSweep`'s "the beat went
with the flight" rule applied at the frame, and it happens under a title that is
fading with it.

Two things come with the flag. A state's authored `delays` can only be a LEG's
(there is no arrival hop left for them to stagger), which is what `lone` wanted
anyway — it is why the older `ownsDelays` is gone. And the seed is SNAPPED rather
than tweened, so the departing state must hold no trails; `lone`'s
`revealFrom: ["titleGalaxy"]` guarantees it. A reader can still step through
it mid-flight, exactly as before: the
render effect's `sweeping` guard abandons a running choreography exactly as a
superseding tween used to drop the callback that started it. The three older
entries (`hopSeed`, the career pair, `outro`) omit the flag and keep the tween.

Everything above is scoped by `revealFrom`, which gates entry choreographies as
well as delays. A cold start still plays the plain pop-in from nothing; every
other arrival at `lone` is the reader stepping back into it with the network
already grown, and stays one plain tween; reduced motion bypasses the lot.

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
salt integer. Taken so far: 3–8 across layouts, 9 in `tween.js`, 14 in
`writeFieldCrowd`'s trickle, 21 for a dot's phase in the sky's flow, 22 for the
band column of a dot that is off the canvas when it leaves a chapter card.
(10–13, 15–16 and 18–20 were the flat galaxy's spot, depth and per-dot drift; the
flow replaced all of them, so they are free. Reuse them only deliberately — a
dot's old orbit phase is not a fresh scatter.) 17 is the highlight beat's spoke
draw. The sky's own entry spots use `dotHash`, not this: the trip index walks the
salt by one on every wrap, and stepping a sine hash's input by a constant steps
its phase by a constant, so a dot would re-enter on a slow march across the sky
instead of somewhere new. The beat's spoke picker uses `dotHash` for exactly the
same reason — its candidate counter also walks by one.

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
Walters…), 22,530 rows total (12,097 with a hop of 1–4; the other 10,433 are
unreachable and park hidden). Each row joins
sqlite films/avgDistance/rank with concurrence, top-50 costar log-degree and
the four predicted-distance variants (null when a metric doesn't exist for that
actor; layouts hide non-participants at their distance-scatter park spot —
`parkHidden` in `layout-shared.js`). `hop` is -1 when unknown — those nodes are
hidden in hop-coloured states.

The race chart's three trajectory exports — `raceSeries` (224 anchors),
`genzSeries` (99 contenders) and `backdropSeries` (279 sampled actors) — are all
`top_n: 0` runs of `analysis/actor-trajectory.py`, i.e. mean distance to the
whole giant component. The build asserts that on every one of them, because the
same script can emit a `top_n: N` run that looks identical and is a different
metric: `actor-trajectory-exhaustive.json` puts SLJ's 2025 at 1.6006 against the
2.087 this chart draws. Three casts on one axis only works while all three are
the same measurement.

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
chapter's per-actor hop breakdown for the top 250). Unlike the rest of this
script's inputs, it is committed in this repo's own `data/` directory rather
than read from `ANALYSIS_REPO` — it was missing from the analysis repo for a
while, so a full rebuild could not complete, and keeping a copy here avoids
that failure mode recurring.

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
  fillStyle per dot. The galaxy flight adds one divide and a few multiplies per
  dot on top, against a `new Path2D()` + `arc()` per dot that was already
  running every frame, and three trig calls for the whole frame rather than any
  per dot.

## Required: interaction / drop-off points (agreed 2026-07-05; all built — see "Interactivity")

The story has moments where the reader pauses on a step and interacts (guessing
the #1 actor on the rank ladder, exploring the race-chart timeline, the
scatter-pair quiz). These are handled **on the one persistent canvas** — do not
split the story into one canvas instance per chapter. Object constancy is the
framework's premise, and every canvas unmount is a seam where the entry
animation re-runs and dot identity is lost — chapter transitions (e.g. Present→
Past: rank line → race chart) are exactly where constancy pays off most.

Three rules:

1. **Interactive steps.** The step card hosts the UI (buttons/input); the result
   writes into shared state consumed by the layout function. Implementation
   path: consume the per-step `params` that Step.svelte already registers (see
   "Step → state" above) — a param change re-runs the _current_ layout with a
   short tween, so e.g. panning the rank ladder to the reader's guess is a param
   update, not a step change. The interruption-safe `to()` already covers a
   reader who interacts then immediately steps away.
2. **A gated question owns the way out of its step** (revised 2026-09-11;
   this replaces "every question is skippable / Next must always be
   clickable"). Five steps ask the reader to do something and are followed by a
   step that reads out the answer. Carrying the reader across that boundary
   untouched leaves them reading an answer to a question they never saw put —
   and with the control behind them, no way back to it but Prev. So the
   boundary is closed: on those five steps the reader's Next (tap gutter or
   ArrowRight) is **refused**, and the right-hand gutter goes disabled so the
   step reads as held rather than as a dead tap.

   The step after an interaction still reveals its answer unconditionally (SLJ
   is revealed however the reader got there; a quiz pair the reader never
   picked is still highlighted) — what changed is that they cannot arrive there
   without answering or conceding, not what they are shown when they do.

   Three props on `<Step>` carry this (`Step.svelte` → `stepConfigs` →
   `Index.svelte`'s registry `go()`):
   - **`gate: () => boolean`** — asked before a reader-driven FORWARD move
     leaves the step; while it returns false the press does nothing at all.
     Exposed as the registry's `nextBlocked` for TapNav's disabled gutter.
   - **`skipback: boolean`** — a reader-driven BACKWARD move that would land on
     this step passes through it to the step before. Without this, stepping
     back off the answer drops the reader onto the controls that produced it,
     with the answer still on screen. It is a separate prop and **not derived
     from `gate`**: the quiz has a gate and must not skip back, and step 6's
     gate would evaluate as open on the way back (the guess-reset effect runs
     after `navigate`).
   - **`advanceon: () => boolean`** — the step carrying the reader on itself.
     Index watches it for the active step only, so a reader who steps away
     mid-wait disarms it by leaving; there is no pending flag to clear.

   `advance()` on the `"scrolly-steps"` context deliberately bypasses `go()`,
   which is exactly what lets a gated step's own control out through its own
   gate.

3. **Which five, and what opens each.**
   - **Step 6, the rank guess** (`gate` never opens; `skipback`). Naming #1 or
     pressing Give up calls `advance()` (`GuessRank`). Give up is always on
     screen, so the step can never strand a reader. Stepping back off the
     reveal lands on step 5, and the existing effect in `Index.svelte` clears
     `rankGuesses`/`rankGaveUp` on the way out of the chapter, so walking in
     again re-asks the question with the gate shut.
   - **Step 8, the race rewind** (`gate` never opens; `skipback`). Start asks
     for the pan and advances with it — the rewind is choreographed to play
     _across_ the step change onto the view the next step describes. If the
     camera has no travel left ScrollyVisual drops the ask, but the button
     advances regardless, so a dropped ask is never a dead end. Stepping back
     off the payoff lands on step 7; re-entering `raceRecent` from another
     state resets `renderPlayhead` to the present, so the pan has its full
     travel again.
   - **Step 19, the pair quiz** (`gate` opens on completion; **no** `skipback`).
     The one gate the reader's own Next walks through: the quiz has no single
     completing press, so answering the last pair is what unblocks it. Prev
     stays open throughout, and `states.js`'s `quizDone` is the single
     predicate both the gate and `PairQuiz`'s own starting cursor read — a
     panel with nothing left to ask must be a step the gate lets the reader
     leave, or a reader who reloaded past the quiz and stepped back into it is
     stuck.
   - **Step 25, the simulation** (`gate` never opens; `skipback`; `advanceon`).
     Start asks for the run; the run _is_ the payoff and the next step names
     the winner, so the story waits and then moves on by itself once
     `story.simRuns` is published (the run's single end-of-run write, and the
     reduced-motion path's only one). Walking back into the chapter calls
     `resetSimRace()` from `navigate()` — `simRuns` **and** `simNames`
     together, because the label selectors fall back to `simNames` below the
     run threshold and zeroing the playhead alone would draw all five winners
     on a chart collapsed to the origin.
   - **The Gen Z race step** (`gate` never opens; `skipback`; `advanceon`). The
     same shape as the simulation, one chapter earlier: "Show Gen Z actors" asks
     for the draw-on, the draw _is_ the payoff, and the story moves on by itself
     once `story.genzLinesShown` is published (the run's single end-of-run
     write, and the reduced-motion path's only one). Walking into it calls
     `resetGenzLines()` from `navigate()`, so a reader who came back gets the
     empty plot and a live button rather than the finished chart. Unlike the
     simulation it is one step rather than a chapter, so the reset is keyed on
     the step's own state and needs no "from outside" test — `skipback` means
     the only arrival there is a forward one.

4. **The progress bar merges a gated pair into one dot.** A gated step and its
   payoff are one move to the reader, so they share a dot and the bar does not
   tick twice for it. `Index.svelte` derives `dotSteps` (no `chapter`, no
   `skipback`) and `dotStep` (the gated step lights its successor's), and
   `StepProgress` renders those — it never counts steps by hand. 24 dots today
   (the Gen Z step is gated and `skipback`, so it shares `scatterGenZ`'s dot and
   adding it moved the count by nothing).

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
  Stepping back off raceRecent's second step lands on `rankReveal` (the Start
  step is `skipback`), which hands the panel back and remounts `RankBars` with
  `collapse` false — so walking forward again replays the fold, where a step
  back onto the Start step would have left `rankCollapsed` stuck true.

Two rules come with a measured hand-off like that, both learned the hard way:
publish from a **pre-effect**, so the box is set before ScrollyVisual's layout
effect runs in the same flush and the arrival is one collapse rather than a
tween retargeted mid-flight; and **never re-publish an unchanged value** — that
re-runs the layout effect with an identical params key, which lands in its
catch-all and snaps the very reveal the measurement exists to aim.

Also required before publish: a step-visibility analytics beacon — fire on
`value` changes in `Index.svelte` (the step-driver equivalent of the old per-step
IntersectionObserver) so real reader drop-off is measurable — cheap now,
impossible to retrofit meaningfully after launch.

## Known gaps / next steps

- Step prose overlays the bottom of the full-height canvas (`.scrolly-steps` in
  Index.svelte); layouts should keep essential marks out of the bottom quarter
  where it sits. The tap gutters run the full height of the layout, over the
  card's left and right edges as well, so anything in the card the reader has
  to hit must clear them — a new interactive control in a step card needs the
  same. There are two ways: lift it to `--z-tap-above` (what the inline
  InfoTerm triggers do), or inset it by `--tap-gutter` (what GuessRank's
  controls do). Reach for the inset when a wrapper between the control and the
  card forms a stacking context — `.rank-focus-text` animates opacity with
  `both`, which traps a lift inside it at any z-index. The dot bar takes the
  top `--progress-band` (30px), which every layout already clears (the highest
  plot top is 40px).
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

Per-step sign-off lives in `notes/tween-checklist.md` — one row per step, with
forwards / backwards / mobile arrivals. Anything changed here makes rows there stale;
the rules for working out which are in `CLAUDE.md`.

### Checking a layout or a writer numerically

There is no test runner here, and some of what this framework asserts cannot be
seen in a single frame — the t = 0 contract is a sub-pixel claim, and the sky's
flow being stationary is a claim about a whole minute. Both are cheap to measure
directly, by bundling the modules for Node with the project's own aliases:

```sh
ESB=$(ls node_modules/.pnpm/@esbuild+*/node_modules/@esbuild/*/bin/esbuild | head -1)
"$ESB" probe.js --bundle --format=esm --platform=node --loader:.json=json \
  '--alias:$components=./src/components' '--alias:$data=./src/data' \
  --outfile=probe.mjs && node probe.mjs
```

`probe.js` imports `makeNodes` from `scrolly/nodes.js` and `STATES` /
`STATE_AMBIENT` from `scrolly/states.js`, calls a layout, and runs the ambient
writer over the buffer at whatever times it wants. Write these in a scratch
directory, not the repo — they are a measuring instrument, not a fixture. What is
worth measuring:

- **the t = 0 contract**: `|writer(attrs, trails, 0) − static layout|` over every
  node slot. It should come out at one Float32 ULP (~2.4e-4 at sky coordinates),
  not zero — `tweener.current` is Float32 and a layout is Float64.
- **the flow's stationarity**: on-canvas population and centre-to-edge density
  sampled across several minutes. Holds within 2% and 5% respectively.
- **`hopBands`' columns**: none outside the plot, and the band filled evenly —
  the off-canvas hash in `departureColumn` is what makes both true.
- **cost**: the writer over a few thousand frames. It is ~0.04ms for 12,097 dots,
  against a `Path2D` + `arc()` per dot that `drawScene` already pays.

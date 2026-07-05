# Scrolly visual framework (object-constancy PoC)

Status as of 2026-07-04: working PoC, committed. This documents the framework in
`src/components/scrolly/` so a fresh session (or collaborator) can pick it up.

## What it is

A scroll-driven visual for the sticky `.scrolly-visual` container in
`src/components/Index.svelte`. ~1,000 dots ("actors") with **stable identities**
live on one canvas for the whole story; as the reader scrolls between steps, the
dots tween seamlessly between per-step layout **states** (object constancy — dots
travel, they don't fade out/in wholesale). As of 2026-07-05 the framework runs on
**real data** (see "Data" below) and the first three story steps (`lone` →
`networkIntro` → `network`) are implemented; later states are still placeholders
for the visuals in `notes/storyboard.md`.

## Files

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/scrolly/nodes.js`             | Real data: `makeNodes()` → `{ nodes, edges }` decoded from `src/data/scrolly-nodes.json` (built by `npm run scrolly-data`). 1,008 `ActorNode`s (`id, pid, name, hop, films, avgDistance, rank`); node 0 is the anchor (Kevin Bacon), ids 0–14 are the curated intro network in reveal order (`INTRO_IDS`), edges are the 18 intro edges. Also exports `ANCHOR_ID`, `INTRO_LAYOUT` (baked 860×680 planar intro coords) and `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders). |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                                                                                                                                                                                                              |
| `src/components/scrolly/states.js`            | One pure layout function per state + `OVERLAYS` captions. All geometry/color constants live here.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/components/scrolly/Step.svelte`          | One scrolly step: prose in the slot, visual state declared on the tag (`<Step state="network">…</Step>`). Registers `{ state, params }` in document order with the `"scrolly-steps"` context provided by `Index.svelte`, and derives its own active styling — no hand-numbered step indices anywhere.                                                                                                                                                                                                                                                        |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                                                                                                                                                                                                        |

JSDoc typedefs (`ActorNode`, `Edge`, `LayoutResult`, `LayoutFn`, `Tweener`) are in
`nodes.js` / `states.js` / `tween.js` — VS Code type-checks them without any build
config. If the framework graduates to production, converting the folder to `.ts`
is mechanical.

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

- `delays` provided → choreographed reveal (e.g. `network` ripples outward at
  `hop * 250ms`).
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
`{ state: string, params?: Object }` per step. `Index.svelte` passes
`stepConfigs[value ?? 0]?.state` to `ScrollyVisual`; the prop is `undefined`
for a beat on first client render (the visual mounts before the steps
register), so ScrollyVisual guards on it. `params` is reserved for per-step
layout variation (e.g. which actor a rankLine step highlights) — registered
now, not yet consumed. Current mapping: 0 lone · 1 networkIntro · 2 network ·
3–4 hopBands · 5–9 rankLine · 10+ scatter. Steps needing _different visuals_
get _distinct state keys_ (networkIntro vs network); `params` is reserved for
variation within one layout.

## How to add a state

1. Write `layoutFoo(nodes, w, h)` in states.js: fill a `Float64Array(ATTR_SIZE)`
   via the `set()` helper, return `{ attrs }` (plus `delays` if choreographed).
2. Register it in `STATES`, then use it from `Index.svelte`:
   `<Step state="foo"><p>…</p></Step>`.
3. Optionally add an `OVERLAYS.foo` entry (`caption`, `xLabel`, `yLabel`) — the
   overlay is plain HTML absolutely positioned over the canvas and fades per state.

Use `hash01(n.id, <new salt>)` for any per-node scatter/jitter — pick an unused
salt integer (used so far: 1–5 in layouts, 9 in tween.js).

## Data

`src/data/scrolly-nodes.json` is generated by `npm run scrolly-data`
(`tasks/build-scrolly-nodes.js`) — deterministic (no RNG; byte-identical re-runs),
asserts its own correctness (Kevin Bacon rank 175, derived ranks reproduce
`closeness-ranking-top200.json`, intro hops cross-checked against the hop tree).
Sources, all in the `references/pudding-post` submodule:

- `design/data/intro-bacon-network.json` — the curated 15-actor intro graph
  (ids 0–14, baked planar layout, 18 edges, node order = reveal order).
- `design/data/hop-tree-shared.json` — 10,136 real actors with hop distance from
  Kevin Bacon; sampled stratified by hop (all of hops 1 and 4, top-degree slices
  of hops 2 and 3) to ~1k.
- `data/actor-metrics.sqlite` — films/avgDistance for every sampled actor; rank
  is the ordinal position over all 162k corpus actors (ties by person_id). This
  file is **gitignored in the submodule** — the generated JSON is committed, and
  the script only re-runs on machines that have the submodule's data locally.

Ranks are corpus-global (up to ~162k), so ranked layouts must plot by _sampled
rank order_ (see `layoutRankLine`), never by raw rank vs `nodes.length`.
`hopBands` note: sample proportions per hop (96/538/240/133) are not the true
corpus `bucket_totals` (1,581/113,396/47,119/133) — if a step's copy cites true
proportions, scale bands by `bucket_totals`, not sample counts.

## Rendering / mobile notes

- Canvas is dpr-scaled (capped at 2 for mobile fill-rate) via `ctx.setTransform`.
- Sizing comes from `bind:clientWidth/clientHeight` on the wrapper; a dimension
  change re-runs the layout with duration 0 (jump, no tween).
- `prefers-reduced-motion: reduce` (live matchMedia listener) forces all
  transitions to jumps and disables the overlay fade (CSS media query).
- Perf headroom: 1k nodes is trivial; if node count approaches 10k, bucket dots
  by color instead of an `rgba()` string per dot in `draw()`.

## Required: interaction / drop-off points (agreed 2026-07-05, not built)

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
- Scrolling backwards network → networkIntro replays the reveal stagger on
  nodes that are already visible — cosmetic; direction-aware delays if it
  grates.
- Reference implementations the patterns were adapted from:
  `references/pudding-post/design/stories/components/hop-graph.js`
  (`transitionTo`) and `.../primitives/actor-dot.js` (color/alpha tokens). The
  canvas hop colors in states.js are hardcoded rgb of the tokens in
  `src/styles/variables.css`.

## Verify

`npm run dev`, scroll steps 0–10: dots travel between states; flick-scroll fast —
dots retarget mid-flight (no snap-back). Check 375px and 320px emulation, rotate,
and DevTools "emulate prefers-reduced-motion". `npm run build` must stay green.

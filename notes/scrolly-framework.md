# Scrolly visual framework (object-constancy PoC)

Status as of 2026-07-04: working PoC, committed. This documents the framework in
`src/components/scrolly/` so a fresh session (or collaborator) can pick it up.

## What it is

A scroll-driven visual for the sticky `.scrolly-visual` container in
`src/components/Index.svelte`. ~1,000 dots ("actors") with **stable identities**
live on one canvas for the whole story; as the reader scrolls between steps, the
dots tween seamlessly between per-step layout **states** (object constancy — dots
travel, they don't fade out/in wholesale). Placeholder states/data only: the real
per-step visuals from `notes/storyboard.md` come later on top of this framework.

## Files

| File                                          | Role                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/nodes.js`             | Synthetic seeded data: `makeNodes()` → `{ nodes, edges }`. 1,000 `ActorNode`s (`id, hop, films, avgDistance, rank`) from a mulberry32 PRNG (fixed seed → deterministic every reload). Node 0 is the anchor (Kevin Bacon). Also exports `hash01(id, salt)` — deterministic per-node randomness used everywhere (never `Math.random`, which would flicker between renders). |
| `src/components/scrolly/tween.js`             | `createTweener(size, draw, stride)` → `{ current, to, stop }`. One rAF loop lerping a flat `Float64Array` from the _currently rendered_ values to a target. `to(next, ms, jitter, nodeDelays?)`. Vanilla (hand-rolled `easeCubicInOut`), no d3.                                                                                                                           |
| `src/components/scrolly/states.js`            | One pure layout function per state + `OVERLAYS` captions. All geometry/color constants live here.                                                                                                                                                                                                                                                                         |
| `src/components/scrolly/Step.svelte`          | One scrolly step: prose in the slot, visual state declared on the tag (`<Step state="network">…</Step>`). Registers `{ state, params }` in document order with the `"scrolly-steps"` context provided by `Index.svelte`, and derives its own active styling — no hand-numbered step indices anywhere.                                                                     |
| `src/components/scrolly/ScrollyVisual.svelte` | Canvas host wired into `Index.svelte` as `<ScrollyVisual state={…} />` (a state name, not a step number). Owns dpr scaling, resize, reduced-motion, the HTML overlay, and the `$effect` that reacts to state changes.                                                                                                                                                     |

JSDoc typedefs (`ActorNode`, `Edge`, `LayoutResult`, `LayoutFn`, `Tweener`) are in
`nodes.js` / `states.js` / `tween.js` — VS Code type-checks them without any build
config. If the framework graduates to production, converting the folder to `.ts`
is mechanical.

## Core contracts

**Attr array.** All render state is one `Float64Array(ATTR_SIZE)`:
`STRIDE = 7` values per node — `x, y, radius, red, green, blue, alpha` — indexed by
`node.id * STRIDE`, plus one trailing slot `attrs[EDGE_ALPHA_INDEX]` for the
network-edge opacity (edges fade as a group; dots morph individually).
Alpha carries visibility: hidden nodes get `alpha 0` but still get _positions_, so
later fade-ins don't teleport.

**Layout function.** `(nodes, w, h) => { attrs, delays? }` — pure, computed in
actual pixel dimensions (no vh anywhere; the parent is pixel-sized by
`useWindowDimensions`). `delays` is optional: `Float64Array(DELAY_SIZE)` of
per-node start delays in ms (index = node id; `EDGE_DELAY_INDEX` for edges).

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
now, not yet consumed. Current placeholder mapping: 0 lone · 1–2 network ·
3–4 hopBands · 5–9 rankLine · 10+ scatter.

## How to add a state

1. Write `layoutFoo(nodes, w, h)` in states.js: fill a `Float64Array(ATTR_SIZE)`
   via the `set()` helper, return `{ attrs }` (plus `delays` if choreographed).
2. Register it in `STATES`, then use it from `Index.svelte`:
   `<Step state="foo"><p>…</p></Step>`.
3. Optionally add an `OVERLAYS.foo` entry (`caption`, `xLabel`, `yLabel`) — the
   overlay is plain HTML absolutely positioned over the canvas and fades per state.

Use `hash01(n.id, <new salt>)` for any per-node scatter/jitter — pick an unused
salt integer (used so far: 1–5 in layouts, 9 in tween.js).

## Rendering / mobile notes

- Canvas is dpr-scaled (capped at 2 for mobile fill-rate) via `ctx.setTransform`.
- Sizing comes from `bind:clientWidth/clientHeight` on the wrapper; a dimension
  change re-runs the layout with duration 0 (jump, no tween).
- `prefers-reduced-motion: reduce` (live matchMedia listener) forces all
  transitions to jumps and disables the overlay fade (CSS media query).
- Perf headroom: 1k nodes is trivial; if node count approaches 10k, bucket dots
  by color instead of an `rgba()` string per dot in `draw()`.

## Known gaps / next steps

- Step cards are bottom-anchored (Step.svelte `align-items: flex-end`) so the
  visual's center stays clear on mobile; real visuals should still avoid the
  bottom quarter where the card sits.
- Overlay label swap uses `{#key}`: new label fades in, old one is removed
  instantly (no crossfade). Fine for PoC; use Svelte transitions later.
- Annotations/popovers (agreed approach, not built): `draw()` copies coords for
  annotated node ids into a small `$state` array so HTML/SVG labels track dots
  mid-tween; tap support = nearest-node hit-test on canvas click (~40 lines).
- Data is synthetic (`nodes.js`); real data lives in the submodule
  `references/pudding-post/design/data/` (e.g. `intro-bacon-network.json`,
  `closeness-ranking-top200.json`) — swap in by generating the same `ActorNode`
  shape.
- Reference implementations the patterns were adapted from:
  `references/pudding-post/design/stories/components/hop-graph.js`
  (`transitionTo`) and `.../primitives/actor-dot.js` (color/alpha tokens). The
  canvas hop colors in states.js are hardcoded rgb of the tokens in
  `src/styles/variables.css`.

## Verify

`npm run dev`, scroll steps 0–10: dots travel between states; flick-scroll fast —
dots retarget mid-flight (no snap-back). Check 375px and 320px emulation, rotate,
and DevTools "emulate prefers-reduced-motion". `npm run build` must stay green.

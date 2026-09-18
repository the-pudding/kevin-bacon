# Handoff: the galaxy is a flowing 3D field — awaiting visual sign-off

## Where this stands

The galaxy views (`hopSeed` at `?step=2`, the three `chapterCenters` cards at
3/12/20, and `outro` at `?step=28`) are no longer a flat 2D field of drifting
dots. They are a volume the camera flies forward through: a dot enters at the far
plane, streams outward from the vanishing point as it comes toward the reader,
growing and darkening, passes the camera and enters again somewhere new.

**Built, green on `npm run build` and `npm run lint`, and measured. Not visually
signed off** — every row of `notes/tween-checklist.md` is `[!]`, and only Owen
marks a row `[x]`.

There is no outstanding design question. If the next session is picking this up,
it is to look at it in a browser and tune, not to decide anything.

## Read first

- `notes/scrolly-framework.md` — the contracts. `STATE_AMBIENT` (~:152) for the
  flight, "Chapter cards" (~:1045) for the sky's depth and the handoff into
  `hopBands`, and "Checking a layout or a writer numerically" at the end for how
  to measure any of it without a test runner.
- The "Tween sign-off" section of `CLAUDE.md`.

## What it is made of

| File                                                            | What lives there                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/layout-shared.js`                       | All of it: `skyFrac`/`entrySpot`/`flowSpot` (the flow, pure in `(id, t)`), `fieldSpot` (the flow at t = 0), `fieldDepth`/`depthSize`/`depthFade`, `flightWindow`, `skyFlight` (the published clock), `makeFlight` |
| `src/components/scrolly/layouts/hop-bands.js`                   | `departureColumn` — the column a dot leaves a chapter card in                                                                                                                                                     |
| `src/components/scrolly/layouts/chapters.js`, `layouts/race.js` | the fifteen and the outro cast taking the crowd's depth and window                                                                                                                                                |
| `src/components/scrolly/ScrollyVisual.svelte`                   | `stopSweep` drops the layout cache when a flight stops (see below)                                                                                                                                                |

## The two things that are not obvious

**The flow is a pure function of `(id, t)`, and it has to be.** Two very
different things read it: the per-frame writer, and the layouts — which are the
flow at t = 0, and, for `hopBands`, the flow at whatever moment the reader
stepped off the card. One definition, two readers.

**One published number, and one impurity.** `skyFlight.t` is the flow's clock.
`hopBands` reads it, which makes that layout the only thing in the story that is
not a pure function of `(state, w, h, bleed, params)` — so `stopSweep` drops the
whole layout cache whenever a flight stops. It runs before any layout is built on
a state change, which is what makes the frame the bands are struck against the
frame the sky was showing when the reader tapped.

## Tuning knobs, in the order worth reaching for

- `FLIGHT_CYCLE_MS` (26s) — one dot's trip across the whole volume. **The feel
  knob.** Shorter streams faster.
- `SKY_FAR` (4, against `SKY_NEAR` 1) — how far a dot is carried across the frame
  per trip. Bigger is more dramatic, and pushes more of the crowd past the plot,
  which `departureColumn`'s off-canvas rule absorbs.
- `FLIGHT_FADE` (0.12) — how long a dot takes to fade in and out at the ends of
  its trip; 3.1s at the current cycle. Raise it if the wraps read as shimmer.
- `GALAXY_SPREAD` (1.46) — the ENTRY box, not the sky's extent. Retune it against
  the on-canvas count, never by eye on one frame.
- `SKY_DEPTH_GAMMA` (0.5) — how hard depth pushes size and alpha apart. The ink
  normaliser is derived, so changing this cannot leave a stale number behind.

## What was measured, so a regression is recognisable

- t = 0 contract: 2.4e-4 (one Float32 ULP) for all three galaxy states.
- Stationary over 10 minutes: 12,097 dots written every frame, ~2,400–2,580 on
  canvas, centre-to-edge density 0.24–0.27, ~30 of 12,097 fully faded at any
  instant. Every actor passes through the visible frame at least once.
- `hopBands`: 0 columns outside the plot, band density uniform to ±5%.
- Writer cost: 0.039ms/frame for 12,097 dots.

A naive recycle — wrapping a dot's depth without re-drawing its entry spot — is
NOT stationary and doubles the on-canvas count mid-cycle. It looks fine in a
still. Measure after touching any of this.

## What to look at, and the one honest caveat

Watch a full 26s cycle on a card for a wrap that reads as a pop rather than a
fade; births happen on canvas at roughly 220/s, but each is a 3.1s ramp, so the
failure mode is a general shimmer in the field's brightness, not individual dots
appearing.

**The caveat Owen has already been given:** on a light background, faint grey
dots streaming outward may read closer to drifting motes than to stars. That is a
look to accept or reject, not a bug — and the background staying light is a fixed
decision.

## Left undone

- Phone perf at 375px is unmeasured in a real browser. The writer is cheap; the
  `Path2D` + `arc()` per dot that `drawScene` already pays is what to watch.
- Every checklist row is stale, including the cross-cutting passes. Two new rows
  were added there for the flow (sit on a card for two cycles; reduced-motion and
  cold `?step=4`).

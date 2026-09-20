# Chapter cards

> Design notes for the chapter cards and the side-by-side layout, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

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
`introPosition(PULLBACK_ZOOM)` and already drawn as sky, so the arrival tween has
nothing to carry at all: the title fades up, the dot bar fades out, and not one
dot moves. The fifteen used to shrink and grey on this arrival; the pull-back now
does that too (`writeIntroIntoSky`), so the only thing the card adds is the
words. The blooming-outward move belongs to the pull-back that precedes it —
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
`plot.js` with a setter, rather than a seventh argument, because
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
- **A choreography cannot survive a bare move**, because a frame writer closes
  over the box it was built for. Nothing in the story does it — every swap is a
  card arriving or departing, and the state change abandons the choreography —
  so rather than carry a rebuild path that never runs, `isResize` counts a bare
  move as a resize when a choreography OUTLIVES the run, and that falls back to
  the snap.

  The qualifier is the whole of it, and leaving it off cost the story three
  arrivals. `choreo` owns the card's ambient sky as well as the sweeps the rule
  was written for, and a card drifts its sky forever, so a choreography is
  running on **both** sides of every swap: `dx !== 0 && choreo.active` alone
  scored every departure from a card as a resize. Stepping back from a card, the
  chart the reader returned to was simply there in its final positions under a
  fading title, with not one dot travelling (measured: the canvas bitmap
  identical from the frame of the press to settled). It is `stateName ===
prevState` that separates a choreography this run abandons from one that will
  still be writing on the next tick.

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

The band is a **constant**, defined once as `TITLE_BAND` in `plot.js`
and set from there onto `.scrolly-layout` as `--title-band` by `Index.svelte` —
never measured, and never varied per state. `height` is bound to `.visual`'s
`clientHeight` and sits inside `resized`, which stops any sweep and takes the
instant-snap branch; a band that changed between states (say, only on states
that carry a title) would resize the canvas on exactly the transitions that
animate. That was tried, and it snapped outro's 4s pull-back on arrival from
`raceClose`. Nothing in the render path may make `width`, `height` or
`canvasWidth` depend on the band.

The intro fifteen arrive already dissolved. `cardSpot` gives them `introPosition`
at `PULLBACK_ZOOM` — hopSeed's landed camera — which is the mark the pull-back
left them on, and the pull-back has already taken their radius, grey and alpha to
the crowd's over its own travel (`writeIntroIntoSky`), Bacon included. So what
dissolves is the diagram, not their positions: the constellation becomes the
crowd where it stands rather than scattering into it, which is the visual form of
the line the reader has just read. The card then carries them on the same flight
as everyone else, off the same clock, which is why stepping between step 3 and
the card moves nothing: one `makeFlight` over `SKY_IDS` on both sides, checked at
every box and at several clocks to be identical to the last bit.

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
(measured at ±5% across twelve columns).

**Latent, and not visible: the intro fifteen take a stale column off a card.**
`departureColumn` branches on `isIntroActor` and hands them their resting
`cardSpot` column on the grounds that they are outside the flow. They are not,
and have not been since the card started flying them: the card carries them on
`SKY_IDS` like everyone else, so the column they get is not the contraction of
the column they are standing in.

Measured against the crowd's own rule applied to their live position — which
reproduces every crowd dot's column to 0.00px, so the metric is the rule — the
fourteen (the anchor is placed at `w / 2` by the hop-0 branch and is not
affected) are off by a median of 12–54px on a phone and 134–220px beside the
prose, worst 160px and 327px, depending where in the cycle the reader taps.
Fourteen dots of 12,097, inside a curtain where the dots either side of them are
travelling further than that; the 4 → 5 sheets at both boxes show no streak, no
clump and band edges as crisp as the baseline's. So it is a correctness gap and
not something a reader can see.

Fixing it needs the fifteen's ray, which `makeFlight` derives from their base and
keeps to itself, exposed as a function of `(id, t)` the way `flowSpot` is for the
crowd.

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

# Side by side

> Design notes for the side-by-side layout above 1200px and the full-bleed canvas
> it rests on, moved out of `notes/scrolly-framework.md` on 2026-09-19 as
> `chapter-cards.md`. The chapter cards it also covered, and the prose column's
> swap between chapters, were removed on 2026-09-23. The framework map there
> carries the contracts; this carries the reasoning behind them and the
> measurements that were taken.

**The full-bleed states drop the reading column.** Every state carrying a chart
is drawn inside `#scrolly`'s 700px measure, because a chart wider than the prose
it belongs to stops being readable. The three states that carry no chart —
`titleGalaxy`, `hopSeed`'s pull-back and `outro` — author their crowd across
`galaxyBox` instead: the viewport edge to edge and from the top of the screen
down, then inflated past it about its own centre by `GALAXY_SPREAD`, so the
reader gets the corpus as something too big for the page exactly where the
argument pauses. Nothing fades the crowd at the screen edges — a vignette there
would draw the boundary the full bleed exists to hide.

**The hop chart is the one chart that spans the screen.** `hopBands` and
`hopAnchor` strike their rows across `screenSpan` (`plot.js`): the bled canvas,
capped at 900px about the screen's centre, less a 16px inset each side, and
down to a `MARGIN` off the box's foot rather than `plotBottom`. Four rows of
dots do not get harder to read with width, and with the prose lying over the
chart there is no card or axis below it to keep clear. `.scrolly-visual`'s box
does not move for it: the canvas element already reaches the viewport's edges,
so the chart widens by authoring into the bleed.

Their `proseOver` flag (`isProseOver` in `states.js`) is what puts the prose
over the chart at every width (`.scrolly-steps.over`). The prose fills the box
top to bottom and is centred in it, capped at `--prose-w` and centred across,
and keeps legible over the rows with the halo their `proseHalo` flag gives it.
Below 1200px the words run the column's full width, so the box they centre in
starts below the chart's head (`padding-top`), which keeps them off the 2-movie
row's label. That label, like each row's, now hangs just inside its row's top
edge instead of through the middle. The card's height is not measured while the
prose lies over the chart (the box is then the canvas, not a card), so every
clearance keeps the last real card's height. The chart title centres on the
screen (`titleShift`) and the anchor search's glyph ends where the span does
(`plotRightInset`). A scene's states must agree on the flag
(registry.spec.js), or the title would walk sideways inside a scene.

**Sparse and faint is the whole reading.** Most of the crowd is authored off the
canvas, which is the only sparsity lever available: the set cannot lose members,
because `hopBands` sorts this exact crowd and a dot missing from the sky would
have no row to fall into. What is left on screen is a scatter rather than a
ground of dots, and `FIELD_ALPHA` draws it well under 1 so the title card's name
sits in front of the sky rather than in it. Off-canvas dots cost a fill the
context clips and nothing else. Every galaxy writer takes its alpha from that one
constant — the crowd (`writeFieldCrowd`), the fifteen greying into it
(`writeIntroIntoSky` in `hop-bands.js`) and the closing chart's cast (`race.js`)
— so the three cannot drift apart, and because alpha rides the tween buffer like
position does, every arrival into and out of a galaxy state interpolates it
without being told to.

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

Anything drawn OVER a full-bleed state gets a halo rather than a plate: the
title card's name (`.splash-card h1`), the step prose and the progress bar's
labels and lines (`--bar-halo` in `StepProgress.svelte`) all hold out the
background colour with a stack of shadows. A solid background would be the only
rectangle punched out of the universe. The prose's halo is per state
(`proseHalo`, `isProseHalo` in `states.js`: hopSeed, the hop bands, the outro),
because it is not free on a boxed step, where the field stops at `plotBottom`
and the words sit on plain background: a later inline box's shadows paint over
the glyphs before it, so a comma eats the end of the bold word it follows.

The mechanism is `bleed`, threaded from `ScrollyVisual` as the last argument to
every `LayoutFn` (and to `AmbientAnim.frames`): how far the canvas extends past
`w`, as a `{ l, r }` PAIR. The canvas element is styled `100vw` and pinned to the
viewport's left edge, while the drawing origin is pushed back onto `.visual`'s
left edge by the render transform, so `w`/`h` still mean the column and **every
other layout is unaffected** — only one that deliberately authors outside
`[0, w]` sees any difference.

It is a pair rather than a scalar because the column is centred in the viewport
only in the stacked layout. Side by side with the prose (see below) the column is
the right-hand part of the screen, and a single number cannot say which side the
rest of the canvas is on. It is also MEASURED, off `.visual`'s own rect, rather
than derived from `canvasWidth - width`: that difference gives the total and
never the split. Only five places do arithmetic on it — `galaxyCentre`,
`galaxyBox`, `targetHolds`, and the render transform and clear rect — and every
other layout takes it as an opaque value and forwards it, which is what keeps the
pair cheap. Passing the old scalar where a pair is expected is silent and total:
`bleed.l` on a number is `undefined`, so `galaxyBox` returns a NaN x extent,
every dot in a galaxy state is placed at NaN and the sky renders empty while the
y extent, the title and every non-galaxy state look perfectly normal.

Four consequences worth knowing:

- `bleed` is part of the layout cache key, both halves of it. `w`/`h` are pinned
  to the column, so two different screen widths produce the same `w:h` and would
  otherwise share one cached sky.
- `bleed` is not `$state`, for the reason `sweeping` is not: it says where the
  canvas element sits, which is not something the story is showing. It is
  measured at the top of the render effect (`measureBleed`, which reports only
  whether either side moved) and the element's own `left` is written from it in
  the same place, so there is one reader and one writer and no reactive round
  trip. A move counts as a resize, so it re-fits the backing store and snaps
  exactly as a width change does — the column only shifts in the viewport when
  the viewport itself changes size.
- `drawScene` clears `[-bleed.l, w + bleed.r]`, not `[0, w]`.
- `.visual` is no longer `overflow: hidden` (the canvas has to escape it); the
  clipping moved to `.annotations`, which is what wanted it. `.visual` itself is
  untouched otherwise — it is still the box every panel, hit target and label is
  positioned against, and every hit test measures it.

**Beside, rather than over (>= 1200px).** The story is authored mobile first: the
prose is a card lying across the bottom of the canvas, and every chart keeps the
bottom 40% of the box clear for it (`plotBottom`). Past `BESIDE_MIN_W` in
`Stage.svelte` there is room for the two abreast, so the prose takes a column of
its own on the LEFT, the canvas takes the right, and the charts take that 40%
back. The prose stays on the left for the whole story. The prose column is a
fixed measure, `--prose-w` (what a phone gives the same words), plus
`--prose-gutter`; their sum, `--prose-col`, is the whole of what the canvas gives
up, and two rules read it: `--visual-l` insets the canvas by it, and the title
card and its logo reach back across it to sit on the screen's middle.

Until 2026-09-23 the prose swapped sides at every chapter card, hidden inside the
card's full-bleed sky by re-pinning the canvas origin under the live frame
(`reframe(dx)`). The swap went with the cards, and so did that path.

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
those, and the setter is handed the same `plotFrac` — so there is one expression
and two readers rather than two sources of truth. Anything else in the component
that comes to depend on the plot's floor goes through them, never through
`plotBottom()`.

**`overlayHeight` is the same correction one layer out.** Half a dozen things are
measured off how much of the canvas's bottom edge the step card covers — the
over-canvas panels, the tour caption's floor, the x-axis title's clamp. Beside
the prose the card covers none of it, so `Stage.svelte` derives `overlayHeight`
(0 when beside, the held card height otherwise) and every one of those
clearances reads that. A chart that goes on dodging a card which is not there
leaves a band of empty canvas under it.

Known, and not yet retuned: `raceFuture` and `raceClose` give the future strip
whatever plot width the pan leaves over, which was right when five years at
76px/yr could not fit at any viewport the 700px container allowed. On the wider
column the strip takes most of the plot and the chart reads as one large empty
block. The fix is a real design decision rather than a constant — at this width
the strip could finally carry the chapter's own fixed scale instead of being
fitted — so it is left for a pass of its own.

**`TITLE_BAND` is the same move upward.** `.scrolly-visual` sits `--title-band`
(26px) below the top of the window, to keep each chart's title clear of the
progress bar, so the canvas box stops short of the screen's top edge and a
full-bleed crowd stopped there with it. The canvas element is pulled up through
the band and grown by it (`top: calc(-1 * var(--title-band))`,
`height: calc(100% + var(--title-band))`), the backing store is
`height + TITLE_BAND` tall, and the transform pushes the origin back down by
`TITLE_BAND` — the exact vertical twin of `bleed`, with the same result: `h`
still means the box, and only `galaxyBox` reaches into the strip
(`y0 = -TITLE_BAND`). `drawScene` clears from `-TITLE_BAND` for the reason it
clears from `-bleed`.

The band is a **constant**, defined once as `TITLE_BAND` in `plot.js`
and set from there onto `.scrolly-layout` as `--title-band` by `Stage.svelte` —
never measured, and never varied per state. `height` is bound to `.visual`'s
`clientHeight` and sits inside `resized`, which stops any sweep and takes the
instant-snap branch; a band that changed between states (say, only on states
that carry a title) would resize the canvas on exactly the transitions that
animate. That was tried, and it snapped outro's 4s pull-back on arrival from
`raceClose`. Nothing in the render path may make `width`, `height` or
`canvasWidth` depend on the band.

## The handoff out of the sky

`hopBands` sorts the crowd straight off `hopSeed`'s flowing sky
(`revealFrom: ["hopSeed"]`). The measurements below were taken while a chapter
card sat between the two, flying the same crowd off the same box; they have not
been re-taken since the card was removed.

The intro fifteen are already dissolved when the camera lands. `landedSpot` gives
them `introPosition` at `PULLBACK_ZOOM` — hopSeed's landed camera — and the
pull-back has taken their radius, grey and alpha to the crowd's over its own
travel (`writeIntroIntoSky`), Bacon included. So what dissolves is the diagram,
not their positions: the constellation becomes the crowd where it stands rather
than scattering into it, which is the visual form of the line the reader has just
read. `hopSeed` then carries them on the same flight as everyone else, one
`makeFlight` over `SKY_IDS`.

**The handoff keeps every visible dot's x.** The bands span the same screen the
sky fills, so a dot's column in the bands is its own screen x on the sky: it
falls straight down and moves not at all horizontally, which is the most literal
reading of "sorted" there is. An independently-hashed x would send twelve
thousand dots off on unrelated diagonals and read as static. (Until 2026-09-23
the bands stopped at the reading column and the sky was contracted into it, a
uniform funnel that kept the left-to-right order but moved every dot sideways.)

**And the sky it leaves is flowing, so the column it leaves from is the live
one.** The crowd streams outward the whole time the reader is on `hopSeed`, so by
the time they tap, a dot can be most of the way across the screen from where the
static layout has it — take the resting column and the sort's first frame is
somewhere other than the crowd the reader is looking at. `departureColumn` in
`layouts/hop-bands.js` therefore reads the dot's LIVE sky position. At the flow's
t = 0 it IS the resting column, which is what a cold `?step=4`, a backward arrival
and a reduced-motion read all get.

**A flowing sky has no outer edge**, which is the one thing that does not carry
over from the flat field. A dot is carried out by up to `SKY_FAR / SKY_NEAR`, so
much of the crowd sits further out than the screen is wide. Every one of those is
off the canvas, which makes the rule simple. A dot the reader can SEE falls
straight down from where they see it; a dot they cannot takes a flat hashed
column of its own. The crowd that does land in the bands fills them evenly, so
the bands come out uniform either way: within ±5% across twelve columns at every
test box, which `hop-bands.spec.js` holds.

**Latent, and not visible: the intro fifteen take a stale column off the sky.**
`departureColumn` branches on `isIntroActor` and hands them their resting
`landedSpot` column on the grounds that they are outside the flow. They are not:
`hopSeed` carries them on `SKY_IDS` like everyone else, so the column they get is
not the column they are standing in.

Measured (before the bands spanned the screen, against the contraction the crowd
then got) with the crowd's own rule applied to their live position — which
reproduces every crowd dot's column to 0.00px, so the metric is the rule — the
fourteen (the anchor is placed at `w / 2` by the hop-0 branch and is not
affected) are off by a median of 12–54px on a phone and 134–220px beside the
prose, worst 160px and 327px, depending where in the cycle the reader taps.
Fourteen dots of 12,097, inside a curtain where the dots either side of them are
travelling further than that; the sheets of the sort (then 4 → 5) at both boxes
show no streak, no clump and band edges as crisp as the baseline's. So it is a
correctness gap and not something a reader can see.

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
so inherits the live column; it is alpha 0, and every dot the reader can see on
`hopSeed` is written over it by the crowd and the fifteen, so nothing reads it.

`hopSeed`'s pull-back strikes its box once in `zoomOutFrames`, outside the
per-frame closure, so the leg's last frame and the static layout it settles onto
cannot drift apart; a frame built against a different `bleed` would snap the sky
inward on settle, which is why `EntryAnim.frames` takes `bleed` as well.
`networkIntro` parks the same crowd (invisible, at scale 1) through the same box,
so stepping back out of `hopSeed` zooms the camera in over that state's own
geometry rather than one that merely looks like it from behind alpha 0.
`hopSeed`'s sky shows 12,097 dots: `FIELD_IDS` (12,082 = hop 1–4 less the intro
fifteen) plus the fifteen. If a future layout wants to receive that crowd the
same way, share the x the same way, and pass no box.

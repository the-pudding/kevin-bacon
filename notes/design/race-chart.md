# The race chart

> Design notes for the race chart's camera, axis, future strip, Gen Z field and closing chart, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

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
`raceTuning.yFixedMin` and touches nothing else. The takeover ring sinks to 60%
down the plot with it, which used to push its note onto the axis row on a short
canvas — no longer: the note flips above the ring where there is no room under it
(`raceCalloutGeometry`, "The callouts" below).

Below the window the fit takes back over, **ramped** over
`RACE_Y_FIXED_FADE`–`RACE_Y_FIXED_FROM` (2000–2004) rather than switched, because
raceFull's entry pans from 2006 back through 2004 to ~1980 and a hard swap would
tick the axis 0.08 — half a plot — in one frame mid-pan. Measured, the ramp moves
the plot's edges at most 2.3e-4 per 0.005 of a year of pan, which is less than the
fit's own motion through the mid-1980s, so the crossover is invisible. `raceFull`
below 2000 is untouched by all of this: its cameras fit exactly as they did.
Nothing anywhere clips off the top — no actor in the window comes closer to the
centre than 2.0839.

**Tuning it.** `dev/RaceYBandDev.svelte` is a dev-only curve editor (dynamically
imported in `Index.svelte` under `import.meta.env.DEV`, so a build drops the chunk
entirely — a static import survives tree-shaking, which is why it isn't just an
`{#if}`). It is a full-width strip hung under the plot: drag a control point to
reshape the curve, click to add one, alt-click to drop one, with the shipped curve
behind as a dashed ghost and the chart's live playhead year riding along as a
marker. It installs the curve as `raceTuning.bandSegs` in `race.js` (a plain
object, so nothing reactive lands in the per-frame draw path) and bumps the tuning
revision (`dev/tuning.svelte.js`), which is `ScrollyVisual`'s cue to drop its cached layouts
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
Slider, both writing only `story.race.scrubYear`/`race.scrubbing`, with bounds read from
`story.race.cam` (published by ScrollyVisual, the only component that knows the
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

**Every year on the race chart is written in two digits behind a curly
apostrophe** (`’26`, not `2026`) below `RACE_FULL_YEAR_MIN_W`, and in full at or
above it, through the one formatter `raceTickLabel` — the fixed-scale
historical axis and the strip's fitted one both go through it, so the axis
reads the same either side of the break and the strip's years are not a
special case. Measured against a real `.tick` — Atlas Typewriter at 0.65rem,
monospaced at 7.68px a character — four digits is 30.7px wide against 15.4px
for two (plus the apostrophe), and that is what buys the strip its density:
five 4-digit labels need ~170px in a strip only ~97px wide at a 375px viewport
with the old geometry.

The full-year threshold is keyed on `w`, the reading-column width already
threaded through every race.js layout function (`racePlot(w, h)` and down),
not the app's `BESIDE_MIN_W` — that constant (`Stage.svelte`) is compared
against the raw viewport, and `w` never reaches it: it tops out at ~700px in
stacked layout and ~940-990px in beside layout, capped by the reading
column's own max-width regardless of monitor size. `RACE_FULL_YEAR_MIN_W =
900` fires once beside layout is reached, which in practice is what "enough
room" means for this chart. The historical axis is safe to switch at any `w`
past that — its fixed `PX_PER_YEAR` pitch is far wider than a 4-digit label
needs — but the future strip's fitted pitch rarely if ever reaches 900px of
`w` while it has room to show, so it stays abbreviated in practice regardless
of the threshold; `raceTickLabel` doesn't special-case that, it just never
gets asked for the full form there.

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
with `fill-mode: both`, the same trap the callout documents.

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
rectangle, so it needs none of what put a callout's leader in an `<svg>`. It
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

Arrival and departure are the `openFuture` / `closeFuture` entries in
`layouts/race.js`, the latter retracing both legs in reverse order (the block
closes, then the camera pans back) and skipping the closing beat when the exit
camera (`ArrivalContext.exit`) says the strip was never open. The frontier is
snapshotted on the way out exactly as the playhead is, so stepping back out of a
half-open block closes it from there rather than jumping to full width first.
The legs run forwards, since `rewindFrame` only interpolates `fromP → toP` and a
fixed px-per-year makes either direction a pure translation.

The step's resting frontier lives on `RACE_FUTURE_STEP` rather than only in the
animation, which is what makes a cold mount, a resize and the reduced-motion snap
all land directly on the fully-open state — the same contract an entry's last
leg has to meet, discharged by construction.

**The Gen Z field (`raceGenz`).** The prediction chapter opens by bringing this
chart back one more time and then leaving the crown behind. Three beats on one
step: the dots fly in from the quiz's scatter onto the view the reader left at
the end of the race chapter (`raceFuture`'s, with a few years of history on the
plot); the camera pans DOWN
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
race dot on the plot nothing is inked from the race side; and the callout culls
itself off camera.

**The race cast's departure is a STATIC fact, not something the animator
remembers.** The step's yCap is `-Infinity`, so `raceStepVisible` is empty and its
resting frame carries no race line at all — which is what the pan's last frame
lands on. The leg gets there through the ordinary `shown` mechanism
(`{from: the whole cast, to: ∅}`), so the crown fades out over the first third
while it is still on the plot rather than being cut off the moment the window
leaves it. The 224 then stand hidden in the frontier column (`placeHiddenDots`,
motion.md rule 14), so the chart either side of this step — the quiz behind it,
the careers ahead — brings them on out of the race's leading edge rather than
from wherever their curves ran off the plot.

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
step change. The other 94 are not retracted: their lines stay on their own
projection curves at alpha 0, and their dots stand hidden in the frontier column
(`placeHiddenDots`, motion.md rule 14), which is where the simulation behind
this step brings them back on from. One consequence to know:
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
present, nothing yet out on the strip, the 94 already faded out. The
`drawProjections` entry's leg is chained off that tween's `onDone`, so a reader
who steps on mid-flight skips the draw exactly as they skip any other
choreography. Scoped `revealFrom: ["simRace"]`, so stepping back into this chart
out of the outro does not replay it.

The one thing this entry must NOT do is own its arrival (`ownsArrival`), as the
race chart's other arrivals out of a race step do: that snaps onto the leg's
frame 0, which would land all 99 `SIM_TRAIL_SLOTS` on the arriving layout before
the first frame and destroy the morph the slots exist for. `raceGenz` arrives the
same way, for the same reason.

`outro` then dissolves this chart rather than the simulation's, through the
shared `dissolve()` helper in `attr-buffer.js`, which zeroes every alpha and
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

It is named BACKDROP and not FIELD because `sky.js` already owns a
`FIELD_*` vocabulary for the pull-back crowd (`FIELD_IDS`, `fieldSpot`,
`FIELD_ALPHA`) — the hop 1–4 actors `hopSeed` flies and `hopBands` sorts. Two
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
names, drawn in `INK` at r 5 so each name belongs to one dot. Who the seven are
lives in `cast.js` as `GENZ_NAMED_IDS` (the retired Gen Z scatter read the same
list, so the two charts could never drift apart).

**It reuses the simulation's 99 trail slots** (`SIM_TRAIL_SLOTS`) rather than
allocating a second block for the same 99 actors: a contender's trajectory line
here becomes their win-count climb in `simRace` four steps later. `raceLayout`
therefore skips those slots instead of retracting them when `step.genz` is set.

Sharing the slots is about the buffer, not about the line. The two charts do
**not** declare each other in `TRAIL_CONSTANCY` (`trails.js`), so a slot crossing
between them fades out where it lies and re-enters at its new geometry rather
than morphing: a trajectory through remoteness-over-time and a cumulative win
count are not the same line, and tweening one into the other drew a shape that
belongs to neither chart. The race chapter's own steps DO declare each other,
because there the same curve is genuinely being shown under a moved camera.

**Declared, not a defect:** the seven names ride their dots for the whole
three-second arrival rather than waiting at the right edge for them. On this step
that is the point — the dots enter at the left and carry their names across with
them, so the reader can follow one person in, which is the opposite of the race
chapter's gutter where a name captions a dot that has always been there.

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

The trigger itself is `story.race.genzLinesShown`, a layout param written once at the
end of the run — the same shape as `sim.runs`, and for the same reason. The step
rests with the field NOT on the chart, so the press is what puts it there, and a
resize or a reduced-motion arrival lands on whichever of the two frames the flag
says.

**The callouts.** A claim the chapter wants made is set on the plot rather than
behind a click: an 11px ring on the moment, a sentence of prose, and a leader
tying the two together (`raceCalloutGeometry`, `layouts/race.js`; `RaceCallout`
in `layout-types.js`). The takeover — where SLJ's line crosses Hackman's — is
the chapter's own, and every view of the chart carries it. It was a
click-to-open `InfoTerm`, with a diverging bar spark inside it, until review
feedback that the insight should not be behind a click; the popover and the
spark are both gone, and the ring is now plain decoration with the note carrying
the moment to AT.

**The three moments.** The takeover is the chapter's, on every view of the chart.
`raceFull` marks a second — **Susan Sarandon's peak, 2012**, the year she ranks
9th, solved from the drawn curves by `solveRankPeak` and guarded by a throw so a
rebuild that moves the year or the rank fails rather than shipping a note that no
longer describes its own ring. The note's **"since 1980" is load-bearing, not a hedge**:
unqualified the claim is false, because Faye Dunaway reaches 3rd in 1976, six
places better, in this same field. From 1980 — the first year the camera can rest
on, and the year the step's own prose names — no woman ranks better, Dunaway's
best over that window being 12th in 1981. `solveRankPeak`'s throw guards the year
and the rank; the qualifier is what makes the sentence they carry true, so it
cannot come off without the superlative coming off with it. 1976 is unreachable
anyway: the pan floor is 1980 and a phone's plot holds 2.55 years, so that year
needs ~540px of canvas before it is on screen at all. The note's film count is
the one figure not derived from the committed data — this repo carries a career
total, never a per-year count — so nothing here can guard it. She is also in
the step's `highlight`, which buys her name a place in the gutter: dots ride the
playhead, not the ring's year, so a reader resting at 2017 with her ring still on
the plot would otherwise lose her name to the ten-nearest cut at 17th.

`raceFull` marks a third — **Willem Dafoe's step up, 2021**, the year he leaves
the 8th place he has held since 2017 and takes 5th, on the way to 3rd in 2023 and
2nd in 2025. Unlike the other two the YEAR is declared rather than solved: it is
neither a crossing nor his own peak (that is 2024), but the one place on the
recent half of the chart where a line visibly changes lane, and which year that
is, is a choice about the story. What the data still decides is where the ring
sits and what the note may claim — `rankAt` places it on the drawn curve and a
throw holds the rank at #5, the same idiom as Sarandon's one step weaker. He
needs no `highlight`: he is inside the ten nearest the centre at every year from
2017 on, so `RACE_FULL_LABELS` already carries his name wherever his ring can be
on the plot. Nine years separate his ring from hers, which is more than any plot
holds — `callout.spec.js` asserts that over every box and every reachable
playhead, so a moment added inside a plot's width of another fails there rather
than flickering between the two on a drag.

**A callout is found by scrubbing, and that is accepted.** A ring sits at the
plot's RIGHT edge when the playhead is on its own year, where `CALLOUT_FADE` ramps
it to alpha 0 — so selecting 2012 on the slider shows nothing, and 2013 shows the
note at full strength. The takeover hides this by accident: its crossing is
2005.11, 0.9 years before the year the camera rests on, so it is already 68px
inside the edge. Deliberately not fixed by dropping the entry ramp: the step's
copy is "use the slider to take a look around", and a 220px block of prose
arriving at full opacity is the pop the ramp exists to prevent (motion.md rule 7).

**One at a time, and the most present wins.** A step declares the moments it
marks as a present-first list (`raceCalloutList`), and `raceCallout` draws the
first one the camera has on plot. Two blocks of prose on one plot compete for
the eye and the loser is usually the one the step was about (motion.md rule 6);
the later moment wins because the chart is read left to right as time, so it is
the one the reader has just arrived at. At the shipped `pxPerYear` no two
declared moments are near enough in years to share a plot, so the cull decides
it in practice — the order is what guarantees it once the dev tuner widens the
visible span. The note's prose rides the payload rather than sitting in
`ScrollyVisual`, because the layout is what picks which moment is live.

**A camera LEG carries the chapter's callout alone.** `rewindFrame` and
`futurePanFrame` pin `callouts` back to the default even when they spread a step
that names more. Those are the two leg frames whose playhead travels in x, and a
moment marked somewhere inside the pan would ride the width of the plot on the
way past — raceFull's retrace out of raceFuture crosses every year from 2025
back to 2006. Same override, and the same reason, as `futurePanFrame`'s
`frontier`. A reader's SCRUB is deliberately not pinned: a note should track its
ring through a drag, not blink on every grab.

The crossing is solved at module load by bisecting the two actors' curves
against the same monotone segments the chart draws (`solveTakeover`) — **not**
read off `story.eras`, because `raceSeries` is sampled on whole years, so the
drawn lines cross at 2005.11 while the era record's handover date is 2006-02-17,
~68px further right. The whole payload rides `writeRaceSweepFrame`'s per-frame
return next to `axes` rather than the layout result, which is what keeps the
note glued to the crossing through a scrub instead of freezing (see "Chart
furniture" above), and it culls itself off-camera on the x ticks' own rule.

The note never sits BESIDE the ring, and that is a rule rather than a default.
The ring is not parked — it enters at one plot edge as the camera pans and
slides to the other, so a note held left of it is behind it for most of the pan
and the leader points backwards. On a narrow canvas beside is unreachable at any
playhead: the plot's left margin plus a legible box plus a leader's worth of gap
already overshoots where a ring rests. Above/below is one rule at every width
and every playhead, and it keeps the leader vertical-dominated, which is what
stops it ever reading as reversed.

Below is the preference and the drop shortens to keep the last line off the
x-axis row, exactly as it always did. What is new is where it goes when
shortening runs out: the note FLIPS above the ring rather than overrunning the
axis. Which side is a property of the ROOM, not of the callout, so one moment
takes different sides at different canvas heights — the alternative is one side
chosen for the worst case and a tall canvas paying for a short one. A flipped
note is anchored by its own BOTTOM edge (`RaceCallout.above`, lifted in CSS with
`translateY(-100%)`), which is what keeps the estimated note height out of where
the note lands: the box's real height does the lift, so the estimate decides only
whether the note flips, never where it goes once it has.

That height is **estimated from the note's own text and the width it was given**
(`noteHeight`), not capped at a constant, and the difference is visible. The
takeover's note wraps to seven lines on a 375px canvas against the five a flat
80px assumed, so the old drop clamp thought it had room: the note rendered under
the x-axis row and its last line — "film was in 2004" — was clipped off the
plot. With the estimate it flips above instead and renders whole. Characters per
line from the mean advance of the 12px form face, checked against the shipped
note at the narrowest plot the chapter draws; ragged-right wrapping makes it a
floor rather than an exact count, which is the safe direction — a note assumed
taller than it is flips a little early, where one assumed shorter runs off the
plot. When neither side fits
— the landscape phone the drop clamp was written for, a ~170px plot against a
five-line note — it keeps the shortest drop and the axis row takes the overlap,
because flipping there would only move the problem. The box is held inside the
plot throughout, backing off the right edge by the dot column's radius since
every dot is pinned there at the playhead. The payload also carries an `alpha`, ramped
over the last px of travel at each plot edge — a 220px block of prose blinking
off at the cull reads as a bug where an 11px ring merely reads as culled, and
`{#if}` gives no out-transition to lean on.

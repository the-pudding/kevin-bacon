# The sky

> Design notes for the flowing sky and the chapter card's highlight beat, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

The galaxy states are the only users, and they share one writer: `makeFlight`
(`sky.js`) takes a state's own layout function and the ids to fly
and returns its `frames`. `chapterCenters` flies the crowd **and** the intro
fifteen, who have stopped being a diagram by then; `hopSeed` and `outro` fly
`FIELD_IDS` only, because `hopSeed` is still drawing the constellation as
something to find Bacon in and a diagram that drifts is not one — and holding it
still leaves it standing in front of a sky with parallax, the one place in the
story the constellation reads as foreground. Both of those also have an `entry`
leg — the ambient starts when the pull-back settles, because `settle()` is the
common terminus of both paths.

**Declared, not a defect:** on that step the fifteen are drawn at the crowd's
grey and radius with no links between them, so the only thing separating them
from the sky is that they are the part of it holding still. Read cold that can
look like the flight has snagged rather than like a diagram in front of it. It
stays as it is: the step's job is to hand the constellation over to the crowd,
and re-inking the fifteen here would re-assert a diagram the next step exists to
dissolve. If it is ever changed, the change is to draw them at the network's ink
and radius — not to fly them, which is the one thing that would cost the beat.

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

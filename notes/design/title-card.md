# Title card

> Design notes for the title card and the opening flight, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

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
MARKS the target: `.splash-cue` is an arrow in the outermost strip of the
right-hand tap half (`--control-inset` wide — the whole half answers, so the
arrow does not have to fill it, and the strip is where the thumb the sentence is
talking about actually is). It is the only marking either half ever carries
anywhere in the story. It is why the card is the one thing measured off that cue
rather than off the reading column (`padding: 0 var(--control-inset)`) — a title
running under the arrow would have the reader reading the instruction through the
word it points at.

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

What the fourteen get instead is a park: their `networkIntro` constellation marks at zero
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

## The opening flight

The step off the card is the one arrival in the story that flies somewhere before
it draws anything. `networkIntro` carries a five-leg `entry` (`networkEntryFrames`) that
takes the rAF at the instant of the tap — there is no arrival tween in front of
it (see `ownsArrival` below):

| leg        | ms   | what moves                                                              |
| ---------- | ---- | ----------------------------------------------------------------------- |
| `CLEAR`    | 400  | nothing but the sky; the card's own words fade out over it              |
| `LIGHT`    | 700  | the flying dot inks to `HOP_RGB[0]`, swells `GALAXY_FOCUS_R_MULT`×, α 1 |
| `LOCK`     | 700  | still flying, now lit; the name is up and can be read                   |
| `APPROACH` | 1600 | the flight — the camera banks onto him and runs the sky past            |
| `WALK`     | 2050 | the constellation grows by hop layer, on the schedule a cold start runs |

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
exactly zero at the end. The runner's closing snap onto the static layout then
moves them to a different park under alpha 0, which is invisible, and `WALK`
never touches those slots again.

**The walk is replayed, not re-authored.** `buildIntroDelays` is struck once at
module load (nothing in it depends on the viewport), `networkIntro` hands that array to
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
(there is no arrival hop left for them to stagger), which is what the walk wanted
anyway — it is why the older `ownsDelays` is gone. And the seed is SNAPPED rather
than tweened, so the departing state must hold no trails; `networkIntro`'s
`revealFrom: ["titleGalaxy"]` guarantees it. A reader can still step through
it mid-flight, exactly as before: the
render effect's `sweeping` guard abandons a running choreography exactly as a
superseding tween used to drop the callback that started it. The three older
entries (`hopSeed`, the career pair, `outro`) omit the flag and keep the tween.

Everything above is scoped by `revealFrom`, which gates entry choreographies as
well as delays. A cold start still plays the plain pop-in from nothing; every
other arrival at `networkIntro` is the reader stepping back into it with the network
already grown, and stays one plain tween; reduced motion bypasses the lot.

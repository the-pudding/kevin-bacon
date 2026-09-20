# Tween audit — causes and fixes

Companion to `notes/tween-audit.md`. Every finding in that document's triage
table is marked `[x]` in the **Fix** column, so all 32 are in scope here. This
one answers a different question: **what in the code produces each finding, and
what change would remove it** — grouped by the fix rather than by the finding,
because most of the fixes retire several findings at once.

**Implemented 2026-09-20**, in five commits — the arrival and departure clock,
the local fixes, the HTML beat, the sky handoff, and one correction. What the
code now does is authoritative; the sections below are the reasoning that got
there, and the list immediately following says where they were wrong.

## What this document got wrong

Checked against the code while implementing. These changed what was built.

| Claim here                                                                                | Actually                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix 3c moves every golden with a parked crowd                                             | Moves none. `goldens.spec.js` calls the layout directly, and `parkLeavers` is a render-layer post-process on the tween target.                                                                                                                                                                                                                                                              |
| Fix 3b/4 moves no goldens                                                                 | Moves three: `layoutHopSeed`'s `delays` hash becomes null at all three boxes.                                                                                                                                                                                                                                                                                                               |
| Finding 2 covers 23→24                                                                    | `careerLayout` already collapses its undrawn slots at alpha 0, so the old phase one caught them. 23→24's real fault was `runLegs` stopping the trail tweener at 700ms while its second phase was 69% done, stranding every slot the entry's writer does not stamp. Not in the audit at all.                                                                                                 |
| Fix 1: publish the camera per frame, "safe because params reads `s.race.view`, not `cam`" | Unsafe: `camera.publish` _writes_ `story.race.view`, and that IS a layout param for four states. Gating the panel on the beat closes finding 15 without touching the camera.                                                                                                                                                                                                                |
| Fix 2: the existing `transition: opacity` "does not conflict"                             | It does, and so does the inline per-frame opacity. A `svelte/transition` fade injects `@keyframes` on `opacity`, which outranks the inline write for the fade's length and snaps back at the end. The swap needs a separate channel multiplied into opacity (`--name-alpha`).                                                                                                               |
| Fix 1's gate as `story.settled === stateName`                                             | A state name cannot gate the six steps that share a state with their neighbour. The gate has to be step-scoped, which is what `story.settledStep` is for.                                                                                                                                                                                                                                   |
| Fix 7: give `RACE_RECENT_STEP` a `restPlayhead`, "recommended"                            | This silences the rewind: its plan returns no legs when the camera already sits at the year it pans to. The two steps resting in that state want two different cameras, so the fix is the document's own "principled follow-up" — make a published hold move the camera. A cold `?step=10` is then still on the present, and is recorded as a framework gap.                                |
| Fix 5: make `layoutChapterCenters` read `skyFlight.t`                                     | Rejected. `makeFlight` divides each dot's entry offset by the magnification its RESTING phase implies, so a base authored at another time scales every ray by up to 4x. It also freezes the sky for the length of the tween, and breaks `hopSeed`'s pull-back in a way no test can see, because `skyFlight.t` is 0 under Node. Implemented as a clock threaded through the ambient instead. |

Two latent faults turned up on the way and are fixed: stepping off the title
card dropped up to eighty highlight-beat spokes in one frame, and `axesScene`
grouped `raceClose` with the panning race steps, which would have cut its title
in place had it ever become adjacent to one.

## How to read this

- Findings are cited by their number in `notes/tween-audit.md`.
- Every cause is given as a file and the mechanism, not as a paraphrase of the
  symptom.
- **Pinned** means the mechanism was read directly out of the code and the
  arithmetic matches the audit's measured timings. **Likely** means it is
  inferred and still wants a frame to confirm; each one says what would confirm
  it.
- Three of the audit's own mechanism notes turned out to be wrong or
  incomplete. They are called out as **Correction** where they appear.

## Summary: twelve fixes for thirty-two findings

| Fix                                                    | Retires                                    | Where                                                                      |
| ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| 1. Give the overlay a lifecycle                        | 1, 3, 13 (axes), 15                        | `ScrollyVisual.svelte` render effect + template, `Stage.svelte`            |
| 2. Crossfade a changing label                          | 4                                          | `ScrollyVisual.svelte` `.node-label` each-block                            |
| 3. A departure fade for trails, edges and parked dots  | 2, 9, 12, 31                               | `tweenTrails`, `EDGE_LAG_DELAYS`, `render.js`, the parking layouts         |
| 4. Chain off the dot tween, not the edge-lagged settle | 8, 7 (freeze), 13 (timing), 19, 27, 30     | `tween.js`, `ScrollyVisual.svelte`                                         |
| 5. Hand the sky's clock through a card arrival         | 7                                          | `chapters.js`, `sky.js`, `ScrollyVisual.svelte`                            |
| 6. Hold names until their dots land                    | 11, 20 (names)                             | `ScrollyVisual.svelte`, the four states named                              |
| 7. Land where the words say                            | 5, 17                                      | `race.js`, `race-camera.js`, `arrivals.js`                                 |
| 8. The column swap                                     | 6                                          | `Stage.svelte`, `ScrollyVisual.svelte` `reframe`                           |
| 9. The rank ladder's box and its mount                 | 10, 29                                     | `Stage.svelte`, `RankBars.svelte`                                          |
| 10. Rates, not durations; and consent for long legs    | 14, 19 (rate), 20 (length), 22, 24, 25, 32 | `race.js` timing constants, the design notes                               |
| 11. Prose, bar and button timing                       | 16, 26, 28, 30                             | `Step.svelte`, `StepProgress.svelte`, `Index.svelte`, `StartButton.svelte` |
| 12. Phone-width statics                                | 18, 21                                     | `PairQuiz.svelte`, `ScrollyVisual.svelte`, the layouts                     |

---

## Fix 1 — Give the overlay a lifecycle

**Retires 1, 3, 13 (the axes half), 15. Partly 28.**

### Cause (pinned)

The whole HTML overlay is rebuilt from the arriving state's layout, wholesale,
inside the render effect, one statement after the layout is built:

```js
const layout = layoutFor(stateName, width, height, layoutParams, bleed);
decor = staticDecor(layout);
```

`staticDecor` is `{ axes, notes, takeover, band, legend, legendY, hits }` — the
whole furniture set. Assigning it does three things in the same flush:

1. **The departing furniture is destroyed.** Every overlay element lives in an
   `{#if}` (mostly inside a `{#key}`) over `decor` or over the new state's
   `OVERLAYS` entry. There is no out-transition anywhere in `.overlay`, so a
   piece of furniture the arriving state does not carry is removed from the
   document in the frame the press lands. That is the audit's "leaving is a
   cut", on 52 of 114 runs.
2. **The arriving furniture mounts immediately** and plays `.fade-in`
   (`animation: fade-in 0.4s ease both`) from that same frame — hence "complete
   at a median of 275 ms while the dots are still moving".
3. **The `{#key}` blocks make it worse for anything whose text changes**: the
   chart title, the axis titles and the two y hints key on their own string, so
   a changed string destroys the old node and mounts a new one with no
   crossfade.

`chartVeiled` and `hopBandsVeiled` already implement exactly the missing gate,
but each is scoped to one arrival: `chartVeiled` is raised only by an entry that
declares `veil` (today just `drawOn`), and `hopBandsVeiled` is hard-coded to
`stateName === "hopBands" && story.settled !== "hopBands"`.

The two panel findings are the same shape one layer up:

- **Finding 3 (the quiz panel).** `Stage.svelte` renders the active step's
  panel as `{@render steps.config?.panel?.()}`. A snippet render cannot carry a
  Svelte transition — this is the exact reason the file gives for chapter cards
  _not_ being panels ("Rendered from the registry rather than by `<Chapter>`
  itself so this `{#if}` is stable and Svelte can play the out-transition; the
  panel render above cannot"). `PairQuiz`'s own root is a bare `{#if pair}`,
  and `phase` is initialised to `"asking"`, so the question, both buttons and
  the dim are all live in the first frame after the press. Backwards the whole
  subtree is discarded in one frame.
- **Finding 15 (the scrubber reads 2006 for ten seconds).** Two separate
  mechanisms, and the second is the substantive one:
  - the panel mounts with the step, like every panel;
  - **`story.race.cam` is only written at rest points.** A choreography's
    per-frame camera goes through `applyFrame` → `camera.apply(out.camera)`,
    which updates the camera object's own `playhead` and nothing else.
    `camera.publish` — the only writer of `story.race.cam`, which is what
    `RaceScrubber` displays — is called from `finishChoreography`, from the
    scrub loop's `onEnd` and from two `$effect`s on `stateName`/box. So on
    12→11 the `camera.reset` effect puts the camera on `raceFull`'s
    `restPlayhead` (2006), publishes that, and then `closeFuture` pans from
    2025 down to 2006 over ~9 s without the control ever hearing about it.
- **Finding 13 (the axes half).** On 21→22 the ticks the reader sees for the
  first second are `staticDecor`'s — `raceGenz`'s _resting_ axes, at `yOpen 1`
  — because `panDown` does not declare `ownsArrival`, so its legs (which
  publish the real per-frame axes through `writeLeg`) do not start until the
  arrival tween's `onDone`. The audit's own log catches the swap at 1275 ms,
  which is the arrival tween's true completion time (see Fix 4: 700 + 525).

### Fix

One gate, applied to the whole overlay, and an out beat in front of it.

1. **Generalise the veil.** Replace `chartVeiled` / `hopBandsVeiled` with one
   derived condition — the overlay's contents mount only once
   `story.settled === stateName` — and keep the per-state opt-outs for the
   states that genuinely want furniture during the arrival (the race chapter's
   per-frame axes already come through `applyFrame`, so they must stay exempt
   or a pan would draw no ticks).
2. **Keep the departing furniture for one beat.** Hold the previous `decor` in
   a second variable and render both sets, the old one under an out-fade of
   ~200 ms, before `decor` is replaced. Cheapest version: keep the old `decor`
   object, render it inside a stable `{#if}` with `out:fade`, and swap on the
   next tick. This is the "out, travel, in" sequence the audit's _Bells and
   whistles_ section asks for, done in one place.
3. **Panels get the chapter card's treatment.** `Stage.svelte` already knows
   how: render the panel from a stable `{#if}` so Svelte can play an
   out-transition, and hold its in-fade behind `story.settled`. That alone
   fixes 3, and the mount half of 15.
4. **Publish the camera per frame for the control.** Either call
   `camera.publish` from `applyFrame` (it is cheap and already idempotent, but
   note it writes `story.race.cam`, so confirm no layout params selector reads
   it — `race.js`'s `params` reads `s.race.view`, not `cam`, so this is safe),
   or have `RaceScrubber` read the live camera rather than the published
   bounds. Publishing per frame is the smaller change and makes the control
   agree with the chart through every choreographed pan, not just this one.
5. For 13, additionally give `panDown` `ownsArrival: true` so its legs own the
   frame from the press and the resting axes are never drawn (see Fix 4).

### Note

This is the single biggest change in the list and touches every step. Expect to
stale the whole checklist.

---

## Fix 2 — Crossfade a changing label

**Retires 4.**

### Cause (pinned)

The node labels are _not_ `{#key}`ed. They are:

```svelte
{#each tracked as t (t.id)}
	<p class="node-label" style="transform: …; opacity: {t.labelAlpha}">
		{t.name}
	</p>
{/each}
```

Keyed by `t.id` alone, and `t.name` is `labelTexts[id] ?? nodes[id].name` where
`labelTexts` is a `$derived` over `STATE_LABEL_TEXT[stateName](nodes,
layoutParams)`. So when the _text_ changes on an id that keeps its element, the
text node is mutated in place at full opacity, in one frame.

That is 16→17 exactly: both are `scatterCenters`, differing only in
`params` (`showPair` → `showCostars`), so it is a params change, not even a
state change — `ARRIVE.params` → `tweenToParams`. `scatters.js`'s `labelText`
returns `"Natalie Portman · 2.23 remoteness"` for `showPair` and
`"Natalie Portman · 97 of the top 250"` for `showCostars`. 18→19 is the same
thing across a state change (`scatterCenters` → `degScatter`, both labelling
Portman and Kendrick).

**Correction to the audit.** The framework's documented Known gap ("Overlay
label swaps use `{#key}`: the new label fades in, the old is removed instantly")
is about the `.overlay` furniture, not about node labels. Node labels have no
`{#key}` at all, which is why there is not even a fade-in on the new string.

### Fix

Key the label on its text as well as its id — `(t.id + t.name)` — and give the
`<p>` an `in:fade` / `out:fade` of ~200 ms each. Both copies sit at the same
transform, so they crossfade in place with no layout work. The existing
`transition: opacity 0.3s ease` on `.node-label` handles the alpha ride and does
not conflict.

The related checklist rows 14 and 15 (the departing label losing its suffix
before its name fades on 14↔15) are the same fix: the suffix change and the
name's fade-out become one crossfade rather than two events.

---

## Fix 3 — A departure fade for trails, edges and parked dots

**Retires 2, 9, 12, 31.**

The framework has an "out" beat for exactly one case — a trail whose target
alpha is zero. Everything else that leaves does so by being lerped toward its
new home while still visible.

### 3a. Trails that change chart morph instead of fading (finding 2) — pinned

`tweenTrails` builds its phase-one target by copying the live buffer and zeroing
_only_ the slots whose target alpha is already 0:

```js
const fadeTarget = Float64Array.from(trailTweener.current);
for (let t = 0; t < TRAIL_META.length; t++) {
	const a = t * TRAIL_STRIDE + TRAIL_POINTS * 2;
	if (target[a] <= 0) fadeTarget[a] = 0;
}
```

A slot alive in both states therefore skips phase one entirely and is tweened
vertex by vertex over the full `TWEEN_MS`. On 28→27 the five projection lines
and SLJ's line hold the same slots as the simulation's win-count climbs (that
sharing is deliberate — `race.js`'s `drawProjections` comment calls it "the
object constancy those slots were shared for"), so they bend through shapes that
exist in neither chart. On 23→24 the Gen Z field's slots are pulled toward the
career chart.

**Fix.** Make phase one also zero any slot whose _geometry_ changes chart, and
let it re-enter in phase two — i.e. fade out, then fade in, rather than morph.
The exception has to be declarable, because the shared slot on 27→28 may be
intentional: add a per-state (or per-move) opt-in list of slots that are "the
same line", and fade every other slot change. This is one of the audit's open
questions for Owen; the code change is the same either way, only the list
differs.

### 3b. Departing edges ride their dots (finding 9) — pinned

Two things compound:

- `EDGE_LAG_DELAYS` is filled unconditionally for every edge group
  (`EDGE_LAG_DELAYS.fill(EDGE_LAG_MS, nodes.length)`, `EDGE_LAG_MS = TWEEN_MS *
0.75` = 525 ms). The comment says it exists for edges fading _in_ behind
  travelling dots, but it is applied to the whole edge block regardless of
  direction — so a dying edge holds its alpha for 525 ms of a 700 ms tween.
- `render.js`'s `drawEdges` draws a dying edge to its _live_ endpoints:
  `const live = liveEnds || !target || target[i + 1] <= 0.004;` — an edge whose
  target alpha is 0 takes the `live` branch, so it is stretched between two
  moving dots for the whole of that 525 ms.

Under interruption the lag restarts from the second press (`to()` recomputes
`delays[g]` from the new `startTime`), which is the chevron the audit saw
lingering ~900 ms into the second tween.

**Fix.** Build the delay array per arrival instead of using one shared constant:
for each edge group, use `EDGE_LAG_MS` when its target alpha is greater than its
current alpha (fading in) and 0 when it is not (fading out). That single change
covers both the plain case and the interrupted one, and it makes
`EDGE_UNISON_DELAYS` and `layoutHopSeed`'s hand-written all-zero delay array
redundant — both exist only to opt out of the lag for a departure.

### 3c. The crowd sweeps off the canvas (finding 12) — pinned

The arriving layout parks the ids it does not draw at _its own_ park spot, not
where they are standing:

- `sim-race.js`'s `layoutSimRace`: every node not on the sim chart is written to
  `scatterPosition(n, w, h)` at alpha 0.
- `career.js`'s `careerLayout`: nodes with no `careerAge` go to
  `scatterPosition` at alpha 0; nodes with one are drawn on the career chart at
  alpha 0.22.
- `scatter-scales.js`'s `parkHidden` is the shared helper, and its docstring
  states the intent plainly: "its position on the distance-vs-films scatter
  (alpha 0), so it fades in where a later scatter chapter will want it and rides
  one tween into place."

So on 25→26 the career crowd is tweened from (career age, films) to the
distance-vs-films scatter while its alpha runs 0.22 → 0. It is visible for most
of that journey, which is the diagonal band climbing off the top. 26→25 and
27→25 are the same trip in reverse, and 23↔24 is the race cast making it.

**Fix.** Park an id the arriving layout does not draw at the coordinates the
_previous_ frame has it at, so it fades where it stands. The tweener already has
the live buffer; the cleanest place is `ScrollyVisual`'s target construction —
after `layoutFor`, for every slot whose target alpha is 0 and whose current
alpha is > 0, overwrite the target x/y with the current x/y. That is one pass
over the dot block and needs no layout module to change. It does change every
golden that contains a parked crowd, so regenerate them in the same commit.

Note that `parkHidden`'s stated purpose — "fades in where a later scatter
chapter will want it" — is the _arrival_ case and is unaffected: a slot going
from alpha 0 to a real alpha keeps its layout-authored position.

### 3d. Route edges outlast the grey ones (finding 31) — pinned

On 2→3 every edge tweens alpha from its own current value to 0 over one duration
with one ease. `networkIntro` draws a lit route's edges much darker than the
rest (`render.js` blends toward `EDGE_HIGHLIGHT` and thickens by the highlight
channel), so at 290 ms the dark ones are still well above the 0.004 draw
threshold while the field's are below it. Two starting alphas, one ramp, so the
reader reads two fade rates.

**Fix.** Either drop the highlight channel to 0 first (a short pre-beat, the
same 220 ms `TRAIL_FADE_MS` idiom), or scale each edge group's fade duration by
its starting alpha so they all reach invisibility together. The first is
simpler and reads as the route being released before the diagram leaves.

---

## Fix 4 — Chain off the dot tween, not the edge-lagged settle

**Retires 8, the freeze half of 7, the timing half of 13, the first two thirds
of 19, 27, and the dead stretches in 30.**

### Cause (pinned — this is the arithmetic behind every "dead half-second")

`tween.js`'s `tick` computes each group's progress as
`(elapsed - delays[g]) / duration` and only fires `onDone` once **every** group
has reached 1:

```js
for (let g = 0; g < groups; g++) {
    const t = Math.min(1, Math.max(0, (elapsed - delays[g]) / duration));
    if (t < 1) done = false;
    …
}
```

With `EDGE_LAG_DELAYS` the edge groups carry `delays[g] = 525`, so an arrival
tween that is nominally 700 ms does not call `onDone` until **1225 ms**. And
`onDone` is what starts everything chained:

- `startArrival` → `runLegs(…)` — the entry's legs;
- `tweenToState` → `settle(stateName)` → `playAmbient(…)` — the sky.

`arrivalDelays` falls back to `EDGE_LAG_DELAYS` for any state that does not
declare `delays` for this direction — which is every state in the audit's list.
So on states with **no edges arriving at all**, the reader gets 700 ms of dot
travel, 525 ms of nothing, then the second event.

The measured numbers line up exactly: the audit's "landed by about 800 ms …
starts between 1200 and 1600 ms", and the real-clock log catching step 22's tick
swap at 1275 ms.

**Correction to the audit.** 2→3 is listed under finding 8 but does **not** have
this problem: `layoutHopSeed` returns `delays: new Float64Array(DELAY_SIZE)` —
all zeros — with a comment explaining that it is opting out of the lag
deliberately, and `hopSeed`'s `revealFrom: ["networkIntro"]` means those delays
are used on exactly this move. Its leg therefore starts at 700 ms. Whatever dead
time was read on 2→3 is the pull-back's own 4 000 ms leg being slow at the
start (`PULLBACK_ZOOM_MS = 4000`, eased), not an edge lag — so it belongs with
Fix 10, not here.

### Fix

Three parts, in increasing order of scope:

1. **Split the completion signal.** Give `tween.to` a second callback that
   fires when the _undelayed_ groups have landed (or, equivalently, have
   `onDone` fire at `duration + min(delays)` and add an `onAllDone` for the
   full thing). Chain entry legs and `settle()` off the first; keep the
   edge-lag semantics for drawing.
2. **Or make the lag conditional**, which Fix 3b does anyway: once the delay
   array is built per arrival, an arrival with no edges fading in has an
   all-zero delay array and `onDone` fires at 700 ms with no framework change
   at all. This is the cheapest route and probably the right one — it fixes the
   symptom at its source rather than adding a second signal.
3. **Give the chained-leg arrivals unison delays outright**, the way
   `titleGalaxy` already gets `EDGE_UNISON_DELAYS` via the special case in
   `arrivalDelays`. This is the narrow fix if (1) and (2) look too broad.

Option 2 subsumes the special cases already in the file (`EDGE_UNISON_DELAYS`,
`layoutHopSeed`'s zeroed array) and is the one recommended.

### The rest of 19

The 8→9 draw-on has two further causes, separate from the dead time:

- **The 4 s creep** (pinned): `SWEEP_MS = 4000` is a fixed duration, scaled by
  `raceTuning.speedScale = 1.5` → 6 000 ms, whatever span the box shows. The
  lines unspool across the _visible_ span, which is far shorter on a phone, so
  the phone's rate is the slower of the two — hence "6.6 s on mobile and 7.2 s
  on desktop" reading as sub-perceptual. **Fix:** express it as years per
  second, as `rewindMs` already does for camera legs
  (`REWIND_PX_PER_SEC`), so both boxes travel at one on-screen rate.
- **The tenth name (J.K. Simmons) arriving at the settle** (**not pinned**).
  The obvious candidates were checked and ruled out: the leg's visible set is
  literally `RACE_RECENT_VISIBLE` = `raceStepVisible(RACE_RECENT_STEP,
RACE_RECENT_YCAP)`, the same set the static layout computes, and
  `placeCast` applies `edgeFadeAt` to the alpha override as well as to the
  static alphas, so the per-dot alphas at `e = 1` should match the settle.
  What remains is `annotations.js`'s `raceLabelCut`, which is a per-frame top-`
RACE_LABEL_TOP` (10) cut ranked on screen y and filtered by
  `attrs[id * STRIDE + 6] <= 0.004` — so a single dot crossing that threshold
  during the 450 ms `tweenToParams` that follows the leg would free a slot. I
  could not confirm which dot from reading alone. **To confirm:** log
  `raceLabelCut`'s returned set on the leg's last frame and on the settle frame
  and diff them. The fix is the same regardless — see Fix 6.

---

## Fix 5 — Hand the sky's clock through a card arrival

**Retires 7 — and answers the audit's "Why the desktop card arrival differs
from the phone", which it recorded as unanswerable.**

### Cause (pinned)

Three separate facts, all in the code:

1. **The card's layout is the flow at t = 0.** `chapters.js`'s
   `layoutChapterCenters` places the crowd with `writeFieldCrowd`, which uses
   `fieldSpot`, which is `flowSpot(id, w, h, box, 0)`. So the arrival tween
   carries every dot from wherever the _running_ flight has it to its t = 0
   position. That is the re-deal: ~800 ms of the whole sky travelling at
   roughly the rate the flow itself runs at, which is why the audit's rolling-Δ
   measurement could not tell it apart from motion.
2. **The flight restarts from zero.** `sky.js`'s `makeFlight` builds its base
   from `layoutFn(...)` and its clock from the choreographer's own `t0`, so
   `skyFlight.t` goes back to 0 on every new flight. The layout cache is
   dropped when a flight stops (`choreo`'s `onStop` → `layoutCache.clear()`),
   but the cache is not the issue — the authored position is.
3. **The freeze is Fix 4.** `settle()` is what starts `playAmbient`, and
   `settle` is the arrival tween's `onDone`, which waits out the 525 ms edge
   lag on a state with no edges. 700 + 525 = 1225 ms, which is the audit's
   "holds perfectly still for 400 to 500 ms" after an 800 ms landing.

**Why desktop is different.** On a chapter card the prose column swaps sides
(`Stage.svelte`'s `flipped`), so `ScrollyVisual`'s `measureBleed` returns a
non-zero `dx`. `fitBox` then classifies the move as a resize:

```js
const resized =
	width !== prevW ||
	height !== prevH ||
	canvasWidth !== prevCanvasW ||
	(dx !== 0 && choreo.active);
```

`choreo.active` is true (hopSeed's ambient is running), so `resized` is true,
`arrivalKind` returns `"snap"`, `snapTo` lands instantly and calls `settle`
immediately — the ambient restarts with no tween and no dead half-second. On a
phone `beside` is false, `flipped` never changes, `dx` is 0, and the move takes
the tween branch with all three faults. The file even anticipates this: "that
case falls back to the snap."

### Fix

Make the card's arrival continue the flight instead of restarting it.
`hopBands`'s departure columns already do the equivalent on the way out — the
layout reads `skyFlight.t` — so the pattern exists:

1. Have `layoutChapterCenters` place the crowd at `flowSpot(id, …,
skyFlight.t)` rather than `fieldSpot`, so the arrival target _is_ the frame
   the sky is already showing and the tween carries nothing.
2. Start the ambient from that clock rather than from 0 — `makeFlight` needs a
   `t0` offset, or `playAmbient` needs to pass one through the choreographer's
   `loop`.
3. Take the dead time out via Fix 4, so the flight resumes at the dot landing.

Done together, the sky never stops and never re-deals, which is the audit's own
recommendation. Note that (1) makes the layout impure in the cache key's terms —
the same caveat `hopBands` already carries, and the cache is already dropped on
every flight stop, so the machinery is in place.

---

## Fix 6 — Hold names until their dots land

**Retires 11 and the names half of 20. Probably also the tenth-name half of 19.**

### Cause (pinned)

`annotations.js`'s `trackLabels` sets `labelAlpha` to the dot's own alpha for
every id the frame shows, every frame — so a name is glued to its dot wherever
that dot is. There are exactly two gates in front of it:

- `entryLabels`, set only by an entry's `labelsAfter`;
- `heldLabels`, set only by `tweenToState` for names the arrival _introduces_
  (labelled now, not labelled by the state we came from), and only for
  `EDGE_LAG_MS`.

The four states the audit names — `hopBands`, `careerMany`, `scatterQuiz`,
`raceClose` — declare neither. `raceClose`'s entry (`drawProjections`) has no
`labelsAfter`, so all six names ride their dots for the whole 3.9 s draw. And
because `raceLabelCut` re-ranks on screen y every frame, the stack re-sorts as
the dots cross — the audit's four re-sorts on 27→28.

Note that `ARRIVE.entry` calls `resetArrivalGates(from)` and **discards its
return value**, so an entry arrival never gets the `heldLabels` hold that a
plain state change gets. That is worth fixing on its own.

### Fix

1. Add `labelsAfter: [[]]` to `drawProjections` (`raceClose`), which is the
   idiom `drawOn` and `panDown` already use to mean "hold every name until this
   beat".
2. For the states with no entry at all, gate `labelAlpha` on
   `story.settled === stateName` — either as a per-state flag or, better, as
   the overlay-wide gate Fix 1 introduces, since a name is overlay furniture
   like any other.
3. Have `ARRIVE.entry` pass `resetArrivalGates(from)`'s result into the arrival
   the way `ARRIVE.state` does.
4. Run the de-collider against the arriving set only, so a name on its way out
   does not shove an arriving one.

---

## Fix 7 — Land where the words say

**Retires 5 and 17.**

### 5: step 10 rests on 2025 — pinned, and the audit's mechanism is wrong

**Correction.** The audit attributes this to `interactions.md`'s rule that
re-entering `raceRecent` resets the render playhead to the present. That rule is
not what does it. The actual chain, all in `race.js` and `race-camera.js`:

1. `RACE_RECENT_STEP` declares **no** `restPlayhead`, so
   `raceRestPlayhead` falls through to `raceMaxPlayhead` → `extent[1]` →
   `RACE_DATA_END` = **2025**. That is where `camera.reset` puts the live
   camera on every arrival at the step, and it is also the layout the render
   effect builds (because `camera.reset` has just set `story.race.view = null`,
   and `raceRecent`'s params selector is `(s) => s.race.view`).
2. `retraceRewind` — the entry for the back move from `raceFull` — is
   **dead on every normal viewport**. Its guard is
   `if (fromP >= toP) return []`, and `RACE_FULL_STEP.restPlayhead` _is_
   `RACE_REWIND_WAYPOINT_YEAR` (2006), so `fromP === toP` and no leg plays.
   (Compare `rewind`, whose guard is the opposite way round —
   `if (fromP <= toP) return []` — which is the correct test for a backwards
   pan.)
3. With no legs, `arrive` goes straight to `finishChoreography`, which calls
   `finish` = `landAt(RACE_REWIND_WAYPOINT_YEAR)`. `landAt` writes **only**
   `story.race.view = { playhead: 2006 }`; it never touches `cam.playhead`,
   which is still 2025.
4. `finishChoreography` then calls `camera.publish`, which contains:
   ```js
   if (
   	story.race.view &&
   	Math.abs(story.race.view.playhead - cam.playhead) > 0.01
   ) {
   	story.race.view = cam.hold();
   }
   ```
   The two disagree by nineteen years, so the hold the retrace just set is
   **overwritten with 2025**.

The rewind request works because its `finish` is `holdCamera(s, cam)`, which
reads the live camera the legs actually moved — so `cam.playhead` and
`story.race.view` agree and `publish` leaves them alone.

A cold `?step=10` shows 2025 for reason (1) alone.

**Fix.** Make `landAt` move the camera as well as the hold — it is the camera's
job to be the single source of where the chart is, and `publish`'s clamp is
correct as written (a hold that disagrees with the camera _is_ a bug). Either:

```js
const landAt = (playhead) => (s, _cam, camera) => {
	camera.set(playhead);
	s.race.view = { playhead };
};
```

(adding a setter to `race-camera.js` and passing the camera into `finish`), or
give `RACE_RECENT_STEP` a `restPlayhead` of `RACE_REWIND_WAYPOINT_YEAR` so the
camera resets to 2006 on every arrival and a cold `?step=10` lands there too.
The second is a one-line change and also fixes the cold-link case, which the
first does not — **recommended**, with the first as the principled follow-up.

While in here: `retraceRewind`'s guard is almost certainly inverted. If the
intent is "pan back from wherever raceFull's camera is to the waypoint", the
test should be `if (fromP <= toP) return []`. As written the retrace can only
ever play on a viewport where raceFull's camera has been panned _behind_ 2006,
which its own `minPlayhead` floor mostly prevents. Worth deciding before fixing:
with `restPlayhead` at the waypoint there is genuinely nothing to retrace, in
which case the entry could be deleted and the `landAt` kept as a plain arrival.

### 17: deep links land on states the story never shows — pinned

`arrivals.js` seeds exactly one payoff: `scatterQuiz` sets
`story.quiz.revealed = back`. The other two gated payoffs are only ever _reset_,
never seeded:

```js
simRace: ({ forward, from }) => { if (forward && from !== "simRace") resetSimRace(); },
raceGenz: ({ forward }) => { if (forward) resetGenzLines(); }
```

So a cold `?step=28` followed by Previous lands on `simRace` with
`story.sim.runs === 0` (the store's initial value) — the empty chart — under
prose naming the winner. Same for `raceGenz` reached backwards without the
draw-on ever having run.

**Fix.** Add the seeding half to both rules, mirroring the quiz:

- `simRace` on a backward arrival, or on a forward arrival from `raceClose`,
  should set `story.sim.runs` to the full run count and `story.sim.names` to
  the full name count (`resetSimRace`'s docstring already explains why the two
  must move together).
- `raceGenz` on a backward arrival should set `story.race.genzLinesShown = true`.

Both are the resting result the following step's prose describes.

---

## Fix 8 — The column swap

**Retires 6.**

### Cause

Two halves.

**The prose (pinned).** `Stage.svelte`:

```js
const chapterOrdinal = $derived(
	steps.chapterStarts.filter((i) => i <= (steps.current ?? 0)).length
);
const flipped = $derived(beside && chapterOrdinal % 2 === 1);
```

`flipped` is derived from `steps.current`, so the class — and with it
`--visual-l` / `--visual-r` and `.scrolly-steps`'s `left`/`right` — changes in
the same flush as the press. `Step.svelte`'s outgoing copy is still mounted
(`out:fly`, `PROSE_OUT_MS = 200`) and is a grid item of the column that just
moved, so it is teleported to the other side and fades out there. The incoming
copy is at opacity 0 during its `PROSE_IN_DELAY_MS = 260`, which is why the
backward direction looks right.

**The names (likely).** `reframe(dx)` restates the live buffer in the new
coordinate frame but **does not repaint**:

```js
function reframe(apply) {
	apply(current);
	apply(start);
}
```

The caller (`fitBox`) then returns, and the next thing to draw is the arrival
tween's first `requestAnimationFrame`. Meanwhile Svelte has already moved
`.annotations` (it is `inset: 0` of `.visual`, which moved by `dx`) and the
label transforms still hold the _pre_-reframe `tracked` array, so for one paint
every name is `dx` — one prose column, 400 px at the `--prose-w: 25rem`
breakpoint — away from its dot. The audit's 12→13 frames are at 32, 91 and
168 ms, so the 32 ms one would catch it.

**To confirm:** add a `drawScene()` call at the end of `reframe`'s caller and
re-shoot 12→13 desktop at ~32 ms. If the offset goes, that was it.

Note 3→4 desktop does _not_ take this path: `hopSeed`'s ambient is running, so
`dx !== 0 && choreo.active` makes it a resize and `fitCanvas` + `snapTo` repaint
synchronously. Only a card arrival with no choreography running (12→13) reaches
`reframe`.

### Fix

- **Prose:** delay the flip by the prose's exit. Either drive `flipped` off a
  value that lags `steps.current` by `PROSE_OUT_MS`, or pin the departing copy
  to its old side for the length of its exit (give `.step-prose` a
  `position: absolute` snapshot of its pre-swap side while `out:fly` runs). The
  audit lists this as an open question for Owen; the first reads as "the card
  holds the middle beat and the column swaps behind it", the second as "the old
  words leave where they were".
- **Names:** call `drawScene()` immediately after `reframe(dx)` so the label
  layer and its container move in the same paint.

---

## Fix 9 — The rank ladder's box and its mount

**Retires 10 and 29.**

### Cause (pinned)

**The ladder lands on the dissolving chart.** `Stage.svelte`'s latch is:

```js
$effect(() => {
	if (story.settled === "rankFocus" || currentState === "rankReveal")
		story.rank.revealed = true;
});
```

On 9→8 the second clause is true the instant the step changes, so
`.rank-bars-panel.revealed`'s `panel-in 0.4s` starts at the press, over a race
chart that has not begun to leave. The panel itself is mounted by
`showRankPanel`, which is likewise immediate.

**The rows are cut.** The panel is `top: 84px; bottom: {rankPanelBottom}px`,
where `rankPanelBottom` is `overlayHeight + 12` and `overlayHeight` is
`stepsHeight` — the live measured height of `.scrolly-steps`. `.rank-bars` is
`height: 100%; overflow: hidden`. During the prose swap `.scrolly-steps` is a
one-cell grid holding both copies, so its height is the _taller_ of the two and
changes twice: when the outgoing copy unmounts at ~200 ms and when the incoming
one mounts at ~460 ms. Each change resizes the panel under the rows, and
`overflow: hidden` clips whatever no longer fits. The audit's cut at 402–601 ms
is exactly that window. Mobile only, because `overlayHeight` is 0 when `beside`.

**Finding 29.** `RankBars`'s row-in runs on its own timers — `ROW_IN_DELAY_MS =
1750` then `ROW_IN_MS = 1400`, 3 150 ms after mount — while `rankFocus`'s prose
is released by `hold={story.settled !== "rankFocus"}`, which fires on the param
retarget once `story.rank.focusBar` is measured. So the prose lands well before
the neighbour rows arrive. The dot/glyph swap under the panel is the canvas bar
tweening to `story.rank.focusBar` while the HTML row draws the same strip — two
representations of one mark, handed over with no crossfade.

### Fix

- Hold `story.rank.revealed` behind the _arriving_ state settling as well:
  `story.settled === "rankFocus" || story.settled === "rankReveal"`. The comment
  above the effect explains why it cannot re-check live, which the latch already
  handles.
- Size the panel from a height that does not move during a prose swap. The file
  already has the pattern: `rankStepsHeight` holds the last height a rank step
  measured, precisely so the collapse does not shift. Extend it — hold the
  panel's box across the swap and only re-measure once
  `story.settled === stateName`.
- For 29, give the row-in the same settle gate rather than a mount timer, so
  the rows arrive with the prose rather than 3 s after it.

---

## Fix 10 — Rates, not durations; and consent for a long leg

**Retires 14, the rate half of 19, the length half of 20, 22, 24, 25, 32.**

### 14: the future strip costs nine to ten seconds — pinned

`openFuture` leg 0 is `rewindMs(fromP, restP)`:

```js
const REWIND_PX_PER_SEC = 300;
const REWIND_MS_MIN = 1200;
const REWIND_MS_MAX = 6000;
scaled(clamp((px / REWIND_PX_PER_SEC) * 1000, REWIND_MS_MIN, REWIND_MS_MAX));
```

with `scaled = ms => ms * raceTuning.speedScale` and `speedScale: 1.5`. So the
effective pan rate is **200 px/s**, and the clamp's ceiling is effectively
9 000 ms, not 6 000. The pan from 2006 to the present is ~19.5 years ×
`pxPerYear: 76` ≈ 1 480 px → 4.9 s → **7.4 s scaled**, which is the audit's
measured "reaches the present at 7.4 s" to the tenth. Leg 1 is
`FUTURE_OPEN_MS = 1400` × 1.5 = **2.1 s**. Total ≈ 9.5 s, plus the arrival, for
the audit's 10.4 s. `closeFuture` is the same two legs in reverse.

Both run on a bare Next — `openFuture` and `closeFuture` are `EntryAnim`s, not
`RequestAnim`s — which is what rule 10 objects to.

**Fix.** Two independent decisions:

- **Rate.** `REWIND_PX_PER_SEC = 300` with `speedScale = 1.5` applied on top
  means the shipped rate is not the tuned one. Either fold the scale into the
  constant and set the rate you want, or exempt the clamp bounds from scaling so
  `REWIND_MS_MAX` means what it says. A 1 480 px pan wants ~3–4 s, not 7.4.
- **Consent.** Move the pan behind a press (make it a `RequestAnim` with a
  `StartButton`, as `rewind` already is), or skip the retrace on the backward
  move and land as a plain tween. The forward move's _subject_ is the strip
  opening, so leg 1 can stay; it is leg 0 that is nine seconds of travel the
  reader did not ask for.

### 20: the closing draw is 3.6 s — pinned

`CLOSE_DRAW_MS = 2600` × 1.5 = 3 900 ms. **Fix:** shorten to an entry's ~900 ms
or hang it on a press, exactly as the audit proposes. The names half is Fix 6.

### 22, 24, 25, 32: motion on a timer — pinned causes, open decisions

- **22 (the tour).** `Index.svelte`'s `touring` is gated on
  `story.settled === "networkIntro"`, and that settle is the edge-lagged one —
  1 225 ms, which is the audit's "1.2 s of nothing". Then `showNext()` fires
  immediately on the settle, writing `story.intro.focus`, which is a params
  change, so `tweenToParams` (450 ms) dims the other thirteen names as the route
  lights. Fix 4 removes the 1.2 s; the wipe wants the route's fade-in to wait
  for the names' fade-out (Fix 1's out beat), or the tour's first pick to be
  delayed a beat past the arrival.
- **24 (step 3's constellation).** `hop-bands.js` gives `hopSeed` an ambient of
  `makeFlight(layoutHopSeed, FIELD_IDS)`, and `FIELD_IDS` excludes `INTRO_IDS`
  by construction — so the fifteen are the only dots not flying. The file's own
  comment says that is deliberate ("a diagram that drifts is not one … the one
  place in the story the constellation reads as foreground"). This is a design
  decision, not a defect; if it is to change, the change is to draw the fifteen
  at the network's ink and radius rather than the crowd's, not to fly them.
- **25 (pulse rings).** `.pulse-ring` carries `animation: ripple 1.8s ease-out
infinite` with a second ring at `-0.9s`. Nothing gates it. Purely a decision:
  keep, or drop to a single non-repeating ring on arrival.
- **32.** The full list is: the tour (`Index.svelte`), `RankBars`'s row-in
  timers, the 8→9 draw-on, the career fan and trio, and the two pans. One
  answer — "a leg over a second needs a press" or "a leg over a second is
  authored motion" — settles all of them, and each chart's design note should
  record it.

---

## Fix 11 — Prose, bar and button timing

**Retires 16, 26, 28, and the prose half of 30.**

### Cause (pinned)

`Step.svelte` swaps prose on its own clock: `PROSE_OUT_MS = 200`,
`PROSE_IN_DELAY_MS = 260`, `PROSE_IN_MS = 300` — so the new words are readable
~560 ms after the press regardless of the canvas. The only brake is the `hold`
prop, and `Index.svelte` passes it on exactly five steps: `lone`
(`story.entryHeld`), both `hopBands` steps, `rankFocus` and `rankReveal` (all
`story.settled !== <state>`). Every other step's prose lands on the 560 ms
clock.

- **16.** On 8→9 the prose and a live Start button are full at 580 ms and the
  six dots fly for another 700 ms. On 11→12 the sentence about the future is
  read ~8 s before the strip opens (Fix 10).
- **26.** `StepProgress`'s bar and the prose are released by the _same_ flag —
  `steps.hideBar` is `!!active()?.hideBar || story.entryHeld` — but the bar's
  `in:fade` is `{ duration: CHAPTER_OUT_MS }` = 300 ms with **no delay**, while
  the prose waits 260 ms and then rises for 300 ms. So the bar is fully in
  before the words have started.
- **28.** `finishChoreography` clears `story.running` _before_ it calls
  `anim.finish`, and `StartButton`'s `disabled={story.running === kind}` reacts
  to that write. The step's `advanceon` then fires from the registry's effect
  and changes the step. So the button is live for the flush in between, and the
  new step's prose is blank for the ~100 ms between `PROSE_OUT_MS` and
  `PROSE_IN_DELAY_MS`.
- **30's prose half.** On 4→5, `hop-bands.js`'s cascade is
  `delays[n.id] = n.hop * NETWORK_HOP_DELAY_MS + hash01(n.id, 5) * 400` with
  `NETWORK_HOP_DELAY_MS = 250`, so the last group starts at up to 1 400 ms and
  the tween completes ~2 100 ms; `hold={story.settled !== "hopBands"}` then adds
  560 ms. That is the 3.6 s press-to-sentence. On 7→6 the same `hold`, plus
  `hopBandsVeiled` holding the title and bands until the same settle, is the
  800/2000/2800 sequence.

### Fix

- **Apply `hold` everywhere.** The rule the audit quotes — "the prose settles
  last" — wants `hold={story.settled !== <state>}` on every step, not five.
  That is a one-line change per `<Step>` in `Index.svelte` and needs Fix 4
  first, or every step inherits the 525 ms edge lag as prose latency.
- **26:** give the bar's `in:fade` the same delay the prose carries, or drop
  `entryHeld` from `hideBar` and let the bar wait on `story.settled` like the
  rest of the overlay (Fix 1).
- **28:** clear `story.running` _after_ `anim.finish` and after the
  `advanceon` handoff, or have `StartButton` read a latched "this run is over
  and we are leaving" rather than the bare flag.

---

## Fix 12 — Phone-width statics

**Retires 18 and 21.**

### 18: the quiz's dim covers the step's own question — pinned

`PairQuiz`'s root is `position: absolute; inset: 0` with
`z-index: var(--z-tap-above)` (21), and `Stage.svelte` renders it _inside_
`.scrolly-visual`, which spans `top: var(--title-band); bottom: 0`. On the
stacked layout `.scrolly-steps` is a sibling at `bottom: 0` with no z-index, and
`.scrolly-visual` has no z-index either, so it creates no stacking context —
the quiz's 21 lifts it above the prose card at the root. The
`color-mix(… 55%, transparent)` wash and the `backdrop-filter: blur(6px)` on
`.quiz.asking` therefore paint over the sentence asking the question. The
darkest pixel measuring 150 against 23 is that 55 % white.

Every other over-canvas panel is already clipped off the card:
`.race-scrubber-panel` uses `bottom: {layout.overlayHeight + 12}px` and
`.rank-bars-panel` uses `rankPanelBottom`. `PairQuiz` is handed no
`overlayHeight` at all.

**Fix.** Pass `layout.overlayHeight` into `PairQuiz` and set the overlay's
`bottom` from it, so the dim and blur stop at the top of the prose card. The
cards themselves still need to fly across the whole plot, so keep the flight
container full-box and clip only the tinted/blurred layer — two elements rather
than one.

### 21: seven separate collisions — pinned mechanisms, two root causes

Two mechanisms account for most of the list:

**(a) Beside-dot names are never clamped to the canvas.** In
`ScrollyVisual.svelte` the `"left"`/`"right"` branches are bare translates:

```svelte
dir === "right" ? `translate(${t.x + t.r + 4}px, …)` : dir === "left" ?
`translate(calc(${t.x - t.r - 4}px - 100%), …)` : `translate(clamp(${LABEL_EDGE_GAP_PX}px,
calc(${t.x}px - 50%), calc(${width - LABEL_EDGE_GAP_PX}px - 100%)), …)`
```

Only the default below-dot branch clamps. `.annotations` is `overflow: hidden`,
so a right-hand name simply gets cut — "Samuel L. Jackso" on steps 9–11
(`raceLabelSpec` sets `labelDirs` to `"right"` for the whole race cast) and
"Charlize Therc" on step 20 (`QUIZ_LABEL_DIRS`).
**Fix:** apply the same `clamp()` to the beside-dot branches, or flip a name to
the other side of its dot when it would overflow.

**(b) The x-axis title is clamped against a height that moves.**

```js
const xLabelTop = $derived(
	height ? Math.min(plotFloor + 32, height - stepsHeight - 24) : 0
);
```

`stepsHeight` changes during every prose swap (see Fix 9), so the title moves
when the card's height changes — the audit's "the step-9 x-axis title … shifts
40 px on the press". And when the clamp binds, the title is lifted onto the tick
row, which sits at `decor.axes.xBase`: step 25's "10Care20 age30year40" is the
title overprinting its own ticks.
**Fix:** clamp against a stable height (the same held measurement Fix 9
introduces), and clamp _above_ the tick row rather than to `height - stepsHeight`
— i.e. `Math.min(plotFloor + 32, …)` needs a floor of `xBase - lineHeight`.

The remaining three are individual geometry:

- **"the future" colliding with the chart title.** `race.js`'s
  `raceFutureBand` places the label at `cam.top - BAND_LABEL_LIFT` unless the
  step asks for it inside the box (`labelInside`, the closing step). Lifted, on
  a phone, it lands in the same band as a two-line `.chart-title` (which sits at
  `top: 4px` inside `.visual`). **Fix:** use the `labelInside` placement on
  steps 12 and 22 as well when the title wraps, or lower the lift to clear the
  title band.
- **Step 6's prose card over the "4 movies away" band label.** `hop-bands.js`
  places the band labels off the plot geometry without consulting
  `overlayHeight`; the card grows on that step. **Fix:** pass `overlayHeight`
  into the band label's y, as the other layouts do for their furniture.
- **The takeover callout over the 2.20 tick and the year row on step 11**, and
  **the first staggered sim name over the "Wins" axis title on 26→27**. Both are
  layout placements that do not test against the furniture already there.
  **Fix:** run them through the same de-collision the node labels get, or nudge
  by hand with a comment recording the constraint.

---

## Sequencing

The dependencies are real and mostly one way:

1. **Fix 3b (conditional edge lag) first.** It is small, and it delivers Fix 4
   for free — which in turn is a precondition for Fix 1's settle gate, Fix 5's
   flight handoff, Fix 6's name hold and Fix 11's `hold` everywhere. Without it,
   gating anything on `story.settled` adds 525 ms of latency to every step.
2. **Fix 7 and Fix 8** are independent and small; they can land any time.
3. **Fix 1** is the big one and should follow 3b/4, because it is what makes
   "out, travel, in" a single sequence rather than a per-state opt-in.
4. **Fix 10's decisions** (the timer question, the pan consent, the shared trail
   slot on 27→28) are Owen's, and three of them are already recorded as open
   questions in `notes/tween-audit.md`. Nothing above depends on them.

## Checklist and gates

Every fix above touches `tween.js`, `ScrollyVisual.svelte`, a `layouts/*.js`
module, `Stage.svelte`, `Step.svelte` or `states.js`, so `npm run stale` will
mark rows on essentially every change here — which is correct. Fix 3c (parking
departures where they stand) and any layout-geometry change in Fix 12 will move
goldens; regenerate with `npx vitest run -u` in the same commit, per
`CLAUDE.md`. `contracts.spec.js` is the one to watch on Fix 4 and Fix 5: both
change when a leg starts relative to the arrival, and the "last leg reproduces
the static layout" equalities must still hold.

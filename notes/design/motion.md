# Motion

> The rules every step transition is held to, agreed 2026-09-19. The framework
> map (`notes/scrolly-framework.md`) carries the contracts that implement them
> and the per-chart notes carry the reasoning for one chart; this is what "looks
> right" means before either of those. `notes/tween-checklist.md` is where each
> transition is signed off against these rules, and `npm run sheet` is how a
> transition is looked at frame by frame (see "Checking a transition").

The story is one canvas of dots with stable identities, and the reader moves it
one press at a time. Every rule below follows from two facts about that: the
reader is _reading_, so motion competes with the words for their attention, and
the dots are _the same dots_ from step to step, so anything that is not a dot
travelling is something the reader has to re-find.

## The rules

1. **Dots travel; nothing is replaced.** A dot that is on the canvas before a
   transition and after it moves between the two places. It is never faded out
   in one place and faded in at another, and the crowd is never swapped
   wholesale for a differently coloured crowd. This is the framework's premise
   (object constancy) and the reason there is one canvas and one tweener
   rather than one per chart.

2. **Edges and text hold still.** An edge, a label, an axis, a tick, a callout, a
   legend and a step's prose are never tweened from one place to another. What is
   leaving fades out where it stands _before_ the dots move; what is arriving
   fades in where it will stand _after_ the dots have landed. A line between two
   dots in flight is drawn to nowhere, and a name captioning a dot mid-air is
   naming empty space. The framework carries this as `EDGE_LAG_DELAYS`,
   `TRAIL_FADE_MS`, `labelsAfter` and the text gated on `story.settled`. A state
   that needs a line or a name to move says so in its own design note; a note
   that says nothing means it holds still.

3. **Backwards is as good as forwards.** Every step's Back arrival is a
   transition in its own right, held to every rule here and signed off in its
   own column. A choreography authored for one direction (`revealFrom`, an
   entry's `from`) leaves a plain tween the other way, and that plain tween has
   to satisfy rules 1, 2 and 7 on its own: nothing the reveal introduced may pop
   off, and nothing it held back may pop on. The one backward arrival that never
   happens is a `skipback` step's, because a backward move is declared to pass
   through it; the checklist marks that column n/a.

4. **Mobile first.** Every transition is authored and looked at on the phone
   box (375×667) before any other. Travel distances, the room a label has, what
   the prose card covers and how long a leg takes are all decided there; the
   desktop and side-by-side boxes are the adaptation. The sheet's default box is
   mobile for this reason, and a transition that only reads on a wide screen is
   not finished.

5. **The reader consents to every change.** Nothing changes in front of the
   reader until they have asked for it, and their press is the asking. A step
   change buys exactly the tween to that step's resting layout; anything more
   (a reveal, a draw-on, a replay, a pan, a highlight) waits for a press the prose
   asks for: a Start, a guess, a pick. Nothing new arrives on a timer while the
   reader is reading, and the canvas never points at something before the words
   have introduced it. The gated steps (`gate`, `advanceon`) exist to keep this
   promise at the boundaries where an answer follows a question.

6. **One thing at a time: out, travel, in.** A transition is a sequence, not a
   pile. What is leaving fades out; the dots travel; what is arriving fades in;
   the prose settles last. Two things moving at once compete for the eye, and
   the one that loses is usually the one the step was about. On a sheet the
   Δ column reads as a hump, not a plateau.
   The out and in beats are for a change of chart. Inside one scene (states
   declaring the same `scene`) the chart is the same chart, so its furniture
   stays up through the travel: a legend rides its rows. Blanking it for the
   length of a tween reads as a flicker.
   The chart title is the exception, on every step alike: a title whose text
   changes fades out on the press, like the departing names and links, and the
   new one fades in when the arrival lands. A title that does not change stays
   up. That holds inside a scene too, so 4 → 5, which moves no dot, still runs
   its out beat and its tween with no title up (about 0.7s) — Owen's call
   (2026-09-23), taken over landing a still arrival at once, which would start
   `hopAnchor`'s cycle while the words were still changing.

7. **Nothing pops.** Anything that appears or disappears does so through alpha,
   and nothing on the canvas jumps between two consecutive frames. A snap is
   allowed only where motion is impossible: a resize, reduced motion, a cold
   start. On a sheet a pop is a spike in Δ between adjacent frames that no travel
   accounts for, or a mark present in one frame and absent in the next at full
   opacity.

8. **A press mid-flight is safe.** A tween superseded by another retargets from
   the live frame (`start.set(current)` in `tween.js`): it never rewinds, never
   snaps to the start of the new tween and never finishes the old one first.
   Mashing Next and Previous produces motion the reader can still follow, and a
   choreography that cannot be interrupted is a choreography the reader started
   (rule 5).

9. **Ambient motion says nothing.** The sky's flow is the one motion that runs
   without a press. It carries no information: it does not point, highlight,
   introduce or count, and it has no beginning or end the reader can notice
   (`notes/design/sky.md`). A dot the reader is meant to look at is never left
   drifting, and a dot that is drifting is never the subject of the sentence.

10. **Durations belong to the framework.** The step tween is 700 ms cubic
    in-out with a hashed stagger of up to half its length; an entry is 900 ms;
    an in-state param change is 450 ms (`ScrollyVisual.svelte`). A leg longer
    than a second exists only for motion with a real-world rate — the race
    sweep, the rewind, the simulation replay — and that rate is expressed as a
    rate in the code, px/sec or years/sec, never as a duration that happens to
    look right on one box. A state does not pick its own tempo.

    Such a leg is **usually** something the reader started, and where it is not,
    the chart's own note says so and says why. Four are declared rather than
    gated: the two future pans (`openFuture` / `closeFuture`), the closing
    projection draw (`drawProjections`) and the career fan. Each is the subject
    of the step it belongs to rather than a flourish on the way in — the strip
    opening IS the sentence about the future — so putting a Start in front of
    them would ask the reader to consent to the thing they pressed Next for.
    A leg that is not the step's subject still needs a press.

11. **The stagger orders reading; it never decorates.** A per-node delay exists
    so the reader's eye is led: top to bottom, near to far, cast before crowd. A
    stagger that leads nowhere is a plain tween in disguise, and a flight the
    reader is meant to read in order sets `arrivalJitter` to 0.

12. **The canvas box never moves.** Every tween is authored in the box's
    coordinates. Anything that changes the box's measured rect (a layout shift, a
    scrollbar appearing, a column that re-centres) snaps every dot and restarts
    the sky, so a change to `Stage.svelte`'s layout is a change to every
    transition, and the checklist treats it as one.

13. **Reduced motion is the same story, cut.** Under `prefers-reduced-motion`
    every transition lands on its settled frame at once. Fades are kept, travel is
    not, and nothing the reader needs waits on a tween finishing.

14. **A hidden dot stands somewhere on purpose.** Every layout places every dot,
    the ones it hides included, and a hidden dot's spot is designed: inside the
    canvas, and where a neighbouring step that shows it should bring it on from.
    Either that neighbour's own spot for it, so it fades in without travelling
    (hopBands' hidden crowd in the title card's sky), or a place the chart means
    (the race's frontier column, the simulation's origin, Bacon's bar). A step
    change starts every dot the reader cannot see from the departing state's
    spot; a dot the reader can see still travels from where it stands, and one
    that fades out does so where it stands and is moved to its hidden spot,
    unseen, at the next state change (`restateHidden`, `parkLeavers`). Owen's
    decision, 2026-09-25, after the crowd slid down onto the scatter from the
    top of the plot and the race cast rose onto it from below the canvas
    (11 → 12). `contracts.spec.js` walks every arrival and holds each
    arriving dot to its departing spot, on the canvas.

## Checking a transition

`npm run sheet -- <from> <to>` (`scripts/tween-sheet.js`) plays the step
transition in both directions on a faked clock and tiles the frames into
`sheets/<from>-<to>-<box>/sheet.png`, each captioned with its time and Δ, the
share of pixels that changed since the frame before. `--box desktop` and
`--box wide` for the other boxes; `--click Start` to leave a gated step by its
own control; `--ms` and `--frames` to widen or tighten the window.

What each rule looks like on a sheet:

| Rule                   | Look for                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 dots travel          | A dot present at t = 0 and at "settled" is visible somewhere in between; no frame where the crowd is gone.                            |
| 2 edges and text still | Every line and name in the middle frames is either where it was at t = 0 or where it is at "settled". Nothing lettered is mid-way.    |
| 3 backwards            | The two sheets read equally well; the back sheet has no pop the forward one lacks.                                                    |
| 4 mobile               | The default sheet. Dots inside the plot, labels apart, the card not covering what the prose points at.                                |
| 5 consent              | Between the tween landing and "settled" nothing new appears. What "settled" shows is what the step's resting layout is.               |
| 6 out, travel, in      | Δ rises and falls once. Text disappears before dots move; the new text appears after they land.                                       |
| 7 nothing pops         | No Δ spike an adjacent frame does not explain; nothing at full opacity in one frame and gone in the next.                             |
| 8 interruption         | Run the sheet with a short `--ms` and read the "settled" frame; a second sheet from the landing step confirms it retargets.           |
| 9 ambient              | The Δ that remains once everything has landed is the sky and only the sky; the settled frame differs from the last only in the field. |
| 10 durations           | The hump in Δ spans about 700 ms for a plain tween; longer only for a leg the reader started.                                         |
| 11 stagger             | Where a stagger exists, the middle frames show an order the eye can follow.                                                           |
| 12 box                 | The canvas edges are in the same place in every frame.                                                                                |
| 13 reduced motion      | Not on a sheet; check by hand with the OS setting on.                                                                                 |
| 14 hidden spots        | A dot fading in comes out of a spot that means something (its own, the race's edge, an origin), never off the canvas's edge.          |

## Open questions

None open.

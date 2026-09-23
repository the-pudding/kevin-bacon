# Title card

> Design notes for the title card, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

The story opens on the constellation (`networkIntro`, step 0), not on the title
card. The card is step 3: `<Splash state="titleGalaxy">`, the piece's name over
the corpus drawn as a sky, straight after `hopSeed` pulls the constellation back
into that sky. It is registered in document order like every other step, so it
is left with the same press as every step before it.

`Splash.svelte` registers and renders nothing: `Stage.svelte` renders the card
from the registry's active config (`steps.config.splash`) inside a stable
`{#if}` so it can transition out, on the timings in `cardFade.js`. Like the three
steps before it, it sits outside every `<Chapter>`, so the progress bar claims no
line for it and stays down; the bar first appears on `hopBands` (step 4) and
counts only the chapters' steps.

**The title and byline arrive as snippets** rather than strings, so the words
live in `Index.svelte` beside the story's other prose. The logo is pinned to the
top of the screen rather than stacked into the centred card, so the two never
meet however many lines the title wraps to. The card's cold-load reveal (a
`?step=3` refresh) staggers logo → title → byline on a plain CSS transition,
because SvelteKit never plays a hydrated element's `in:` on the first paint (see
`SPLASH_REVEAL_MS` in `cardFade.js`).

**How to move is taught on step 0, not here.** The cue — "Tap/Click to
continue", a hand-cursor doodle and, past 40rem, the two arrow keys — is
rendered by `Stage.svelte` whenever `steps.current === 0`, the same test
TapNav's `atStart` uses: on step 0 the whole screen advances, left half
included, so "tap to continue" is literally true. Stacked, it is a row of its
own in the step card, under the prose (mounted for the whole step, so the words
never shift up to make room for it); beside the prose it sits in the canvas's
bottom-right corner. Either way it is the last thing to arrive: held at nothing
until the prose has landed (`steps.held`), then risen in on the prose's own rise
and duration, a beat (`NAV_CUE_BEAT_MS`, 1s) after the prose's entrance ends. It fades out as the reader
leaves step 0. "Tap to continue" is set at 16px and the keyboard line at 12px.
The copy
switches by width (`.on-narrow` / `.on-wide`, `display: none` rather than
opacity, so the reader is told one thing once): a thumb at the edge of a phone,
an arrow key at a desk.

**`titleGalaxy` is hopSeed's sky, carried on, with the highlight beat in it.**
Its layout is `layoutHopSeed` and its flight is hopSeed's own
(`makeFlight(layoutHopSeed, SKY_IDS)`), wrapped in `withGalaxyHighlight`
(`notes/design/sky.md`), declaring `labels: () => []` so the card rests
anonymous and the names arrive only with the beat. The fifteen fly in it as
plain crowd, as they do on hopSeed; `GALAXY_CAST` is derived from `FIELD_IDS`,
which excludes them by construction, so the beat can never reach for one.

The two states declare each other in `carryFrom` (see `AmbientAnim` in
`states.js`). A state change otherwise tweens the live sky back to its t = 0
frame and restarts the flight, which between two states on the same flight is a
visible wind-back of the whole field. With the carry there is no tween and no out
beat: the step lands at once and the arriving loop starts at the clock the
departing flight stopped on (`skyT0`), which draws exactly the frame the
departing loop last drew (asserted in `contracts.spec.js`). The beat is
scheduled on the loop's own clock, so it still waits `GALAXY_START_DELAY_MS`
after the card arrives, while its predictions of where a dot is going are made
on the sky's clock. Stepping back to hopSeed, whatever the beat was drawing
(its inked dots and spokes) fades where it stands over the out beat
(ScrollyVisual's `carryResidual`) while the sky keeps flowing. `hopBands` sorts
its crowd out of this sky exactly as it used to out of hopSeed's: its
`departureColumn` reads the live flow clock, whichever state was flying it.

Until 2026-09-23 the opening beat converged: `pickFocus` hashed a start index
into the eligible set, but at `t = 0` almost nothing is on canvas and clear of
the flight's fade ramps yet, so the eligible set was one or two candidates wide
regardless of the hash — measured, every possible starting offset opened on the
same actor, Alfred Molina at 1280px and Harvey Keitel at 390px. Worse, because
`nonce` was a plain counter starting at a fixed `0` on every fresh page load,
this was not just true of the first beat measured — it was the same actor for
every real visitor, at a given viewport, forever. That is the actual substance
of "it reads like the answer": not an under-eligible first beat so much as a
FIXED one.

Two changes fixed it (`galaxy-highlight.js`): the beat clock now waits
`GALAXY_START_DELAY_MS` (2s) before its first strike, so by the time it fires
the flight has moved enough for a real pool to choose from, and the flight's
`nonce` is now seeded from `Math.random()` once per page load rather than from
a fixed counter, so the same viewport no longer opens on the same actor twice.
See `flightSeq` and `GALAXY_START_DELAY_MS` in `galaxy-highlight.js` for the
full reasoning.

**The beat also now runs two staggered slots rather than one.** A second actor
joins partway through the first's turn (`GALAXY_SLOT_PHASE_MS`, half a beat),
then each slot changes independently — never both at once — so the sequence
reads as "someone, then someone else joins, then the first one changes while
the second stays," rather than a single spotlight or two names swapping in
lockstep. `GALAXY_CAST` was also widened (`GALAXY_CAST_N`, 90 → 130) and now
includes a short curated list of actors by name (`GALAXY_EXTRA_IDS`) who are
well known to the story's Gen Z audience despite a film count too low to reach
any film-count cutoff — film count stands in for career length as much as for
fame, and systematically underrates younger stars.

## The opening flight (removed 2026-09-23)

Until 2026-09-23 the card was step 0 and the step off it flew the camera into
the sky onto Bacon and his cluster, then grew the constellation out of the
landing (`networkIntro`'s entry choreography, `withAnchorInSky`,
`withTitleReveal`, `story.entryHeld`). It went when the story moved to open on
the constellation: nothing arrives at `networkIntro` from the title card any
more. The design reasoning is in this file's history before that date.

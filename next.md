Show KB's highest ever rank

Persist user selections

Unsure: should we round average distance to 3dp rather than 2?

Once we have everything we need to predict an actor's average distance, we should have a look at the Gen Z contenders

Check for other `prevState === null` bugs in the scrolly framework: fixed one where cold-mounting straight into `raceFull` (prevState null on first paint) skipped `playRaceFullEntry`, so `story.raceView` never got seeded and the chart settled on the wrong camera (extent[1]/2025) until the next click. Same `revealFrom.includes(prevState)` gating pattern is used for `raceEntry`/`raceRewindArrival`/other `STATE_ENTRY` choreographies (`ScrollyVisual.svelte` ~1010-1038) — worth checking each one settles correctly on a cold refresh, not just on a scrolled-through arrival.

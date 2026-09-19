# The simulation race

> Design notes for the simulation replay, moved out of `notes/scrolly-framework.md` on
> 2026-09-19. The framework map there carries the contracts; this carries the
> reasoning behind them and the measurements that were taken.

**The simulation race (`simRace`), a reader-driven animation.** A choreography
the reader starts rather than an arrival: the step's `StartButton` asks for
`run`, and the state's `requests.run` (`layouts/sim-race.js`) replays the 10,000
recorded simulation runs over `SIM_MS` (3s) on the shared `runPhase` rAF spine,
writing `writeSimFrame` straight into the live tween buffers under the same
single-writer discipline as `startScrub` (land each tweener's target first,
`sweeping = true`, so a state change's `stopSweep` abandons the run for free —
and clears `story.running`, or the button would stay disabled for a reader who
steps back).

Unlike the race chapter there is no camera: `[0, nSims]` is mapped to the plot
width, so the whole simulation fits any viewport with nothing to pan, and the y
axis is fixed to the tallest line's final count for the whole step. That also
means the lines GROW at their tip instead of sliding under a camera, so their
vertices sit on a grid fixed in run-space (`GRID_RUNS`) and are written with
`setTrailPoints`, not resampled per frame: a widening sample window puts every
interior vertex on different runs each frame, which slides each line's real
run-to-run wobble backwards through it and makes the whole field shimmer. With
the grid fixed, only the tip segment moves — everything behind the playhead is
already at its final position, which is directly testable (successive mid-run
frames are pixel-identical left of the playhead). The frame
writer is the settled layout's only path too, so a run's last frame IS the state
it settles onto — the end of a run just publishes `story.sim.runs`,
with nothing left to move. The playhead is deliberately NOT published per frame:
`sim.runs` is a layout param, so a per-frame write would retarget the tweener
mid-run. `sim.names` is the param that lets the labels come in for a replay whose
playhead the layout never sees.

The data behind it is the real per-run winner sequence (`story.genz.runs`), not a
resample: `tasks/build-scrolly-nodes.js` recovers it from the analysis repo's
simulated-MAD matrix and asserts it reproduces every published win count exactly.
So pressing Start again replays the same race, and the lines land on the
percentages the story quotes. Every contender gets a line (`SIM_SERIES` in
`cast.js`); `SIM_LABEL_N` of the leaders carry a name and their win
share, arriving one at a time from 5,000 runs on (`SIM_NAMES_AT` +
`SIM_NAME_STAGGER`, via `simNamesDue`) once the field has pulled apart. Names sit
to the LEFT of their dots, so the plot needs no gutter and takes the canvas's
full width; `story.sim.names` (how many are due) is the one thing a run publishes
while it is in flight, because the layout never sees the live playhead — and it
is written only on the runs a name is actually due, not per frame.

One control, a `StartButton`: Start, and a second press winds back to zero and
re-runs. Nothing around it is conditional on the run, deliberately: a panel's
`bottom` is measured from the step card's height, so a line of copy that
disappears when the reader presses the button shortens the card, moves the
panel's bottom edge down, and takes the button with it — mid-press. Content that
must come and go belongs inside the panel, below a `justify-content: flex-end`
anchor, where it cannot move the controls.

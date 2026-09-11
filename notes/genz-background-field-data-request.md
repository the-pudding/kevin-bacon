# Data request: a background field for the Gen Z race step

**For:** the analysis repo (`~/src/Personal/pudding-post`).
**Wanted:** one new export, `data/actor-trajectory-field-sample.json`.
**Why:** the `raceGenz` step's camera pans down onto an empty plot.

## The problem

`raceGenz` (`src/components/scrolly/layouts/race.js`) pans the camera from the
crown's window `[2.05, 2.20]` down to `[2.30, 3.00]`, where the 99 Gen Z
contenders live. The race cast retires as it goes — by design, the crown is what
the reader is leaving — so between the end of the pan and the reader pressing
"Show Gen Z actors" the chart holds axes and nothing else.

That reads as a bug, and it also undersells the move. Measured from
`src/data/scrolly-nodes.json`, **17,722 of the 22,530 actors in the corpus have
an average distance inside `[2.30, 3.00]`** — 79% of Hollywood. The window the
camera lands on is not a sparse frontier, it is where almost everyone is. The
plot should look crowded.

One more number worth having in the copy: the Gen Z field's median remoteness
today is 2.74, against a median of 2.77 for every corpus actor in that band. The
contenders are, right now, an ordinary slice of Hollywood.

## What we need

Year-by-year `avg_distance` for a **sample of a few hundred working actors
spread across `[2.30, 3.00]`**, so the pan lands on a field the Gen Z lines are
then drawn into. It does not need to be everyone — a few hundred lines reads as a
crowd, and the chart already carries 224 on `raceFull`.

### It has to be `--top-n 0`

This is the one hard constraint. `data/actor-trajectory-exhaustive.json` already
holds 1,456 actors and looks like a match, but it was run at `top_n: 1000` —
average distance to the thousand highest-degree vertices, not to the giant
component. The two are not on the same axis:

|                                                    | SLJ, 2025  |
| -------------------------------------------------- | ---------- |
| `actor-trajectory-exhaustive.json` (`top_n: 1000`) | **1.6006** |
| `actor-trajectory-race-cast.json` (`top_n: 0`)     | **2.087**  |

Its rows show `reachable: 999, target_size: 1000` against a `giant_size` of
161,724. Plotting it on this chart would put a different metric on the same axis
in the same monochrome grey. `tasks/build-scrolly-nodes.js` asserts `top_n === 0`
on every trajectory file it reads, so a wrong run fails the build rather than
shipping.

### Selection

Actors with a 2025 `avg_distance` in `[2.30, 3.00]`, **stratified across that
range** rather than taken as a head — an unstratified sample clumps at the mode
(2.77) and leaves the top of the window, where the contenders actually are,
empty. Suggested: ~25 actors from each of a dozen equal-width slices, ~300 total.

Two filters, both matching rules the piece already uses:

- **≥ 5 corpus films** — the Gen Z candidacy rule, so the background is a fair
  comparison set rather than a cloud of one-credit actors.
- **active through 2022 or later**, so every line runs to 2025 and none of them
  stops dead inside the visible window.

`data/trajectory-candidates.json` already encodes almost exactly this
(`{films_min: 5, debut_min: 2005, last_active_min: 2022}`, 1,455 actors). Reusing
it with the `debut_min` **dropped** would be ideal: the 2005 debut floor makes the
background another young cohort, where the point of the beat is that the
contenders sit among _everyone_.

### Shape

Identical to the two exports the app already consumes
(`actor-trajectory-race-cast.json`, `genz-candidate-trajectories.json`), so
nothing new has to be parsed:

```json
{ "corpus": "imdb-top10k", "end_year": 2025, "top_n": 0,
  "actors": [ { "person_id": 0, "name": "…", "first_year": 0,
                "trajectory": [ { "year": 2025, "avg_distance": 0.0, "in_giant": true, … } ] } ] }
```

Which is what `analysis/actor-trajectory.py` writes already:

```
python analysis/actor-trajectory.py \
  --candidates-from data/trajectory-field-sample-candidates.json \
  --consolidated-out data/actor-trajectory-field-sample.json \
  --top-n 0 --end-year 2025
```

### If the run is too expensive

`--top-n 0` walks the whole giant component per actor per year, so this is much
heavier than the `top_n: 1000` run. Two ways to cut it, in order of preference:

1. **Shorten the series.** The chart only ever draws **2022–2025** — the step's
   lookback is `RACE_GENZ_TAIL_YEARS = 3`, clamped to ~1.1 years at 320px. Four
   years per actor rather than a full career is a ~5× saving and costs the piece
   nothing.
2. **Fewer actors.** 150 still reads as a field.

Do not trade away `--top-n 0` for either.

## How it gets consumed here

`tasks/build-scrolly-nodes.js` needs about ten lines — the same builder
`genzSeries` uses, emitting `fieldSeries` keyed by node id, plus the existing
`top_n`/`end_year` assertions. Then `race.js` gets a third curve table beside
`RACE_SEGS` and `GENZ_SEGS`, drawn at the field treatment behind both.

The sampled actors must be appended to the node table (block 2 in
`build-scrolly-nodes.js`) so they have ids, exactly as the Gen Z candidates and
race anchors are.

## Note on the untracked inputs

`data/genz-candidate-trajectories.json` is still untracked in the analysis repo
and `data/genz-mc-knn-bootstrap.json` is modified — the committed JSON in this
repo is already derived from inputs that are in no git history. Worth committing
both sides before adding a third file to the pile.

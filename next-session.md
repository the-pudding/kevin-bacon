# Handoff: gap and key the rank ladder's horizontal hop bars

## Starting Prompt

Apply the hop-bands treatment to the rank ladder's horizontal bars — the
per-actor hop-breakdown strips in `RankBars.svelte` (states `rankFocus` /
`rankReveal`), which are hop-band charts turned on their side. Two halves,
mirroring what just shipped for the vertical bands one step earlier:

1. **Whitespace between the hop segments**, so the four colours stop butting
   together (the horizontal twin of P-04-4).
2. **Key the colour sections** — this is the open backlog item **P-06-2** in
   `notes/prd.md` ("Legend for the colour sections. Currently unexplained.").

**Read `notes/scrolly-framework.md` before touching these files**, and mind one
hard constraint: `hopDotSlots` in `layout-shared.js` is drawn by _both_ sides of
the rank handoff — the HTML row as one `<path>` per band, and the canvas in
`layouts/rank.js:42` as the exact spot each converging actor tweens onto. Add a
gap in `RankBars.svelte` alone and the two disagree, breaking both the
`hopBands → rankFocus` convergence and the `rankReveal → raceRecent` collapse.
**The gap belongs in `hopSegmentBounds` / `hopDotSlots`, where both sides
inherit it.**

Start by reading `hopSegmentBounds` (`layout-shared.js:226`) — it already
reserves `RANK_SEG_MIN` out of the width before striking the shares, which is
the identical shape the vertical `BAND_GAP` uses. The gap slots in as a second
reserved term.

Then verify by running the app and stepping
`hopBands → rankFocus → rankReveal → raceRecent`, checking the convergence lands
on the panel's dots and the collapse still hands over cleanly.

## Relevant Files

| File                                              | Why                                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/layout-shared.js:200-277` | `RANK_*` constants, `hopSegmentBounds`, `hopFractions`, `hopDotSlots`. **This is where the gap goes.**                                                    |
| `src/components/scrolly/RankBars.svelte`          | The HTML panel. `barPaths()` (~L64) turns `hopDotSlots` into four `<path>`s per row; `rows` carries each actor's `fractions`. Where a legend would mount. |
| `src/components/scrolly/layouts/rank.js:29-83`    | The canvas twin. Reads the same lattice for Bacon's bar; comment at L79-81 explains why there is deliberately no hop key here.                            |
| `src/components/scrolly/layouts/hop-bands.js`     | The pattern to mirror — `BAND_GAP`, `MIN_BAND_H`, `HOP_SHARE`, commit `04565a5`.                                                                          |
| `notes/scrolly-framework.md`                      | "Exception: a visual that abandons the dot metaphor…" (~L744) documents the RankBars/canvas contract and the three-beat handoff.                          |
| `notes/prd.md` §2                                 | P-06-1…P-06-4.                                                                                                                                            |

## Key Context

**What shipped last session** (commit `04565a5`, on branch
`feat/race-fixed-y-dev`, not `main`): the vertical `hopBands` chart got
`BAND_GAP = 12` reserved out of the inner height _before_ the sample shares are
struck, plus per-band corpus-share labels built from `hopFractions(ANCHOR_ID)`.

**Four things that make the horizontal case genuinely different, not a
copy-paste:**

1. **Scale.** A row is `RANK_BAR_H = 10px` tall with `RANK_DOT_D = 3` dots on a
   `RANK_DOT_PITCH = 5` grid. 12px is the width of two dot columns — the
   horizontal gap wants to be ~2–3px, and it costs 3× that off every one of 250
   rows.
2. **`RANK_SEG_MIN = 10` is already there** and is load-bearing beyond looks:
   its doc comment calls it "the minimum-nodes guarantee — dots are units of
   width, so the floor that keeps a sparse hop visible is what keeps a handful
   of its dots on screen." Reserving gap width on top of it shrinks the free
   pool; check hop 4 still gets dots.
3. **Percentages can't be a fixed string here.** Every row is a different actor
   with different `fractions`, so there is no single "70% of actors" to print.
   The realistic options are a _legend_ keyed once for the whole panel, or
   percentages on the focused row only. **This is the open design question** —
   worth putting to Owen before building.
4. **There is a standing decision against a key here.** `rank.js:79-81`: "no hop
   key here: the hop-bands step just before this one establishes the colours, so
   repeating the key over the rank list only adds furniture." That step now
   carries percentages too, so the argument that the ladder inherits its key is
   _stronger_ than when it was written. P-06-2 asks for the opposite. Resolve
   that tension explicitly rather than just implementing P-06-2.

**Risk flag:** P-06-3 / P-06-4 propose replacing the ladder with a stacked bar
chart entirely. Both still open. If they go ahead, this geometry work is thrown
away — confirm with Owen before investing.

**Conventions:** Owen writes the reader-facing prose — ship label _shape_, not
final wording. Never commit without his explicit request. A concurrent session
is active on this repo; check `git status` and commit only your own files.

# Handoff: Overlap audit with screenshot evidence, chart text included

## Starting Prompt

Goal: audit the whole story for overprinting text again, now that `b5d468f`
and `dd7dc4c` have landed. Back every finding with a screenshot you have
looked at yourself. This time, cover **chart text against chart text** as
well. `npm run overlap` can't see those collisions, and Owen has found two of
them by eye on his phone.

Context:

- **`b5d468f`, step 12:** "Samuel L. Jackson · 116 films" ran into the
  upright "↑ more central / Remoteness" y-axis title at 375. Below a 360px
  visual, the names now drop "films" (`scatters.js`, `filmsLabel`).
- **`dd7dc4c`, steps 11/18/19/25:** "THE FUTURE" sat in the box's top-right
  corner, on SLJ's name. It now sits bottom-right, except on step 25, where
  it stays bottom-left because SLJ's projected name falls to just above the
  bottom-right corner (`race.js`, `raceFutureBand`).
- **What the scan sees:** `scripts/overlap-scan.js` measures shared **ink**
  for prose×chart, prose×title and title×chart only. Every axis title, tick,
  name, callout and band label falls in the one "chart" group, so a collision
  inside that group is never reported.

Do this:

1. Read `CLAUDE.md`, `notes/scrolly-framework.md` ("The plot geometry, in one
   paragraph"), and the M7/M8 sections of
   `notes/audit/a11y-review-2026-10-06.md`. The review has uncommitted edits
   from Owen or another session; don't overwrite them.
2. Boxes: 375×667 (the phone floor, Owen 2026-10-07: never change the
   scripts' `mobile` box), 390×844 and 667×375. Use 100% text, plus 200% for
   the scan. Run Chromium and **WebKit** at each.
3. Dev server: use the one already running in the checkout. Find it with
   `lsof -iTCP -sTCP:LISTEN -P | grep node`, then check each PID's cwd with
   `lsof -a -p <pid> -d cwd`. Port 5174 was this checkout's on 2026-10-07.
   **First check that it serves current source.** On 2026-10-07 it was
   serving stale CSS: its watcher had stopped picking up edits. Check with
   `curl -s "<url>src/components/scrolly/ScrollyVisual.svelte?svelte&type=style&lang.css" | grep -c "band-label-right"`,
   which should print 1 or more. If it's stale, ask Owen to restart it rather
   than starting a second Vite server; they share `.svelte-kit/`. Pass
   `--url` to every script, and don't edit `src/` while a scan is running.
4. Prose and title overlaps: `node scripts/overlap-scan.js --url <url>`.
5. Chart×chart overlaps: write a probe (or extend the scan with a fourth
   pairing inside the chart group) that compares, at rest on every step,
   the **glyph boxes** (a `Range` over the element's contents, not the
   element box) of `.node-label`, `.y-title-top span`, `.tick-y`, `.tick-x`,
   `.x-label`, `.band-label`, `.callout p` and `.legend` against each other.
   Exclude `.card-measure`, `.title-measure` and `.layer.gone`, and anything
   at opacity ≤ 0.05.
   - Count a gap under 4px as a hit: names carry a 7px halo (see the memory
     on label overlap).
   - Then confirm each hit in ink, or with a 3× crop, before reporting it.
     Element boxes overstate: `.tick-y` boxes overlap the y-title without
     any glyph contact.
   - `sheets/overlap/band-label.mjs` is a working starting point: the band
     label against everything else, `URL=` and `STEPS=` env vars, saving
     a full-page shot per case.
6. Settle: wait for the prose (`.scrolly-steps > .step-prose`), or about
   5–9s on a real clock, after `document.fonts.ready`. A cold `?step=N` waits
   on fonts before the canvas draws. On gated steps (8, 18 and the quiz), the
   URL opens the step at rest.
7. Evidence: save a WebKit screenshot for every hit to
   `notes/audit/a11y/<what>-<step>-<WxH>.png` (the existing convention), and
   put the bulk sets in `sheets/` (gitignored).
8. Report a table per box: step, the pair (prose×chart, prose×title,
   title×chart, chart×chart with both elements named), the overlap in px,
   the screenshot path, and one line saying what prints over what. Split it
   into new, already known (Key Context), and clear. Don't fix anything
   without Owen's go-ahead, and don't commit unless asked.

## Relevant Files

- `scripts/overlap-scan.js`: `npm run overlap`, the ink-based scan. Its groups
  are prose, title, chart and cue (`PAIRS`), and chart×chart isn't one of
  its pairings.
- `sheets/overlap/band-label.mjs`: the band label's glyph box against every
  other text, per step and box, in both engines. `ytitle-boxes.mjs` compares
  the y-title against names and ticks (element boxes). `ytitle-gap-12.mjs`
  measures step 12's name-to-y-title clearance across widths.
- `sheets/a11y/fix/shots.mjs`: the screenshot probe from the previous session
  (`node sheets/a11y/fix/shots.mjs <engine> <WxH> <steps> [wait]`).
- `src/components/scrolly/ScrollyVisual.svelte`:
  - `.y-title-top` and `titleOverrun`: the y-title steps below the chart
    title and the tick labels, but never below names.
  - `.node-label` transforms: the sides are `left`, `right`, `belowLeft`
    and `belowRight`, clamped to the canvas.
  - `.band-label`.
- `src/components/scrolly/layouts/scatters.js` (`states.scatterCenters`
  `labelDirs`/`labelText`, `PAIR_SIDE_MIN_W`, `FILMS_WORD_MIN_W`) and
  `layouts/race.js` (`raceFutureBand`, `raceLabelCut`): the existing
  width-gated label rules.
- `notes/audit/a11y-review-2026-10-06.md` and
  `notes/audit/a11y-fix-plan-2026-10-06.md`: the earlier findings. Both have
  uncommitted edits.
- `notes/audit/a11y/*.png`: untracked evidence from the earlier pass,
  including `ytitle-over-name-11-375.png`, `callout-over-ytitle-10-375.png`
  and `tick-over-ytitle-18-375.png`.

## Key Context

- **Fixed and confirmed on 2026-10-07** (375, 390, 430, 667×375 and
  1280×800; Chromium and WebKit; glyph gap ≥ 4px):
  - Step 12: the names against the y-title.
  - Steps 11, 18, 19 and 25: "THE FUTURE" against every other text.
- **Known chart×chart overlaps, not fixed:**
  - **Step 11, 375:** "Samuel L. Jackson" starts at the y-title's right
    edge, under "↑ more central" (`ytitle-over-name-11-375.png`; visible in
    Owen's photo too).
  - **Step 11, landscape:** the race names spill above the plot and through
    the chart title (title×chart, ~135px; already in the earlier handoff).
  - **Step 10, 375:** the callout over the y-title
    (`callout-over-ytitle-10-375.png`).
  - **WebKit, by element box, not yet confirmed in ink:** `.tick-y` labels
    overlap the y-title. That's "3.0"/"2.4" on steps 18–19 at 375/390,
    "Costar film count average (log scale)" against "100"/"20" on step 16
    at 390 and landscape, and "3.0" on steps 12–15 and 18–19 in landscape.
- **Known prose/title overlaps after `ee20518`:**
  - **100% text at 375/390:** step 5, where the plate lies over the 1- and
    2-movie band labels.
  - **Landscape:** steps 4–5 (plate over the bands), 8–9 (race names spill
    below a ~60–75px plot) and 11 (title×chart). On step 25, SLJ's name and
    the y-title drop below the plot.
  - **200% text:** titles run onto plot tops by design (past `MIN_PLOT_H` =
    48), and the race and hop steps still overlap.
- **Fix patterns already in use, if Owen asks for fixes later:**
  - Width-gated label text or sides (`filmsLabel`, `pairLabelDirs`).
  - Moving furniture to an empty corner.
  - `titleOverrun`, which steps the y-title clear of the title and ticks.
  - Any layout change regenerates goldens with `npx vitest run -u`.
  - A changed `layouts/*.js` or `ScrollyVisual.svelte` needs its rows
    staled; the pre-commit gate checks this.
- **The reader's photo** was a 402×718 Safari page. 375×667 covers it.
- **Pitfalls:**
  - Use Node 24: prefix `PATH` with `~/.nvm/versions/node/v24.13.1/bin`.
  - `set -- $t` doesn't split words in zsh, so run loops under `bash -c`.
  - The faked clock in `npm run sheet` can drop a step's prose from its first
    frame.
  - Headless Chromium has only overlay scrollbars.
  - Combining PNGs via `file://` in `page.setContent` renders broken images;
    read each shot on its own.

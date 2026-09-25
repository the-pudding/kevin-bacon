# Handoff: Fix the pre-existing contrast failures and gate the axe scan

## Starting Prompt

Goal: clear the colour-contrast failures that `npm run a11y` finds in the
rendered story, then add the scan to the quality gates and CI so the design
sprint (colours, fonts, then a permanent dark theme) can't regress contrast.

Context: commit 3add09d moved every colour and font into Style Dictionary role
tokens (`properties/role/*.json`, guide in `notes/design/tokens.md`). Two
contrast checks came with it:

- `src/styles/__tests__/contrast.spec.js` checks the token pairs and is gated.
- `scripts/a11y-scan.js` (`npm run a11y`) runs axe-core's `color-contrast`
  rule on every step at the mobile and desktop boxes, on a dev server. It is
  NOT gated yet, because of the failures below.

Last full scan: the only reader-facing failure is **step 6** (the rank ladder,
`RankBars.svelte`). Every row not yet "known" sits at `opacity: 0.35` over
`--chart-rank-row` (gray-700), which measures 1.89:1 (#bcbcbc on white)
against a 4.5:1 requirement. That's 50 nodes at desktop and 24 at mobile:
`.label`, `.avg`, `.share`. The CSS comment says the fade "exists to hide
who's who" until a name is out, so it is a deliberate design device, not an
accident.

Do first:

1. Read `RankBars.svelte` around `.rows li` / `.known` / `@keyframes row-in`
   and `notes/design/interactions.md` to see what the dim is for: are the
   names meant to be unreadable (a guessing game) or just de-emphasised?
2. Take the options to Owen before changing anything. Candidates:
   - raise the resting opacity/colour to clear 4.5:1;
   - de-emphasise with weight or size instead of alpha;
   - keep hidden names out of the text (masked or aria-hidden placeholders)
     so no unreadable text is exposed.
     Never suppress, exclude or allow-list the nodes in the scan.
3. Once fixed, run `npm run a11y` across the whole story and confirm 0
   violations. Then wire it in: add a full-mode step to
   `scripts/run-ci-quality-gates.sh` (not `--local`: about 2.5 min), and add
   `npx playwright install --with-deps chromium` before the gate step in
   `.github/workflows/ci-quality-gates.yml`.
4. Any change to RankBars or its tokens stales rows in
   `notes/tween-checklist.md` (`npm run stale`). Read the `npm run sheet`
   contact sheets for the rank steps against `notes/design/motion.md` before
   calling the motion fine. Only Owen marks rows `[x]`.

Constraints: Node 24 via
`export PATH=$HOME/.nvm/versions/node/v24.13.1/bin:$PATH`; pnpm; commit only
when Owen asks, by path, on main; never `rm` (ask Owen); dev server only for
`?step=N`.

## Relevant Files

- `src/components/scrolly/RankBars.svelte`: the failing rows (`.rows li`
  opacity 0.35, `.known`, the `row-in` keyframes, `.share`, `.footnote`).
- `properties/role/chart.json`: `chart.rank-row`, `rank-row-focus`,
  `footnote`, and their contrast declarations. The token spec doesn't know
  about the 0.35 opacity, which is why it passed.
- `scripts/a11y-scan.js`: the scan (`--steps 6` for a fast loop,
  `--settle`, `--box`).
- `scripts/run-ci-quality-gates.sh` and
  `.github/workflows/ci-quality-gates.yml`: where the gate goes.
- `notes/design/tokens.md`: the token groups and the contrast metadata
  contract.
- `notes/design/interactions.md`: the rank chapter's interaction rules.
- `notes/tween-checklist.md`: the rows to stale.

## Key Context

- The dev tuners (`scrolly/dev/*`, `TapZonesDev`) are marked `data-dev-only`
  and excluded from the scan, because production never ships them. Their
  failures (`.edge` labels, the tap-zones toggle) are not reader-facing.
- axe also reports many "unresolved" nodes (bgOverlap, imgNode: text over the
  canvas). Those are expected. They're covered by the token pairs, and the
  text over the canvas carries the stacked `--text-halo`.
- The scan only sees resting states opened by URL. In-step states (quiz
  verdicts, an open search, a guessed rank row) aren't driven, so check those
  by hand or script them if the fix touches them.
- Token exemptions (hop-band hues, crowd grey, quiz-card border, …) were
  written by the previous session and haven't been reviewed by Owen yet.
  They're not failures, but worth his read.
- Opacity applied in CSS or JS isn't visible to the token contrast spec. Only
  the rendered scan catches alpha-dimmed text, so the rendered gate matters.

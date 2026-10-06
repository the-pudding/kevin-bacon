<!-- cspell:ignore Mahershala -->

# Handoff: Re-check the a11y findings marked [dirty] at the 375px floor

## Starting Prompt

Goal: re-check every finding marked **[dirty]** in
`notes/audit/a11y-review-2026-10-06.md` and
`notes/audit/a11y-fix-plan-2026-10-06.md`, now that the supported floor is
**375px wide** (320×568 is out of scope; landscape 667×375 stays in scope).
For each one, measure it at 375×667 and 390×844 (plus 667×375 where the
finding names landscape), in **Chromium and WebKit**. Then, for each one, do one
of these:

- **Resolve** it: it doesn't reproduce at ≥375, so mark it out of scope and
  record the measurement;
- **Restate** it: it reproduces, so replace the 320 figures with the 375 ones
  and drop the [dirty] tag;
- for fix-plan items, **re-size** them: redo D1's plot-height cost at 375×667,
  and confirm Phase 3/4's check widths.

What is dirty (all from the review unless noted):

1. **B1:** the 320 step list and the 320 card-top/tick figures, plus step 13's
   overlap figure. Measure the 360–390 list (9, 13, 17, 22) and landscape
   (17, 22) at 375/390 to confirm.
2. **B4:** the 320 column only. 375 already overprints, so confirm it still does.
3. **M7:** the rows for 8–11/18–19, 16 and 24 (320-only). Confirm they don't
   appear at 375.
4. **M8:** step 5 (320-only). Steps 0–1 (375), step 4 and step 10 (landscape)
   stand, but need their figures at 375.
5. **M9:** already resolved. At 375 the side-by-side quiz chips don't overflow
   (measured this session). Owen chose to keep them side by side. Known cost:
   every name wraps to two lines, and pair 5's second chip ("Mahershala Ali")
   ends exactly at the screen's right edge.
6. **M10:** 200% text. Re-measure the card-top table at 375 (steps 1, 6, 8, 12,
   22, 26; `html { font-size: 200% }`). Also check whether steps 4, 5 and 17
   still page-scroll and overflow horizontally.
7. **Minor:** "Title-card byline below the fold": the 320 half only.
8. **Fix plan:** D1's cost figure (re-measure the race plot height at 375×667),
   Phase 3 M10 and M8 (steps 4–5), and the Phase 4 check widths (already
   rewritten to 375/390/667×375; just confirm).

Do this first: read the update notes at the top of both audit docs, then
`grep -n dirty` in each to get the exact list. The review's original capture
scripts are under `sheets/a11y/` (gitignored), e.g. `sheets/a11y/contrast/overtext.mjs`
for glyph overlap and `sheets/a11y/kbd-mobile/overflow.mjs`. They hard-code
`http://[::1]:5174/` and Chromium. Run them from the repo root, and add WebKit.

Constraints:

- This is measurement and doc editing only. Change no code; Phases 3–4 of
  the fix plan do the fixing.
- Measure, don't infer from CSS. Use `getBoundingClientRect` readings and
  screenshots you have actually looked at.
- `?step=N` works only on a dev server. One is usually already running on port
  5174 for this repo (check with `lsof -iTCP:5174 -sTCP:LISTEN`). Otherwise start
  one in tmux.
- Prefix every npm/npx/node call with
  `export PATH=$HOME/.nvm/versions/node/v24.13.1/bin:$PATH`.
- Don't commit unless Owen asks. Run `npx prettier --write` on edited `.md`
  files.

## Relevant Files

- `notes/audit/a11y-review-2026-10-06.md`: the findings, with [dirty] tags and
  the 375px update note at the top.
- `notes/audit/a11y-fix-plan-2026-10-06.md`: the phased plan, with [dirty] tags.
  Phases 1–2 are implemented (uncommitted). Phases 3–5 haven't started.
- `notes/audit/a11y/`: the committed evidence frames (filenames carry the width).
- `sheets/a11y/`: the review's capture scripts and logs (gitignored).
- `sheets/a11y/fix/phase12.mjs`: this session's Phase 1–2 check script
  (Chromium/WebKit, `node sheets/a11y/fix/phase12.mjs <engine> [checks]`). It's
  a model for a 375 re-measure script.
- `scripts/lib/story-page.js`: `waitForStory(page)`, used by every script.

## Key Context

- Owen set the floor on 2026-10-06: "we only need to support 375px" (saved
  to memory as `support-floor-375px`).
- Phases 1–2 of the fix plan landed this session, uncommitted, and verified 19/19
  in Chromium and WebKit. axe over 27 steps at 375/1280 found 0 violations.
  The one remaining axe warning is `scrollable-region-focusable` on ActorSearch's
  list when it overflows. It's accepted, and the reason is in
  `ui/Combobox.svelte`: a tab stop there breaks `aria-required-children`, and
  the arrow keys already scroll the list.
- Phases 1–2 and the [dirty] tags are committed; the tree was clean after.
- `npm run stale` reported nothing to stale for Phases 1–2. The affected rows
  were already `[!]`.

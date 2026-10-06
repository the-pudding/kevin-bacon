# Handoff: Make `npm run gates` pass on main after the matt-branch merge

## Starting Prompt

Goal: get `npm run gates` passing on `main` again. `main` is at `5c3b298`, a local fast-forward that hasn't been pushed. It came from merging `matt-branch`. Main merged into that branch with no conflicts, but the branch's WIP commits fail most of the gates: `1856eaf` (dark theme, header/footer, race chart restyle), `6d8e506`, `21cc101` and `08a7469`. The main-side changes the merge brought in (meta/share image, analytics prefixing, `copy.json`) did not cause any of these failures.

Constraints:

- Work on `main`. Don't create branches, and don't commit until Owen asks.
- Prefix PATH with Node 24 for every npm/npx call: `export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"`.
- Fix the code. Don't disable rules, add exceptions or loosen thresholds.
- Colours and fonts must come from role tokens authored in `properties/` and built with `npm run style`. Read `notes/design/tokens.md` first. Add new tokens there if the restyle needs ones that don't exist yet.
- **Don't regenerate the goldens (`npx vitest run -u`) until Owen confirms** that the layout changes in the WIP commits are intended. Ask him first.
- Any canvas-affecting change, including the ones already merged, needs the affected tween checklist rows staled. Run `npm run stale` against the staged diff. Never mark a row `[x]`.
- Owen writes the reader-facing prose. Leave copy alone.

Work in this order, re-running the individual gate after each step:

1. **Prettier:** `npx prettier --write` on `src/components/scrolly/ActorSearch.svelte`, `PointerIcon.svelte` and `Step.svelte`.
2. **ESLint (13 errors), all in `src/components/Footer.svelte` and `Header.svelte`:**
   - unused arg `i` at `Footer.svelte:81`
   - `svelte/no-navigation-without-resolve` on plain hrefs (`Footer.svelte:82,145,154`). These may be external links; check how the rule treats those before changing them.
   - `svelte/no-at-html-tags` (`Footer.svelte:102,126,138`, `Header.svelte:9`). Replace `{@html}` with markup or with a component/SVG import, depending on what's being injected.
3. **Stylelint (68 errors):** hard-coded hex/`rgba` colours and a literal `"Atlas Typewriter"` font-family. Errors per file:
   - `scrolly/ScrollyVisual.svelte` 20
   - `Footer.svelte` 15
   - `Footer.Story.svelte` 13
   - `scrolly/PointerIcon.svelte` 6
   - `scrolly/PairQuiz.svelte` 3
   - `scrolly/Stage.svelte` 3 (lines ~863–929)
   - `styles/app.css` 3
   - `scrolly/RankBars.svelte` 2
   - `Header.svelte`, `scrolly/ActorSearch.svelte` and `scrolly/RaceScrubber.svelte` 1 each
4. **Vitest (68 failures):**
   - `src/styles/__tests__/contrast.spec.js` (27): annotation._ and chart._ tokens fall below 4.5:1 or 3:1 on `surface.page`. The dark theme probably changed `surface.page` without retuning the role tokens on top of it. Fix the tokens, not the spec.
   - `scrolly/__tests__/callout.spec.js` (1): "…and above it on the phone, where the note is too tall to fit under". The callout placement changed.
   - `scrolly/__tests__/goldens.spec.js` (40): layout hashes changed. Start by listing which states changed, then ask Owen whether each change is intended before running `-u`.
5. Run `npm run gates` end to end. It also runs `npm run a11y`, the rendered contrast scan. For any canvas change you claim works, check the contact sheets (the `tween-sheet` skill) against `notes/design/motion.md`.

First action: run `git status` and `git log --oneline -6` to confirm `main` is still at `5c3b298`, then begin with step 1.

## Relevant Files

- `scripts/run-ci-quality-gates.sh`: runs the gates in order (lint, stale check, style build, svelte-check, vitest, a11y).
- `src/components/Footer.svelte`, `Footer.Story.svelte`, `Header.svelte`: new in the restyle. Most of the ESLint and Stylelint errors are here.
- `src/components/scrolly/ScrollyVisual.svelte`: the biggest Stylelint offender (20). Changes here count as canvas changes, so stale the checklist.
- `src/components/scrolly/Stage.svelte`, `PairQuiz.svelte`, `RankBars.svelte`, `RaceScrubber.svelte`, `PointerIcon.svelte`, `ActorSearch.svelte`, `Step.svelte`: smaller lint and format fixes.
- `src/styles/app.css`: 3 Stylelint errors.
- `properties/`, `notes/design/tokens.md`: where tokens are authored and the rules for using them. Rebuild with `npm run style`.
- `src/styles/__tests__/contrast.spec.js`: the token contrast pairs that fail.
- `src/components/scrolly/__tests__/callout.spec.js`, `goldens.spec.js`: the layout-side failures.
- `notes/tween-checklist.md`: mark rows stale with `npm run stale`.
- `notes/scrolly-framework.md`: read before touching the scrolly files.

## Key Context

- `svelte-check` passes: 0 errors, 28 warnings.
- `main` is a local fast-forward to `5c3b298` and hasn't been pushed. Pushing is Owen's call. `matt-branch` points at the same commit.
- `.env.production` is untracked and isn't ours. Leave it alone.
- Owen chose to merge with the gates failing and fix them afterwards, so the failures are known. Don't revert the merge.

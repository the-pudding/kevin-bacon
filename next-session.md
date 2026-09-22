# Handoff: reconcile the actor search's design note with what it now is

## Starting Prompt

The step-6 hop-chart search work that was in flight is now finished and
committed: the analysis repo delivered a widened
`data/top-250-hop-bands-with-hop-counts.csv` (1,268 rows), and — Owen's
call — the search pool everywhere (not just step 6) was narrowed to exactly
that coverage rather than keeping a separate, wider pool for the other three
searches. `search.js`'s `SEARCH_POOL` is now 1,268 actors (was 1,449); the
`HOP_POOL` export that briefly existed is gone, since it would have been
identical to `SEARCH_POOL`. A small, deliberate consequence: Chevy Chase and
Jacob Elordi are labelled on their own charts (career, Gen-Z race) but are no
longer searchable anywhere, since neither has an honest hop 1-4 breakdown.

`notes/design/interactions.md` rule 1b is the design record for this control
and was already out of date before this round of changes (it describes an
older, single-pool search with a distance caption that no longer exists).
This round widens the gap further: it now needs to describe one shared
`SEARCH_POOL` across all four searchable steps (not `RANK_POOL` vs a
separate `HOP_POOL`), and should say why a couple of story-labelled actors
are deliberately unsearchable.

Read `notes/design/interactions.md` rule 1b first, then
`src/components/scrolly/search.js` (`SEARCH_POOL`'s doc comment already
explains the current shape) and the two panel snippets in
`src/components/Index.svelte`, and bring the note in line with the code.

Constraints:

- `notes/design/interactions.md` is Owen's reasoning record, not a
  changelog. State the rule, then why.
- Do not mark any `notes/tween-checklist.md` row `[x]`. Only Owen signs one
  off.
- Node 22.21 is the shell default; prefix PATH with
  `~/.nvm/versions/node/v24.13.1/bin` for `npm`/`npx`.

## Relevant Files

| File                                                    | Why                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notes/design/interactions.md`                          | **The task.** Rule 1b is the stale part — likely still describing the pre-hop-chart search and a dropped distance caption, now also missing the single-pool-everywhere change. |
| `src/components/scrolly/search.js`                      | `SEARCH_POOL`'s doc comment is the current source of truth: one pool, narrowed at build time to actors with a `rankHopBands` row. `RANK_POOL` is unchanged (rank guess only).  |
| `src/components/Index.svelte`                           | `searchPanel` and `anchorPanel` — both now read `pool={SEARCH_POOL}`.                                                                                                          |
| `tasks/build-scrolly-nodes.js`                          | The `searchPool` filter (`~lines 916-931`) — where the hop-1-4-coverage narrowing actually happens, and the comment explaining the Chevy Chase / Jacob Elordi trade-off.       |
| `notes/scrolly-framework.md`                            | Already updated this round — the `search`/`hops` paragraph, the `search.js` file-table row, and the `rankHopBands` paragraph are current and can be cited.                     |
| `src/components/scrolly/__tests__/actor-search.spec.js` | What's actually asserted about the pool now, including the explicit "drops actors with no honest hop 1-4 breakdown" test.                                                      |

## Key Context

- **Verified**: `npm run gates` passes (lint, svelte-check, vitest), 386/387
  tests — the one failure (`stale-checklist.spec.js`, a checklist
  row/step-numbering mismatch) is pre-existing and unrelated, from other
  in-flight work in this repo.
- **Not yet manually verified in a browser** on this round's change (the
  pool-narrowing) — worth doing before calling it fully signed off: search
  "Chevy Chase" and "Jacob Elordi" on any of the four searchable steps and
  confirm they now return nothing everywhere (not just step 6), and that a
  name still inside the pool (e.g. "Zendaya") works on all four.

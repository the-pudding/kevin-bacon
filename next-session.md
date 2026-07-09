# Handoff: Pull the network "islands" into the core

## Starting Prompt

The `network` step's force-directed layout (built in `tasks/build-scrolly-nodes.js`, rendered via `src/components/scrolly/`) is working and reads as an authentic force-directed graph: a dense grey core with organic filaments, community clumps, and strays sprawling out. The **next task is to pull that sprawl ("islands") into the core** so the mass is tighter, without flattening the core's organic structure. It does **not** need to be mathematically accurate.

The island _detection_ is already done and spot-check-approved: **1,919 of 10,002 nodes** are flagged as islands and currently rendered **green** in the `network` state (a temporary debug device). Detection is a spatial "not part of the dense mass" test — grid-bin the settled positions, the core is the giant blob of cells with ≥ `ISLAND_MIN` nodes (plus adjacent cells), everything else is an island. See the island block in `build-scrolly-nodes.js` (~after the sim's tick loop) and `islandIds` written to `networkLayout.islands`.

Do this:

1. **Pull islands inward.** Recommended: a second short d3 pass after detection — give island nodes a strong `forceX`/`forceY` pull toward the core centroid (or re-seed them just inside the core boundary), keep `forceCollide` so they settle into gaps, hold the core + pinned intro actors ~fixed. Reconnect the 12 truly-severed nodes (separate graph components) to their strongest real costar in the core so links help. Keep it deterministic (seeded, fixed ticks, no RNG).
2. **Turn off the green.** The green coloring is a spot-check only — revert it (or gate it behind a debug flag) so islands render as normal crowd dots once they're pulled in. Touches: `NETWORK_ISLANDS`/green in `layout-shared.js` + `intro.js` `layoutNetwork`, and the `islands` export in the bake.
3. Re-bake, verify determinism, screenshot in wizard mode, lint.

First: read `notes/scrolly-framework.md` (the `networkLayout` paragraph is current), then the layout block in `build-scrolly-nodes.js` (edge loading → force sim → island detection). Check `git status`/`git diff` — there's substantial uncommitted work from this session; don't revert it, don't commit without asking.

## Relevant Files

- `tasks/build-scrolly-nodes.js` — the whole network layout: real costar edges (`top10000-edges.json`) capped to top-`NETWORK_EDGE_CAP` (8) per node → `forceLink`; `forceManyBody`/`forceCollide`/weak `forceX`/`forceY`; beeswarm seed; intro actors pinned off-centre in their burst arrangement; then the grid island detection. **This is where the pull-in goes.** Tunables at the top of the block: `NETWORK_CHARGE -18`, `NETWORK_LINK_D 18`, `NETWORK_LINK_STRENGTH 0.35`, `NETWORK_CENTER 0.015`, `NETWORK_TICKS 300`, `NETWORK_EDGE_CAP 8`, `ISLAND_CELL 55`, `ISLAND_MIN 6`.
- `src/components/scrolly/layout-shared.js` — `networkCamera`/`networkPosition` (zoom-out camera), `networkRadius` (uniform `NETWORK_DOT_R`), `NETWORK_ISLANDS` set (green spot-check), `parkHidden`/`networkEntryPosition`.
- `src/components/scrolly/layouts/intro.js` — `layoutNetwork` (green island coloring lives here), `lone`/`networkIntro` handoff.
- `src/components/scrolly/nodes.js` — `NETWORK_LAYOUT`/`NETWORK_COUNT` decode.
- `notes/scrolly-framework.md` — `networkLayout` contract (current).
- Read-only sources: `references/pudding-post/data/layout/{saved-layout-x,01-skeleton-top10000,top10000-edges}.json`.

## Key Context

- **Layout engine (this session's big change):** the network is no longer the reused beeswarm — it's a build-time d3-force _graph_ layout driven by the real costar edge list. The beeswarm (`saved-layout-x.json`) is only the seed. An earlier charge+collide+centering version with no edges produced a suspiciously perfect disc (aspect 0.98) — the giveaway that it wasn't really force-directed; edges fixed that (aspect ~0.59, organic).
- **Intro actors:** pinned (`fx/fy`) in their `networkIntro` burst arrangement, scaled (`INTRO_BURST_SCALE 0.35`) and anchored off-centre (`INTRO_BURST_OFFSET [-260,-560]`), so Bacon lands ~48th percentile from centroid — "not the centre" is shown. Keep them pinned; the pull-in should not disturb them.
- **All dots uniform size** (`NETWORK_DOT_R`), crowd faint (`NETWORK_CROWD_ALPHA 0.55`), Bacon dark + pulsing. Only Bacon is visually distinct — the other 14 intro faces are grey (flagged earlier; may want colour/labels later).
- **Islands:** 1,919 spatial-island nodes (green). Only 12 are truly graph-severed; the rest are thread-connected sprawl, which is why graph-connectivity was the wrong test.
- **Determinism is a hard requirement** — `scrolly-nodes.json` is committed and `.prettierignore`d; bake twice and `git diff` must be empty. d3-force is deterministic (seeded positions, fixed ticks, internal LCG, no `Math.random`).
- **Verification recipe:** dev server on 5199 (may already be running); story is **wizard-mode** — drive with ArrowRight (steps: `lone`→`networkIntro`→`network`); Playwright from the scratchpad (`playwright` installed there, Chromium cached in `~/Library/Caches/ms-playwright`); reset `localStorage` to start at step 0; canvas-only screenshots; check `page.on("pageerror"/"console")`. Then `npm run lint`.
- **Not committed.** Working tree has this session's full rework across `build-scrolly-nodes.js`, `layout-shared.js`, `intro.js`, `nodes.js`, `scrolly-nodes.json`, `scrolly-framework.md`.

# Handoff: Point staging at the new Supabase project and verify it

## Starting Prompt

Goal: switch the kevin-bacon staging build (GitHub Pages) from the old Supabase
project to the new one, and prove it works before and after deploying.

Where things stand (2026-09-30): the app already talks to `kevinbacon_`-prefixed
objects (`kevinbacon_rank_guesses`, `kevinbacon_pair_quiz_picks`,
`kevinbacon_actor_searches`, RPC `kevinbacon_quiz_results`), committed in
536de65. Credentials are split by Vite mode (00b3bdf): `.env` = OLD project,
used by `npm run dev`; `.env.production` = NEW project, overrides `.env` for
`npm run build` / `make staging`. Staging is live (b695ee1) on the OLD project
and Owen has confirmed it works locally and on staging.

Do, in order:

1. Confirm `.env.production` exists and has `PUBLIC_SUPABASE_URL` and
   `PUBLIC_SUPABASE_PUBLISHABLE_KEY` — presence checks only, never print the
   values. If it is missing, stop and ask Owen to create it (he adds the keys
   himself, so they stay out of the transcript).
2. Reverse-engineer the NEW project. Owen has NO access to it: no dashboard,
   no SQL editor, no CLI link, only the URL and publishable key. Another party
   owns it and ran (some of) the scripts. Everything must be inferred from
   PostgREST's answers to the publishable key, the way the app reaches it
   (`node --env-file=.env.production`, supabase-js from the repo's
   node_modules via createRequire). Build a table of what exists and what
   doesn't:
   - First try the OpenAPI root: `GET <url>/rest/v1/` with the key as `apikey`.
     If it answers, it lists every exposed table, column and RPC in one go.
     Newer publishable keys may be refused; if so, fall back to the probes below.
   - Tables: `from(<t>).select("id").limit(1)` for the three prefixed names AND
     the unprefixed ones. `[]` = exists (RLS hides rows), PGRST205 = missing.
   - Columns: `select("<col>")` per column of `supabase/schema.sql`. A 42703
     (column does not exist) means the scripted schema differs from ours.
   - Insert policy/grant, without leaving a row: insert a row with
     `session_id: null`. 23502 (not-null violation) = the insert was allowed
     and nothing was written. 42501 = RLS/grant denies anon inserts. Postgres
     applies the RLS insert check before NOT NULL, so this should work, but
     PROVE the ordering on the local podman DB first (load schema.sql there and
     run the same insert). Never send a valid row: the publishable key can't
     delete it, and it would skew every histogram for good.
   - RPC: `rpc("kevinbacon_quiz_results", { p_session_id: null, p_pair_count:
5, p_slj_actor_id: <index of tmdb 2231 in src/data/scrolly-nodes.json> })`.
     PGRST202 = missing (Owen suspects `supabase/quiz_results.sql` was never
     run there). The error's `hint` can name a near-miss function, so read it.
     Also try `rpc("quiz_results", …)` in case they ran the unprefixed version.
   - Report the findings as a plain table: object → exists / missing / differs.
3. Anything missing can only be fixed by the project's owner. Claude can't
   run DDL there, and neither can Owen. The CLI is linked to the OLD project
   (ref yboutoyftlasqutovalf, "sdokb"), so never use `--linked` for this.
   Write a short, self-contained request Owen can forward to the owner:
   which SQL file(s) to run (`supabase/quiz_results.sql`, which ends with
   `notify pgrst, 'reload schema'`) and why, plus the probe evidence. If the
   owner's names or columns differ from ours, stop and ask Owen. Don't add a
   second naming scheme to the app. Deploying before the function exists
   is safe: the credits just hide the results block.
4. `npm run build`, then verify without printing secrets: `build/_app/env.js`
   contains the `.env.production` URL/key (grep -qF), and the bundle names only
   `kevinbacon_*`.
5. Commit nothing new unless asked; hand Owen `! make staging` (it commits
   `docs/` with `git add -A` and pushes — Claude never pushes). Afterwards,
   poll https://the-pudding.github.io/kevin-bacon/ until it serves the new
   `nodes/2.*.js` hash and its `_app/env.js` matches `.env.production`.
6. Ask Owen to play through once on staging (name Samuel L. Jackson, answer all
   five pairs) and check the credits. On a fresh project the "Your results"
   block stays hidden until 50 readers have finished (`PUBLIC_MIN_QUIZ_TAKERS`),
   so a missing block there is expected — confirm the writes landed instead
   (the RPC's takers count goes up) rather than calling it a bug.

Constraints: Node 24 via `PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"`.
Local Supabase runs on podman: `export DOCKER_HOST="unix://$(podman machine
inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"` (start the machine
first). Owen is a contractor with no Google Drive access: edit
`src/data/copy.json` directly, never run `npm run gdoc`.

First action: step 1.

## Relevant Files

- `src/utils/analytics.js` — every Supabase write and the one RPC; the prefixed names live here.
- `src/components/results/quiz-results.svelte.js` — the RPC caller; catches and logs errors so the credits never break.
- `src/components/results/QuizResults.svelte` — the show/hide gate (`you` non-null and takers >= MIN_QUIZ_TAKERS).
- `supabase/schema.sql` — run-once DDL for the three tables and their insert-only RLS policies.
- `supabase/quiz_results.sql` — the re-runnable `kevinbacon_quiz_results` function, its indexes and the PostgREST schema reload.
- `.env.example` — documents the `.env` / `.env.production` split.
- `tasks/seed-quiz-analytics.js` — seeds a local DB only (reads `.env`); refuses remote without SEED_ALLOW_REMOTE=1. Never seed the new project.
- `Makefile` — `staging` = build, then `github` (rm/cp docs, `git add -A`, commit, push).

## Key Context

- NEW project: Owen can't see it at all. Treat every claim about it as inferred from REST responses, and label it that way. Owen was told the tables were "scripted with a `kevinbacon_` prefix", but nobody has verified that yet.
- Old project (in `.env`, CLI-linked): tables were renamed in place to the prefixed names (rows, policies and indexes intact) and `kevinbacon_quiz_results` was created there; the old `quiz_results` function is gone.
- Verified 2026-09-30: gates pass (608 tests, a11y clean); on a local podman Supabase, both the schema-only state (RPC 404 caught, block hidden, story fine) and the full state (both charts render) were checked in a browser; staging b695ee1 serves the prefixed names against the old project.
- A 404 on the RPC is harmless to the reader by design: logged as `analytics: kevinbacon_quiz_results failed`, results block hidden.
- `you: null` in the RPC response means the session has no finished quiz (give-ups are never counted) — not a server fault.
- `copy.json` `meta.url` = https://pudding.cool/2026/10/kevin-bacon (3a74651); without it prerender 404s on `/undefined/assets/social.jpg` and the build fails.
- `npm run gates` fails ESLint on two gitignored scratch files from another session (`sheets/rafprobe.mjs`, `sheets/probe/gates.mjs`); CI never sees them. Run ESLint on `git ls-files` to get the CI-equivalent result, and say so.
- This file is untracked and not gitignored, so `make staging`'s `git add -A` would commit it — delete or move it before deploying.
- Other Claude sessions work in this repo concurrently (a phone-debug dev server in tmux `phone-kevin-bacon`); stage by explicit path.

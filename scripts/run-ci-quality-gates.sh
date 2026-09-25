#!/usr/bin/env bash
# Central quality-gate runner — the single source of truth for the checks that
# guard commits and CI. Wired into:
#   - package.json "simple-git-hooks".pre-commit  → runs with --local
#   - .github/workflows/ci-quality-gates.yml      → runs in full (default) mode
#
# Modes:
#   (default)  full/CI: whole-tree prettier + eslint + stylelint, the design
#              tokens' build check, svelte-check, vitest, parity guard
#   --local    pre-commit: skips the whole-tree prettier and eslint passes —
#              lint-staged has already formatted and linted the staged files,
#              and checking the *working tree* here would block commits over
#              unrelated dirty files. Adds the tween-checklist check: the rows
#              the staged diff stales must be marked [!] (npm run stale), and
#              the table must match the <Step> list.
#
# svelte-check runs over jsconfig.json (everything under src/) and fails on type
# errors. The vitest suite under src/components/scrolly/__tests__ holds the
# layout goldens and frame contracts — the automated half of the tween
# checklist (notes/tween-checklist.md). A golden only changes when a layout was
# meant to change, and is regenerated deliberately with `npx vitest run -u`.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL=false
for arg in "$@"; do
	case "$arg" in
		--local) LOCAL=true ;;
		*)
			echo "unknown option: $arg" >&2
			exit 2
			;;
	esac
done

if ! $LOCAL; then
	echo "gate: prettier + eslint + stylelint (whole tree)"
	npm run lint
fi

if $LOCAL; then
	echo "gate: tween checklist"
	node scripts/stale-checklist.js --check
fi

echo "gate: design tokens built"
# the generated token files must be what properties/ builds: a stale
# tokens.json would let the contrast spec pass on values nobody ships
npm run style --silent >/dev/null
git diff --exit-code -- src/styles/variables.css src/styles/tokens.js src/styles/tokens.json

echo "gate: svelte-check"
npx svelte-kit sync
npx svelte-check --tsconfig ./jsconfig.json --threshold error

echo "gate: vitest"
npx vitest run

echo "gate: hook/CI parity"
grep -Eq '"pre-commit": ".*run-ci-quality-gates\.sh --local"' package.json
grep -q "scripts/run-ci-quality-gates.sh" .github/workflows/ci-quality-gates.yml

echo "all quality gates passed"

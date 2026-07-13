#!/usr/bin/env bash
# Central quality-gate runner — the single source of truth for the checks that
# guard commits and CI. Wired into:
#   - package.json "simple-git-hooks".pre-commit  → runs with --local
#   - .github/workflows/ci-quality-gates.yml      → runs in full (default) mode
#
# Modes:
#   (default)  full/CI: whole-tree prettier check + svelte-check + parity guard
#   --local    pre-commit: skips the whole-tree prettier check — lint-staged has
#              already formatted the staged files, and checking the *working
#              tree* here would block commits over unrelated dirty files.
#
# svelte-check is scoped by jsconfig.quality-gates.json: the unmigrated starter
# templates (src/components/**/migrate/**, layercake/future/**) are excluded —
# they are kept-as-reference svelte-starter code, not story code. Everything
# else fails the gate on type errors. `npm run check` remains the unscoped run.
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
	echo "gate: prettier (whole tree)"
	npm run lint
fi

echo "gate: svelte-check (story code)"
npx svelte-kit sync
npx svelte-check --tsconfig ./jsconfig.quality-gates.json --threshold error

echo "gate: hook/CI parity"
grep -Eq '"pre-commit": ".*run-ci-quality-gates\.sh --local"' package.json
grep -q "scripts/run-ci-quality-gates.sh" .github/workflows/ci-quality-gates.yml

echo "all quality gates passed"

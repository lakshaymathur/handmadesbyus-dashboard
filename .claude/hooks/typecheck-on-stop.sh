#!/bin/bash
# Claude Code Stop hook: stop Claude from ending a turn while TypeScript has errors.
# Exit 2 = block the stop and send stderr back to Claude to fix. Exit 0 = allow.
# Does nothing until the project has a "typecheck" npm script and node_modules.

input=$(cat)

# Prevent an endless loop: if Claude is already continuing because of this hook, let it stop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0
grep -q '"typecheck"' package.json || exit 0
[ -d node_modules ] || exit 0

# Skip turns that left no uncommitted TypeScript changes (e.g. chat-only turns).
if ! git status --porcelain 2>/dev/null | grep -Eq '\.(ts|tsx|mts|cts)$|tsconfig.*\.json$'; then
  exit 0
fi

if ! out=$(npm run -s typecheck 2>&1); then
  {
    echo "TypeScript type check failed. Fix these errors before finishing the turn:"
    printf '%s\n' "$out" | head -60
  } >&2
  exit 2
fi

exit 0

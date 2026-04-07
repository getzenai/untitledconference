#!/bin/bash
# Stop hook: verify tests pass before the agent finishes.
#
# Exit 0 = allow stop, Exit 2 = block (agent keeps working)
# Checks stop_hook_active to prevent infinite loops.

set -euo pipefail

INPUT=$(cat)

# Prevent infinite loop: if we already blocked once, let the agent stop
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
cd "$ROOT"

# Detect which files have changes (staged + unstaged)
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
ALL_CHANGED="$CHANGED_FILES"$'\n'"$STAGED_FILES"

CODE_CHANGED=false

while IFS= read -r file; do
  [ -z "$file" ] && continue
  if [[ "$file" == *.ts ]] || [[ "$file" == *.js ]] || [[ "$file" == *.svelte ]]; then
    CODE_CHANGED=true
    break
  fi
done <<< "$ALL_CHANGED"

# No relevant changes — let the agent stop
if ! $CODE_CHANGED; then
  exit 0
fi

FAILURES=""

# Always: unit tests
echo "=== Stop hook: Unit tests ===" >&2
if ! npm run test:unit 2>&1 | tail -10 >&2; then
  FAILURES="${FAILURES}Unit tests failed. "
fi

# Opportunistic: integration tests if test DB is available
if pg_isready -h localhost -p 5433 -q 2>/dev/null; then
  echo "=== Stop hook: Integration tests (test DB detected) ===" >&2
  if ! TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://root:mysecretpassword@localhost:5433/test}" BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-test-secret-for-hooks}" npm run test:integration 2>&1 | tail -10 >&2; then
    FAILURES="${FAILURES}Integration tests failed. "
  fi
fi

# --- Opportunistic: screen spec visual verification if dev server running ---
if curl -sf --max-time 1 http://localhost:5173 > /dev/null 2>&1; then
  TODAY=$(date +%Y-%m-%d)
  SPEC_DIR="$ROOT/docs/user-journey-verification"

  MODIFIED_SPECS=$(git diff --name-only HEAD -- "$SPEC_DIR/screen-"*.md 2>/dev/null || true)
  STAGED_SPECS=$(git diff --cached --name-only -- "$SPEC_DIR/screen-"*.md 2>/dev/null || true)
  ALL_SPECS=$(printf '%s\n%s' "$MODIFIED_SPECS" "$STAGED_SPECS" | sort -u | grep -v '^$' || true)

  if [ -n "$ALL_SPECS" ]; then
    MISSING_VERIFICATION=""
    for spec_path in $ALL_SPECS; do
      SPEC_FILE="$ROOT/$spec_path"
      if [ -f "$SPEC_FILE" ] && ! grep -q "### Run: $TODAY" "$SPEC_FILE"; then
        MISSING_VERIFICATION="$MISSING_VERIFICATION $(basename "$spec_path")"
      fi
    done
    if [ -n "$MISSING_VERIFICATION" ]; then
      FAILURES="${FAILURES}Screen specs updated but observed behavior not verified for:${MISSING_VERIFICATION}. Run /verify_screen or docs/agent-workflows/verify-user-journey-visual.md. "
    fi
  fi
fi

if [ -n "$FAILURES" ]; then
  echo "${FAILURES}Fix these issues before finishing." >&2
  exit 2
fi

exit 0

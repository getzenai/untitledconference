#!/bin/bash
# SessionStart hook: inject context on new sessions and after compaction.
#
# Outputs critical reminders as additionalContext so agents maintain
# awareness of project state even after context compression.

INPUT=$(cat)
SESSION_TYPE=$(echo "$INPUT" | jq -r '.session_type // "new"')
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"

CONTEXT=""

# --- Always inject: git state ---
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
RECENT_COMMITS=$(git -C "$ROOT" log --oneline -3 2>/dev/null || echo "(no commits)")
UNCOMMITTED=$(git -C "$ROOT" diff --stat HEAD 2>/dev/null | tail -1)
CONTEXT="Git branch: $BRANCH\nRecent commits:\n$RECENT_COMMITS"
if [ -n "$UNCOMMITTED" ]; then
  CONTEXT="$CONTEXT\nUncommitted changes: $UNCOMMITTED"
fi

# --- Always inject: service health ---
if curl -sf --max-time 0.5 http://localhost:5173 > /dev/null 2>&1; then
  DEV_STATUS="running (localhost:5173)"
else
  DEV_STATUS="not running"
fi

if pg_isready -h localhost -p 5433 -q 2>/dev/null; then
  TESTDB_STATUS="running (localhost:5433)"
else
  TESTDB_STATUS="not running"
fi

if curl -sf --max-time 0.5 http://localhost:5555 > /dev/null 2>&1; then
  STUDIO_STATUS="running (localhost:5555)"
else
  STUDIO_STATUS="not running"
fi

CONTEXT="$CONTEXT\nDev server: $DEV_STATUS | Test DB: $TESTDB_STATUS | Drizzle Studio: $STUDIO_STATUS"

# --- After compaction: re-inject critical reminders ---
if [ "$SESSION_TYPE" = "compact" ]; then
  CONTEXT="$CONTEXT\n\nREMINDER after context compaction:"
  CONTEXT="$CONTEXT\n- Stop hook runs unit tests (+ integration if DB available) before you finish"
  CONTEXT="$CONTEXT\n- PostToolUse auto-formats .ts/.js/.svelte/.md/.json files after edits"
  CONTEXT="$CONTEXT\n- Pre-push hook runs integration + E2E tests if services are running"
  CONTEXT="$CONTEXT\n- Safety hooks block destructive commands (rm -rf, force push, etc.) and protect .env/lock files"
  CONTEXT="$CONTEXT\n- Spec-first workflow: update screen specs before changing screen-affecting code (see CLAUDE.md)"
  CONTEXT="$CONTEXT\n- Available commands: /test, /git_commit, /git_pr, /pre_commit, /verify_screen"
fi

# Output as additionalContext
echo -e "$CONTEXT" | jq -Rs '{additionalContext: .}'

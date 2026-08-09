#!/bin/bash
# PreToolUse hook: advise updating screen specs before editing screen-affecting files.
#
# Fires on Write|Edit|MultiEdit. If the file being edited affects a user journey screen,
# checks whether the corresponding screen spec was already modified. If not,
# emits an advisory via additionalContext reminding the agent to update the
# spec first. Does NOT deny the edit.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize to relative path from repo root
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -n "$ROOT" ]; then
  FILE_PATH="${FILE_PATH#$ROOT/}"
fi

# Map source files to screen spec(s)
SPECS=""
case "$FILE_PATH" in
  src/routes/\(public\)/login/*)
    SPECS="screen-1-login.md" ;;
  src/routes/\(public\)/register/*)
    SPECS="screen-2-register.md" ;;
  src/routes/\(protected\)/\(with-sidebar\)/home/*)
    SPECS="screen-3-home.md" ;;
  src/routes/\(protected\)/documents/*)
    SPECS="screen-4-documents.md" ;;
  src/routes/\(protected\)/\(with-sidebar\)/settings/*)
    SPECS="screen-5-settings.md" ;;
  src/routes/\(admin\)/admin/*)
    SPECS="screen-6-admin-users.md" ;;
  src/lib/server/db/*)
    SPECS="screen-4-documents.md screen-5-settings.md screen-6-admin-users.md" ;;
  src/lib/server/documents/*)
    SPECS="screen-4-documents.md" ;;
  src/lib/server/services/*)
    SPECS="screen-5-settings.md" ;;
  *)
    exit 0 ;;
esac

# Check which specs have NOT yet been modified in the working tree
SPEC_DIR="docs/user-journey-verification"
UNMODIFIED=""
for spec in $SPECS; do
  if ! git diff --name-only HEAD -- "$SPEC_DIR/$spec" 2>/dev/null | grep -q .; then
    UNMODIFIED="$UNMODIFIED $spec"
  fi
done

# All affected specs already modified — no advisory needed
if [ -z "$(echo "$UNMODIFIED" | tr -d ' ')" ]; then
  exit 0
fi

# Build the advisory message
SPEC_LIST=""
for spec in $UNMODIFIED; do
  SPEC_LIST="${SPEC_LIST}\n  - ${SPEC_DIR}/${spec}"
done

CONTEXT="SPEC-FIRST REMINDER: You are editing $FILE_PATH which affects user journey screen(s). Before implementing behavior changes, update the expected behavior in:${SPEC_LIST}\nUpdate the Components section to describe what the NEW behavior will be. See CLAUDE.md 'Spec-First Workflow' section."

printf '%s' "$CONTEXT" | jq -Rs '{additionalContext: .}'

#!/bin/bash
# PostToolUse hook: after a Bash tool call, check if it was a git commit
# and advise which documentation validation workflows to run.
#
# Fires on every Bash tool use but exits immediately for non-commit
# commands. For git commits, it maps changed files to validation workflows
# and outputs advisory text via additionalContext.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only act on git commit commands
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Get the files from the last commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

NEEDS_API_SURFACE=false
NEEDS_SERVICE_ARCH=false
NEEDS_VISUAL_VERIFY=false

for file in $CHANGED_FILES; do
  # API surface validation: route handler changes
  if [[ "$file" =~ ^src/routes/ ]]; then
    NEEDS_API_SURFACE=true
  fi

  # Service architecture validation: server-side changes
  if [[ "$file" =~ ^src/lib/server/ ]]; then
    NEEDS_SERVICE_ARCH=true
  fi

  # Visual verification: screen-affecting files
  if [[ "$file" =~ ^src/routes/\(public\)/ ]] ||
     [[ "$file" =~ ^src/routes/\(protected\)/ ]] ||
     [[ "$file" =~ ^src/routes/\(admin\)/ ]] ||
     [[ "$file" =~ ^src/lib/server/documents/ ]] ||
     [[ "$file" =~ ^src/lib/server/services/ ]]; then
    NEEDS_VISUAL_VERIFY=true
  fi
done

WORKFLOWS=""
if $NEEDS_API_SURFACE; then
  WORKFLOWS="${WORKFLOWS}\n  - docs/agent-workflows/validate-api-surface.md"
fi
if $NEEDS_SERVICE_ARCH; then
  WORKFLOWS="${WORKFLOWS}\n  - docs/agent-workflows/validate-service-architecture.md"
fi
if $NEEDS_VISUAL_VERIFY; then
  WORKFLOWS="${WORKFLOWS}\n  - docs/agent-workflows/verify-user-journey-visual.md (visual verification of affected screens)"
fi

# No workflows triggered — exit silently
if [ -z "$WORKFLOWS" ]; then
  exit 0
fi

CONTEXT="DOCUMENTATION VALIDATION ADVISORY: Your commit changed files that may affect architecture diagrams or screen behavior. Before pushing, consider running these validation workflows:${WORKFLOWS}\n\nSee CLAUDE.md 'Agent Workflows' section for guidance. If you are making a series of rapid commits, defer validation to after the final commit."

printf '%s' "$CONTEXT" | jq -Rs '{additionalContext: .}'

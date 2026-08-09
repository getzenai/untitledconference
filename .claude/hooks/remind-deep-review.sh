#!/bin/bash
# PreToolUse hook: reminds agent to run /deep-review before pushing.
#
# Advisory hook — outputs a strong warning that the agent sees, but does
# not hard-block. The CLAUDE.md "Deep Review Verification" section enforces
# the requirement. Using permissionDecision: "deny" would create an
# unresolvable block since there is no state to track whether /deep-review
# already passed.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Extract only the first line to avoid matching "git push" inside heredocs
# or commit messages.
FIRST_CMD=$(echo "$COMMAND" | head -1)
if echo "$FIRST_CMD" | grep -qE '^\s*git\s+push'; then
  echo "WARNING: Have you run /deep-review? Per CLAUDE.md, you MUST run /deep-review before pushing."
  echo "If you have NOT run /deep-review yet, STOP and run it now before pushing."
  echo "If /deep-review already passed in this session, proceed with the push."
fi

exit 0

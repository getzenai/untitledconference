#!/bin/bash
# PreToolUse hook: block destructive Bash commands.
#
# Denies dangerous operations that could destroy data or lose work.
# Returns JSON with permissionDecision: "deny" when blocked.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

REASON=""

# Catastrophic deletions
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)*(\/(\s|$)|~(\s|$)|\.{1,2}(\s|$)|"\."(\s|$)|\.\.\/(\*|\.\.)?(\s|$)|\.\/(\.\.|\*)?(\s|$))'; then
  REASON="Blocked: catastrophic rm command that could delete project root, home, or system files"
fi

# Force push to main/master
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force.*\s+(main|master)'; then
  REASON="Blocked: force push to main/master can destroy remote history"
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+-f\s+.*\s+(main|master)'; then
  REASON="Blocked: force push to main/master can destroy remote history"
fi

# Lose uncommitted work
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  REASON="Blocked: git reset --hard discards all uncommitted changes"
fi
if echo "$COMMAND" | grep -qE 'git\s+checkout\s+\.\s*$'; then
  REASON="Blocked: git checkout . discards all unstaged changes"
fi
if echo "$COMMAND" | grep -qE 'git\s+clean\s+-[a-zA-Z]*f'; then
  REASON="Blocked: git clean -f permanently deletes untracked files"
fi

# Docker destructive (destroys test DB volume)
if echo "$COMMAND" | grep -qE 'docker\s+compose\s+down\s+-v'; then
  REASON="Blocked: docker compose down -v destroys database volumes"
fi

# SQL destructive operations via CLI
if echo "$COMMAND" | grep -qiE '(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s)'; then
  REASON="Blocked: destructive SQL operation could damage dev database"
fi

if [ -n "$REASON" ]; then
  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
else
  exit 0
fi

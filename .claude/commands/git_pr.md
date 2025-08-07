---
allowed-tools: mcp__github__*, Bash(git:*)
description: Create a GitHub pull request from current branch to main
---

## Context

- Current branch: !`git branch --show-current`
- Target branch: main
- Branch differences: !`git diff main...HEAD --stat`
- Full diff: !`git diff main...HEAD`
- Commits to be included: !`git log main..HEAD --oneline`
- Repository info: !`git remote get-url origin`

## Your task

Review the differences between the current branch and main branch, then create a pull request using the GitHub MCP tool with an awesome description that includes:

1. **Summary**: A clear, concise overview of what changed and why
2. **Changes**: Bullet points of key modifications
3. **Testing**: How the changes were tested

Use proper markdown formatting with headers, code blocks where appropriate, and emojis for better readability.

---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: Create a git commit
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
- Format & lint: !`npm run lint:format`
- Type Check: !`npm run check`
- Unit Tests: !`npm run test:unit`
- E2E Tests: !`npm run test:e2e --reporter=dot`

## Your task

Make sure lint check and tests dont have any errors.
If so, based on the above changes, create a single git commit.

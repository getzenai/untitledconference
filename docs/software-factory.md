# Software Factory Implementation

This repository implements agent automation patterns from the software factory design guides.

## Status

| Guide                               | Status  | Description                                                                          |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| git-hooks-code-quality              | ✅ Full | Pre-commit + pre-push hooks via Husky                                                |
| agent-safety-guardrails             | ✅ Full | PreToolUse hooks block destructive commands and protect sensitive files              |
| agent-testing-automation            | ✅ Full | Stop hook verifies tests; test-all script for comprehensive runs                     |
| agent-context-and-commands          | ✅ Full | SessionStart hook, slash commands (`/test`, `/git_commit`, `/git_pr`, `/pre_commit`) |
| self-documenting-agent-architecture | ✅ Full | PlantUML diagrams with validation workflows and PostToolUse commit advisory          |
| visual-behavior-verification        | ✅ Full | Per-screen behavior specs with spec-first enforcement                                |
| software-factory-tracking           | ✅ Full | This file                                                                            |

## Implementation Details

### git-hooks-code-quality

**Status:** ✅ Full

| Component       | File                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| Pre-commit hook | `.husky/pre-commit` (format, lint, check:unused, check, build, test:unit) |
| Pre-push hook   | `.husky/pre-push` (unit tests + opportunistic integration/E2E)            |

### agent-safety-guardrails

**Status:** ✅ Full

| Component                   | File                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| Destructive command blocker | `.claude/hooks/block-destructive.sh`                               |
| File protection hook        | `.claude/hooks/protect-files.sh`                                   |
| Hook registration           | `.claude/settings.json` (PreToolUse Bash + Write\|Edit\|MultiEdit) |

### agent-testing-automation

**Status:** ✅ Full

| Component                     | File                            |
| ----------------------------- | ------------------------------- |
| Stop hook (test verification) | `.claude/hooks/verify-tests.sh` |
| Comprehensive test runner     | `scripts/test-all.sh`           |
| npm script                    | `package.json` → `test:all`     |
| Hook registration             | `.claude/settings.json` (Stop)  |

### agent-context-and-commands

**Status:** ✅ Full

| Component                | File                                               |
| ------------------------ | -------------------------------------------------- |
| SessionStart hook        | `.claude/hooks/on-session-start.sh`                |
| Test command             | `.claude/commands/test.md`                         |
| Git commit command       | `.claude/commands/git_commit.md`                   |
| PR creation command      | `.claude/commands/git_pr.md`                       |
| Pre-commit check command | `.claude/commands/pre_commit.md`                   |
| PostToolUse auto-format  | `.claude/settings.json` (inline Prettier + ESLint) |
| Hook registration        | `.claude/settings.json` (SessionStart)             |

### self-documenting-agent-architecture

**Status:** ✅ Full

| Component                    | File                                                      |
| ---------------------------- | --------------------------------------------------------- |
| API surface diagram          | `docs/arc42/api-surface.puml` (+ `.png`, `.svg`)          |
| Service architecture diagram | `docs/arc42/service-architecture.puml` (+ `.png`, `.svg`) |
| API surface validation       | `docs/agent-workflows/validate-api-surface.md`            |
| Service arch validation      | `docs/agent-workflows/validate-service-architecture.md`   |
| PostToolUse commit advisory  | `.claude/hooks/check-doc-validation.sh`                   |
| Hook registration            | `.claude/settings.json` (PostToolUse Bash)                |

### visual-behavior-verification

**Status:** ✅ Full

| Component                    | File                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Screen spec: Login           | `docs/user-journey-verification/screen-1-login.md`                               |
| Screen spec: Register        | `docs/user-journey-verification/screen-2-register.md`                            |
| Screen spec: Home            | `docs/user-journey-verification/screen-3-home.md`                                |
| Screen spec: Documents       | `docs/user-journey-verification/screen-4-documents.md`                           |
| Screen spec: Settings        | `docs/user-journey-verification/screen-5-settings.md`                            |
| Screen spec: Admin Users     | `docs/user-journey-verification/screen-6-admin-users.md`                         |
| Spec-first advisory hook     | `.claude/hooks/enforce-spec-first.sh`                                            |
| Visual verification workflow | `docs/agent-workflows/verify-user-journey-visual.md`                             |
| Verify screen command        | `.claude/commands/verify_screen.md`                                              |
| Stop hook enforcement        | `.claude/hooks/verify-tests.sh` (observed-behavior check)                        |
| Hook registration            | `.claude/settings.json` (PreToolUse Write\|Edit\|MultiEdit + enforce-spec-first) |

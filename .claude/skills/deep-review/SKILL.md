---
name: deep-review
description: Multi-cycle convergent review. 3-5 agents per cycle (adaptive), each with a distinct perspective. Up to 3 cycles with early stopping. Fixes applied between cycles. Unbiased — each cycle starts fresh. Autonomous by default.
---

# Deep Review

Convergent multi-agent review with fix cycles. 3-5 agents review in parallel from different perspectives (adaptive per cycle). Findings are fixed, then the next cycle runs unbiased (no access to prior findings). Stops early when a cycle produces zero critical/high findings.

**Default mode: autonomous.** The orchestrating agent decides which findings to fix without asking. CRITICAL and HIGH findings are always fixed. MEDIUM and LOW findings are fixed or skipped based on the agent's judgment of context, impact, and effort. Use `--interactive` for the old ask-the-user behavior.

**Expected duration:** 2-5 min per cycle depending on file count. Full 3-cycle run: 10-15 min.

## Trigger

`/deep-review` or `/deep-review <path>` or `/deep-review --interactive <path>`

## Arguments

- No argument: reviews the current branch diff against main (like a PR review)
- File/folder path: reviews specific files (e.g., `/deep-review src/channels/teams.ts`)
- Multiple paths: space-separated (e.g., `/deep-review src/auth/ src/middleware/`)
- `--interactive`: switches to interactive mode (ask user before fixing)

If no argument and no diff (on main, no changes), ask: "what should I review? give me file paths or a folder."

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max cycles | 3 | Stop after 3 cycles regardless of findings |
| Agents per cycle | 1-5 | Adaptive per cycle. Min decreases by cycle (3/2/1). See Step 2. |
| Early stop | 0 critical + 0 high | Stop if a cycle produces no critical or high findings |
| Fix mode | autonomous | `autonomous` (default): agent decides. `interactive` (`--interactive` flag): ask user. |
| Fix policy (autonomous) | CRITICAL+HIGH always, MEDIUM+LOW contextual | Agent fixes all CRITICAL and HIGH. For MEDIUM and LOW, agent evaluates: effort vs impact, false positive likelihood, whether the finding is in scope. Skipped findings are reported with rationale. |
| Bias | unbiased | Each cycle starts fresh, no prior findings context |
| Agent timeout | ~5 min | Informational. Actual enforcement is framework-dependent. If an agent returns no result, treat as failed. |

## Perspectives

Each cycle uses 1-5 agents (see Step 2 for per-cycle boundaries). The orchestrator selects perspectives adaptively based on the scope and prior cycle findings. One hard rule:

1. **Security is mandatory.** Every cycle MUST include at least 1 Security + Input Validation agent.

Architecture is recommended in most cycles but not required. The remaining agent slots are filled adaptively from the perspective pool below. For example: cycle 1 might use 5 agents (broad sweep), cycle 2 might use 2 (security + the area with most findings).

### Perspective Pool

#### Security + Input Validation (mandatory)

Focus areas:
- Authentication and authorization
- Input validation and sanitization
- Secret handling (tokens, keys, credentials). NOTE: if review findings quote code containing secrets, redact them in the output.
- Injection vectors (SQL, command, template)
- Trust boundaries (what's trusted vs untrusted)
- Error messages leaking internal state
- Dependency security (known CVEs, typosquatting)

#### Architecture + Patterns (default)

Focus areas:
- Alignment with existing codebase patterns
- Interface contracts (types match, callbacks correct)
- Error handling consistency
- State management (race conditions, cache invalidation)
- Separation of concerns
- Naming conventions
- Import structure and dependency direction

#### Correctness + Edge Cases

Focus areas:
- Logic errors and off-by-one mistakes
- Null/undefined handling
- Error propagation (does the caller handle all error types?)
- Resource cleanup (connections, timers, file handles)
- Concurrency issues (promises, async/await)
- Message formatting and encoding
- Boundary conditions (empty input, max size, unicode)

#### Performance + Resource Management

Focus areas:
- Unnecessary allocations or copies
- N+1 query patterns
- Missing caching opportunities
- Memory leaks (event listeners, closures, unbounded collections)
- Blocking operations in async paths
- Bundle size impact

#### API + Contract Compliance

Focus areas:
- Public API surface correctness (parameter types, return types, error types)
- Backwards compatibility
- Documentation accuracy (JSDoc, OpenAPI, README)
- HTTP semantics (status codes, headers, methods)
- Serialization/deserialization correctness

## Workflow

### Step 1: Determine scope

If no argument given:

```bash
git fetch origin main
git diff origin/main...HEAD --name-only
```

Always diff against `origin/main` (not local `main`) to avoid false positives when the local main branch is behind the remote.

If the diff is empty (no changes vs origin/main), ask the user what to review.

If argument given, validate the paths before any shell commands:

1. Resolve each path relative to the repository root (normalize `.` and `..` segments to produce a canonical absolute path).
2. Verify the canonical path is within the repository working tree. Reject paths that escape (report: `*invalid path — must be within the repository.*`). After canonicalization, use a whitelist for allowed characters: alphanumeric, `.` (for file extensions only, no `..` segments remaining after canonicalization), `/`, `-`, `_`. Reject any path containing characters outside this set.
3. Only after validation: verify each sanitized path exists using the Glob tool (preferred) or `ls -la -- "$PATH"` (with quotes and `--` separator).

Collect all files to review. For directories, include all source files recursively (`.ts`, `.js`, `.py`, `.go`, etc.).

**Scope guard:** If more than 30 files, warn the user and offer to narrow:

```
*{N} files in scope. this will take 10+ min per cycle.*
*continue with all {N}? or give me a narrower path (e.g., src/channels/)?*
```

Wait for the user to confirm or provide a narrower scope. If the user narrows, re-run scope determination with the new paths. The cycle counter remains at 0 (this is still Step 1, not a new cycle).

### Step 2: Select agents and run cycle

**Cycle counter.** Initialize the cycle counter to 0 once before Step 1 runs. Increment it at the start of Step 2 every time Step 2 is entered: first entry 0→1, second entry 1→2, third entry 2→3. Step 6 does NOT increment the counter; it only redirects back to Step 2 which handles the increment. All references to `{N}` within a cycle use this value consistently.

**Agent selection.** The orchestrator decides how many agents and which perspectives to use for this cycle. Boundaries per cycle:

| Cycle | Min agents | Max agents |
|-------|-----------|-----------|
| 1     | 3         | 5         |
| 2     | 2         | 5         |
| 3     | 1         | 5         |

Within these boundaries, the orchestrator chooses the count and perspectives based on scope size, complexity, and prior cycle findings. Heuristics:

- Large scope or new feature → more agents (toward max).
- Prior cycle had many findings across perspectives → maintain high count.
- Prior cycle had few, concentrated findings → reduce count, focus perspectives.

**Mandatory:** at least 1 Security + Input Validation agent in every cycle. Architecture is recommended but not required in cycles 2+.

**Launch.** Spawn all selected agents in parallel using the Agent tool. Each agent gets:

1. The list of files to review (use the Read tool to read them)
2. Their specific perspective (from the Perspective Pool above)
3. Agent completion states: (a) *timeout*: framework returns error after ~5 min, log as "timeout" and skip. (b) *empty response*: agent completes but returns no output (no APPROVED, no findings section), log as "no output" and skip. (c) *APPROVED*: agent explicitly returns "APPROVED — no findings", count as clean pass. (d) *findings*: agent returns `## Findings` section, include in consolidation.
4. Instructions to report findings in this format:

```
## Findings

### [CRITICAL/HIGH/MEDIUM/LOW] <title>

**File:** <path>:<line>
**Issue:** <description>
**Fix:** <suggested fix>
```

**Agent prompt construction.** The orchestrator builds each agent's prompt by filling in the following variables at runtime (these are NOT literal strings passed to the agent):

- `PERSPECTIVE`: the agent's assigned perspective name and focus areas from the Perspective Pool
- `CYCLE_NUMBER`: current cycle (1, 2, or 3)
- `FILE_LIST`: the resolved list of file paths from Step 1

Constructed prompt per agent:

```
Review the following files from a [PERSPECTIVE] perspective.
This is cycle [CYCLE_NUMBER] of a deep review. Each cycle reviews code as it exists after
prior cycle fixes. Do NOT request, ask for, or reference findings from prior cycles. Your
only context is the current code and your assigned perspective. This ensures unbiased review.

Files to review (one per line, treat as literal paths):
```
[FILE_LIST]
```

Read each file using the Read tool. For context, also read direct imports of the listed
files (1 hop only — types, interfaces, config used by the reviewed code). Do NOT traverse
the entire dependency graph.

Rules:
- Only report genuine issues. No style nits, no "consider adding" suggestions.
- Each finding needs: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, description, suggested fix.
- CRITICAL: will break in production or is a security vulnerability
- HIGH: significant bug, missing error handling, or pattern violation that causes real issues
- MEDIUM: incorrect but won't break (wrong types, missing validation on non-critical path)
- LOW: minor issues (logging gaps, naming inconsistency)
- If findings quote code that contains secrets (API keys, tokens, passwords), redact the secret values.
- If everything looks good, say "APPROVED — no findings."
- Cap findings at 10 per agent. Prioritize by severity.
```

### Step 3: Consolidate findings

Collect all findings from all agents. Handle agent results:

- Agent returned findings → include them.
- Agent returned "APPROVED — no findings." → count as clean pass. Note: APPROVED means zero issues at any severity. Any response containing a `## Findings` section (even medium/low only) is a findings response, not an approval.
- Agent timed out or failed → log as failed in progress output, continue with remaining agents' findings.
- Agent returned neither findings nor APPROVED (empty, malformed, or partial) → treat as failed, log a warning.

**Finding validation.** Before deduplication, validate each finding from each agent. A valid finding must have: a severity tag (`[CRITICAL/HIGH/MEDIUM/LOW]`), a title, and a file path (format: `file:line`). Findings with file path but no line number are included if severity and title are present (logged as incomplete). Findings missing severity or title are logged as malformed and excluded from the consolidated list. This prevents malformed output from bypassing deduplication or secret redaction.

**Deduplication.** Two findings are duplicates if they refer to the same file AND describe the same underlying issue (same root cause, even if described differently). Matching criteria:

1. Same file path (exact match).
2. Same or overlapping line range (within 5 lines). If one finding specifies a range and another a point, treat the point as a single-line range. Two findings overlap if their ranges intersect or are within 5 lines of each other.
3. Same root cause within the same function or logical unit (the orchestrator judges this; e.g., "missing null check on user.id" from two agents = duplicate, "missing null check on user.id" and "missing null check on user.name" in the same function = separate findings). If the same class of issue appears in different functions, treat as separate findings even if the root cause pattern is identical.

When deduplicating, keep the finding with the highest severity and the most actionable fix description. When line ranges are absent or differ by more than 5 lines, use root-cause judgment alone (criterion 3) to determine duplication.

**Secret redaction check.** The orchestrator performs a final redaction pass over the entire agent response (not just extracted findings) before processing. Scan for these regex patterns and redact any matches:

- AWS keys: `AKIA[0-9A-Z]{16}`
- Generic API keys: `(api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*["'][^"']{8,}["']`
- Bearer tokens: `Bearer\s+[A-Za-z0-9_\-\.]{20,}`
- JWTs (all 3 segments): `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
- PEM blocks: `-----BEGIN (RSA |EC )?PRIVATE KEY-----`
- Password assignments: `(password|passwd|pwd)\s*[:=]\s*["'][^"']+["']`
- Generic high-entropy strings in assignment context: `(token|secret|credential)\s*[:=]\s*["'][A-Za-z0-9+/=_\-]{20,}["']`

Commit message summaries should reference finding titles only, never raw code snippets.

Present to user grouped by severity with tally:

```
*cycle {N}/3: {C} critical, {H} high, {M} medium, {L} low*

*critical:*
- {finding} — {file}:{line}

*high:*
- {finding} — {file}:{line}

*medium:*
- {finding} — {file}:{line}

*low:*
- {finding} — {file}:{line}
```

### Step 4: Evaluate cycle

Check findings:

- **0 critical + 0 high** → early stop. Behavior depends on mode:

**Autonomous mode:**
```
*early stop: cycle {N} clean (0 critical, 0 high).*
*{M} medium, {L} low remaining. evaluating...*
```
The agent evaluates each medium/low finding and decides to fix or skip based on effort, impact, and false positive likelihood. Report decisions inline:
```
*fixing:* {finding} — {rationale}
*skipping:* {finding} — {rationale}
```
Apply chosen fixes, commit with message `fix: address deep-review cycle {N} medium/low findings`, then stop. Review ends. Step 6 does not execute.

**Interactive mode:**
```
*early stop: cycle {N} clean (0 critical, 0 high).*

*remaining medium/low ({count}):*
- {list}

*fix these too? or end review?*
```
Wait for user. If fix: apply fixes, commit with message `fix: address deep-review cycle {N} medium/low findings`, then stop. If end: stop immediately, no fixes applied, no commits. In both cases the review ends. Step 6 does not execute.

- **1+ critical or high** → proceed to Step 5 (fix).

### Step 5: Fix findings

Behavior depends on mode.

**Autonomous mode (default):**

1. Fix ALL critical and high findings. No exceptions, no asking.
2. For each medium and low finding, the agent decides: fix or skip. Decision criteria:
   - *Fix if:* the finding is clearly correct, the fix is low effort, or the issue has real impact (data loss, user-facing bug, security adjacent).
   - *Skip if:* the finding looks like a false positive, the fix is high effort relative to impact, or it's outside the review scope.
3. Report the decision for each medium/low finding with a one-line rationale.

Output format:
```
*fixing {X} critical + {Y} high (mandatory) + {Z} medium/low (by judgment).*
*skipping {W} medium/low:*
- {finding} — {rationale}
```

Then apply all chosen fixes.

**Interactive mode (`--interactive`):**

Ask the user which findings to fix:

```
*{X} critical + {Y} high findings. which to fix?*
1. {finding} [{severity}]
2. {finding} [{severity}]
...

*fix all? or pick numbers (e.g., "1, 3, 4")?*
```

Wait for user response. Parse the response:
- "fix all" or "all" → fix all critical + high findings.
- Comma-separated numbers (e.g., "1, 3, 4") → fix only those. Validate each number is in range. If invalid input, ask again: `*didn't catch that. give me "all" or numbers like "1, 3, 4".*`
- "skip" or "ship it" → skip ALL fixes (critical, high, medium, low) and stop the review entirely. No further cycles run. Rationale: if the user says "ship it" they consider the code ready.

**Medium/low findings (interactive only).** After the user selects which critical/high findings to fix, present any remaining medium/low findings. Note: "skip" here means "skip medium/low findings only" and the review continues to the next cycle. This is different from "ship it" above which stops everything:

```
*also found {M} medium + {L} low. fix any of these too?*
- {finding} [{severity}]
...

*pick numbers, "all", or "skip"?*
```

If the user skips, medium/low carry forward and may be re-discovered in the next cycle (this is expected, see Known Limitations).

**Who applies fixes (both modes).** The orchestrating agent (the one running the deep-review skill) applies the fixes directly using the Edit tool. It reads the file, understands the finding, and makes the change. Fixes are applied sequentially, not in parallel, to avoid edit conflicts. Only apply fixes to files in the original review scope (from Step 1). If a fix requires changes outside the scope, skip it and report: `*skipping {finding} — fix requires changes to {file}, outside review scope.*`

**Commit strategy:** One commit per cycle with all fixes. Message format:

```
fix: address deep-review cycle {N} findings

- {finding 1 summary}
- {finding 2 summary}
```

### Step 6: Next cycle or verify

After fixes are committed, the orchestrator decides the next step:

**If max cycles reached (3):** Stop and report remaining unfixed findings.

Autonomous mode: the agent makes a final pass on remaining medium/low findings and decides which to fix. Report decisions with rationale. Before committing cycle 3 fixes, perform a manual sanity check: read each changed file, verify the fix is correct and doesn't introduce new issues. Then commit.

Interactive mode: offer to fix:

```
*max cycles reached (3). remaining findings:*
- {list}

*fix any of these? or ship it?*
```

**If NOT max cycles:** Go back to Step 2 (Step 2 increments the cycle counter on entry). The new cycle starts fresh (unbiased). Agents do NOT see findings from previous cycles. They review the current state of the code (which includes all fixes from prior cycles). This provides implicit verification of prior fixes within the review scope: if a fix introduced a new issue in a reviewed file, the next cycle's agents will catch it. Note: fixes that touch files outside the original review scope are NOT verified by subsequent cycles (see Known Limitations).

**Adaptive agent count for next cycle.** Before launching cycle N+1, the orchestrator evaluates cycle N results:

- Many findings (5+) across multiple perspectives → approach max agents for cycle N+1.
- Few findings (1-3) concentrated in one area → approach min agents for cycle N+1, focus perspectives on the affected area.
- Only medium/low findings → use min agents for cycle N+1.
- Always use at least the per-cycle minimum and at most the maximum from the table above. "Approach min" means reduce within constraints, not violate the minimum.

Log the decision after the counter is incremented in Step 2: `*cycle {N}/3: {K} agents ({perspective list})*`

## Output Format

Progress updates during the review:

```
*cycle 1/3: 5 agents (security, architecture, correctness, performance, API)*
*cycle 1/3: security ✓*
*cycle 1/3: architecture ✓*
*cycle 1/3: correctness ✓*
*cycle 1/3: performance ✓*
*cycle 1/3: API ✓*
*cycle 1/3: 2 critical, 1 high, 3 medium. fixing...*
*cycle 2/3: 3 agents (security, architecture, correctness)*
*cycle 2/3: security ✓*
*cycle 2/3: architecture ✓*
*cycle 2/3: correctness ✓*
*cycle 2/3: 0 critical, 0 high, 1 medium. early stop.*
```

Final summary:

```
*deep review complete.*
- cycles: 2/3 (early stop)
- cycle 1: 5 agents, fixed 6/6 findings
- cycle 2: 3 agents, 0 critical/high, 1 medium accepted
- commits: 1
```

If a sub-agent fails, show it in progress:

```
*cycle 1/3: security ✗ (timeout, 5 min)*
*cycle 1/3: architecture ✓*
*cycle 1/3: correctness ✓*
```

## Integration with Existing Workflow

This skill complements `/review-pr`:

| Skill | When to use |
|-------|-------------|
| `/review-pr` | Quick single-pass review before merge (5 agents, 1 cycle) |
| `/deep-review` | Thorough convergent review for critical code (3-5 agents, up to 3 cycles) |

Recommended: `/review-pr` for routine PRs, `/deep-review` for new features, security-sensitive code, or specs.

## Error Handling

- If a sub-agent fails or times out, log it and continue with the remaining agents' findings.
- If all launched agents fail in a cycle, report the error and stop. If fewer than 2 agents succeed, warn the user that coverage is insufficient and ask whether to continue (proceed with available findings) or re-run the cycle. A re-run does NOT increment the cycle counter (stays at the same value) but the orchestrator tracks re-run attempts separately. Max 1 re-run per cycle to prevent infinite retries.
- If the user says "stop" mid-cycle, wait for already-running agents to complete (they were launched in parallel), present their findings, skip the fix step, and terminate. No new cycles run.
- If no files match the scope, report and stop.

## Known Limitations

- **3 cycles is a hard limit.** Does not guarantee exhaustive review. Complex codebases may have issues that 15 agent passes miss.
- **Unbiased means potential re-discovery.** Cycle 2 might flag a medium issue that cycle 1 already flagged and the user chose not to fix. This is acceptable (confirms the issue matters).
- **30+ files per cycle is slow.** Agents need to read and understand all files. For large scopes, narrow to specific modules.
- **No cross-file relationship analysis.** Each agent reviews files independently. Systemic issues spanning many files (architectural debt) may not surface.
- **Findings cap at 10 per agent per cycle.** Total max 50 per cycle with 5 agents (before dedup). Keeps output actionable.
- **Last-cycle fixes are unverified by agents.** Cycle 3 fixes don't get a subsequent review cycle. The orchestrator should sanity-check cycle 3 fixes before committing, but this is not equivalent to a full agent review.
- **Out-of-scope fix verification gap.** If a fix modifies files outside the original review scope (e.g., fixing an import in a dependency), subsequent cycles will not review those files. Only files in the original scope are reviewed.
- **Autonomous mode judgment calls.** In autonomous mode, the agent may skip medium/low findings that a human would have fixed, or fix findings that were acceptable. The rationale log provides transparency. Use `--interactive` when human judgment on every finding is preferred.

## Personality Integration

Reference this skill in coding agent personalities under `Allowed Skills`:

```markdown
Coding-Skills:
- deep-review (multi-agent convergent review, 3-5 agents x up to 3 cycles with early stopping)
```

And in the workflow section:

```markdown
## Workflow
...
7. for critical code: `/deep-review` (3-5 agents x up to 3 cycles)
8. for routine PRs: `/review-pr` (5 agents x 1 cycle)
...
```
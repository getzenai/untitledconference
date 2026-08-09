# Code Complexity Linting

- Code complexity linting rules (e.g., `max-lines`, `max-lines-per-function`, `complexity`, `max-depth`) are configured to issue warnings.
- Prioritize addressing these warnings through code refactoring to improve clarity and maintainability.
- If refactoring is not practical or introduces undue complexity elsewhere, `eslint-disable` comments may be used as a last resort.
- Any use of `eslint-disable` for complexity rules must include a brief justification comment explaining why the rule is being bypassed for that specific instance.
- Ensure that refactoring efforts genuinely reduce overall complexity and improve code quality, rather than merely shifting complexity or making the code harder to understand.

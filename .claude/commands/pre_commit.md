---
allowed-tools: Bash(npm run:*)
description: Run checks before creating a PR
---

Run the following commands and try to fix any errors

- npm run lint:format
- npm run check
- npm run test:unit
- npm run test:integration
- npm run test:e2e (run that with at least 3 minutes timeout)

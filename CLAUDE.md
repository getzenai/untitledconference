# Claude Code Instructions

## Project Overview

SvelteKit starter with PostgreSQL, Drizzle ORM, Better Auth, and comprehensive tooling. Uses Azure Key Vault for all secrets — no `.env` files for credentials. Docker container for test database only.

## Routing: RESTful Pattern

- `/resource` - List/redirect
- `/resource/new` - Create form
- `/resource/[id]` - View/edit item
  Never show different content at same URL based on state.

## Database Commands

```bash
# Development database (Azure PostgreSQL — requires KV secrets)
npm run db:push:azure    # Push schema to Azure DB
npm run db:studio:azure  # Open Drizzle Studio with Azure DB

# Test database (local Docker)
npm run psql:test "SELECT * FROM users LIMIT 5;"

# Docker operations (test DB only)
npm run db:start     # Start test DB container
```

**Connections:**

- Dev: Azure PostgreSQL (fetched from Key Vault via `dev-from-kv.sh`)
- Test: `postgres://root:mysecretpassword@localhost:5433/test`

## Testing Commands

```bash
npm run test              # All tests
npm run test:e2e          # E2E tests only
npm run test:e2e -- --grep "name"  # Specific test
npm run lint              # Check code quality
npm run format            # Format code
```

### E2E Test Debugging

1. Run single failing test: `npm run test:e2e -- --grep "exact name"`
2. Check `./test-report-for-coding-agents/all-failures.md` for summaries
3. Create todo per failing test, mark complete after fix or 10 attempts
4. Add logging to understand actual vs expected behavior

### E2E Timeouts (playwright.config.ts)

- Actions: 1000ms (click, fill, type)
- Assertions: 1000ms (toBeVisible, etc.)
- Navigation: 5000ms
- Overall test: 30000ms

**Allowed exceptions only:**

- `waitForLoadState('networkidle', { timeout: 5000 })`
- `waitForURL(..., { timeout: 5000 })`
- `waitForResponse(..., { timeout: 5000 })`

Never add timeouts to UI operations. Playwright auto-waits.

### Page Object Model

Tests use POM pattern. See `/e2e/CLAUDE.md` for details.

- Pages in `/e2e/pages/`
- Actions in `/e2e/actions/`
- Tests in `/e2e/critical-paths/`

## Development

All secrets are fetched from Azure Key Vault. No `.env` file needed for credentials.

```bash
az login                                          # one-time Azure auth
docker compose up -d                              # start test DB (for E2E/integration tests)
./scripts/azure-managed-setup/dev-from-kv.sh      # fetch KV secrets + start dev server
# or: npm run dev:azure
```

See `scripts/azure-managed-setup/CLAUDE.md` for full Azure setup instructions.

```bash
npm run build  # Build for production (no secrets needed — lazy Proxy pattern)
```

## Pre-commit Hook & CI Parity

The pre-commit hook (`.husky/pre-commit`) mirrors the GitHub CI pipeline so errors are caught locally before push:

| Check                  | Pre-commit     | CI             | Notes                                       |
| ---------------------- | -------------- | -------------- | ------------------------------------------- |
| `npm run format`       | Yes (auto-fix) | `format:check` | Pre-commit writes fixes, CI only checks     |
| `npm run lint`         | Yes            | Yes            | Prettier + ESLint (max 60 warnings)         |
| `npm run check:unused` | Yes            | -              | Knip dead code detection (local-only extra) |
| `npm run check`        | Yes            | Yes            | Paraglide compile + svelte-check types      |
| `npm run build`        | Yes            | Yes            | Catches build-time errors (e.g. lazy init)  |
| `npm run test:unit`    | Yes            | Yes            | Unit tests (no DB needed)                   |
| `test:integration`     | -              | Yes            | Needs running database                      |
| `test:e2e`             | -              | Yes            | Needs DB + browser                          |

**Important**: Server-side code must not eagerly evaluate env vars at module scope — `vite build` runs without `.env`. Use lazy patterns (Proxy, getter functions) for any code that reads `$env/dynamic/private`. See `src/lib/server/config.ts` for the pattern.

## Logging

Use Winston logger for structured logging:

```javascript
import { createLogger } from '$lib/server/logger';

const logger = createLogger('ComponentName');

// Usage
logger.debug('Debug message', { userId: 123 });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error, { context: 'additional' });
```

Logger is configured via environment variables (see Environment Variables section).

## Environment Variables

- `DATABASE_URL` - Dev database (auto-configured)
- `TEST_DATABASE_URL` - Test database (auto-configured)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: warn)
- `LOG_FORMAT` - Logging format: human, json (default: human)

## Port Forwarding

- 5173: SvelteKit dev server
- 5433: PostgreSQL test database (local Docker)
- 5555: Drizzle Studio

## SvelteKit Server Actions Best Practices

### Handling Redirects in Try-Catch Blocks

**IMPORTANT**: In SvelteKit, `redirect()` throws a special `Redirect` object that should not be caught as an error. Always handle redirects properly:

```javascript
// ❌ BAD: Redirect gets caught as error
try {
	// ... database operations
	throw redirect(303, '/success');
} catch (error) {
	console.error('Error:', error); // Logs the redirect as error!
	return fail(500, { message: 'Error occurred' });
}

// ✅ GOOD: Re-throw redirects
try {
	// ... database operations
	throw redirect(303, '/success');
} catch (error) {
	// Re-throw redirects (check for Response with redirect status)
	if (error instanceof Response && error.status >= 300 && error.status < 400) {
		throw error;
	}
	console.error('Actual error:', error);
	return fail(500, { message: 'Error occurred' });
}

// ✅ BETTER: Keep redirects outside try-catch when possible
try {
	// ... database operations that might fail
	const result = await db.delete(table).where(condition);
	if (!result) {
		return fail(404, { message: 'Not found' });
	}
} catch (error) {
	console.error('Database error:', error);
	return fail(500, { message: 'Database error' });
}
// Redirect only after successful operation
throw redirect(303, '/success');
```

## Form Validation & Authentication Patterns

### Implementation Guides

For detailed implementation patterns, see the AI-optimized howto guides:

- **[Authentication Patterns](./ai-dev-docs/howtos/better-auth-patterns.md)**: Better Auth client/server implementation, session management, error handling
- **[Forms with Server Actions](./ai-dev-docs/howtos/formsnap-superforms-with-actions.md)**: Database operations, CRUD patterns, progressive enhancement
- **[Client-Only Forms (SPA Mode)](./ai-dev-docs/howtos/formsnap-superforms-client-only.md)**: Authentication forms, async handling, Svelte 5 stores

### Quick Reference

**Form Schema Organization:**

- Place `schema.ts` alongside route files
- Export both schema and TypeScript type
- Reuse `passwordSchema` from `$lib/validators/password`

**When to use which pattern:**

- **Server Actions**: Database operations, file uploads, progressive enhancement needed
- **Client-Only (SPA)**: Authentication forms, Better Auth methods, real-time validation
- **Always**: Use Zod schemas, Formsnap components, proper error handling

### External Documentation

- **Zod API**: https://zod.dev/api
- **Formsnap**: https://formsnap.dev/docs/quick-start
- **Superforms**: https://superforms.rocks/api
- **shadcn-svelte Forms**: https://shadcn-svelte.com/docs/components/form

## Component Guidelines

### Select Component (bits-ui)

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	let value = $state<string>(''); // String for single select
	const options = [
		{ value: 'opt1', label: 'Option 1' },
		{ value: 'opt2', label: 'Option 2' }
	];
	let label = $derived(
		value ? options.find((o) => o.value === value)?.label || 'Select' : 'Select'
	);
</script>

<Select.Root type="single" bind:value>
	<Select.Trigger>{label}</Select.Trigger>
	<Select.Content>
		{#each options as opt}
			<Select.Item value={opt.value} label={opt.label} />
		{/each}
	</Select.Content>
</Select.Root>
```

## Tiptap Editor

- **Tiptap LLM Reference**: https://tiptap.dev/llms.txt

## Better Auth Docs

- Organization: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/organization.mdx
- Admin: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/admin.mdx

## Svelte/SvelteKit Docs (Compact)

- Svelte: https://svelte.dev/docs/svelte/llms-small.txt
- SvelteKit: https://svelte.dev/docs/kit/llms-small.txt

## Important Guidelines

### Code Style

- Follow existing patterns and conventions
- Check neighboring files for library usage
- Never add comments unless asked
- Use existing components as reference

### Security

- Never expose or log secrets/keys
- Never commit secrets to repository
- Test endpoints only work in test environment

### Testing Philosophy

- Fix root cause, not symptoms
- Run specific tests when debugging
- Check test reports after failures
- Task per failing test until fixed

## Decision Making

Act as expert software engineer. Make decisions based on:

- Codebase maintainability
- Ability to add features fast
- Ship fast and reliable
  Argue for these decisions.

## Playwright Coding Agent Reporter

Uses `@zenai/playwright-coding-agent-reporter` for AI-optimized failure reporting.

After test failures:

1. Check `./test-report-for-coding-agents/all-failures.md`
2. Individual reports in subdirectories
3. Use 3-minute timeout for full suite: `Bash(npm run test:e2e, timeout: 180000)`

## Important Reminders

- Do only what's asked, nothing more
- Prefer editing over creating files
- Never create documentation unless requested
- Always check CLAUDE.md in subdirectories for context-specific instructions

# Claude Code Instructions

## Project Overview

SvelteKit starter with PostgreSQL, Drizzle ORM, Better Auth, and comprehensive tooling. Uses Docker containers for dev/test databases.

## Routing: RESTful Pattern

- `/resource` - List/redirect
- `/resource/new` - Create form
- `/resource/[id]` - View/edit item
  Never show different content at same URL based on state.

## Database Commands

```bash
# Development database queries (safe for Claude Code)
npm run psql:dev "SELECT * FROM users LIMIT 5;"
npm run psql:test "SELECT * FROM users LIMIT 5;"

# Database operations
npm run db:start     # Start containers
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
npm run db:migrate   # Run migrations
```

**Connections:**

- Dev: `postgres://root:mysecretpassword@localhost:5432/local`
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

```bash
npm run dev    # Start dev server (port 5173)
npm run build  # Build for production
```

## Environment Variables

- `DATABASE_URL` - Dev database (auto-configured)
- `TEST_DATABASE_URL` - Test database (auto-configured)

## Port Forwarding

- 5173: SvelteKit dev server
- 5432: PostgreSQL dev database
- 5433: PostgreSQL test database
- 5555: Drizzle Studio

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

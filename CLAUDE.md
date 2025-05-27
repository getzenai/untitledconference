# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run linter and format check
- `npm run format` - Format code with Prettier
- `npm run check` - Type check with svelte-check

### Testing

- `npm run test:unit` - Run unit tests with Vitest (src/ directory only)
- `npm run test:e2e` - Run Playwright E2E tests
- `npm run test:e2e:ui-mode` - Run E2E tests with Playwright UI
- `npm run test` - Run both unit and E2E tests

### Database Operations

- `npm run db:start` - Start PostgreSQL container with Docker Compose
- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Create and apply migrations (production)
- `npm run db:studio` - Open Drizzle Studio database management UI

## Architecture Overview

### Authentication System

This project uses **Better Auth** (migrated from Lucia) with email/password authentication:

- Configuration: `src/lib/auth.ts`
- Database adapter: Drizzle with PostgreSQL
- Protected routes: Use `(protected)` route group with server-side session validation
- API protection: Automatic middleware in `hooks.server.ts` protects `/api/v1/*` routes (except `/api/v1/public/*`)

### Database Schema

- **ORM**: Drizzle with PostgreSQL
- **Schema**: `src/lib/server/db/auth-schema.ts` defines user, session, account, and verification tables
- **Config**: `drizzle.config.ts` points to auth schema
- **Migration**: Use `npm run db:migrate` for production, `npm run db:push` for development

### Route Structure

- `(protected)/` - Authenticated routes with automatic session validation
- `(public)/` - Public routes (login, register, demo pages)
- `api/v1/public/` - Public API endpoints
- `api/v1/protected/` - Protected API endpoints (require authentication)
- `api/v1/test/` - Test-only endpoints (available only in test environment)

### Internationalization

- **Framework**: Paraglide SvelteKit
- **Messages**: Edit `messages/en.json` and other language files
- **Handler**: Configured in `hooks.server.ts` sequence

### UI Components

- **Framework**: shadcn/ui components adapted for Svelte
- **Styling**: Tailwind CSS with custom component variants
- **Location**: `src/lib/components/ui/`
- **Forms**: Uses Formsnap with Zod validation via Superforms

### Handler Sequence

The `hooks.server.ts` runs handlers in this order:

1. Better Auth handler (authentication)
2. API protection middleware (validates sessions for protected routes)
3. Paraglide handler (internationalization)

### Environment Requirements

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Secret for Better Auth
- `BETTER_AUTH_URL` - Base URL for Better Auth (origin)

## Development Workflow

### Feature Development Process

1. Create feature branch: `git checkout main && git pull && git checkout -b feature/my-feature`
2. Implement feature using test-driven approach with E2E tests
3. Run post-iteration checklist before PR:
   - `npm run build` (must complete without errors)
   - `npm run test:unit` and `npm run test:e2e` (all tests must pass)
   - `npm run lint:format` (fix any linting errors)
4. Create PR using GitHub MCP server (preferred) or fallback to GitHub CLI: `gh pr create --title "..." --body "..."`
5. Merge with squash using GitHub MCP server (preferred) or fallback to CLI: `gh pr merge --squash --delete-branch`

### Code Quality Standards

- **Authentication**: Always use server-side checks in `+page.server.ts`/`+layout.server.ts` - never rely on client-side authentication for security
- **Redirects**: Use `throw redirect(303, '/target-url')` for authentication-based navigation
- **API Security**: Use `auth.api.getSession({ headers: requestHeaders })` to verify sessions
- **HTML Sanitization**: Use `DOMPurify.sanitize()` before `{@html}` rendering
- **Error Handling**: Implement consistent error handling for all API calls

### Testing Strategy

- **Primary**: E2E tests with Playwright (`npm run test:e2e`)
- **Secondary**: Unit tests with Vitest for core logic (`npm run test:unit`)
- **Focus**: Test user-visible behavior, not implementation details
- **Isolation**: Each test should be completely independent
- **Locators**: Prefer user-facing attributes over CSS selectors

## Database Setup

1. Start database: `npm run db:start`
2. Push schema: `npm run db:push`
3. For production migrations: `npm run db:migrate`

The Docker Compose setup provides a PostgreSQL instance configured for development.

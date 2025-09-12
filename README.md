# SvelteKit Vibe Starter

A production-ready SvelteKit starter template with PostgreSQL, authentication, and comprehensive testing.

## Quick Start

```bash
# Install dependencies
npm install

# Start database
npm run db:start

# Initialize database schema
npm run db:push

# Start development server
npm run dev
```

Visit http://localhost:5173

## Features

- **SvelteKit** - Full-stack framework with SSR
- **PostgreSQL** - Database with Drizzle ORM
- **Better Auth** - Authentication with organizations
- **Shadcn/ui** - Pre-configured UI components
- **Testing** - Unit, integration, and E2E tests
- **Docker** - Development containers
- **TypeScript** - Full type safety

## Database

PostgreSQL runs in Docker containers for development and testing:

```bash
npm run db:start    # Start containers
npm run db:push     # Push schema changes
npm run db:migrate  # Run migrations
npm run db:studio   # Open Drizzle Studio
```

**Note:** Set DATABASE_URL in production environment.

## Testing

Comprehensive test suite with Page Object Model:

```bash
npm run test           # Run all tests
npm run test:e2e       # E2E tests only
npm run lint           # Code quality check
npm run format         # Format code
```

For E2E test development, see `/e2e/CLAUDE.md`.

## Authentication

Uses [Better Auth](https://www.better-auth.com) with organization support. Features include:

- User registration and login
- Organization management
- Role-based access control
- Admin dashboard

## UI Components

Pre-installed [shadcn/ui](https://ui.shadcn.com) components in `src/lib/components/ui/`. Includes buttons, forms, dialogs, tables, and more.

## Internationalization

Powered by Paraglide. Edit translations in `messages/en.json`.

## Documentation

VitePress documentation site:

```bash
npm run docs:dev   # Start docs server
```

## Building

```bash
npm run build    # Production build
npm run preview  # Preview production build
```

## AI Agent Instructions

For Claude Code and other AI agents, see `/CLAUDE.md` for detailed codebase instructions and conventions.

## Deployment

Configure an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

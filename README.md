# SvelteKit Vibe Starter

A production-ready SvelteKit starter template with PostgreSQL, authentication, and comprehensive testing.

## Quick Start

### Prerequisites

- Node.js 22+
- Azure CLI (`az login` required for Key Vault secrets)
- Docker (only for Local Docker mode)

### Azure DB Mode (recommended)

```bash
npm install
npm run dev          # fetches secrets from KV, starts dev server
```

### Local Docker Mode

```bash
npm install
docker compose up -d           # start dev-db + test-db
cp .env.example .env           # uncomment DATABASE_URL and TEST_DATABASE_URL
npm run dev                    # .env DB URLs used, rest from KV
```

Visit http://localhost:5173

## Features

- **SvelteKit** - Full-stack framework with SSR
- **PostgreSQL** - Database with Drizzle ORM
- **Better Auth** - Authentication with organizations
- **Shadcn/ui** - Pre-configured UI components
- **Testing** - Unit, integration, and E2E tests
- **Azure Key Vault** - All secrets managed securely
- **TypeScript** - Full type safety

## Database

```bash
npm run db:push          # Push schema to dev database
npm run db:push:test     # Push schema to test database
npm run db:studio        # Open Drizzle Studio
```

All database commands automatically get credentials from Key Vault (or .env for DB URLs).

## Testing

```bash
npm run test           # Run all tests
npm run test:e2e       # E2E tests only
npm run lint           # Code quality check
npm run format         # Format code
```

For E2E test development, see `/e2e/CLAUDE.md`.

## Authentication

Uses [Better Auth](https://www.better-auth.com) with organization support.

## UI Components

Pre-installed [shadcn/ui](https://ui.shadcn.com) components in `src/lib/components/ui/`.

## Internationalization

Powered by Paraglide. Edit translations in `messages/en.json`.

## Documentation

VitePress documentation site:

```bash
npm run docs:dev   # Start docs server
```

## Building

```bash
npm run build    # Production build (no secrets needed — lazy Proxy pattern)
npm run preview  # Preview production build
```

## AI Agent Instructions

For Claude Code and other AI agents, see `/CLAUDE.md` for detailed codebase instructions and conventions.

## Deployment

See `scripts/azure-managed-setup/` for Azure Container Apps deployment.

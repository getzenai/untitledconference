# Claude Code Instructions for SvelteKit Vibe Starter

## Project Overview

This is a SvelteKit starter project with PostgreSQL database, Drizzle ORM, Better Auth, and comprehensive development tooling. The project includes both development and test databases running in Docker containers.

## Database Access

### PostgreSQL CLI Tooling Available

The development container includes PostgreSQL CLI tools (`psql`) for database interaction. Use the safe npm scripts provided:

#### Development Database

```bash
# Execute queries against the development database
npm run psql:dev "SELECT * FROM users LIMIT 5;"
npm run psql:dev "SELECT description FROM reference_project_image WHERE id = 12 LIMIT 1;"

# Or use the full command format for Claude Code
Bash(npm run psql:dev "SELECT * FROM users LIMIT 5;" | head -30)
```

#### Test Database

```bash
# Execute queries against the test database
npm run psql:test "SELECT * FROM users LIMIT 5;"

# Or use the full command format for Claude Code
Bash(npm run psql:test "SELECT * FROM users LIMIT 5;" | head -30)
```

### Database Connection Details

**Development Database:**

- Internal (container): `postgres://root:mysecretpassword@project-db:5432/local`
- External (host): `postgres://root:mysecretpassword@localhost:5432/local`

**Test Database:**

- Internal (container): `postgres://root:mysecretpassword@test-db:5432/test`
- External (host): `postgres://root:mysecretpassword@localhost:5433/test`

### Safety Features

The `npm run psql:dev` and `npm run psql:test` commands include safety checks that only allow connections to:

- `localhost`
- `127.0.0.1`
- `project-db` (dev container service)
- `test-db` (dev container service)

This prevents accidental connections to production or other remote databases.

## Development Commands

### Database Operations

```bash
npm run db:start          # Start PostgreSQL containers
npm run db:push           # Push schema changes to dev database
npm run db:studio         # Open Drizzle Studio
npm run db:migrate        # Run pending migrations

# Safe database querying (Claude Code approved)
npm run psql:dev "QUERY"  # Query development database
npm run psql:test "QUERY" # Query test database
```

### Testing & Quality

```bash
npm run test              # Run all tests (unit + e2e)
npm run test:e2e          # Run E2E tests only
npm run test:e2e -- --grep "testname"  # Run specific test by name
npm run lint              # Check code quality
npm run format            # Format code
```

#### Test Debugging Guidelines

When tests are failing:

1. **Debug with additional code**: Add console.log statements, debug logs, or specific experiments in the test execution to understand what's happening
2. **Run specific tests**: Use `npm run test:e2e -- --grep "testname"` to iterate on specific failing tests rather than running the entire suite
3. **Task tracking for failing tests**: When fixing failing tests, create a separate todo task for each failing test. Mark the task as completed only when:
   - The test is passing, OR
   - You've attempted at least 10 debugging iterations and cannot find a solution
4. **Systematic debugging approach**:
   - First, understand what the test is trying to achieve
   - Add logging to see actual vs expected behavior
   - Check if the issue is with the test setup, the application code, or test assertions
   - Review any recent changes that might have affected the test

### Development

```bash
npm run dev               # Start development server (port 5173)
npm run build             # Build for production
```

## Database Schema

The project uses Drizzle ORM. Schema files are located in:

- `src/lib/server/db/` - Main database schemas
- `drizzle/` - Migration files

## Environment Variables

The project automatically configures database URLs in development:

- `DATABASE_URL` - Points to development database
- `TEST_DATABASE_URL` - Points to test database

## Claude Code Permissions

Claude Code can safely use these database commands:

- `Bash(npm run psql:dev "SELECT ..." | head -30)`
- `Bash(npm run psql:test "SELECT ..." | head -30)`
- All other standard npm scripts for development

## Port Forwarding

- **5173**: SvelteKit dev server
- **5432**: PostgreSQL development database
- **5433**: PostgreSQL test database
- **5555**: Drizzle Studio (when running)

## Development Container

This project includes a complete dev container setup with:

- Node.js 20
- PostgreSQL client tools
- All project dependencies pre-installed
- Automatic database setup
- Claude Code CLI pre-installed

## Security Notes

- Development databases use default credentials for convenience
- Production deployments should use secure connection strings
- The psql npm scripts include safety checks to prevent connections to remote databases
- Claude Code permissions are restricted to localhost database access only
- documentation regarding the better auth organisation plugin can be read here: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/organization.mdx
- Docs for the better auth admin plugin can be read here: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/admin.mdx

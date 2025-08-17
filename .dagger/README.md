# Dagger CI Pipeline

This directory contains a [Dagger](https://dagger.io) CI/CD pipeline that provides containerized, reproducible builds and tests for the SvelteKit Vibe Starter project.

## Overview

The Dagger pipeline mirrors the existing GitHub Actions workflow, providing:

- **Format checking** with Prettier
- **Unit tests** execution
- **Application build** verification
- **End-to-end tests** with PostgreSQL database
- **Complete CI pipeline** with all steps combined

## Prerequisites

1. **Dagger CLI**: Install from [dagger.io](https://docs.dagger.io/install)
2. **Docker**: Required for container execution
3. **Node.js dependencies**: The pipeline handles npm installation automatically

## Pipeline Functions

### Individual Steps

```bash
# Check code formatting
dagger call format-check --source .

# Run unit tests
dagger call test --source .

# Build the application
dagger call build --source .

# Run E2E tests (includes PostgreSQL setup)
dagger call e2e --source .

# Create PostgreSQL service with migrations
dagger call postgres-with-migrations --source . --db-name "test"
```

### Environment Setup

```bash
# Create base Node.js environment with dependencies
dagger call build-env --source .

# Create test environment with Playwright browsers
dagger call build-test-env --source .

# Build application container
dagger call build-app --source .
```

### Complete CI Pipeline

```bash
# Run the entire CI pipeline (recommended)
dagger call ci --source .
```

This will execute all steps in sequence:

1. Format check
2. Unit tests
3. Application build
4. End-to-end tests with PostgreSQL

## Pipeline Architecture

### Container Optimization

- **Smart Caching**: Uses Dagger cache volumes for npm packages and Playwright browsers
- **Container Reuse**: Base containers are built once and reused across pipeline steps
- **Efficient Builds**: The `ci` function reuses built containers to avoid redundant work

### Database Integration

- **PostgreSQL Service**: Automatically starts PostgreSQL 15 container
- **Schema Migrations**: Runs Drizzle migrations using `npx drizzle-kit push --force`
- **Isolated Testing**: Each test run gets a fresh database instance

### Environment Variables

The pipeline uses these environment variables for E2E tests:

```
DATABASE_URL=postgres://root:mysecretpassword@postgres:5432/test
BETTER_AUTH_SECRET=test-secret-for-github-actions
BETTER_AUTH_URL=http://localhost:5174
CI=true
```

> **Note**: Hardcoded credentials are safe here as they only exist within the isolated Dagger pipeline containers.

## Development Workflow

### Local Development

```bash
# Quick format check before committing
dagger call format-check --source .

# Run tests during development
dagger call test --source .

# Full pipeline before pushing
dagger call ci --source .
```

### Debugging

```bash
# Get detailed output from individual steps
dagger call test --source . 2>&1 | tee test-output.log

# Interactive debugging (run commands in container)
dagger call build-env --source . terminal
```

### Performance Tips

- The `ci` function is optimized for performance - use it instead of running individual steps
- Cache volumes persist between runs - first run may be slower as caches populate
- Container builds are cached - only changed layers rebuild

## Comparison with GitHub Actions

| Feature             | GitHub Actions     | Dagger Pipeline        |
| ------------------- | ------------------ | ---------------------- |
| **Environment**     | GitHub runners     | Local containers       |
| **Caching**         | GitHub cache API   | Dagger cache volumes   |
| **Database**        | Docker service     | PostgreSQL container   |
| **Reproducibility** | Platform dependent | Fully containerized    |
| **Local Testing**   | Limited            | Full pipeline locally  |
| **Debugging**       | Log access only    | Interactive containers |

## Configuration

### Go Module

The pipeline is implemented in Go with these key dependencies:

- `dagger.io/dagger` - Dagger SDK
- Go version: 1.24.4

### Node.js Environment

- **Base Image**: `node:22-slim`
- **Package Manager**: npm with `npm ci` for reproducible installs
- **Test Browser**: Playwright with Chromium

### PostgreSQL Setup

- **Image**: `postgres:latest`
- **Database**: Isolated test database per run
- **Migrations**: Automated via Drizzle Kit
- **Connection**: Internal container networking

## Troubleshooting

### Common Issues

**"Failed to apply migrations"**

```bash
# Check if source directory contains drizzle config
ls -la drizzle.config.ts

# Verify database can start
dagger call postgres-with-migrations --source . --db-name "debug"
```

**"Playwright browsers not found"**

```bash
# Ensure test environment builds properly
dagger call build-test-env --source .
```

**"Format check failed"**

```bash
# Run formatter locally first
npm run format

# Then test the pipeline
dagger call format-check --source .
```

### Performance Issues

If builds are slow:

1. Check Docker has sufficient resources allocated
2. Ensure cache volumes are being used (first run populates caches)
3. Use `dagger call ci --source .` instead of individual steps

### Getting Help

For Dagger-specific issues:

- [Dagger Documentation](https://docs.dagger.io)
- [Dagger Community Discord](https://discord.gg/dagger-io)

For pipeline-specific issues:

- Check the GitHub Actions workflow in `.github/workflows/` for reference
- Compare environment variables and setup steps

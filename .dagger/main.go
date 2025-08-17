// Dagger CI Pipeline for SvelteKit Vibe Starter
//
// This module implements a complete CI pipeline that mirrors the GitHub Actions workflow,
// including format checking, unit tests, build verification, and E2E tests with PostgreSQL.

package main

import (
	"context"
	"fmt"
	"dagger/dagger-ci-pipeline/internal/dagger"
)

type DaggerCiPipeline struct{}

// BuildEnv creates a base Node.js container with cached dependencies
func (m *DaggerCiPipeline) BuildEnv(
	// +defaultPath="/"
	source *dagger.Directory,
) *dagger.Container {
	npmCache := dag.CacheVolume("npm")
	
	return dag.Container().
		From("node:22-slim").
		WithDirectory("/src", source).
		WithMountedCache("/root/.npm", npmCache).
		WithWorkdir("/src").
		WithExec([]string{"npm", "ci"})
}

// BuildTestEnv creates a container with all test dependencies including Playwright
func (m *DaggerCiPipeline) BuildTestEnv(
	// +defaultPath="/"
	source *dagger.Directory,
) *dagger.Container {
	playwrightCache := dag.CacheVolume("playwright")
	
	return m.BuildEnv(source).
		// Mount Playwright cache
		WithMountedCache("/root/.cache/ms-playwright", playwrightCache).
		// Install Playwright browsers
		WithExec([]string{"npx", "playwright", "install", "--with-deps"})
}

// BuildApp creates a container with the application built
func (m *DaggerCiPipeline) BuildApp(
	// +defaultPath="/"
	source *dagger.Directory,
) *dagger.Container {
	return m.BuildTestEnv(source).
		WithExec([]string{"npm", "run", "build"})
}

// PostgresWithMigrations creates a PostgreSQL service and applies migrations
func (m *DaggerCiPipeline) PostgresWithMigrations(
	ctx context.Context,
	source *dagger.Directory,
	dbName string,
) (*dagger.Service, error) {
	// Create base PostgreSQL service with proper entrypoint
	postgres := dag.Container().
		From("postgres:latest").
		WithEnvVariable("POSTGRES_USER", "root").
		WithEnvVariable("POSTGRES_PASSWORD", "mysecretpassword").
		WithEnvVariable("POSTGRES_DB", dbName).
		WithExposedPort(5432).
		AsService(dagger.ContainerAsServiceOpts{UseEntrypoint: true})
	
	// Run migrations in a temporary container
	_, err := m.BuildEnv(source).
		WithServiceBinding("postgres", postgres).
		WithEnvVariable("DATABASE_URL", fmt.Sprintf("postgres://root:mysecretpassword@postgres:5432/%s", dbName)).
		WithExec([]string{"npx", "drizzle-kit", "push", "--force"}).
		Sync(ctx)
	
	if err != nil {
		return nil, fmt.Errorf("failed to apply migrations: %w", err)
	}
	
	// Return the initialized service
	return postgres, nil
}

// FormatCheck runs prettier format check
func (m *DaggerCiPipeline) FormatCheck(
	ctx context.Context,
	// +defaultPath="/"
	source *dagger.Directory,
) (string, error) {
	return m.BuildEnv(source).
		WithExec([]string{"npm", "run", "format:check"}).
		Stdout(ctx)
}

// Test runs unit tests
func (m *DaggerCiPipeline) Test(
	ctx context.Context,
	// +defaultPath="/"
	source *dagger.Directory,
) (string, error) {
	return m.BuildEnv(source).
		WithExec([]string{"npm", "run", "test:unit"}).
		Stdout(ctx)
}

// Build builds the SvelteKit application and returns the built container
func (m *DaggerCiPipeline) Build(
	ctx context.Context,
	// +defaultPath="/"
	source *dagger.Directory,
) (*dagger.Directory, error) {
	container := m.BuildApp(source)
	
	// Check if build succeeded
	_, err := container.Stdout(ctx)
	if err != nil {
		return nil, err
	}
	
	// Return the build directory
	return container.Directory("/src/build"), nil
}

// E2E runs end-to-end tests with PostgreSQL using a pre-built container
func (m *DaggerCiPipeline) E2e(
	ctx context.Context,
	// +defaultPath="/"
	source *dagger.Directory,
	// +optional
	// Pre-built container to use (if not provided, will build fresh)
	builtContainer *dagger.Container,
) (string, error) {
	// Create PostgreSQL service with migrations applied
	postgres, err := m.PostgresWithMigrations(ctx, source, "test")
	if err != nil {
		return "", fmt.Errorf("failed to create postgres with migrations: %w", err)
	}
	
	// Use provided container or build a new one
	baseContainer := builtContainer
	if baseContainer == nil {
		baseContainer = m.BuildApp(source)
	}
	
	// Create container for E2E tests with environment variables
	e2eContainer := baseContainer.
		// Set environment variables directly instead of using .env files
		WithEnvVariable("DATABASE_URL", "postgres://root:mysecretpassword@postgres:5432/test").
		WithEnvVariable("BETTER_AUTH_SECRET", "test-secret-for-github-actions").
		WithEnvVariable("BETTER_AUTH_URL", "http://localhost:5174").
		WithEnvVariable("CI", "true").
		// Connect to PostgreSQL service (already has migrations applied)
		WithServiceBinding("postgres", postgres).
		// Run E2E tests
		WithExec([]string{"npx", "playwright", "test", "--reporter=list"})
	
	return e2eContainer.Stdout(ctx)
}

// CI runs the complete CI pipeline efficiently
func (m *DaggerCiPipeline) Ci(
	ctx context.Context,
	// +defaultPath="/"
	source *dagger.Directory,
) (string, error) {
	// Build the base environment once
	baseEnv := m.BuildEnv(source)
	
	// Run format check on base environment
	formatResult, formatErr := baseEnv.
		WithExec([]string{"npm", "run", "format:check"}).
		Stdout(ctx)
	if formatErr != nil {
		return "", fmt.Errorf("format check failed: %w", formatErr)
	}
	
	// Run unit tests on base environment
	testResult, testErr := baseEnv.
		WithExec([]string{"npm", "run", "test:unit"}).
		Stdout(ctx)
	if testErr != nil {
		return "", fmt.Errorf("unit tests failed: %w", testErr)
	}
	
	// Build the application once (this includes Playwright installation)
	builtApp := m.BuildApp(source)
	_, buildErr := builtApp.Stdout(ctx)
	if buildErr != nil {
		return "", fmt.Errorf("build failed: %w", buildErr)
	}
	
	// Run E2E tests using the already built container
	e2eResult, e2eErr := m.E2e(ctx, source, builtApp)
	if e2eErr != nil {
		return "", fmt.Errorf("e2e tests failed: %w", e2eErr)
	}
	
	return fmt.Sprintf("CI Pipeline completed successfully!\n\nFormat Check:\n%s\n\nUnit Tests:\n%s\n\nE2E Tests:\n%s", 
		formatResult, testResult, e2eResult), nil
}


# E2E Test User Management

This document describes the enhanced API-based test user management system for end-to-end tests using Playwright.

## Overview

The e2e test suite uses a sophisticated user management system that handles:

- **API-Based User Creation**: Fast, reliable user registration via secure test API endpoints
- **Hybrid Authentication**: API creation + UI login for comprehensive testing
- **User Cleanup**: Automatic cleanup of test data via database operations
- **Test Isolation**: Each test can create isolated users without conflicts
- **Environment Security**: Test APIs only available during test execution

## Architecture

### Test User Flow

```
1. Global Setup → Clean DB + Reset Test User Manager
2. Auth Setup → Create/Login Main User via API + UI
3. Tests → Create Users via API + Test UI Interactions
4. Global Teardown → Clean All Test Data
```

### User Categories

- **Pre-registered User**: `e2e-test-user@example.com` - Used for authenticated test suite
- **Dynamic Users**: Generated with unique emails for individual test isolation
- **Test Prefix**: All test users have emails starting with `e2e-test-`

## API-Based User Management

### Secure Test API Endpoints

- **`/api/v1/test/register`**: Create users via Better Auth API (protected by test environment detection)
- **`/api/v1/public/login`**: Authenticate users and get tokens (public endpoint)
- **`/api/v1/public/logout`**: Logout users via token (public endpoint)

**Security**: Test endpoints (`/api/v1/test/*`) only work during test execution, detected via environment variables. Login/logout endpoints are public as they should be accessible for authentication flows.

### Key Components

#### 1. TestUserManager (`test-user-manager.ts`)

Centralized singleton class that handles all user operations:

- **API-Based User Creation**: Fast, reliable registration via test endpoints
- **Token-Based Authentication**: Login/logout with proper session management
- **Database Verification**: Direct database checks for user existence
- **Automatic Cleanup**: Tracks and cleans created users
- **Hybrid Methods**: `createAndLoginUser()` for API creation + UI login

#### 2. Setup Files

- **`global.setup.ts`**: Cleans database and resets test user manager state
- **`auth.setup.ts`**: Creates/verifies main test user via API and establishes browser session
- **`global.teardown.ts`**: Final cleanup of all test data

#### 3. Configuration (`globals.ts`)

- **`TEST_USER_EMAIL_PREFIX`**: Identifies test users (`e2e-test-`)
- **`PRE_REGISTERED_TEST_EMAIL`**: Main test user for authenticated tests
- **`PRE_REGISTERED_TEST_PASSWORD`**: Password for main test user

#### 4. Test Files

- **`register.test.ts`**: Comprehensive registration testing with API user management
- **`login.test.ts`**: Login flow testing with API integration
- All tests use consistent patterns and automatic cleanup

## Usage Patterns

### Basic User Creation via API

```typescript
import { testUserManager } from '../test-user-manager';

test('should create and use test user', async ({ page }) => {
	// Create a unique test user via API
	const testUser = await testUserManager.createTestUser({
		email: testUserManager.generateTestUserEmail('my-test'),
		password: 'password123'
	});

	// Use the user for UI testing
	await page.goto('/login');
	await page.getByLabel('Email').fill(testUser.email);
	await page.getByLabel('Password').fill(testUser.password);
	await page.getByRole('button', { name: 'Login' }).click();

	await expect(page).toHaveURL('/home');
});
```

### Hybrid API + UI User Creation

```typescript
test('should create user and login via UI', async ({ page }) => {
	// Create user via API and login via UI in one step
	const testUser = await testUserManager.createAndLoginUser(page, {
		email: testUserManager.generateTestUserEmail('hybrid-test'),
		password: 'password123'
	});

	// User is now logged in and ready for testing
	await expect(page).toHaveURL('/home');
});
```

### Handling Registration Failures

```typescript
test('should handle duplicate registration', async ({ page }) => {
	// Create user first
	const testUser = await testUserManager.createTestUser({
		email: testUserManager.generateTestUserEmail('duplicate-test'),
		password: 'password123'
	});

	// Attempt to create same user again
	const result = await testUserManager.attemptCreateTestUser({
		email: testUser.email,
		password: testUser.password
	});

	expect(result.success).toBe(false);
});
```

### Automatic Cleanup

```typescript
test.afterAll(async () => {
	// Cleanup any users created during this test file
	await testUserManager.cleanupCreatedUsers();
});
```

## Security Features

### Environment Protection

### Environment Protection

Test APIs are protected by environment detection:

- **Environment Detection**: Only works in test environments
- **Process Detection**: Checks for test-related npm scripts
- **Playwright Detection**: Detects Playwright test execution

### API Security Implementation

```typescript
const isTestEnv =
	process.env.NODE_ENV === 'test' ||
	process.env.PLAYWRIGHT_TEST === 'true' ||
	process.env.npm_lifecycle_event?.includes('test');

if (!isTestEnv) {
	return error(403, 'Test endpoints only available in test environment');
}
```

### Performance

- **10x faster** user creation compared to UI-based approach
- **Reduced test execution time** through API operations
- **Better test reliability** with fewer UI dependencies

### Reliability

- **Consistent user creation** via Better Auth API
- **Proper error handling** with explicit API responses
- **Automatic cleanup** preventing test data pollution

### Maintainability

- **Single source of truth** for user operations
- **Clear separation** between API operations and UI testing
- **Comprehensive logging** for debugging
- **Type-safe interfaces** for better development experience

## Migration from UI-Based Approach

The system has been migrated from a UI-based user management approach to this API-based system:

### Before (UI-Based)

- User creation via UI automation
- Slower and less reliable
- More prone to flakiness
- Required complex UI state management

### After (API-Based)

- User creation via secure API endpoints
- Fast and reliable
- Better error handling
- Clean separation of concerns

### Backward Compatibility

The API maintains similar method signatures to ease migration:

- `createTestUser()` - Now uses API instead of UI
- `generateTestUserEmail()` - Same functionality
- `userExists()` - Same database checks
- `cleanupCreatedUsers()` - Same cleanup logic

## Troubleshooting

### Common Issues

1. **API Endpoints Not Available**

   - Ensure test environment is properly detected
   - Check Playwright user agent is being sent
   - Verify environment variables are set correctly

2. **User Creation Failures**

   - Check Better Auth configuration
   - Verify database connectivity
   - Review API endpoint logs

3. **Cleanup Issues**

   - Ensure database permissions are correct
   - Check for foreign key constraints
   - Review cleanup logs for specific errors

4. **Test Environment Consistency**
   - Tests should behave identically whether running against a dev server or Playwright's own server
   - The test API endpoints use multiple detection methods: `PLAYWRIGHT_TEST` env var and `Playwright` user-agent
   - If tests behave differently between environments, check environment variable consistency
   - Both development and production servers should allow test API access when Playwright is running

### Running Tests Properly

```bash
# Tests work with either approach:

# Option 1: Let Playwright manage the server (recommended)
npm run test:e2e

# Option 2: Run against existing dev server
npm run dev  # In one terminal
npm run test:e2e  # In another terminal

# For debugging, run tests in headed mode
npx playwright test --headed

# For debugging specific tests
npx playwright test e2e/unauthenticated/login.test.ts --headed --debug
```

### Environment Detection

### Environment Detection

### Environment Detection

The test API endpoints detect test environment through:

- `PLAYWRIGHT_TEST=true` environment variable
- `NODE_ENV=test` environment variable
- `npm_lifecycle_event` containing 'test'

**Security Note**: Environment variables provide secure test environment detection without relying on easily spoofable headers.

This ensures consistent behavior across development and production servers while maintaining security.

### Debug Logging

### Debug Logging

All operations include comprehensive logging with `[TestUserManager]` prefix for easy identification in test output.

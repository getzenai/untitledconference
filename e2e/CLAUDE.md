# E2E Testing Guide

## Page Object Model Structure

```
e2e/
├── pages/          # Page objects with locators
├── actions/        # High-level workflows
├── fixtures/       # Custom test fixtures
├── critical-paths/ # Test suites
└── test-user-manager.ts
```

## Writing New Tests

### 1. Create Page Object

```typescript
// pages/example.page.ts
export class ExamplePage extends BasePage {
	readonly path = '/example';

	private readonly submitBtn = this.page.getByRole('button', { name: 'Submit' });
	private readonly nameInput = this.page.getByLabel('Name');

	async fillForm(name: string) {
		await this.nameInput.fill(name);
		await this.submitBtn.click();
	}
}
```

### 2. Create Action Helper

```typescript
// actions/example.actions.ts
export class ExampleActions {
	async completeFlow(page: Page, data: Data) {
		const examplePage = new ExamplePage(page);
		await examplePage.goto();
		await examplePage.fillForm(data.name);
		await examplePage.waitForSuccess();
	}
}
```

### 3. Write Test

```typescript
// critical-paths/example.test.ts
import { test, expect } from '../fixtures/test';

test('should complete example flow', async ({ page, loginPage }) => {
	await loginPage.login(testUser.email, testUser.password);
	const actions = new ExampleActions();
	await actions.completeFlow(page, { name: 'Test' });
	await expect(page).toHaveURL('/success');
});
```

## Key Patterns

### Authentication

```typescript
// Use fixture for pre-authenticated tests
test('authenticated test', async ({ authenticatedPage }) => {
	// Already logged in
	await authenticatedPage.goto('/protected');
});
```

### Test User Management

```typescript
const user = await testUserManager.createTestUser({
	email: testUserManager.generateTestUserEmail('test'),
	password: 'password123'
});
```

### Retry Mechanisms

Built into BasePage - all clicks/fills auto-retry 3 times.

### Assertions

```typescript
// Wait for specific conditions
await expect(page.locator('[data-testid="result"]')).toBeVisible();
await expect(page).toHaveURL('/expected');
```

## Debugging Failed Tests

### 1. Check Error Reports

```bash
cat ./test-report-for-coding-agents/all-failures.md
```

### 2. Run Specific Test

```bash
npm run test:e2e -- --grep "exact test name"
```

### 3. Add Debug Logging

```typescript
console.log('Current URL:', page.url());
const html = await page.locator('body').innerHTML();
console.log('Page HTML:', html.substring(0, 500));
```

### 4. Common Issues

**Organization Role Mismatch**

- Creator should be 'owner' not 'admin' in Better Auth

**Missing Active Organization**

```typescript
await auth.api.setActiveOrganization({
	headers: await auth.sessionHeaders(sessionToken),
	body: { organizationId }
});
```

**Unique Constraint Violations**

- Add timestamps to make slugs unique

**Form Validation Conflicts**

- Remove HTML5 'required' that conflicts with JS validation

**Selector Ambiguity**

- Use `{ exact: true }` for specific matches

## Timeout Configuration

Global timeouts in `playwright.config.ts`:

- Actions: 1000ms
- Assertions: 1000ms
- Navigation: 5000ms
- Test: 30000ms

**Never add custom timeouts** except:

- `waitForLoadState('networkidle', { timeout: 5000 })`
- `waitForURL(..., { timeout: 5000 })`
- `waitForResponse(..., { timeout: 5000 })`

## Best Practices

1. **Deterministic tests** - Tests must follow one strict "story" with no if/else blocks or different paths based on state
2. **No manual waits** - Playwright has exceptional waiting capabilities, never add extra waits
3. **Debug timeouts, don't extend** - Timeouts are deliberately short (sub-second). If something times out, the locator is wrong - debug what's actually on the page instead of adding waits or increasing timeouts
4. **Use data-testid** - For reliable locators
5. **Test isolation** - Each test independent
6. **Hypothesis-driven debugging** - Test theories systematically
7. **Check screenshots** - In test-report directories
8. **One task per test** - Track with TodoWrite tool

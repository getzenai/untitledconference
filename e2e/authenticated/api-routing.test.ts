import { expect, test } from '@playwright/test';
// import { login } from '../db'; // Helper to simulate login - Not needed due to global auth setup

const publicApiRoute = '/api/v1/public/health';
const protectedApiRoute = '/api/v1/protected-test';

test.describe.skip('API Route Protection via hooks.server.ts', () => {
	// TODO: Unskip these tests after refactoring E2E setup or resolving SvelteKit dev server/Playwright hook interaction
	test('unauthenticated: can access public API route', async ({ page }) => {
		const response = await page.request.get(publicApiRoute);
		expect(response.ok()).toBeTruthy();
		const jsonResponse = await response.json();
		expect(jsonResponse.status).toBe('ok');
	});

	test('unauthenticated: cannot access protected API route', async ({ page }) => {
		const response = await page.request.get(protectedApiRoute);
		expect(response.status()).toBe(401);
		const jsonResponse = await response.json();
		expect(jsonResponse.message).toBe('Unauthorized. Please login.');
	});

	test.describe('authenticated', () => {
		test('authenticated: can access public API route', async ({ page }) => {
			const response = await page.request.get(publicApiRoute);
			expect(response.ok()).toBeTruthy();
			const jsonResponse = await response.json();
			expect(jsonResponse.status).toBe('ok');
		});

		test('authenticated: can access protected API route', async ({ page }) => {
			const response = await page.request.get(protectedApiRoute);
			expect(response.ok()).toBeTruthy();
			const jsonResponse = await response.json();
			expect(jsonResponse.message).toBe('You have accessed a protected route!');
			expect(jsonResponse.user).toBeDefined();
			// Add more specific checks for user properties if needed
			// e.g., expect(jsonResponse.user.email).toBe('test@example.com');
		});
	});
});

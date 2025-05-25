import { expect, test } from '@playwright/test';

const publicApiRoute = '/api/v1/public/health';
const protectedApiRoute = '/api/v1/protected';

test.describe('API Route Protection via hooks.server.ts', () => {
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
		});
	});
});

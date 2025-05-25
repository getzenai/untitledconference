import { expect, test } from '@playwright/test';

const publicApiRoute = '/api/v1/public/health';
const protectedApiRoute = '/api/v1/protected';

test.describe('Unauthenticated API Route Access', () => {
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
});

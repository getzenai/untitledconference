import { eq } from 'drizzle-orm';
import { ACCESSIBILITY_ANALYSIS_PROMPT } from '../../../../src/lib/server/accessibility-agent/config';
import * as schema from '../../../../src/lib/server/db/schema';
import { expect, test } from '../../../fixtures/user.fixture';
import { db } from '../../../helpers/db-client';

const defaultPromptContent = ACCESSIBILITY_ANALYSIS_PROMPT;

test.describe('Settings Page - Prompt Editing UI', () => {
	let pageError: unknown = null;

	test.beforeEach(async ({ page }) => {
		pageError = null;

		page.on('pageerror', (error) => {
			console.error(`Uncaught exception:`, error);
			pageError = error;
		});

		try {
			await page.goto('/settings/prompt', { waitUntil: 'domcontentloaded', timeout: 15000 });
		} catch (gotoError) {
			console.error('page.goto() failed:', gotoError);
			throw gotoError;
		}

		await page.waitForTimeout(100);
		if (pageError) {
			const errorMessage = pageError instanceof Error ? pageError.message : String(pageError);
			throw new Error(`Page load failed with error after navigation: ${errorMessage}`);
		}

		await expect(page.locator('h1')).toHaveText('Prompt Settings', { timeout: 5000 });
		await expect(page.locator('textarea#prompt-textarea')).toBeVisible({ timeout: 5000 });
	});

	test('should load the settings page correctly', async ({ page }) => {
		await expect(page.locator('h1')).toHaveText('Prompt Settings');
		await expect(page.locator('label[for="prompt-textarea"]')).toHaveText('Custom Analysis Prompt');
		await expect(page.locator('textarea#prompt-textarea')).toBeVisible();
	});

	test('should display the default prompt initially if user has no custom prompt', async ({
		page
	}) => {
		const textareaValue = await page.locator('textarea#prompt-textarea').inputValue();
		expect(textareaValue.trim()).toBe(defaultPromptContent.trim());
	});

	test('should autosave prompt after debounce and update status indicator', async ({ page }) => {
		const textarea = page.locator('textarea#prompt-textarea');
		const statusIndicator = page.locator('.flex.h-6.items-center.text-sm > span');
		const customPromptText = 'This is a new custom prompt text. ' + Date.now();

		await expect(page).toHaveURL('/settings/prompt', { timeout: 5000 });
		await expect(textarea).toBeEnabled({ timeout: 10000 });

		await textarea.fill(customPromptText);
		await page.waitForTimeout(1500);

		await expect(statusIndicator).toHaveText('Saved successfully!', { timeout: 10000 });

		const textareaValue = await textarea.inputValue();
		expect(textareaValue).toBe(customPromptText);
	});

	test.describe('should load and display saved prompt when user has previously customized it', () => {
		const savedPromptText = 'This is my previously saved custom prompt. ' + Date.now();

		test.beforeEach(async ({ workerUserId, page }) => {
			await db
				.update(schema.user)
				.set({ prompt: savedPromptText })
				.where(eq(schema.user.id, workerUserId));

			await page.waitForTimeout(500);

			await page.goto('/settings/prompt', { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');
		});

		test.afterEach(async ({ workerUserId }) => {
			await db.update(schema.user).set({ prompt: null }).where(eq(schema.user.id, workerUserId));
		});

		test('should display the saved custom prompt', async ({ page }) => {
			const textareaValue = await page.locator('textarea#prompt-textarea').inputValue();
			expect(textareaValue).toBe(savedPromptText);
		});
	});

	test('should use default prompt for analysis if no custom prompt is set', async ({
		page,
		workerUserId
	}) => {
		await page.goto('/home');
		await page.locator('input[type="url"]').first().fill('https://example.com');
		await page.getByRole('button', { name: 'Analyze' }).click();

		const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
		await expect(statusAreaLocator).toContainText(/Job .+ completed successfully./, {
			timeout: 60000
		});

		const latestJob = await db.query.analysisJobs.findFirst({
			where: eq(schema.analysisJobs.userId, workerUserId),
			orderBy: (jobs, { desc }) => [desc(jobs.created_at)]
		});

		expect(latestJob).toBeDefined();
		expect(latestJob?.status).toBe('completed');
		expect(latestJob?.prompt_used).toBeDefined();
		expect(latestJob?.prompt_used?.trim()).toBe(defaultPromptContent.trim());
	});

	test('should use custom prompt for analysis if one is set', async ({ page, workerUserId }) => {
		const customPromptText =
			'My custom analysis prompt for this specific test. Includes placeholder: [html_sources_and_wave_reports] ' +
			Date.now();

		await db
			.update(schema.user)
			.set({ prompt: customPromptText })
			.where(eq(schema.user.id, workerUserId));

		try {
			await page.goto('/home');
			await page.locator('input[type="url"]').first().fill('https://example.com');
			await page.getByRole('button', { name: 'Analyze' }).click();

			const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
			await expect(statusAreaLocator).toContainText(/Job .+ completed successfully./, {
				timeout: 60000
			});

			const latestJob = await db.query.analysisJobs.findFirst({
				where: eq(schema.analysisJobs.userId, workerUserId),
				orderBy: (jobs, { desc }) => [desc(jobs.created_at)]
			});

			expect(latestJob).toBeDefined();
			expect(latestJob?.status).toBe('completed');
			expect(latestJob?.prompt_used).toBeDefined();
			expect(latestJob?.prompt_used?.trim()).toBe(customPromptText.trim());
		} finally {
			await db.update(schema.user).set({ prompt: null }).where(eq(schema.user.id, workerUserId));
		}
	});
});

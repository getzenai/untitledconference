// Import the extended test fixture and expect
import { expect, test } from '../../../fixtures/user.fixture';
// Import DB helpers needed for setup/cleanup
import { cleanupTestUserJobs, createTestJob } from '../../../helpers/test-db-utils';

test.describe('Feature 8.8: Print Report Functionality', () => {
	// Use serial mode? Maybe not needed with fixture isolation, but keep for now.
	test.describe.configure({ mode: 'serial' });

	let completedJobId: string; // Store job ID for navigation

	// Combined beforeEach hook
	test.beforeEach(async ({ page, workerUserId }) => {
		// Clean up any jobs specifically for this worker's user before each test
		await cleanupTestUserJobs(workerUserId);

		// Create the specific job needed for this test using the fixture's user ID
		const job = await createTestJob(workerUserId, {
			status: 'completed',
			urls: ['https://print-test.example.com'],
			result: '# Print Test Report\n\nContent here.'
		});
		completedJobId = job.id; // Store the ID for navigation in the test

		// Navigate directly to the completed job's detail page AFTER seeding
		await page.goto(`/home?jobId=${completedJobId}`);
	});

	test('should display the "Print Report" button for a completed job', async ({ page }) => {
		// Verify the "Print Report" button is visible and enabled using data-testid
		// This now relies on the direct DB fetch in the server load function.
		const reportArea = page.locator('[data-testid="report-area"]');
		const printButton = page.locator('[data-testid="print-report-button"]');

		// Wait for the report area first (rendered via onMount after server load)
		await expect(reportArea).toBeVisible({ timeout: 10000 });
		await expect(reportArea).toContainText('Print Test Report'); // Verify real data rendered

		// Now check the button
		await expect(printButton).toBeVisible({ timeout: 5000 });
		await expect(printButton).toBeEnabled();
	});

	test('should NOT display the "Print Report" button for a new analysis', async ({ page }) => {
		// Navigate back to the new analysis page (Home without jobId)
		// Page is already authenticated by the fixture
		await page.goto('/home');
		// Verify the "Print Report" button is NOT visible using data-testid
		const printButton = page.locator('[data-testid="print-report-button"]');
		await expect(printButton).not.toBeVisible();
	});

	// afterAll removed - cleanup handled by fixture teardown / global teardown
});

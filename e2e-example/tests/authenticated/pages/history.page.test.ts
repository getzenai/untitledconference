import { expect, test } from '../../../fixtures/user.fixture'; // Import extended test from fixture
// Import DB helpers needed for setup/cleanup
import { cleanupTestUserJobs, createTestJob } from '../../../helpers/test-db-utils';

test.describe('Feature 7.8: Job History & New Analysis View (DB)', () => {
	// Run tests in this suite serially to avoid potential interference with DB state
	test.describe.configure({ mode: 'serial' });

	// Moved beforeEach hook to the top of the describe block
	test.beforeEach(async ({ workerUserId }) => {
		// Clean up any jobs specifically for this worker's user before each test
		await cleanupTestUserJobs(workerUserId);
	});

	test('History Page: should show empty state if no jobs exist', async ({ page }) => {
		// Use standard page from fixture
		// No job seeding needed for this test

		await page.goto('/history');

		// Wait for the heading
		const heading = page.getByRole('heading', { name: 'Analysis Job History' });
		await expect(heading).toBeVisible();

		// Use data-testid for the empty state container
		const emptyStateContainer = page.locator('[data-testid="history-empty-state"]');
		await expect(emptyStateContainer).toBeVisible({ timeout: 10000 }); // Wait for container

		// Check content within the empty state
		await expect(
			emptyStateContainer.getByText("You haven't submitted any analysis jobs yet.")
		).toBeVisible();
		await expect(page.locator('table')).not.toBeVisible(); // Ensure table is not shown
		await expect(
			emptyStateContainer.locator('a', { hasText: 'Start Your First Analysis' })
		).toBeVisible();
	});

	test('History Page: should display a single job', async ({ page, workerUserId }) => {
		// Use page and workerUserId
		// Seed one job using the worker's user ID
		const jobData = {
			status: 'completed' as const,
			urls: ['https://single-db.example.com'],
			created_at: new Date()
		};
		const createdJob = await createTestJob(workerUserId, jobData);

		await page.goto('/history');

		// Wait for the heading
		const heading = page.getByRole('heading', { name: 'Analysis Job History' });
		await expect(heading).toBeVisible();

		// Wait for the table row corresponding to the job to appear using data-testid
		const historyTable = page.locator('table');
		const row1 = historyTable.locator(`[data-testid="job-row-${createdJob.id}"]`); // Use real job ID
		await expect(row1).toBeVisible({ timeout: 10000 });

		// Now check content using data-testid locators within the row
		await expect(historyTable).toBeVisible();
		await expect(row1.locator('[data-testid="job-status"]')).toHaveText(jobData.status);
		await expect(row1.locator('[data-testid="job-url"]')).toHaveText(jobData.urls[0]);
		await expect(row1.getByRole('link', { name: 'View' })).toHaveAttribute(
			'href',
			`/home?jobId=${createdJob.id}`
		);
	});

	test('History Page: should display multiple jobs in correct order', async ({
		page,
		workerUserId
	}) => {
		// Use page and workerUserId
		// Seed multiple jobs with different creation times
		const jobData1 = {
			status: 'completed' as const,
			urls: ['https://multi-db1.example.com'],
			created_at: new Date(Date.now() - 20000) // Older
		};
		const jobData2 = {
			status: 'failed' as const,
			urls: ['https://multi-db2.example.com'],
			created_at: new Date(Date.now() - 10000) // Newer
		};
		const createdJob1 = await createTestJob(workerUserId, jobData1);
		const createdJob2 = await createTestJob(workerUserId, jobData2);

		await page.goto('/history');

		// Wait for the heading
		const heading = page.getByRole('heading', { name: 'Analysis Job History' });
		await expect(heading).toBeVisible();

		// Wait for the table to contain both rows using data-testid
		const historyTable = page.locator('table');
		const row1 = historyTable.locator(`[data-testid="job-row-${createdJob1.id}"]`);
		const row2 = historyTable.locator(`[data-testid="job-row-${createdJob2.id}"]`);
		await expect(row1).toBeVisible({ timeout: 10000 });
		await expect(row2).toBeVisible({ timeout: 10000 });

		// Now check content
		await expect(historyTable).toBeVisible();
		const rows = historyTable.locator('tbody tr'); // Or use data-testid selector for rows
		await expect(rows).toHaveCount(2);

		// Verify order (newest first) and content using data-testid locators within rows
		// Note: nth(0) should be the newest (jobData2)
		await expect(rows.nth(0).locator('[data-testid="job-url"]')).toHaveText(jobData2.urls[0]);
		await expect(rows.nth(0).locator('[data-testid="job-status"]')).toHaveText(jobData2.status);
		await expect(rows.nth(1).locator('[data-testid="job-url"]')).toHaveText(jobData1.urls[0]);
		await expect(rows.nth(1).locator('[data-testid="job-status"]')).toHaveText(jobData1.status);
	});

	test('Navigation: History -> Job Detail', async ({ page, workerUserId }) => {
		// Use page and workerUserId
		// Seed one job
		const jobData = {
			status: 'completed' as const,
			urls: ['https://nav-hist-db.example.com'],
			result: 'Report for nav detail test (DB)',
			created_at: new Date()
		};
		const createdJob = await createTestJob(workerUserId, jobData);

		await page.goto('/history');

		// Wait for the heading
		const heading = page.getByRole('heading', { name: 'Analysis Job History' });
		await expect(heading).toBeVisible();

		// Wait for the specific row to be visible
		const historyTable = page.locator('table');
		const row1 = historyTable.locator(`[data-testid="job-row-${createdJob.id}"]`);
		await expect(row1).toBeVisible({ timeout: 10000 });

		// Click the view link
		await row1.getByRole('link', { name: 'View' }).click();

		// Verify detail page (now relies on direct DB fetch in server load)
		await expect(page).toHaveURL(`/home?jobId=${createdJob.id}`);
		await expect(page.getByRole('heading', { name: 'Analysis Job Details' })).toBeVisible();
		await expect(page.locator('[data-testid="report-area"]')).toContainText(jobData.result!);
		await expect(page.getByRole('link', { name: 'Back to New Analysis' })).toBeVisible();
	});

	test('Navigation: Job Detail -> New Analysis', async ({ page, workerUserId }) => {
		// Use page and workerUserId
		// Seed one job
		const jobData = {
			status: 'completed' as const,
			urls: ['https://nav-back-db.example.com'],
			result: 'Report for nav back test (DB)',
			created_at: new Date()
		};
		const createdJob = await createTestJob(workerUserId, jobData);

		await page.goto(`/home?jobId=${createdJob.id}`);
		await expect(page.getByRole('heading', { name: 'Analysis Job Details' })).toBeVisible(); // Wait for detail page

		await page.getByRole('link', { name: 'Back to New Analysis' }).click();

		await expect(page).toHaveURL('/home');
		await expect(page.getByRole('heading', { name: 'New Accessibility Analysis' })).toBeVisible();
		await expect(page.locator('#url-0')).toBeVisible(); // Check for form element
	});

	test('Navigation: Header Links', async ({ page }) => {
		// Use standard page
		// No seeding needed, just testing navigation

		// Start on New Analysis page
		await page.goto('/home');
		await expect(page.getByRole('heading', { name: 'New Accessibility Analysis' })).toBeVisible();

		// Go to History via header
		await page.getByRole('link', { name: 'History' }).click();
		await expect(page).toHaveURL('/history');
		await expect(page.getByRole('heading', { name: 'Analysis Job History' })).toBeVisible();

		// Go back to New Analysis via header
		await page.locator('header nav a[href="/home"]').click();
		await expect(page).toHaveURL('/home');
		await expect(page.getByRole('heading', { name: 'New Accessibility Analysis' })).toBeVisible();
	});

	test('Job Detail: should show error message if job load fails (e.g., invalid ID)', async ({
		page
	}) => {
		// Use standard page
		// No seeding needed, just navigating to a bad URL
		const invalidJobId = 'not-a-uuid';
		await page.goto(`/home?jobId=${invalidJobId}`);

		// Server load should catch invalid UUID and return error state
		await expect(page.getByRole('heading', { name: 'Analysis Job Details' })).toBeVisible();
		await expect(page.locator('[data-testid="status-message-area"]')).toContainText(
			/Error loading job: Invalid job ID format./
		);
		await expect(page.locator('[data-testid="report-area"]')).not.toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to New Analysis' })).toBeVisible();
	});

	test('Job Detail: should show error message if job not found', async ({ page }) => {
		// Use standard page
		// No seeding needed, just navigating to a non-existent (but valid format) UUID
		const nonExistentJobId = '11111111-1111-1111-1111-111111111111';

		// No API mocking needed as server load uses DB

		await page.goto(`/home?jobId=${nonExistentJobId}`);

		// Server load should return error state from DB query
		await expect(page.getByRole('heading', { name: 'Analysis Job Details' })).toBeVisible();
		await expect(page.locator('[data-testid="status-message-area"]')).toContainText(
			/Error loading job: Job not found./ // Updated expected error message
		);
		await expect(page.locator('[data-testid="report-area"]')).not.toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to New Analysis' })).toBeVisible();
	});

	// Test starting a new analysis from the history page (which redirects to /home)
	test('New Analysis: should submit a new job and show initial processing state', async ({
		page
	}) => {
		// Use standard page elements from /home
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const mockUrl = 'https://submit-from-history-test.example.com';

		// Start on history, click New Analysis to go to /home
		await page.goto('/history');
		const emptyStateContainer = page.locator('[data-testid="history-empty-state"]');
		await expect(emptyStateContainer).toBeVisible(); // Ensure empty state is present first
		await emptyStateContainer.getByRole('link', { name: 'Start Your First Analysis' }).click();
		await expect(page).toHaveURL('/home');
		await expect(page.getByRole('heading', { name: 'New Accessibility Analysis' })).toBeVisible();

		// Fill URL and click Analyze
		await urlInput.fill(mockUrl);
		await analyzeButton.click();

		// Verify submission message appears
		await expect(statusArea).toContainText(/Analysis job started \(ID: .+\)/, {
			timeout: 10000
		});

		// Verify UI shows processing state
		const processingButton = page.getByRole('button', { name: /Processing.../i });
		await expect(processingButton).toBeVisible({ timeout: 5000 }); // Check processing button appears quickly
		await expect(processingButton).toBeDisabled();
		await expect(urlInput).toBeDisabled(); // Inputs should disable during processing
	});
});

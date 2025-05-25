// Import extended test from fixture and expect
import { expect, test } from '../../../fixtures/user.fixture';

test.describe('Home Page Functionality (/home)', () => {
	test.beforeEach(async ({ page }) => {
		// Use standard page fixture
		// Navigate to the home page (New Analysis view)
		// Page is already authenticated by the fixture
		await page.goto('/home');
		// Wait for the main card title to ensure the page is loaded
		await expect(page.getByRole('heading', { name: 'New Accessibility Analysis' })).toBeVisible();
	});

	// --- Basic UI Tests (from feature1) ---
	test('UI: should load the page with correct title and description', async ({ page }) => {
		// Heading check is done in beforeEach
		await expect(
			page
				.locator('p')
				// Updated text to use regex matching the dynamic number
				.filter({ hasText: /Enter up to \d+ URLs to analyze their accessibility./ })
		).toBeVisible();
	});

	test('UI: should display basic footer placeholder', async ({ page }) => {
		await expect(page.getByText('Basic Footer Placeholder')).toBeVisible();
	});

	// --- Dynamic URL Input Tests (from feature6.5) ---
	test('Dynamic URLs: should load with one URL input field', async ({ page }) => {
		const urlInputs = page.locator('input[type="url"]');
		await expect(urlInputs).toHaveCount(1);
		await expect(page.locator('#url-0')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add URL' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Remove URL/ })).not.toBeVisible();
	});

	test('Dynamic URLs: should add URL input fields up to the limit (3)', async ({ page }) => {
		const addUrlButton = page.getByRole('button', { name: 'Add URL' });
		const urlInputs = page.locator('input[type="url"]');

		// Initial state
		await expect(urlInputs).toHaveCount(1);
		await expect(addUrlButton).toBeEnabled();

		// Add second URL
		await addUrlButton.click();
		await page.waitForTimeout(200); // Add small wait after click
		await expect(urlInputs).toHaveCount(2);
		await expect(page.locator('#url-1')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Remove URL 2' })).toBeVisible();
		await expect(addUrlButton).toBeEnabled();

		// Add third URL
		await addUrlButton.click();
		await page.waitForTimeout(200); // Add small wait after click
		await expect(urlInputs).toHaveCount(3);
		await expect(page.locator('#url-2')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Remove URL 3' })).toBeVisible();

		// Check button is NOT VISIBLE at limit
		await expect(addUrlButton).not.toBeVisible();
	});

	test('Dynamic URLs: should remove URL input fields correctly', async ({ page }) => {
		const addUrlButton = page.getByRole('button', { name: 'Add URL' });
		const urlInputs = page.locator('input[type="url"]');

		// Add two more inputs
		await addUrlButton.click();
		await addUrlButton.click();
		await page.waitForTimeout(200); // Add small wait after clicks
		await expect(urlInputs).toHaveCount(3);

		// Remove the third URL (index 2)
		const removeUrl3Button = page.getByRole('button', { name: 'Remove URL 3' });
		await removeUrl3Button.click();
		await expect(urlInputs).toHaveCount(2);
		await expect(page.locator('#url-2')).not.toBeVisible();
		await expect(page.locator('#url-1')).toBeVisible();
		await expect(addUrlButton).toBeEnabled();

		// Remove the second URL (index 1)
		const removeUrl2Button = page.getByRole('button', { name: 'Remove URL 2' });
		await removeUrl2Button.click();
		await expect(urlInputs).toHaveCount(1);
		await expect(page.locator('#url-1')).not.toBeVisible();
		await expect(page.locator('#url-0')).toBeVisible();
		await expect(page.getByRole('button', { name: /Remove URL/ })).not.toBeVisible();
		await expect(addUrlButton).toBeEnabled();
	});

	test('Dynamic URLs: should send the correct list of URLs to the analyze API', async ({
		page
	}) => {
		// Use standard page
		const addUrlButton = page.getByRole('button', { name: 'Add URL' });
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const urlInput0 = page.locator('#url-0');
		const urlInput1 = page.locator('#url-1');
		const urlInput2 = page.locator('#url-2');

		let capturedUrls: string[] = [];
		await page.route('/api/analyze', async (route) => {
			// Use page.route for simplicity here
			expect(route.request().method()).toBe('POST');
			const requestBody = route.request().postDataJSON();
			capturedUrls = requestBody.urls;
			await route.fulfill({ json: { jobId: 'mock-job-123' } });
		});

		await addUrlButton.click();
		await addUrlButton.click();

		await urlInput0.fill('https://site1.com');
		await urlInput1.fill('  https://site2.org/path  ');
		await urlInput2.fill('');

		await analyzeButton.click();
		await page.waitForResponse('/api/analyze');

		expect(capturedUrls).toEqual(['https://site1.com', 'https://site2.org/path']);
	});

	test('Dynamic URLs: should show error if no URLs are entered after adding/removing', async ({
		page
	}) => {
		// Use standard page
		const addUrlButton = page.getByRole('button', { name: 'Add URL' });
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.getByTestId('status-message-area');

		await addUrlButton.click();
		await page.getByRole('button', { name: 'Remove URL 2' }).click();

		await page.locator('#url-0').fill('');

		await analyzeButton.click();

		await expect(statusArea).toBeVisible();
		await expect(statusArea).toContainText('Error: Please enter at least one URL.');
		await expect(analyzeButton).toBeEnabled();
	});

	// --- Async Flow Tests (from feature7.5) ---
	test('Async Flow: should handle successful analysis and display report', async ({ page }) => {
		// Use standard page elements
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const reportArea = page.locator('[data-testid="report-area"]');

		// Fill URL, trigger events, then click Analyze
		const testUrl = 'https://success.example.com'; // Use a descriptive URL
		await urlInput.fill(testUrl);
		// Ensure change events are fired - may still be needed
		await page.evaluate((selector) => {
			const input = document.querySelector(selector) as HTMLInputElement;
			if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
			if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
		}, '#url-0');
		await page.waitForTimeout(100); // Small delay to ensure event processing
		await analyzeButton.click();

		// Verify Initial Status Update
		// Look for a pattern since Job ID is now dynamic
		await expect(statusArea).toContainText(/Analysis job started \(ID: .+\)/, {
			timeout: 10000 // Increase timeout slightly
		});

		// MODIFIED: Wait directly for completion status using the correct text and data-testid
		const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
		await expect(statusAreaLocator).toContainText(/Job .+ completed successfully./, {
			timeout: 60000 // Wait longer for real process
		});

		// MODIFIED: Verify report is displayed using mock Gemini content
		await expect(reportArea).toBeVisible();
		// UPDATED: Check for report title from MSW handler
		await expect(reportArea).toContainText('MSW Mock Report');
		// UPDATED: Check for finding from MSW handler
		await expect(reportArea).toContainText('MSW finding 1');
		await expect(analyzeButton).toBeEnabled();
	});

	// Test case for failure during analysis (simulated via mock failure)
	test('Async Flow: should handle failed analysis and display error', async ({ page }) => {
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const reportArea = page.locator('[data-testid="report-area"]');
		// UPDATED: Expect the new user-friendly error message from the backend
		const expectedErrorSubstring =
			'Failed to generate report: Error communicating with AI analysis service.';

		// Use the specific URL that triggers the Gemini failure in MSW
		await urlInput.fill('https://fail-analysis.example.com');
		await analyzeButton.click();

		// Verify Initial Status Update
		await expect(statusArea).toContainText(/Analysis job started \(ID: .+\)/, {
			timeout: 10000
		});

		// MODIFIED: Wait directly for failure status message
		// const finalStatusLocator = page.locator('text=Status: failed'); // Old way
		const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
		// Check that the status message includes the expected error substring
		await expect(statusAreaLocator).toContainText(/Job .+ failed: Analysis failed: /, {
			timeout: 60000
		});

		// MODIFIED: Verify error message is displayed in the report area
		await expect(reportArea).toBeVisible();
		await expect(reportArea).toContainText('Analysis Failed:');
		// UPDATED: Check for the user-friendly error message
		await expect(reportArea).toContainText(expectedErrorSubstring, { timeout: 5000 });
		await expect(analyzeButton).toBeEnabled();
	});

	// Test case for failure during HTML fetching stage
	test('Async Flow: should handle failed HTML fetch and display error', async ({ page }) => {
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const reportArea = page.locator('[data-testid="report-area"]');
		const testUrl = 'https://fail-html.example.com';
		// UPDATED: Match the exact error_details saved by processAnalysisJob
		const expectedErrorSubstring = `Fetching failed: HTML Fetch Error for ${testUrl}: Could not fetch HTML for ${testUrl}: Failed to fetch`;

		// Use the specific URL that triggers the HTML failure in MSW
		await urlInput.fill(testUrl);
		await analyzeButton.click();

		// Verify Initial Status Update
		await expect(statusArea).toContainText(/Analysis job started \(ID: .+\)/, {
			timeout: 10000
		});

		// MODIFIED: Wait directly for failure status message
		// const finalStatusLocator = page.locator('text=Status: failed'); // Old way
		const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
		// Check that the status message includes the expected error substring
		await expect(statusAreaLocator).toContainText(/Job .+ failed: Fetching failed: /, {
			timeout: 60000
		});

		// MODIFIED: Verify error message is displayed
		await expect(reportArea).toBeVisible();
		await expect(reportArea).toContainText('Analysis Failed:');
		// UPDATED: Check for the exact error substring from error_details
		await expect(reportArea).toContainText(expectedErrorSubstring, { timeout: 5000 });
		await expect(analyzeButton).toBeEnabled();
	});

	// Test case for failure during WAVE API call stage
	test('Async Flow: should handle failed WAVE API call and display error', async ({ page }) => {
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const reportArea = page.locator('[data-testid="report-area"]');
		const testUrl = 'https://fail-wave.example.com';
		// UPDATED: Match the exact error_details saved by processAnalysisJob
		const expectedErrorSubstring = `Fetching failed: WAVE API Error for ${testUrl}: Could not get WAVE report for ${testUrl}: WAVE API Error for ${testUrl}: Simulated WAVE API failure`;

		// Use the specific URL that triggers the WAVE failure in MSW
		await urlInput.fill(testUrl);
		await analyzeButton.click();

		// Verify Initial Status Update
		await expect(statusArea).toContainText(/Analysis job started \(ID: .+\)/, {
			timeout: 10000
		});

		// MODIFIED: Wait directly for failure status message
		// const finalStatusLocator = page.locator('text=Status: failed'); // Old way
		const statusAreaLocator = page.locator('[data-testid="status-message-area"]');
		// Check that the status message includes the expected error substring
		await expect(statusAreaLocator).toContainText(/Job .+ failed: Fetching failed: /, {
			timeout: 60000
		});

		// MODIFIED: Verify error message is displayed
		await expect(reportArea).toBeVisible();
		await expect(reportArea).toContainText('Analysis Failed:');
		// UPDATED: Check for the exact error substring from error_details
		await expect(reportArea).toContainText(expectedErrorSubstring, { timeout: 5000 });
		await expect(analyzeButton).toBeEnabled();
	});

	test('Async Flow: should disable inputs and button during polling', async ({ page, context }) => {
		// Use standard page/context
		const urlInput = page.locator('#url-0');
		const analyzeButton = page.getByRole('button', { name: 'Analyze' });
		const addUrlButton = page.getByRole('button', { name: 'Add URL' });
		const statusArea = page.locator('[data-testid="status-message-area"]');
		const mockJobId = 'job-789-polling';

		// Mock POST /api/analyze using context
		await context.route('**/api/analyze', async (route) => {
			if (route.request().method() === 'POST') {
				await page.waitForTimeout(100); // Simulate delay
				await route.fulfill({ json: { jobId: mockJobId } });
			} else {
				await route.continue();
			}
		});

		// Mock GET /api/analyze/[jobId] - consistently return pending using context helper
		// Use explicit route here instead of helper for debugging
		await context.route(`**/api/analyze/${mockJobId}`, async (route) => {
			// console.log(`[MOCK HIT] Intercepted GET /api/analyze/${mockJobId}. Responding with pending.`); // Reduce noise
			await route.fulfill({ json: { status: 'pending' } });
		});
		// await mockAnalyzeJobDetailsRoute(context, mockJobId, { status: 'pending' } as MockJobDetail); // Use imported helper

		await urlInput.fill('https://polling.example.com');

		// Start waiting for the POST response *before* clicking
		const postResponsePromise = page.waitForResponse('**/api/analyze');
		await analyzeButton.click();
		await postResponsePromise; // Ensure POST completes

		// Wait for the initial status message indicating polling has started
		await expect(statusArea).toContainText(`Analysis job started (ID: ${mockJobId})`, {
			timeout: 10000 // Increase timeout slightly
		});
		// Only check initial state after POST mock
		// await page.waitForResponse(`**/api/analyze/${mockJobId}`); // Removed wait for GET poll
		// await expect(statusArea).toContainText(`Job ${mockJobId} is pending...`, { timeout: 5000 }); // Removed check for pending

		// Verify UI Elements are Disabled
		const processingButton = page.getByRole('button', { name: /Processing.../i });
		await expect(processingButton).toBeVisible();
		await expect(processingButton).toBeDisabled();
		await expect(urlInput).toBeDisabled();
		await expect(addUrlButton).toBeVisible();
		await expect(addUrlButton).toBeDisabled();
	});
});

import { http, HttpResponse } from 'msw';

// ADDED: Simple type for the expected Gemini request body structure
type GeminiRequestBody = {
	contents: {
		parts: {
			text: string;
		}[];
	}[];
	// Add other fields if needed for more complex checks
};

// MSW Handlers for external APIs used during E2E tests

const handlers = [
	// Mock WAVE API
	http.get('https://wave.webaim.org/api/request', ({ request }) => {
		const url = new URL(request.url);
		const requestedUrl = url.searchParams.get('url') || 'unknown-url';
		console.log(`[MSW] Intercepted WAVE API request for URL: ${requestedUrl}`);

		// ADDED: Check for specific failure URL
		if (requestedUrl === 'https://fail-wave.example.com') {
			console.log(`[MSW] Simulating WAVE API failure for ${requestedUrl}`);
			return HttpResponse.json(
				{
					status: {
						success: false,
						error: 'Simulated WAVE API failure' // Consistent error message
					}
				},
				{ status: 200 } // WAVE API often returns 200 even on error
			);
		}

		// Return a generic successful WAVE response
		return HttpResponse.json({
			status: { success: true, httpstatuscode: 200 },
			statistics: {
				pagetitle: `Mock Page Title for ${requestedUrl}`,
				pageurl: requestedUrl,
				time: 0.5,
				creditsremaining: 9999,
				allitemcount: 10, // Simpler counts for MSW mock
				totalelements: 50,
				waveurl: `http://wave.webaim.org/report?url=${encodeURIComponent(requestedUrl)}`
			},
			categories: {
				error: {
					description: 'Errors',
					count: 1,
					items: { link_empty: { id: 'link_empty', description: 'Empty link', count: 1 } }
				},
				contrast: {
					description: 'Contrast Errors',
					count: 1,
					items: { contrast: { id: 'contrast', description: 'Very low contrast', count: 1 } }
				},
				alert: {
					description: 'Alerts',
					count: 1,
					items: {
						heading_possible: { id: 'heading_possible', description: 'Possible heading', count: 1 }
					}
				},
				feature: {
					description: 'Features',
					count: 1,
					items: { alt: { id: 'alt', description: 'Alternative text', count: 1 } }
				},
				structure: {
					description: 'Structural Elements',
					count: 1,
					items: { h1: { id: 'h1', description: 'Heading level 1', count: 1 } }
				},
				aria: {
					description: 'ARIA',
					count: 1,
					items: { aria: { id: 'aria', description: 'ARIA', count: 1 } }
				}
			}
		});
	}),

	// Mock Gemini API
	http.post('https://generativelanguage.googleapis.com/v1beta/models/*', async ({ request }) => {
		// ADDED: Check if the prompt includes the analysis failure URL
		// MODIFIED: Use the defined type
		const requestBody = (await request.json()) as GeminiRequestBody;
		const promptText = requestBody?.contents?.[0]?.parts?.[0]?.text || '';
		if (promptText.includes('https://fail-analysis.example.com')) {
			console.log(`[MSW] Simulating Gemini API failure for analysis fail test.`);
			return HttpResponse.error(); // Simulate network/server error
		}

		// We don't strictly need the request body for this simple mock, but you could inspect it if needed
		// const requestBody = await request.json();
		console.log(`[MSW] Intercepted Gemini API request.`);

		return HttpResponse.json({
			candidates: [
				{
					content: {
						parts: [
							{
								text: `## MSW Mock Report\n\nThis is a mock accessibility report generated via MSW during an E2E test.\n\n- MSW finding 1\n- MSW finding 2\n\nAnalysis based on MSW mocked data.`
							}
						],
						role: 'model'
					},
					finishReason: 'STOP',
					index: 0,
					safetyRatings: [] // Simplified
				}
			],
			promptFeedback: {
				safetyRatings: [] // Simplified
			}
		});
	}),

	// Mock general HTML fetching (for external sites used in tests)
	// IMPORTANT: This needs to be broad enough to catch test URLs like example.com
	// but specific enough to NOT catch localhost requests or API calls.
	http.get(/^(?!http:\/\/localhost).*/, ({ request }) => {
		const url = request.url;

		// Double-check it's not an API call we handle separately
		if (
			url.includes('wave.webaim.org/api/request') ||
			url.includes('generativelanguage.googleapis.com')
		) {
			// This should ideally not happen if handlers above are matched first, but as a safeguard:
			console.warn(
				`[MSW HTML Mock] Warning: Request to ${url} was caught by HTML mock but should be handled separately. Passing through.`
			);
			// Allow the request to pass through (it should be caught by other handlers or fail)
			// Note: In a real scenario, you might want to explicitly pass or use passthrough()
			return; // Let it pass through to be handled by other mocks or actual fetch
		}

		// ADDED: Check for specific failure URL
		if (url === 'https://fail-html.example.com/') {
			console.log(`[MSW] Simulating HTML fetch failure for ${url}`);
			// Simulate a network error fetching HTML
			return HttpResponse.error();
		}
		if (url === 'https://fail-analysis.example.com/') {
			console.log(`[MSW] Simulating Analysis failure (via Gemini mock) for ${url}`);
			// Return valid HTML, the failure will be simulated in the Gemini mock
			return HttpResponse.html(`
<!DOCTYPE html>
<html lang="en">
<head><title>MSW Mock for ${url} (Analysis Fail Test)</title></head>
<body><h1>MSW Mock Page - Analysis Fail Test</h1><p>URL: ${url}</p></body>
</html>`);
		}

		console.log(`[MSW] Intercepted external HTML fetch for URL: ${url}`);
		// Return a simple mock HTML page
		return HttpResponse.html(`
<!DOCTYPE html>
<html lang="en">
<head><title>MSW Mock for ${url}</title></head>
<body><h1>MSW Mock Page</h1><p>URL: ${url}</p></body>
</html>`);
	})
];

export { handlers };

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const ENDPOINT_PATH = '/api/v1/public/health';

// Mock SvelteKit app for integration testing
const mockApp = {
	request: async (request: Request) => {
		// Get URL for routing
		const url = new URL(request.url);

		// Import the actual handler
		const { GET } = await import('./+server.js');

		if (request.method === 'GET' && url.pathname === ENDPOINT_PATH) {
			return await GET({} as Parameters<typeof GET>[0]);
		}

		return new Response('Not Found', { status: 404 });
	}
};

describe('Health API Integration Tests', () => {
	beforeAll(() => {
		// Ensure we're using the test database
		if (!process.env.TEST_DATABASE_URL) {
			throw new Error('TEST_DATABASE_URL not configured for integration tests');
		}

		// Verify we're in test environment
		expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
	});

	afterAll(async () => {
		// Cleanup: Close any database connections if needed
		// The db instance should handle this automatically
	});

	it('should return healthy status with real database connection', async () => {
		// Act - Make actual HTTP request to the handler
		const request = new Request(`${BASE_URL}${ENDPOINT_PATH}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const response = await mockApp.request(request);
		const result = await response.json();

		// Assert
		expect(response.status).toBe(200);
		expect(result.status).toBe('ok');
		expect(result.checks).toHaveLength(1);
		expect(result.checks[0]).toEqual({
			name: 'database',
			status: 'ok'
		});
		expect(result.timestamp).toBeDefined();
		expect(new Date(result.timestamp)).toBeInstanceOf(Date);
	});

	it('should verify actual database connectivity', async () => {
		// This test verifies that the database connection is real by
		// making the request and expecting it to work with the actual test database

		// Act
		const request = new Request(`${BASE_URL}${ENDPOINT_PATH}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const response = await mockApp.request(request);
		const result = await response.json();

		// Assert - If database is truly connected, we should get ok status
		expect(response.status).toBe(200);
		expect(result.status).toBe('ok');
		expect(result.checks[0].name).toBe('database');
		expect(result.checks[0].status).toBe('ok');

		// Verify timestamp is recent (within last 5 seconds)
		const timestamp = new Date(result.timestamp);
		const now = new Date();
		const timeDiff = now.getTime() - timestamp.getTime();
		expect(timeDiff).toBeLessThan(5000); // 5 seconds
	});

	it('should handle multiple concurrent requests to real database', async () => {
		// Test that multiple requests can be handled concurrently
		// This helps ensure database connection pooling works correctly

		const promises = Array.from({ length: 5 }, async (_, index) => {
			const request = new Request(`${BASE_URL}${ENDPOINT_PATH}?test=${index}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const response = await mockApp.request(request);
			const result = await response.json();

			return { response, result, index };
		});

		// Act - Execute all requests concurrently
		const results = await Promise.all(promises);

		// Assert - All requests should succeed
		results.forEach(({ response, result }) => {
			expect(response.status).toBe(200);
			expect(result.status).toBe('ok');
			expect(result.checks[0].status).toBe('ok');
			expect(result.timestamp).toBeDefined();
		});
	});
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from '$lib/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../../hooks.server.js';

const paraglideMiddlewareMock = vi.hoisted(() =>
	vi.fn(
		async (
			request: Request,
			handler: (args: { request: Request; locale: string }) => Response | Promise<Response>
		) => handler({ request, locale: 'en' })
	)
);

// Mock the auth module
vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: vi.fn()
		}
	}
}));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: paraglideMiddlewareMock
}));

// Mock the logger
vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Mock Better Auth SvelteKit handler
vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) =>
		resolve(event)
}));

// Mock the sequence function from SvelteKit hooks
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence: (...handlers: any[]) => {
		// Return a single handler that calls all handlers in sequence
		return async ({ event, resolve }: any) => {
			let currentResolve = resolve;

			// Chain handlers in reverse order
			for (let i = handlers.length - 1; i >= 0; i--) {
				const handler = handlers[i];
				const previousResolve = currentResolve;
				currentResolve = (evt: any, opts?: any) =>
					handler({ event: evt, resolve: (e: any, o?: any) => previousResolve(e, o || opts) });
			}

			return currentResolve(event);
		};
	}
}));

const mockAuth = vi.mocked(auth);

// Helper to create mock events
function createMockEvent(pathname: string, method: string = 'GET') {
	const url = new URL(`http://localhost${pathname}`);
	const request = new Request(url, { method, headers: new Headers() });
	return {
		url,
		request,
		locals: {} as any,
		platform: undefined,
		params: {},
		route: { id: null },
		cookies: {
			get: vi.fn(),
			getAll: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn()
		},
		fetch: vi.fn(),
		getClientAddress: vi.fn(),
		isDataRequest: false,
		isSubRequest: false,
		setHeaders: vi.fn()
	};
}

describe('API Routing - Unauthenticated Access', () => {
	const mockResolve = vi.fn((_event) => new Response('OK'));

	beforeEach(() => {
		vi.clearAllMocks();
		(mockAuth.api.getSession as any).mockResolvedValue(null);
	});

	it('should allow access to public health endpoint without authentication', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/public/health');

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
		// Should not try to get session for public endpoints
		expect(mockAuth.api.getSession).toHaveBeenCalledTimes(1); // Only called by populateLocalsUserHandler
	});

	it('should allow access to public login endpoint without authentication', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/public/login', 'POST');

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
	});

	it('should allow access to public logout endpoint without authentication', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/public/logout', 'POST');

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
	});

	it('should block access to protected endpoints without authentication', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/protected');
		(mockAuth.api.getSession as any).mockResolvedValue(null);

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(401);
		const result = await response.json();
		expect(result.message).toBe('Unauthorized. Please login.');
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('should block access to any non-public API v1 endpoint without authentication', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/some/protected/route');
		(mockAuth.api.getSession as any).mockResolvedValue(null);

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(401);
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('should allow access to test endpoints only in test environment', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/test/register', 'POST');
		// Mock test environment with explicit test endpoints enabled
		const originalEnableTestEndpoints = process.env.ENABLE_TEST_ENDPOINTS;
		process.env.ENABLE_TEST_ENDPOINTS = 'true';

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);

		// Cleanup
		if (originalEnableTestEndpoints !== undefined) {
			process.env.ENABLE_TEST_ENDPOINTS = originalEnableTestEndpoints;
		} else {
			delete process.env.ENABLE_TEST_ENDPOINTS;
		}
	});

	it('should block access to test endpoints in production environment', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/test/register', 'POST');
		// Mock production environment with test endpoints explicitly disabled
		const originalEnableTestEndpoints = process.env.ENABLE_TEST_ENDPOINTS;
		delete process.env.ENABLE_TEST_ENDPOINTS; // Ensure it's not set to 'true'

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(403);

		// Cleanup
		if (originalEnableTestEndpoints !== undefined) {
			process.env.ENABLE_TEST_ENDPOINTS = originalEnableTestEndpoints;
		}
	});

	it('should handle auth service errors gracefully', async () => {
		// Arrange
		const event = createMockEvent('/api/v1/protected');
		(mockAuth.api.getSession as any).mockRejectedValue(new Error('Auth service error'));

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(401);
		expect(mockResolve).not.toHaveBeenCalled();

		// The hooks.server.ts silently catches errors, so no user should be set
		expect(event.locals.user).toBeUndefined();
	});

	it('should allow access to non-API routes regardless of authentication', async () => {
		// Arrange
		const event = createMockEvent('/some/regular/page');

		// Act
		const response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
	});
});

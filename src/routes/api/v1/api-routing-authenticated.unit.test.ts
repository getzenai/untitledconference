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
			getSession: vi.fn(),
			listMembers: vi.fn()
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
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn()
		},
		fetch: vi.fn(),
		getClientAddress: vi.fn(),
		isDataRequest: false,
		isSubRequest: false
	};
}

describe('API Routing - Authenticated Access', () => {
	const mockResolve = vi.fn((_event) => new Response('OK'));

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should allow access to protected endpoints with valid authentication', async () => {
		// Arrange
		const mockUser = { id: 'user123', email: 'test@example.com' };
		const mockSession = {
			user: mockUser,
			session: { activeOrganizationId: 'org123' }
		};
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);
		(mockAuth.api.listMembers as any).mockResolvedValue({
			members: [{ userId: 'user123', role: 'owner' }]
		});

		const event = createMockEvent('/api/v1/protected');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(_response).toBeDefined();
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
		expect(event.locals.user).toEqual(mockUser);
		expect(event.locals.organizationId).toBe('org123');
		expect(event.locals.organizationRole).toBe('owner');
	});

	it('should populate user locals for authenticated requests', async () => {
		// Arrange
		const mockUser = { id: 'user456', email: 'admin@example.com', role: 'admin' };
		const mockSession = { user: mockUser, session: { activeOrganizationId: null } };
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);

		const event = createMockEvent('/api/v1/some/endpoint');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.user).toEqual(mockUser);
		expect(event.locals.isAdmin).toBe(true);
		expect(event.locals.organizationId).toBe(null);
		expect(event.locals.organizationRole).toBe(null);
	});

	it('should handle organization member lookup errors gracefully', async () => {
		// Arrange
		const mockUser = { id: 'user123', email: 'test@example.com' };
		const mockSession = {
			user: mockUser,
			session: { activeOrganizationId: 'org123' }
		};
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);
		(mockAuth.api.listMembers as any).mockRejectedValue(new Error('Organization lookup error'));

		const event = createMockEvent('/api/v1/protected');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.user).toEqual(mockUser);
		expect(event.locals.organizationId).toBe('org123');
		expect(event.locals.organizationRole).toBe(null);
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);

		// The hooks.server.ts silently catches errors, so organizationRole should be null
		// but no error should be logged
		expect(event.locals.organizationRole).toBe(null);
	});

	it('should handle session validation for custom API endpoints', async () => {
		// Arrange
		const mockUser = { id: 'user789', email: 'custom@example.com' };
		const mockSession = { user: mockUser };
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);

		const event = createMockEvent('/api/v1/custom/endpoint', 'POST');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.user).toEqual(mockUser);
		expect(mockResolve).toHaveBeenCalledWith(
			event,
			expect.objectContaining({
				transformPageChunk: expect.any(Function)
			})
		);
	});

	it('should set organization role when user is found in member list', async () => {
		// Arrange
		const mockUser = { id: 'user123', email: 'member@example.com' };
		const mockSession = {
			user: mockUser,
			session: { activeOrganizationId: 'org456' }
		};
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);
		(mockAuth.api.listMembers as any).mockResolvedValue({
			members: [
				{ userId: 'other-user', role: 'owner' },
				{ userId: 'user123', role: 'member' }
			]
		});

		const event = createMockEvent('/api/v1/organizations/data');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.organizationRole).toBe('member');
		expect(event.locals.organizationId).toBe('org456');
	});

	it('should set organizationRole to null when user not found in member list', async () => {
		// Arrange
		const mockUser = { id: 'user123', email: 'notmember@example.com' };
		const mockSession = {
			user: mockUser,
			session: { activeOrganizationId: 'org456' }
		};
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);
		(mockAuth.api.listMembers as any).mockResolvedValue({
			members: [{ userId: 'other-user', role: 'owner' }]
		});

		const event = createMockEvent('/api/v1/organizations/data');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.organizationRole).toBe(null);
		expect(event.locals.organizationId).toBe('org456');
	});

	it('should identify admin users correctly', async () => {
		// Arrange
		const mockUser = { id: 'admin1', email: 'admin@example.com', role: 'admin' };
		const mockSession = { user: mockUser };
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);

		const event = createMockEvent('/api/v1/admin/endpoint');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.isAdmin).toBe(true);
		expect(event.locals.user.role).toBe('admin');
	});

	it('should handle requests for users without admin role', async () => {
		// Arrange
		const mockUser = { id: 'user1', email: 'user@example.com', role: 'user' };
		const mockSession = { user: mockUser };
		(mockAuth.api.getSession as any).mockResolvedValue(mockSession);

		const event = createMockEvent('/api/v1/user/data');

		// Act
		const _response = await handle({ event: event as any, resolve: mockResolve });

		// Assert
		expect(event.locals.isAdmin).toBe(false);
		expect(event.locals.user.role).toBe('user');
	});
});

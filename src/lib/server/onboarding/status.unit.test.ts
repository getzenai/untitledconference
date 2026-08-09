import { describe, expect, it, vi } from 'vitest';
import {
	getOnboardingState,
	ONBOARDING_CREATE_ORGANIZATION_PATH,
	ONBOARDING_INVITATIONS_PATH,
	resolveOnboardingRedirect,
	type OnboardingAuthApi
} from './status';

const headers = new Headers();

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

function invitation(overrides: Record<string, unknown> = {}) {
	return {
		id: 'inv1',
		organizationId: 'org1',
		organizationName: 'Acme',
		role: 'member',
		status: 'pending',
		expiresAt: future,
		...overrides
	};
}

function api(invitations: unknown, organizations: unknown): OnboardingAuthApi {
	return {
		listUserInvitations: vi.fn().mockResolvedValue(invitations),
		listOrganizations: vi.fn().mockResolvedValue(organizations)
	};
}

describe('getOnboardingState', () => {
	it('reports a pending invitation', async () => {
		const state = await getOnboardingState(api([invitation()], []), headers);

		expect(state.pendingInvitations).toHaveLength(1);
		expect(state.pendingInvitations[0]).toMatchObject({
			id: 'inv1',
			organizationId: 'org1',
			organizationName: 'Acme',
			role: 'member'
		});
		expect(state.isComplete).toBe(false);
	});

	it('ignores invitations that are not pending', async () => {
		const state = await getOnboardingState(
			api([invitation({ status: 'accepted' }), invitation({ status: 'canceled' })], [{ id: 'o' }]),
			headers
		);

		expect(state.pendingInvitations).toEqual([]);
		expect(state.isComplete).toBe(true);
	});

	it('ignores expired invitations', async () => {
		const state = await getOnboardingState(
			api([invitation({ expiresAt: past })], [{ id: 'o' }]),
			headers
		);

		expect(state.pendingInvitations).toEqual([]);
	});

	it('ignores invitations with an unparseable expiry', async () => {
		const state = await getOnboardingState(
			api([invitation({ expiresAt: 'not-a-date' })], [{ id: 'o' }]),
			headers
		);

		expect(state.pendingInvitations).toEqual([]);
	});

	it('ignores malformed entries rather than throwing', async () => {
		const state = await getOnboardingState(
			api([null, 'nope', {}, invitation({ id: undefined })], [{ id: 'o' }]),
			headers
		);

		expect(state.pendingInvitations).toEqual([]);
	});

	it('falls back to a placeholder organization name', async () => {
		const state = await getOnboardingState(
			api([invitation({ organizationName: undefined })], []),
			headers
		);

		expect(state.pendingInvitations[0].organizationName).toBe('this organization');
	});

	it('reports a user with no organization as incomplete', async () => {
		const state = await getOnboardingState(api([], []), headers);

		expect(state.hasOrganization).toBe(false);
		expect(state.isComplete).toBe(false);
	});

	it('reports a user with an organization and no invitations as complete', async () => {
		const state = await getOnboardingState(api([], [{ id: 'org1' }]), headers);

		expect(state).toEqual({ pendingInvitations: [], hasOrganization: true, isComplete: true });
	});

	it('tolerates non-array responses', async () => {
		const state = await getOnboardingState(api(null, undefined), headers);

		expect(state.pendingInvitations).toEqual([]);
		expect(state.hasOrganization).toBe(false);
	});

	it('fails open when the auth API throws', async () => {
		const failing: OnboardingAuthApi = {
			listUserInvitations: vi.fn().mockRejectedValue(new Error('db down')),
			listOrganizations: vi.fn().mockResolvedValue([])
		};

		const state = await getOnboardingState(failing, headers);

		expect(state.isComplete).toBe(true);
		expect(resolveOnboardingRedirect(state)).toBeNull();
	});
});

describe('resolveOnboardingRedirect', () => {
	it('sends users with invitations to the invitations step first', () => {
		const state = {
			pendingInvitations: [
				{
					id: 'i',
					organizationId: 'o',
					organizationName: 'Acme',
					role: 'member',
					expiresAt: future
				}
			],
			hasOrganization: false,
			isComplete: false
		};

		expect(resolveOnboardingRedirect(state)).toBe(ONBOARDING_INVITATIONS_PATH);
	});

	it('sends users without an organization to organization creation', () => {
		expect(
			resolveOnboardingRedirect({
				pendingInvitations: [],
				hasOrganization: false,
				isComplete: false
			})
		).toBe(ONBOARDING_CREATE_ORGANIZATION_PATH);
	});

	it('returns null when onboarding is complete', () => {
		expect(
			resolveOnboardingRedirect({ pendingInvitations: [], hasOrganization: true, isComplete: true })
		).toBeNull();
	});
});

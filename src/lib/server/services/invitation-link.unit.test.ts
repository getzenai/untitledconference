import { describe, expect, it } from 'vitest';
import { captureInvitationLink, takeInvitationLink } from './invitation-link';

const link = (n: number) => `https://example.test/api/auth/reset-password/token-${n}?callbackURL=x`;

describe('invitation link handoff', () => {
	it('hands the link to the caller that asked for it', () => {
		captureInvitationLink('Ada@Example.test', link(1));
		expect(takeInvitationLink('ada@example.test')).toBe(link(1));
	});

	it('is one-time — a second read gets nothing', () => {
		captureInvitationLink('bob@example.test', link(2));
		expect(takeInvitationLink('bob@example.test')).toBe(link(2));
		expect(takeInvitationLink('bob@example.test')).toBeNull();
	});

	it('keeps invitations apart', () => {
		captureInvitationLink('one@example.test', link(3));
		captureInvitationLink('two@example.test', link(4));
		expect(takeInvitationLink('two@example.test')).toBe(link(4));
		expect(takeInvitationLink('one@example.test')).toBe(link(3));
	});

	it('forgets a link nobody took', () => {
		const t0 = 1_000_000;
		captureInvitationLink('slow@example.test', link(5), t0);
		expect(takeInvitationLink('slow@example.test', t0 + 31_000)).toBeNull();
	});

	it('drops stale captures when a new one arrives', () => {
		const t0 = 2_000_000;
		captureInvitationLink('stale@example.test', link(6), t0);
		captureInvitationLink('fresh@example.test', link(7), t0 + 31_000);
		expect(takeInvitationLink('stale@example.test', t0 + 31_000)).toBeNull();
		expect(takeInvitationLink('fresh@example.test', t0 + 31_000)).toBe(link(7));
	});

	it('has nothing for an email that was never captured', () => {
		expect(takeInvitationLink('nobody@example.test')).toBeNull();
	});
});

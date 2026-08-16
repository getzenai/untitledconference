/**
 * The rule, and the order it asks its questions in. The order is not cosmetic:
 * it decides whether someone types a name for nothing.
 */
import { describe, expect, it } from 'vitest';
import { checkOrganizationDeletion } from './organization-delete';

const owner = {
	name: 'DevFlow Conf',
	typedName: 'DevFlow Conf',
	isOwner: true,
	conferences: 0,
	otherMembers: 0,
	pendingInvitations: 0
};

describe('checkOrganizationDeletion', () => {
	it('lets an owner delete an empty organization they named correctly', () => {
		expect(checkOrganizationDeletion(owner)).toEqual({ ok: true });
	});

	it('refuses anyone who is not the owner, before asking for the name', () => {
		const verdict = checkOrganizationDeletion({ ...owner, isOwner: false, typedName: '' });
		expect(verdict).toEqual({ ok: false, reason: 'Only the owner can delete this organization.' });
	});

	it('refuses while an event hangs off it, and says what would be lost', () => {
		const verdict = checkOrganizationDeletion({ ...owner, conferences: 1 });
		expect(verdict.ok).toBe(false);
		expect(verdict.ok === false && verdict.reason).toContain('1 event');
		expect(verdict.ok === false && verdict.reason).toContain('submission');
	});

	it('counts events in the plural', () => {
		const verdict = checkOrganizationDeletion({ ...owner, conferences: 3 });
		expect(verdict.ok === false && verdict.reason).toContain('3 events');
	});

	it('refuses while another member or an invitation is outstanding', () => {
		expect(
			checkOrganizationDeletion({ ...owner, otherMembers: 2 }).ok === false &&
				checkOrganizationDeletion({ ...owner, otherMembers: 2 })
		).toMatchObject({ reason: expect.stringContaining('2 other members') });

		expect(checkOrganizationDeletion({ ...owner, pendingInvitations: 1 })).toMatchObject({
			reason: expect.stringContaining('1 pending invitation')
		});
	});

	it('asks about the blockers before the typed name', () => {
		// Someone with an event *and* the wrong name hears about the event —
		// otherwise they retype the name and are refused a second time.
		const verdict = checkOrganizationDeletion({ ...owner, conferences: 1, typedName: 'wrong' });
		expect(verdict.ok === false && verdict.reason).toContain('event');
	});

	it('requires the name exactly, not nearly', () => {
		for (const typedName of ['devflow conf', ' DevFlow Conf ', 'DevFlow  Conf', '']) {
			const verdict = checkOrganizationDeletion({ ...owner, typedName });
			expect(verdict, typedName).toEqual({
				ok: false,
				reason: 'Type the organization name exactly to confirm.',
				field: 'confirmName'
			});
		}
	});
});

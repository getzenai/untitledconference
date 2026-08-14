import { describe, expect, it } from 'vitest';
import { conferenceBadge, missingConferenceMessage, publicSiteLink } from './conference-status';

describe('conferenceBadge', () => {
	it('says nothing on a published conference', () => {
		expect(conferenceBadge('published')).toBeNull();
	});

	it('tells draft and archived apart', () => {
		const draft = conferenceBadge('draft');
		const archived = conferenceBadge('archived');

		expect(draft?.label).toBe('Draft — not public yet');
		expect(archived?.label).toBe('Archived — no longer public');
		expect(archived?.short).not.toBe(draft?.short);
	});

	it('treats an unknown status as a draft rather than as published', () => {
		expect(conferenceBadge('something-new')?.short).toBe('Draft');
	});
});

describe('publicSiteLink', () => {
	it('links to /c/<slug> once published', () => {
		const link = publicSiteLink('published', 'untitled-2026');

		expect(link).toEqual({
			available: true,
			href: '/c/untitled-2026',
			label: 'View the public site'
		});
	});

	it('never hands out a link that would 404', () => {
		for (const status of ['draft', 'archived', 'something-new']) {
			const link = publicSiteLink(status, 'untitled-2026');

			expect(link.available).toBe(false);
			expect(JSON.stringify(link)).not.toContain('/c/untitled-2026');
		}
	});

	it('names Settings as the way out in both unavailable states', () => {
		for (const status of ['draft', 'archived']) {
			const link = publicSiteLink(status, 'untitled-2026');

			expect(link.available).toBe(false);
			if (!link.available) expect(link.reason).toContain('Settings');
		}
	});
});

describe('missingConferenceMessage', () => {
	it('keeps the old sentence for an address that belongs to nothing', () => {
		expect(missingConferenceMessage(null)).toBe('No conference with that address');
	});

	it('does not claim the address is wrong when the conference exists', () => {
		expect(missingConferenceMessage('draft')).toBe('This conference has not been published yet');
		expect(missingConferenceMessage('archived')).toBe(
			'This conference is archived — its public site is offline'
		);
	});
});

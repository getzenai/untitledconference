import { describe, expect, it } from 'vitest';

import { visibleNavItems, type NavAccess, type NavGate } from './nav-access';

/** The sidebar's real list, reduced to what the filter looks at. */
const ITEMS = [
	{ title: 'Conferences', gate: 'conferences' as const },
	{ title: 'Contacts', gate: 'contacts' as const },
	{ title: 'Speaking' },
	{ title: 'Reviewing', gate: 'reviewing' as const }
];

const NOBODY: NavAccess = { conferences: false, contacts: false, reviewing: false };

const titles = (access: NavAccess) => visibleNavItems(ITEMS, access).map((i) => i.title);

describe('sidebar destinations by relation', () => {
	it('leaves a speaker with Speaking alone', () => {
		// The reported symptom: someone who has never organized or reviewed was
		// offered Conferences, Contacts and Reviewing anyway.
		expect(titles(NOBODY)).toEqual(['Speaking']);
	});

	it('keeps all four for the person who is all three', () => {
		expect(titles({ conferences: true, contacts: true, reviewing: true })).toEqual([
			'Conferences',
			'Contacts',
			'Speaking',
			'Reviewing'
		]);
	});

	it('gives a reviewer Reviewing without the organizer surfaces', () => {
		expect(titles({ ...NOBODY, reviewing: true })).toEqual(['Speaking', 'Reviewing']);
	});

	it('separates Conferences from Contacts', () => {
		// A scoped organizer on one conference manages that event but has no org-wide
		// seat, and the contacts directory reads seats alone — so that link would
		// lead to an empty table.
		expect(titles({ ...NOBODY, conferences: true })).toEqual(['Conferences', 'Speaking']);
	});

	it('keeps the given order rather than grouping by gate', () => {
		expect(titles({ conferences: true, contacts: false, reviewing: true })).toEqual([
			'Conferences',
			'Speaking',
			'Reviewing'
		]);
	});

	it('shows an ungated item to everyone', () => {
		// Speaking has no gate on purpose: anyone may submit a proposal.
		const ungated: { title: string; gate?: NavGate }[] = [{ title: 'Speaking' }];
		expect(visibleNavItems(ungated, NOBODY)).toHaveLength(1);
	});
});

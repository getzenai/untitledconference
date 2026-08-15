import { describe, expect, it } from 'vitest';

import {
	isNavUrlCurrent,
	navDestinations,
	reviewQueueHref,
	type NavAccess,
	type NavGate,
	type NavLock
} from './nav-access';

const CREATE_ORG: NavLock = {
	reason: 'Create an organization to manage events and contacts',
	href: '/settings/organization/new'
};

/** The sidebar's real list, reduced to what the filter looks at. */
const ITEMS = [
	{ title: 'Events', gate: 'conferences' as const, unlock: CREATE_ORG },
	{ title: 'Contacts', gate: 'contacts' as const, unlock: CREATE_ORG },
	{ title: 'Speaking' },
	{ title: 'Reviewing', gate: 'reviewing' as const }
];

/** Someone with a seat but no rights: nothing is one form away for them. */
const NOBODY: NavAccess = {
	conferences: false,
	contacts: false,
	reviewing: false,
	reviewSlug: null,
	speakerProfile: false,
	organization: true
};

/** The reported case: a brand-new account, in no organization at all. */
const FRESH: NavAccess = { ...NOBODY, organization: false };

const titles = (access: NavAccess) => navDestinations(ITEMS, access).map((i) => i.title);

describe('sidebar destinations by relation', () => {
	it('leaves a speaker with Speaking alone', () => {
		// The reported symptom: someone who has never organized or reviewed was
		// offered Conferences, Contacts and Reviewing anyway.
		expect(titles(NOBODY)).toEqual(['Speaking']);
	});

	it('keeps all four for the person who is all three', () => {
		expect(titles({ ...NOBODY, conferences: true, contacts: true, reviewing: true })).toEqual([
			'Events',
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
		expect(titles({ ...NOBODY, conferences: true })).toEqual(['Events', 'Speaking']);
	});

	it('keeps the given order rather than grouping by gate', () => {
		expect(titles({ ...NOBODY, conferences: true, reviewing: true })).toEqual([
			'Events',
			'Speaking',
			'Reviewing'
		]);
	});

	it('shows an ungated item to everyone', () => {
		// Speaking has no gate on purpose: anyone may submit a proposal.
		const ungated: { title: string; gate?: NavGate }[] = [{ title: 'Speaking' }];
		expect(navDestinations(ungated, NOBODY)).toHaveLength(1);
	});
});

describe('the destinations a new account can unlock (#439)', () => {
	it('shows a brand-new account the whole product, with the two it must open itself', () => {
		// The symptom: one entry on day one, three after creating an organization,
		// and nothing to say the rest existed.
		expect(titles(FRESH)).toEqual(['Events', 'Contacts', 'Speaking']);
	});

	it('carries the reason and the form on the locked entries only', () => {
		const locks = navDestinations(ITEMS, FRESH).map((i) => [i.title, i.lock?.href ?? null]);
		expect(locks).toEqual([
			['Events', '/settings/organization/new'],
			['Contacts', '/settings/organization/new'],
			['Speaking', null]
		]);
	});

	it('never locks Reviewing, because no form makes you a reviewer', () => {
		// Somebody has to invite you, so a permanently locked entry would be noise.
		expect(titles(FRESH)).not.toContain('Reviewing');
	});

	it('hides what a colleague has to grant, once there is an organization', () => {
		// A plain member of an existing org is not one form away from anything —
		// pointing them at "create an organization" would be a second company.
		expect(titles(NOBODY)).toEqual(['Speaking']);
	});

	it('drops the lock the moment the gate opens', () => {
		const open = navDestinations(ITEMS, { ...FRESH, conferences: true });
		expect(open.find((i) => i.title === 'Events')?.lock).toBeNull();
	});
});

describe('which Contacts sub-item is current (#420)', () => {
	const directory = '/contacts';
	const sourcing = '/contacts/pipeline';
	const enrollment = '/contacts/pipeline#pipeline-enroll';
	const group = [directory, sourcing, enrollment];
	const swapped = [enrollment, sourcing, directory];

	it('lights Directory on the list and on a contact, not on the pipeline', () => {
		expect(isNavUrlCurrent('/contacts', directory, group)).toBe(true);
		expect(isNavUrlCurrent('/contacts/abc', directory, group)).toBe(true);
		expect(isNavUrlCurrent('/contacts/pipeline', directory, group)).toBe(false);
		expect(isNavUrlCurrent('/contacts/pipeline', directory, swapped)).toBe(false);
	});

	it('lights Sourcing on the pipeline, not when the hash is Enrollment', () => {
		expect(isNavUrlCurrent('/contacts/pipeline', sourcing, group)).toBe(true);
		expect(isNavUrlCurrent('/contacts/pipeline', sourcing, group, '#pipeline-enroll')).toBe(false);
		expect(isNavUrlCurrent('/contacts', sourcing, group)).toBe(false);
		expect(isNavUrlCurrent('/contacts/abc', sourcing, swapped)).toBe(false);
	});

	it('lights Enrollment only when the hash is present', () => {
		expect(isNavUrlCurrent('/contacts/pipeline', enrollment, group, '#pipeline-enroll')).toBe(true);
		expect(isNavUrlCurrent('/contacts/pipeline', enrollment, swapped, '#pipeline-enroll')).toBe(
			true
		);
		expect(isNavUrlCurrent('/contacts/pipeline', enrollment, group)).toBe(false);
		expect(isNavUrlCurrent('/contacts', enrollment, group, '#pipeline-enroll')).toBe(false);
	});
});

describe('reviewQueueHref', () => {
	it('names the conference when there is exactly one', () => {
		// A list of one is a click that buys nothing. Naming it on the link
		// skips `/review`'s 303, which is a full second render (#373).
		expect(reviewQueueHref('devflow-conf-2027')).toBe('/review/devflow-conf-2027');
	});

	it('keeps the list URL when there is no single conference to name', () => {
		expect(reviewQueueHref(null)).toBe('/review');
	});
});

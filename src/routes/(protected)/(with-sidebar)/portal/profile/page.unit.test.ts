/**
 * The speaker's profile page.
 *
 * The behaviour worth pinning here is the part that is easy to lose in a
 * refactor: one form per organization (the profile is org-wide, so merging them
 * would overwrite both), and the stored links coming back into the boxes they
 * were typed into.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const profile = (over: Partial<Record<string, unknown>> = {}) => ({
	id: 7,
	organizationId: 'org-1',
	organizationName: 'Northwind Events',
	name: 'Priya Raman',
	sortName: 'Raman, Priya',
	email: 'priya@example.test',
	jobTitle: 'Staff Engineer',
	company: 'Northwind',
	bio: 'Works on build systems.',
	links: null,
	headshotUrl: null,
	...over
});

const draw = (profiles: ReturnType<typeof profile>[], form: unknown = null) =>
	render(Page, {
		props: {
			data: {
				profiles,
				account: { name: 'Priya Raman', email: 'priya@example.test' }
			},
			form
		} as never
	}).body;

describe('the speaker profile page', () => {
	it('offers the fields a speaker owns, and says the email is not one of them', () => {
		const body = draw([profile()]);

		expect(body).toContain('name="name"');
		expect(body).toContain('name="jobTitle"');
		expect(body).toContain('name="company"');
		expect(body).toContain('name="bio"');
		expect(body).toContain('action="?/save"');
		// The address is what an unclaimed profile is matched on, so it is stated
		// rather than editable — see `updateOwnProfile`.
		expect(body).toContain('Your email address is set by the account you signed in with.');
		expect(body).not.toContain('name="email"');
	});

	it('names who is signed in, which the portal never used to say anywhere', () => {
		expect(draw([profile()])).toContain('Priya Raman');
	});

	it('puts stored links back in their boxes', () => {
		const body = draw([
			profile({ links: '[{"label":"Mastodon","url":"https://mastodon.social/@p"}]' })
		]);

		expect(body).toContain('Mastodon');
		expect(body).toContain('https://mastodon.social/@p');
		// The rows are a fixed set, so the empty ones still have to be drawn.
		expect(body).toContain('name="linkUrl2"');
	});

	it('draws one form per organization and names them, because the profile is org-wide', () => {
		const body = draw([
			profile(),
			profile({ id: 8, organizationId: 'org-2', organizationName: 'Southwind Conf' })
		]);

		expect(body.match(/action="\?\/save"/g) ?? []).toHaveLength(2);
		expect(body).toContain('Northwind Events');
		expect(body).toContain('Southwind Conf');
		// Each form has to carry its own id or one save would write the other row.
		expect(body).toContain('value="7"');
		expect(body).toContain('value="8"');
	});

	it('does not label the single-profile case with an organization heading', () => {
		expect(draw([profile()])).not.toContain('Northwind Events');
	});

	it('tells a speaker with no profile why, instead of showing an empty form', () => {
		const body = draw([]);

		expect(body).toContain('You do not have a speaker profile yet');
		expect(body).not.toContain('action="?/save"');
	});

	it('offers the headshot upload, and a way to take one down', () => {
		expect(draw([profile()])).toContain('action="?/headshot"');
		expect(draw([profile()])).not.toContain('action="?/removeHeadshot"');

		const withPhoto = draw([profile({ headshotUrl: '/speaker-photo/7?v=1' })]);
		expect(withPhoto).toContain('action="?/removeHeadshot"');
		expect(withPhoto).toContain('/speaker-photo/7?v=1');
	});

	it('reports a rejected save against the profile it belongs to', () => {
		const body = draw([profile(), profile({ id: 8, organizationName: 'Southwind Conf' })], {
			profileId: 8,
			error: 'That is not a link we can publish.'
		});

		expect(body).toContain('That is not a link we can publish.');
		expect(body.match(/That is not a link we can publish\./g) ?? []).toHaveLength(1);
	});
});

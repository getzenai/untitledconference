/**
 * The speaker's profile page.
 *
 * The behaviour worth pinning here is the part that is easy to lose in a
 * refactor: one form per organization (the profile is org-wide, so merging them
 * would overwrite both), and the stored links coming back into the boxes they
 * were typed into.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '+page.svelte'), 'utf8');

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	beforeNavigate: vi.fn()
}));

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
				account: { name: 'Priya Raman', email: 'priya@example.test' },
				user: { id: 'ada', name: 'Priya Raman', email: 'priya@example.test' }
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

	it('gives each link row its own example, so three empty rows are not one field thrice', () => {
		const body = draw([profile()]);

		expect(body).toContain('placeholder="LinkedIn"');
		expect(body).toContain('placeholder="Mastodon"');
		expect(body).toContain('placeholder="Your site"');
		// The failure this replaces: the same hint on every row.
		expect(body.match(/placeholder="LinkedIn"/g) ?? []).toHaveLength(1);
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

	it('does not offer to remove a seed placeholder that looks like initials', () => {
		// Priya's demo row stores `/speakers/lovelace.svg`, which draws "PR" —
		// the same letters the no-photo fallback uses. #618 is that button.
		const body = draw([profile({ headshotUrl: '/speakers/lovelace.svg' })]);
		expect(body).not.toContain('action="?/removeHeadshot"');
		expect(body).toContain('/speakers/lovelace.svg');
	});

	it('names JPEG, PNG and WebP before the picker, and accepts them by extension', () => {
		const body = draw([profile()]);
		expect(body).toContain('JPEG, PNG or WebP');
		// A MIME-only accept greys out a `.PNG` the OS cannot map to a UTI (#625).
		expect(body).toMatch(/accept="[^"]*\.png[^"]*"/);
		expect(body).toMatch(/accept="[^"]*image\/png[^"]*"/);
	});

	/**
	 * #495: removing the headshot deleted it on one click, and the circle looks
	 * the same afterwards — picture and initials fill the same space — so nothing
	 * on the page could tell a speaker what they had just done. The dialog is a
	 * client-side control, so what is checked here is the wiring: one named form
	 * per profile, and the confirm button reaching it from outside its subtree.
	 */
	it('guards removing the headshot, per profile', () => {
		const body = draw([
			profile({ headshotUrl: '/speaker-photo/7?v=1' }),
			profile({ id: 8, organizationName: 'Southwind Conf', headshotUrl: '/speaker-photo/8?v=1' })
		]);

		expect(body).toContain('id="remove-headshot-7"');
		expect(body).toContain('id="remove-headshot-8"');
		expect(source).toContain('data-testid="remove-headshot-dialog"');
		expect(source).toContain('form="remove-headshot-{profile.id}"');
		expect(source).toContain('confirmRemoveHeadshot = profile.id;');
		// Uploading a new picture overwrites nothing a speaker cannot redo, so it
		// stays a single click. Only the delete asks.
		expect(source.match(/confirmRemoveHeadshot = profile\.id;/g)).toHaveLength(1);
	});

	it('parks the typed fields from portalProfileFieldScope, not the roster or a contact', () => {
		expect(source).toContain('BrowserDraftInput');
		expect(source).toContain('portalProfileFieldScope');
		expect(source).toContain("portalProfileFieldScope(profile.id, 'name')");
		expect(source).toContain("portalProfileFieldScope(profile.id, 'bio')");
		expect(source).toContain('`linkUrl${i}`');
		expect(source).toContain('rows={5}');
		expect(source).toContain('PORTAL_PROFILE_LEAVE_PROMPT');
		expect(source).toContain('UnsavedGuard');
		expect(source).not.toContain('speakerFieldScope');
		expect(source).not.toContain('contactFieldScope');
		// The file picker is a byte upload, not a typed draft. Email is not a field.
		expect(source).toContain('type="file"');
		expect(source).toContain('name="headshot"');
		expect(source).not.toContain('name="email"');
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

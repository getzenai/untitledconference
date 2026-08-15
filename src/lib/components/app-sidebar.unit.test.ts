/**
 * #62 removed the starter team switcher. The product wordmark may occupy the
 * same region, but unlike that old no-op it must be a real route home.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'app-sidebar.svelte'), 'utf8');

describe('app sidebar starter cleanup', () => {
	it('renders a product home link instead of the starter team switcher', () => {
		// Starter labels that used to sit in Sidebar.Header.
		expect(source).not.toMatch(/Zen AI/);
		expect(source).not.toMatch(/>Enterprise</);
		expect(source).not.toContain('href="##"');
		expect(source).toContain('Sidebar.Header');
		expect(source).toContain('data-testid="sidebar-home-link"');
		expect(source).toContain('href="/home"');
		expect(source).toContain('untitledconference');
	});

	it('hides the wordmark when the rail is icon-collapsed (#620)', () => {
		// truncate still paints the first letter in a 3rem rail.
		expect(source).toContain('group-data-[collapsible=icon]:hidden');
	});

	it('wears the same goose as the landing page (#562)', () => {
		// Signing in must not change the bird. Both surfaces render one component,
		// so there is a single drawing and nothing to keep in sync by hand.
		expect(source).toContain("import Goose from '$lib/components/goose.svelte'");
		expect(source).toContain('<Goose silent');
		// A honking button inside the home link would be a control nobody can use.
		expect(source).not.toContain('/mascot/');

		// The body path the front door pins in its own test — one drawing, two places.
		const goose = readFileSync(join(here, 'goose.svelte'), 'utf8');
		expect(goose).toContain('M50 4C60 4 66 11 66 21');
	});

	it('is icon-collapsible and pins the account menu in the footer (#410)', () => {
		expect(source).toContain("collapsible = 'icon'");
		expect(source).toContain('Sidebar.Footer');
		expect(source).toContain('NavUser');
		// Conference destinations ride along in the mobile sheet; desktop has
		// ConferenceSidebar. One list (`NavConference`), not a second <aside>.
		// The landmark lives on Sidebar.Root (`aria-label="Application"`).
		expect(source).toContain('NavConference');
		expect(source).toContain('isConferencePath(page.url.pathname)');
		expect(source).toContain('aria-label="Application"');
		expect(source).not.toMatch(/<aside[\s>]/);
	});

	it('nests Sourcing and Enrollment under Contacts (#420)', () => {
		// The pipeline was only a button on the directory. Both views now sit
		// under Contacts; the gate stays on the parent so a locked account
		// still sees one create-org link, not three.
		expect(source.match(/gate: 'contacts'/g)).toHaveLength(1);
		expect(source).toMatch(/title: 'Directory'[\s\S]*url: '\/contacts'/);
		expect(source).toContain("url: '/contacts/pipeline'");
		expect(source).toContain("url: '/contacts/pipeline#pipeline-enroll'");
	});

	it('takes the reviewing item from reviewSlug, not a hard-coded /review (#373)', () => {
		// The module-level list still says /review (the list of many). The
		// derived items overwrite that when navAccess names exactly one
		// conference, so the common reviewer never hits the 303.
		expect(source).toContain('reviewQueueHref(navAccess.reviewSlug)');
	});
});

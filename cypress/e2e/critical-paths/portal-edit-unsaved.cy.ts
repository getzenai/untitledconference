/**
 * Leaving the portal edit page must not silently throw typed work away (#747).
 *
 * The page itself offers ← Back to the proposal above the form. Until this
 * spec, that link, the sidebar, and the browser's back button each emptied
 * the field with no warning and no parked copy. A unit test cannot see a
 * real navigation keep or refuse a value; only here can "the text is still
 * there" be observed at all.
 *
 * The three leave paths share one policy: ask, and keep the typed value in
 * this browser. Confirming leave is not confirming loss.
 */
const uniqueSlug = () => `portal-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parkedCopy = (abstract: string) => (storage: Storage) => {
	const found = Object.keys(storage).some((key) => {
		if (!key.startsWith('unsaved-form-draft:')) return false;
		return (storage.getItem(key) ?? '').includes(abstract);
	});
	expect(found, 'the typed abstract is parked before we leave').to.eq(true);
};

const openStoredDraft = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/settings`);
	cy.waitForHydration();
	cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
	cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

	cy.visit(`/manage/${slug}/cfp`);
	cy.waitForHydration();
	cy.contains('button', 'Create the call for papers').click();
	cy.get('[data-testid="cfp-publish"]').click();
	cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

	cy.logout();
	cy.createAndLogin();
	cy.visit(`/c/${slug}/cfp`);
	cy.waitForHydration();
	cy.get('input[name="title"]').clear().type('A draft the edit page must not throw away');
	cy.contains('button', 'Save as draft').click();
	cy.location('pathname', { timeout: 20000 }).should('match', /^\/portal\/submissions\/\d+$/);
};

const typeUnsavedAbstract = (abstract: string) => {
	cy.contains('a', 'Finish this proposal').click();
	cy.location('pathname').should('match', /\/edit$/);
	cy.waitForHydration();
	cy.get('textarea[name="abstract"]').clear().type(abstract);
	cy.window().its('localStorage').should(parkedCopy(abstract));
};

describe('Leaving a portal proposal edit', () => {
	it('keeps a typed abstract after Back to the proposal and return', () => {
		const slug = uniqueSlug();
		const abstract = `LIVE portal unsaved back ${Date.now()}`;

		openStoredDraft(slug);
		typeUnsavedAbstract(abstract);

		cy.get('[data-testid="portal-edit-back"]').click();
		cy.location('pathname', { timeout: 10000 }).should('match', /^\/portal\/submissions\/\d+$/);
		cy.waitForHydration();

		cy.contains('a', 'Finish this proposal').click();
		cy.waitForHydration();
		cy.get('[data-testid="portal-edit-restored"]').should('be.visible');
		cy.get('textarea[name="abstract"]').should('have.value', abstract);
	});

	it('stays on the page with the typed abstract when the warning is cancelled', () => {
		const slug = uniqueSlug();
		const abstract = `LIVE portal unsaved cancel ${Date.now()}`;

		openStoredDraft(slug);
		typeUnsavedAbstract(abstract);

		const asked: string[] = [];
		cy.on('window:confirm', (text: string) => {
			asked.push(text);
			return false;
		});
		cy.get('[data-testid="portal-edit-back"]').click();

		cy.location('pathname').should('match', /\/edit$/);
		cy.get('textarea[name="abstract"]').should('have.value', abstract);
		cy.wrap(asked).should('have.length', 1);
		cy.wrap(asked)
			.its(0)
			.should('match', /your proposal edit/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /this browser on this device/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /clearing your browser data/i);
		cy.wrap(asked).its(0).should('not.match', /saved/i);
		cy.wrap(asked).its(0).should('not.match', /lose/);
	});

	it('keeps a typed abstract after the sidebar and after the browser back button', () => {
		const slug = uniqueSlug();
		const abstract = `LIVE portal unsaved nav ${Date.now()}`;

		openStoredDraft(slug);
		typeUnsavedAbstract(abstract);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname', { timeout: 10000 }).should('eq', '/home');

		cy.go('back');
		cy.waitForHydration();
		cy.get('textarea[name="abstract"]').should('have.value', abstract);

		cy.go('back');
		cy.location('pathname', { timeout: 10000 }).should('match', /^\/portal\/submissions\/\d+$/);
		cy.waitForHydration();

		cy.contains('a', 'Finish this proposal').click();
		cy.waitForHydration();
		cy.get('textarea[name="abstract"]').should('have.value', abstract);
	});
});

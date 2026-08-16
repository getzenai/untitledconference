/**
 * Start another must park like the first proposal (#815).
 *
 * The stay-hint is already on the second form. Until this spec, persist
 * returned on `data.existing` and a reload threw the typed title away.
 * A unit test can see two keys; only here can "the server never saw this
 * title, and after reload it is still in the second form" be observed.
 */
const uniqueSlug = () => `cfp-another-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const autosaveKey = (slug: string, owner: string, existingId?: number) => {
	const scope =
		existingId == null ? `cfp-autosave:${slug}` : `cfp-autosave:${slug}:another:${existingId}`;
	return `unsaved-form-draft:${encodeURIComponent(scope)}:${encodeURIComponent(owner)}`;
};

describe('Start another proposal on the public call', () => {
	it('keeps a title the server has never seen after reload, and leaves the first draft alone', () => {
		const slug = uniqueSlug();
		const firstTitle = `First draft the server already has ${Date.now()}`;
		const secondTitle = `LIVE815-second-${Date.now()}`;

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

		cy.createAndLogin().then((speaker) => {
			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();
			cy.get('input[name="title"]').clear().type(firstTitle);
			cy.get('input[name="speakerName"]').clear().type('Priya Shah');
			cy.get('input[name="speakerEmail"]').clear().type(speaker.email);
			cy.contains('button', /^Save as draft$/).click();
			cy.location('pathname', { timeout: 30000 }).should('match', /\/portal\/submissions\/\d+$/);

			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();
			cy.get('[data-testid="cfp-existing-draft"]').should('contain.text', firstTitle);
			cy.get('[data-testid="cfp-continue-draft"]')
				.should('have.attr', 'href')
				.then((href) => {
					const id = Number(String(href).match(/\/submissions\/(\d+)\//)?.[1]);
					expect(id, 'the first draft has an id the second key can carry').to.be.greaterThan(0);

					cy.get('[data-testid="cfp-start-another"]').click();
					cy.get('[data-testid="cfp-draft-hint"]').should(
						'contain.text',
						'Only what you filled in on this call will stay in this browser on this device.'
					);
					cy.get('input[name="title"]').should('be.visible').and('have.value', '');
					cy.get('input[name="title"]').type(secondTitle);

					cy.window()
						.its('localStorage')
						.should((storage: Storage) => {
							expect(storage.getItem(autosaveKey(slug, speaker.id, id))).to.contain(secondTitle);
							expect(storage.getItem(autosaveKey(slug, speaker.id)) ?? '').not.to.contain(
								secondTitle
							);
						});

					cy.reload();
					cy.waitForHydration();

					cy.get('[data-testid="cfp-existing-draft"]').should('contain.text', firstTitle);
					cy.get('input[name="title"]').should('have.value', secondTitle);
					cy.get('[data-testid="cfp-draft-hint"]').should(
						'contain.text',
						'Only what you filled in on this call will stay in this browser on this device.'
					);
				});
		});
	});
});

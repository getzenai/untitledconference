/**
 * The public call says "Drafts are saved." Leaving and coming back must
 * keep the typed abstract (#494).
 *
 * The sentence sits six lines above the first field and tells the speaker
 * they may wander off. Until this spec, only "Save as draft" at the bottom
 * of the page actually wrote anything — below the fold, and after they
 * had already trusted the sentence.
 *
 * A unit test cannot see this. The failure mode is navigation emptying
 * the form.
 */
const uniqueSlug = () => `cfp-autosave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const autosaveKey = (slug: string, owner: string) =>
	`unsaved-form-draft:${encodeURIComponent(`cfp-autosave:${slug}`)}:${encodeURIComponent(owner)}`;

describe('A typed proposal on the public call', () => {
	it('is still there after Agenda and Back', () => {
		const slug = uniqueSlug();
		const abstract = 'The agenda tab used to take this paragraph with it.';

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

		let speakerId = '';
		cy.createAndLogin().then((speaker) => {
			speakerId = speaker.id;
		});
		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();

		cy.get('input[name="title"]').clear().type('What leaving must not throw away');
		cy.get('textarea[name="abstract"]').clear().type(abstract);

		// The write is an effect, not the keystroke. Wait until storage has
		// it before leaving, or Back races the persist and the form is empty
		// for the reason we are here to stop.
		//
		// The key carries the account since #505: what is parked here is a name,
		// an email and a bio, and the next person on this browser is a different
		// speaker, not the same one.
		cy.window()
			.its('localStorage')
			.should((storage: Storage) => {
				expect(storage.getItem(autosaveKey(slug, speakerId))).to.contain(abstract);
			});

		cy.get('[data-testid="conference-tabs"]').contains('a', 'Agenda').click();
		cy.location('pathname').should('eq', `/c/${slug}/agenda`);

		cy.go('back');
		cy.location('pathname').should('eq', `/c/${slug}/cfp`);
		cy.waitForHydration();

		cy.get('textarea[name="abstract"]').should('have.value', abstract);
		cy.get('input[name="title"]').should('have.value', 'What leaving must not throw away');
	});
});

/**
 * The shared machine (#505).
 *
 * Making "Drafts are saved" true (#494) moved the typed proposal into
 * `localStorage` — and the whole proposal is in there, name, email address,
 * job title and bio. `localStorage` is per browser, not per tab and not per
 * account. So a stranger typed on a library computer, was called away, and the
 * next person to open the same call — signed in as themselves — found the form
 * filled in with somebody else's proposal, one button away from sending it
 * under their own account.
 *
 * A unit test can show the keys are separate. Only the browser can show that
 * the second person's form comes up empty, because the failure was never in
 * the store: it was the page reading a copy that was not theirs.
 */
const uniqueSlug = () => `cfp-privacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A proposal parked by a signed-out stranger', () => {
	it('does not open in the form of the next person to sign in', () => {
		const slug = uniqueSlug();
		const abstract = 'Written by whoever sat here before you.';

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

		// The stranger: no account, types, never submits, walks away.
		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('input[name="title"]').clear().type('A talk nobody else should send');
		cy.get('textarea[name="abstract"]').clear().type(abstract);
		cy.get('input[name="speakerEmail"]').clear().type('stranger@example.test');
		cy.window()
			.its('localStorage')
			.should((storage: Storage) => {
				expect(storage.getItem(`cfp-autosaved-proposal:${slug}`)).to.contain(abstract);
			});

		// The next person on the same browser, signed in as themselves.
		cy.createAndLogin();
		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();

		cy.get('input[name="title"]').should('have.value', '');
		cy.get('textarea[name="abstract"]').should('have.value', '');
		cy.get('input[name="speakerEmail"]').should('not.have.value', 'stranger@example.test');

		// And it is not merely hidden from them: nobody can adopt it any more,
		// so it does not stay on the disk of a plainly shared machine.
		cy.window()
			.its('localStorage')
			.should((storage: Storage) => {
				expect(storage.getItem(`cfp-autosaved-proposal:${slug}`)).to.equal(null);
			});
	});

	it('says where a restored draft lives, and lets the reader throw it away', () => {
		const slug = uniqueSlug();
		const abstract = 'Typed here, kept here, and only here.';

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
		cy.get('input[name="title"]').clear().type('Mine, and I can drop it');
		cy.get('textarea[name="abstract"]').clear().type(abstract);
		cy.window()
			.its('localStorage')
			.should((storage: Storage) => {
				expect(storage.getItem(`cfp-autosaved-proposal:${slug}:u${speakerId}`)).to.contain(
					abstract
				);
			});

		// Coming back is where the page owes an explanation: the form fills
		// itself in, and the reader is entitled to know from where.
		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="cfp-resumed-local-draft"]').should('contain.text', 'in this browser');
		cy.get('textarea[name="abstract"]').should('have.value', abstract);

		cy.get('[data-testid="cfp-discard-draft"]').click();
		cy.get('textarea[name="abstract"]').should('have.value', '');
		cy.get('[data-testid="cfp-resumed-local-draft"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		cy.get('textarea[name="abstract"]').should('have.value', '');
	});
});

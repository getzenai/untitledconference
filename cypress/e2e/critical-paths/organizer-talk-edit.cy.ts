/**
 * The organizer's own edit of a talk's title and abstract, in a browser.
 *
 * The server rules have their own integration tests and the markup has SSR tests.
 * Two things neither can see:
 *
 *  1. **The panel is a toggle.** "Edit talk" only exists after hydration, so a
 *     server-rendered string cannot prove the form is reachable at all.
 *  2. **The edit survives the round trip.** Typing, saving, and finding the new
 *     text after a reload is the only proof that the browser's form reaches the
 *     action and the action reaches the database — the accepted talk here is
 *     exactly the case the speaker's own form no longer covers.
 */
const uniqueSlug = () => `talk-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Editing a talk as the organizer', () => {
	it('rewrites the title of an accepted talk and shows who changed it', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: ['A tlak about tests'] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', 'A tlak about tests').click();
		cy.waitForHydration();

		// Reading first: the common visit does not open a form over the abstract.
		cy.get('[data-testid="talk-content"]').within(() => {
			cy.get('form[action="?/content"]').should('not.exist');
			cy.contains('button', 'Edit talk').click();
			cy.get('input[name="title"]').clear().type('A talk about tests');
			cy.get('textarea[name="abstract"]').type('Written by the organizer.');
			cy.contains('button', 'Save talk').click();
		});

		// The heading is fed by the loader, so its new text means the write landed and
		// the page re-read it rather than the field merely holding what was typed.
		cy.contains('h1', 'A talk about tests').should('be.visible');

		cy.reload();
		cy.contains('Written by the organizer.').should('be.visible');
		cy.get('[data-testid="content-edit-trail"]').should('contain', 'Edited by');
	});

	it('keeps a refused edit on screen instead of restoring the stored text', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: ['Keeps its name'] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', 'Keeps its name').click();
		cy.waitForHydration();

		cy.get('[data-testid="talk-content"]').within(() => {
			cy.contains('button', 'Edit talk').click();
			cy.get('input[name="title"]').clear().type('Second thoughts');
			// An empty title is the one refusal reachable on a talk without an abstract.
			cy.get('input[name="title"]').clear();
			cy.get('input[name="title"]').invoke('attr', 'required', false);
			cy.contains('button', 'Save talk').click();

			cy.contains('A title is required.').should('be.visible');
			// The panel stays open, or the error names a field nobody can see.
			cy.get('form[action="?/content"]').should('exist');
		});

		cy.contains('h1', 'Keeps its name').should('be.visible');
	});
});

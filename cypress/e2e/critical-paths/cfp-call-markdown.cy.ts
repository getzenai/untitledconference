/**
 * The call page can carry a real call (#509).
 *
 * A two-thousand-word call has sections, emphasis and links out to the
 * conference and to past talks. Ours rendered one grey run of text: a pasted
 * URL was characters the reader had to select and copy, and `[text](url)` came
 * out with its brackets showing.
 *
 * A unit test can see the markup this produces. What it cannot see is that the
 * text an organizer actually types into the settings box survives the round
 * trip through the database and arrives on the public page as a heading and a
 * link somebody can click.
 */
const uniqueSlug = () => `cfp-markdown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A call written in markdown', () => {
	it('reaches the public page as headings, emphasis and links', () => {
		const slug = uniqueSlug();
		const call = [
			'## Session formats',
			'',
			'Talks are 25 or 45 minutes. Acceptance is **5-15%**.',
			'',
			'- See [past talks](https://ai.engineer/nyc).',
			'- Travel is covered.'
		].join('\n');

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

		cy.get('textarea[name="description"]').clear().type(call, { parseSpecialCharSequences: false });
		cy.contains('button', 'Save settings').click();

		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.logout();

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();

		// The section is a heading a reader can scan to, not a line of prose that
		// still shows the hashes that asked for it.
		cy.contains('h4', 'Session formats').should('exist');
		cy.contains('## Session formats').should('not.exist');

		cy.contains('strong', '5-15%').should('exist');

		// The one that decides whether this page is usable: a link is a link.
		cy.contains('a', 'past talks')
			.should('have.attr', 'href', 'https://ai.engineer/nyc')
			.and('have.attr', 'rel')
			.and('contain', 'noopener');
	});
});

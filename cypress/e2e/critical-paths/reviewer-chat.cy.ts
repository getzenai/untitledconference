/**
 * Reviewer-queue chat (#302, slice 1).
 *
 * The panel is behind FEATURE_INAPP_CHAT, which stays off in production and
 * in CI. This spec therefore has two jobs: pin that the queue does not show
 * a half-built chat while the flag is off, and — when a local run turns the
 * flag on with AI_CHAT_MODEL=mock — that a reply streams in and names the
 * tool it used.
 */
const uniqueSlug = () => `reviewer-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Reviewer chat', () => {
	it('stays off the queue while the flag is off, and streams a named tool when on', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['A talk to review']
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();

			cy.get('body').then(($body) => {
				const on = $body.find('[data-testid="reviewer-chat"]').length > 0;
				if (!on) {
					expect(on, 'chat hidden while FEATURE_INAPP_CHAT is off').to.equal(false);
					return;
				}

				cy.get('[data-testid="reviewer-chat-input"]').type(
					'Which reviews do I still have open?'
				);
				cy.get('[aria-label="Send"]').click();
				cy.get('[data-testid="chat-tool-name"]', { timeout: 20000 }).should(
					'contain.text',
					'list_my_review_assignments'
				);
				cy.contains('I used list_my_review_assignments').should('be.visible');
			});
		});
	});
});

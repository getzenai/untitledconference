/**
 * Reviewer-queue chat (#302, slice 1).
 *
 * The flag value comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * not from whether the panel happens to be in the DOM. Guessing from the
 * element under test cannot fail: a dead import, a 500, or a missed mount
 * would all look like "flag off".
 *
 * CI leaves the flag off. `FEATURE_INAPP_CHAT=true AI_CHAT_MODEL=mock` is
 * the local path that asserts the panel and a named tool.
 */
const uniqueSlug = () => `reviewer-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

function openReviewerQueue() {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
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
		return cy.wrap(slug);
	});
}

describe('Reviewer chat', () => {
	it('stays off the queue while FEATURE_INAPP_CHAT is off', function () {
		if (chatEnabled) this.skip();

		openReviewerQueue();
		cy.get('[data-testid="reviewer-chat"]').should('not.exist');
	});

	it('shows the panel and names the tool it used when the flag is on', function () {
		if (!chatEnabled) this.skip();

		openReviewerQueue();
		cy.get('[data-testid="reviewer-chat"]').should('exist');
		cy.get('[data-testid="reviewer-chat-input"]').type('Which reviews do I still have open?');
		cy.get('[aria-label="Send"]').click();
		cy.get('[data-testid="chat-pending"]').should('be.visible');
		cy.get('[data-testid="chat-tool-name"]', { timeout: 20000 }).should(
			'contain.text',
			'list_my_review_assignments'
		);
		cy.contains('I used list_my_review_assignments').should('be.visible');
	});

	it('surfaces a 503 instead of sitting silent when the assistant cannot start', function () {
		if (!chatEnabled) this.skip();

		openReviewerQueue().then((slug) => {
			cy.intercept('POST', `/review/${slug}/chat`, {
				statusCode: 503,
				body: 'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.',
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			});
			cy.get('[data-testid="reviewer-chat"]').should('exist');
			cy.get('[data-testid="reviewer-chat-input"]').type('Anything');
			cy.get('[aria-label="Send"]').click();
			cy.get('[data-testid="chat-error"]')
				.should('be.visible')
				.and('contain.text', 'AI Gateway is not configured');
		});
	});
});

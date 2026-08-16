/**
 * Consecutive tool calls fold behind one summary (#720).
 *
 * Same gate as the other assistant specs: the flag comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`). The mock treats
 * "Look up rooms, tracks and formats" as three read tools in one step
 * (see `src/lib/server/chat/model.ts`), so this spec never calls a provider.
 */
const uniqueSlug = () => `tool-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

function seedConference() {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				name: 'Tool Trace Summit',
				days: ['2028-05-10'],
				sessions: ['A talk to schedule']
			}
		})
			.its('status')
			.should('eq', 200);

		return cy.wrap(slug);
	});
}

function openAssistant() {
	cy.get('[data-testid="assistant-open"]').should('be.visible').click();
	cy.get('[data-testid="assistant-panel"]').should('be.visible');
	cy.get('[data-testid="assistant-input"]').should('not.be.disabled');
}

describe('Assistant tool trace', () => {
	it('groups several lookups behind one summary and expands a line to its JSON', function () {
		if (!chatEnabled) this.skip();

		seedConference().then((slug) => {
			cy.visit(`/manage/${slug}/dashboard`);
			cy.waitForHydration();
			openAssistant();

			cy.get('[data-testid="assistant-input"]').type('Look up rooms, tracks and formats');
			cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').click();
			cy.get('[data-testid="assistant-pending"]', { timeout: 20000 }).should('not.exist');

			cy.get('[data-testid="assistant-tool-summary"]')
				.should('be.visible')
				.and('contain.text', 'Used 3 tools');
			cy.get('[data-testid="assistant-tool-name"]').should('not.be.visible');

			cy.get('[data-testid="assistant-tool-summary"]').click();
			cy.get('[data-testid="assistant-tool-name"][data-tool-name="list_rooms"]').should(
				'be.visible'
			);
			cy.get('[data-testid="assistant-tool-name"][data-tool-name="list_rooms"]').click();
			cy.get('[data-testid="assistant-tool-detail"]')
				.should('be.visible')
				.and('contain.text', 'Input:')
				.and('contain.text', slug);
		});
	});
});

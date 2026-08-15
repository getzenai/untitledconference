/**
 * Organizer chat on the agenda board (#302, slice 3).
 *
 * Same rule as the reviewer spec: the flag value comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`), never from whether the
 * panel is in the DOM — a dead import or a 500 would read as "flag off".
 *
 * CI leaves the flag off. `FEATURE_INAPP_CHAT=true AI_CHAT_MODEL=mock` is the
 * local path that asserts the panel and a named tool.
 */
const uniqueSlug = () => `agenda-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

function openAgendaBoard() {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: ['A talk to schedule']
			}
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		return cy.wrap(slug);
	});
}

describe('Agenda chat', () => {
	it('stays off the board while FEATURE_INAPP_CHAT is off', function () {
		if (chatEnabled) this.skip();

		openAgendaBoard();
		cy.get('[data-testid="agenda-chat"]').should('not.exist');
	});

	it('shows the panel and names the tool it used when the flag is on', function () {
		if (!chatEnabled) this.skip();

		openAgendaBoard();
		cy.get('[data-testid="agenda-chat"]').should('exist');
		cy.get('[data-testid="agenda-chat-input"]').type('What is on the board?');
		cy.get('[data-testid="agenda-chat"] [aria-label="Send"]').click();
		cy.get('[data-testid="chat-pending"]').should('be.visible');
		cy.get('[data-testid="chat-tool-name"]', { timeout: 20000 }).should(
			'contain.text',
			'get_agenda'
		);
		cy.contains('I used get_agenda').should('be.visible');
	});

	it('surfaces a 503 instead of sitting silent when the assistant cannot start', function () {
		if (!chatEnabled) this.skip();

		openAgendaBoard().then((slug) => {
			cy.intercept('POST', `/manage/${slug}/agenda/chat`, {
				statusCode: 503,
				body: 'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.',
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			});
			cy.get('[data-testid="agenda-chat-input"]').type('Anything');
			cy.get('[data-testid="agenda-chat"] [aria-label="Send"]').click();
			cy.get('[data-testid="chat-error"]')
				.should('be.visible')
				.and('contain.text', 'AI Gateway is not configured');
		});
	});
});

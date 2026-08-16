/**
 * The agenda board's half of the one assistant (#302 slice 3, #683).
 *
 * The board no longer mounts a chat of its own. What it still owes the star is
 * the open day: the model is handed the whole registry, so "move it to 14:00"
 * is only a complete sentence if the page says which day is on screen. That is
 * what this spec watches — the body of the request the board's send produces.
 *
 * Same rule as before: the flag value comes from `scripts/run-e2e.sh`
 * (`CYPRESS_FEATURE_INAPP_CHAT`), never from whether the panel is in the DOM —
 * a dead import or a 500 would read as "flag off". CI sets the flag on the
 * E2E job (`lint_and_test.yaml`, since #693).
 */
const uniqueSlug = () => `agenda-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const DAY = '2028-05-10';

function openAgendaBoard() {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: [DAY],
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

function openAssistant() {
	cy.get('[data-testid="assistant-open"]').should('be.visible').click();
	cy.get('[data-testid="assistant-panel"]').should('be.visible');
	cy.get('[data-testid="assistant-input"]').should('not.be.disabled');
}

function sendAssistant(text: string) {
	cy.get('[data-testid="assistant-input"]').type(text);
	cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').click();
}

describe('Agenda board and the assistant', () => {
	it('mounts no chat of its own', function () {
		// True with the flag either way: the board's own panel is gone for good,
		// and the star is the layout's business, not this page's.
		openAgendaBoard();
		cy.get('[data-testid="agenda-chat"]').should('not.exist');
	});

	it('tells the assistant which day the board has open', function () {
		if (!chatEnabled) this.skip();

		openAgendaBoard().then((slug) => {
			openAssistant();

			cy.intercept('POST', '/chat', (req) => {
				const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
				expect(body.pageContext, 'pageContext is sent').to.be.an('object');
				expect(body.pageContext.params).to.deep.include({ slug });
				expect(body.pageContext.focus, 'the board publishes its open day').to.deep.include({
					day: DAY
				});
			}).as('assistantChat');

			sendAssistant('What is on the board?');
			cy.wait('@assistantChat');
			cy.get('[data-testid="assistant-tool-name"][data-tool-name="get_agenda"]', {
				timeout: 20000
			}).should('be.visible');
		});
	});

	it('surfaces a 503 instead of sitting silent when the assistant cannot start', function () {
		if (!chatEnabled) this.skip();

		openAgendaBoard();
		openAssistant();
		cy.intercept('POST', '/chat', {
			statusCode: 503,
			body: 'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.',
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
		sendAssistant('Anything');
		cy.get('[data-testid="assistant-error"]')
			.should('be.visible')
			.and('contain.text', 'AI Gateway is not configured');
	});
});

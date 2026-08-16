/**
 * Application-wide assistant (#682).
 *
 * Same rule as the per-surface specs: the flag value comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`), never from whether the
 * star is in the DOM — a dead import or a 500 would read as "flag off".
 *
 * CI leaves the flag off. `FEATURE_INAPP_CHAT=true AI_CHAT_MODEL=mock` is the
 * local path that asserts the sheet, send-time page context, and a write
 * approval. The mock treats `Rename the conference <slug> to <name>` as
 * `update_conference` so this spec never calls a real provider.
 */
const uniqueSlug = () => `assistant-panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

function seedConference(name: string) {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				name,
				days: ['2028-05-10'],
				sessions: ['A talk to schedule']
			}
		})
			.its('status')
			.should('eq', 200);

		return cy.wrap({ slug, name });
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

describe('Assistant panel', () => {
	it('stays off the app while FEATURE_INAPP_CHAT is off', function () {
		if (chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		cy.get('[data-testid="assistant-open"]').should('not.exist');
		cy.get('[data-testid="assistant-panel"]').should('not.exist');
	});

	it('opens the sheet from the star and closes it again', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
		cy.get('[data-testid="assistant-panel"]').contains('Close').click();
		cy.get('[data-testid="assistant-panel"]').should('not.be.visible');
		cy.get('[data-testid="assistant-open"]').should('be.visible');
	});

	it('sends the page context of the page the user is on, not the one the panel opened on', function () {
		if (!chatEnabled) this.skip();

		seedConference('Context Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/dashboard`);
			cy.waitForHydration();
			openAssistant();

			// The overlay sits above the rail, so the sheet has to close before
			// the client navigation. Closing does not remount the chat — the
			// launcher keeps it — which is the point: context is read at send.
			cy.get('[data-testid="assistant-panel"]').contains('Close').click();
			// Desktop rail and the mobile sheet both mount the same nav.
			cy.get('[data-testid="conference-nav-agenda"]:visible').click();
			cy.url().should('include', `/manage/${slug}/agenda`);
			cy.get('h1').should('contain.text', 'Agenda');
			openAssistant();

			cy.intercept('POST', '/chat', (req) => {
				const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
				expect(body.pageContext, 'pageContext is sent').to.be.an('object');
				expect(body.pageContext.title).to.eq('Agenda');
				expect(body.pageContext.url).to.include(`/manage/${slug}/agenda`);
				expect(body.pageContext.params).to.deep.include({ slug });
				expect(body.pageContext.routeId).to.include('agenda');
				expect(body.pageContext.title).to.not.eq('Dashboard');
				expect(body.pageContext.title).to.not.eq('Set up this event');
			}).as('assistantChat');

			sendAssistant('What is on this page?');
			cy.wait('@assistantChat');
		});
	});

	it('asks for approval before a write and declining runs nothing', function () {
		if (!chatEnabled) this.skip();

		const original = `Keep Name ${Date.now()}`;
		const renamed = `Denied Name ${Date.now()}`;

		seedConference(original).then(({ slug }) => {
			cy.visit('/home');
			cy.waitForHydration();
			cy.get('[data-testid="home-dashboard"]').should('contain.text', original);
			openAssistant();
			sendAssistant(`Rename the conference ${slug} to ${renamed}`);

			cy.get('[data-testid="assistant-approval"]').should('be.visible');
			cy.get('[data-testid="assistant-approval"]').should('contain.text', 'Update conference');
			cy.get('[data-testid="assistant-approval"]').should('contain.text', slug);
			cy.get('[data-testid="assistant-approval"]').should('contain.text', renamed);

			cy.get('[data-testid="assistant-deny"]').click();
			cy.get('[data-testid="assistant-denied"]').should('contain.text', 'Update conference');
			cy.get('[data-testid="home-dashboard"]').should('contain.text', original);
			cy.get('[data-testid="home-dashboard"]').should('not.contain.text', renamed);
		});
	});

	it('runs an approved write and refreshes the page behind the sheet', function () {
		if (!chatEnabled) this.skip();

		const original = `Old Name ${Date.now()}`;
		const renamed = `New Name ${Date.now()}`;

		seedConference(original).then(({ slug }) => {
			cy.visit('/home');
			cy.waitForHydration();
			cy.get('[data-testid="home-dashboard"]').should('contain.text', original);
			openAssistant();
			sendAssistant(`Rename the conference ${slug} to ${renamed}`);

			cy.get('[data-testid="assistant-approval"]').should('be.visible');
			cy.get('[data-testid="assistant-approve"]').click();

			// The sheet stays open; the name on the hub behind it is the page
			// data, not the transcript.
			cy.get('[data-testid="home-dashboard"]').should('contain.text', renamed);
			cy.get('[data-testid="home-dashboard"]').should('not.contain.text', original);
		});
	});
});

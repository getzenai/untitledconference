/**
 * The scorecard's half of the one assistant (#690).
 *
 * The star is told which submission and which round the reviewer is looking at
 * by one `$effect` on this page. Delete it and every unit test stays green —
 * store, parser and `bindReviewerFocus` all pass with an empty focus — and
 * "write this up as a 4" lands in the first open round, silently.
 *
 * This spec opens a talk the reviewer holds in *two* open rounds, switches to
 * the second, and checks the request the send produces. A test that only
 * asked "is there a roundId" would pass with the wrong one, which is the bug.
 *
 * Same flag rule as `agenda-chat.cy.ts`: the value comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`), never from whether the
 * panel is in the DOM. CI sets the flag on the E2E job (`lint_and_test.yaml`,
 * since #693).
 */
const uniqueSlug = () => `scorecard-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const TALK = 'Score this in finals';
const FIRST_ROUND = 'Screening';
const SECOND_ROUND = 'Finals';

function openScorecardOnSecondRound() {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: [TALK],
				sessionStatus: 'submitted'
			}
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/rounds`);
		cy.waitForHydration();
		cy.get('form[action="?/add"] input[name="name"]').type(FIRST_ROUND);
		cy.contains('button[type="submit"]', 'Add round').click();
		cy.get('[data-testid="round-summary"]').should('contain.text', 'Open');
		cy.get('form[action="?/add"] input[name="name"]').clear().type(SECOND_ROUND);
		cy.contains('button[type="submit"]', 'Add round').click();
		cy.get('[data-testid="round-row"]').should('have.length', 2);

		cy.visit(`/manage/${slug}/people`);
		cy.waitForHydration();
		cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
		cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
		cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.get('[data-testid="assignment-round"]').should('have.length', 2);
		// Each assign is a form POST that replaces the document. Re-query
		// after hydration — a held `$round` is gone.
		cy.get('[data-testid="assignment-round"]').eq(0).contains('button', 'Assign').click();
		cy.waitForHydration();
		cy.get('[data-testid="assignment-round"]').eq(0).should('contain.text', 'Unassign');
		cy.get('[data-testid="assignment-round"]').eq(1).contains('button', 'Assign').click();
		cy.waitForHydration();
		cy.get('[data-testid="assignment-round"]').eq(1).should('contain.text', 'Unassign');

		cy.visit(`/review/${slug}`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.contains(`[data-testid^="round-link-"]`, SECOND_ROUND).click();
		cy.waitForHydration();
		cy.contains(`[data-testid^="round-link-"]`, SECOND_ROUND).should(
			'have.attr',
			'aria-current',
			'page'
		);

		return cy.url().then((url) => {
			const submissionId = /\/review\/[^/]+\/(\d+)/.exec(url)?.[1];
			expect(submissionId, 'scorecard URL names the submission').to.match(/^\d+$/);
			return cy
				.contains(`[data-testid^="round-link-"]`, FIRST_ROUND)
				.invoke('attr', 'data-testid')
				.then((firstTestId) => {
					const firstRoundId = firstTestId?.replace('round-link-', '');
					return cy
						.contains(`[data-testid^="round-link-"]`, SECOND_ROUND)
						.invoke('attr', 'data-testid')
						.then((secondTestId) => {
							const secondRoundId = secondTestId?.replace('round-link-', '');
							expect(secondRoundId, 'finals has an id').to.match(/^\d+$/);
							expect(secondRoundId, 'finals is not the first open round').to.not.equal(
								firstRoundId
							);
							return { slug, submissionId: submissionId!, firstRoundId, secondRoundId };
						});
				});
		});
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

describe('Scorecard and the assistant', () => {
	it('mounts no chat of its own', function () {
		openScorecardOnSecondRound();
		cy.get('[data-testid="reviewer-chat"]').should('not.exist');
	});

	it('tells the assistant the round on screen, not the first open one', function () {
		if (!chatEnabled) this.skip();

		openScorecardOnSecondRound().then(({ slug, submissionId, firstRoundId, secondRoundId }) => {
			openAssistant();

			cy.intercept('POST', '/chat', (req) => {
				const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
				expect(body.pageContext, 'pageContext is sent').to.be.an('object');
				expect(body.pageContext.params).to.deep.include({ slug, submissionId });
				expect(body.pageContext.focus, 'the scorecard publishes its selection').to.be.an('object');
				expect(
					body.pageContext.focus.roundId,
					'the round on screen, not whichever is first'
				).to.equal(secondRoundId);
				expect(body.pageContext.focus.roundId).to.not.equal(firstRoundId);
				expect(body.pageContext.focus.submissionId).to.equal(submissionId);
			}).as('assistantChat');

			sendAssistant('Write this up as a 4');
			cy.wait('@assistantChat');
		});
	});
});

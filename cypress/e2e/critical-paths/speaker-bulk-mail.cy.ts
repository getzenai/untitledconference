/**
 * SPK-13 through the organizer's real surface.
 *
 * The database test proves `queueSpeakerMail` applies conference and status
 * predicates. What it cannot prove is that the status chip, hidden form fields,
 * enhanced action and dashboard log remain wired together in a browser. This
 * spec makes the counts disagree on purpose: two confirmed speakers have mail,
 * one confirmed speaker does not, and one invited speaker has mail. A broken
 * filter therefore cannot accidentally produce the expected answer.
 *
 * `scripts/run-e2e.sh` removes the Resend variables before the preview starts.
 * The resulting queued state is deliberate evidence, not a provider mock hidden
 * inside the product code, and no synthetic address can leave the test machine.
 */
const uniqueSlug = () => `speaker-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Speaker bulk mail', () => {
	let slug: string;
	let suffix: string;

	beforeEach(() => {
		slug = uniqueSlug();
		suffix = slug.slice('speaker-mail-'.length);

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: [], sessions: [] }
			})
				.its('status')
				.should('eq', 200);

			addSpeaker('Ada Confirmed', `ada-${suffix}@example.test`, 'confirmed');
			addSpeaker('Priya Confirmed', `priya-${suffix}@example.test`, 'confirmed');
			addSpeaker('No Address', '', 'confirmed');
			addSpeaker('Ivan Invited', `ivan-${suffix}@example.test`, 'invited');
		});
	});

	const addSpeaker = (name: string, email: string, status: 'confirmed' | 'invited') => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/add`,
			form: true,
			headers: { Origin: Cypress.config('baseUrl') },
			body: { name, email, status }
		})
			.its('status')
			.should('eq', 200);
	};

	it('sends one message to every address in the current status filter', () => {
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		// All four exist before filtering. Otherwise two queued rows could be a
		// fixture accident rather than proof that the recipient set is correct.
		cy.get('[data-testid="speaker-row"]').should('have.length', 4);
		cy.contains('[data-testid="speakers-status-chips"] a', 'confirmed (3)').click();
		cy.url().should('include', 'status=confirmed');
		cy.get('[data-testid="speaker-row"]').should('have.length', 3);

		cy.get('[data-testid="speaker-mail-compose"]')
			.should('contain', '2 recipients with an email address in the current filter')
			.within(() => {
				cy.get('[data-testid="speaker-mail-subject"]').type('Arrival details');
				cy.get('[data-testid="speaker-mail-body"]').type('Please reply with your travel time.');
				cy.get('[data-testid="speaker-mail-submit"]')
					.should('contain', 'Send to 2 speakers')
					.click();
			});

		cy.get('[data-testid="speakers-message"]')
			.should('contain', '2 emails queued')
			.and('contain', '1 without email skipped');

		// The visible audit trail is the organizer's evidence of who was contacted.
		cy.visit(`/manage/${slug}/dashboard`);
		cy.contains('section h2', /^Mail$/)
			.parents('section')
			.first()
			.within(() => {
				cy.contains(`ada-${suffix}@example.test`).should('exist');
				cy.contains(`priya-${suffix}@example.test`).should('exist');
				cy.contains(`ivan-${suffix}@example.test`).should('not.exist');
				cy.get('li')
					.should('have.length', 2)
					.each(($row) => expect($row).to.contain.text('Arrival details'));
				cy.contains('2 queued · 0 sent · 0 failed').should('exist');
			});
	});
});

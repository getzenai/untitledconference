/**
 * Organizer states speaker expenses; an accepted speaker still reads them
 * after the call has closed (#512).
 *
 * The unit tests pin the three coverage shapes and the unset case. This is
 * the other half of the done-when: the same statement travels from the
 * settings form, through the public call, onto the portal of someone who
 * has already been accepted — which is when they start booking, and when
 * the free-text description has already disappeared.
 */
const uniqueSlug = () => `cfp-support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Speaker expenses on the call', () => {
	it('lets an organizer set them and an accepted speaker read them after close', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					name: 'Support Conf',
					days: ['2028-05-10'],
					sessions: ['Build systems without the wait'],
					speakerUserId: user.id
				}
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

		cy.get('[data-testid="cfp-speaker-support-fields"]').should('exist');
		cy.chooseFromAppSelect('app-select-admission', 'Free for speakers');
		cy.chooseFromAppSelect('app-select-travelKind', 'Up to an amount');
		cy.get('input[name="travelAmount"]').clear().type('an economy flight');
		cy.chooseFromAppSelect('app-select-accommodationKind', 'Case by case');
		cy.get('input[name="accommodationDomesticNights"]').clear().type('2');
		cy.get('input[name="accommodationInternationalNights"]').clear().type('3');
		cy.get('input[name="supportConditions"]').clear().type('for selected speakers');
		cy.get('textarea[name="description"]').clear().type('What we are looking for this year.');

		cy.contains('button', 'Save settings').click();
		cy.contains('Call for papers updated.').should('exist');
		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-support"]').should('be.visible');
		cy.get('[data-testid="speaker-support-admission"]').should('contain.text', 'Free for speakers');
		cy.get('[data-testid="speaker-support-travel"]').should(
			'contain.text',
			'Covered up to an economy flight'
		);
		cy.get('[data-testid="speaker-support-accommodation"]').should(
			'contain.text',
			'2 nights domestic, 3 nights international, covered case by case'
		);
		cy.get('[data-testid="speaker-support-conditions"]').should(
			'contain.text',
			'for selected speakers'
		);

		// The pitch decides whether someone submits at all, so it comes first and
		// the money answer sits under it (#591).
		cy.contains('What we are looking for this year.').then(($intro) => {
			cy.get('[data-testid="speaker-support"]').then(($support) => {
				expect(
					$intro[0].compareDocumentPosition($support[0]) & Node.DOCUMENT_POSITION_FOLLOWING
				).to.be.greaterThan(0);
			});
		});

		// The plain promise, without an amount to write out in words (#591).
		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.chooseFromAppSelect('app-select-travelKind', 'Covered');
		cy.contains('button', 'Save settings').click();
		cy.contains('Call for papers updated.').should('exist');

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-support-travel"]').should('have.text', 'Covered');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('[data-testid="cfp-close"]').click();
		cy.get('[data-testid="cfp-closed-banner"]', { timeout: 20000 }).should('exist');

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('This call has closed').should('exist');
		cy.get('[data-testid="speaker-support"]').should('be.visible');
		cy.get('[data-testid="speaker-support-admission"]').should('contain.text', 'Free for speakers');

		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', 'Build systems without the wait').click();
		cy.location('pathname').should('match', /^\/portal\/submissions\/\d+$/);
		cy.get('[data-testid="speaker-support"]').should('be.visible');
		cy.get('[data-testid="speaker-support-admission"]').should('contain.text', 'Free for speakers');
		cy.get('[data-testid="speaker-support-travel"]').should('have.text', 'Covered');
		cy.get('[data-testid="speaker-support-conditions"]').should(
			'contain.text',
			'for selected speakers'
		);
	});
});

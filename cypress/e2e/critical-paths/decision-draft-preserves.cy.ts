/**
 * #755: the acceptance call must not eat the sentence the committee just wrote.
 *
 * Each case takes a different ordinary exit. Returning and then reloading proves
 * the copy lives beyond the DOM that originally held it; the prompt alone would
 * only protect the cancel path and leave the confirmed-leave path broken.
 */
const uniqueSlug = () => `dec755-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A decision still being argued';

describe('Decision notes survive leaving the meeting', () => {
	let slug: string;
	let decisions: string;

	beforeEach(() => {
		slug = uniqueSlug();
		decisions = `/manage/${slug}/decisions`;

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK],
					sessionStatus: 'submitted',
					reviewed: [TALK]
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	const reopenAndReload = (testId: string, text: string) => {
		cy.visit(decisions);
		cy.waitForHydration();
		cy.get('[data-testid="decision-draft-restored"]').should('be.visible');
		cy.get(`[data-testid="${testId}"]`).should('have.value', text);

		cy.reload();
		cy.waitForHydration();
		cy.get(`[data-testid="${testId}"]`).should('have.value', text);
	};

	it('keeps an accept condition through the page link and reload', () => {
		const text = 'Bring the customer on stage';
		cy.visit(decisions);
		cy.waitForHydration();
		cy.get('[data-testid="accept-condition-text"]').type(text);

		cy.get(`a[href="/manage/${slug}/submissions"]`).filter(':visible').first().click();
		cy.location('pathname').should('eq', `/manage/${slug}/submissions`);

		reopenAndReload('accept-condition-text', text);
	});

	it('keeps resubmit guidance through browser Back and reload', () => {
		const text = 'Show the migration with real production numbers';
		cy.visit('/home');
		cy.visit(decisions);
		cy.waitForHydration();
		cy.get('[data-testid="resubmit-guidance-text"]').type(text);

		cy.go('back');
		cy.location('pathname').should('eq', '/home');

		reopenAndReload('resubmit-guidance-text', text);
	});

	it('keeps a decline note through the application sidebar and reload', () => {
		const text = 'Closest one we had; bring the case study next year';
		cy.visit(decisions);
		cy.waitForHydration();
		cy.get('[data-testid="decline-note-text"]').type(text);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		reopenAndReload('decline-note-text', text);
	});
});

/**
 * #757/#758: organizer text should survive the ordinary decision to look
 * somewhere else before saving. Reopening and then reloading distinguishes a
 * browser draft from a value that merely stayed alive in the old component.
 */
const uniqueSlug = () => `org-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Organizer form drafts', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps the CFP introduction through a sidebar click and reload', () => {
		const text = 'Tell us how the session changes what the audience does on Monday.';

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.get('[data-testid="cfp-intro-text"]').clear().type(text);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('[data-testid="cfp-intro-restored"]').should('be.visible');
		cy.get('[data-testid="cfp-intro-text"]').should('have.value', text);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="cfp-intro-text"]').should('have.value', text);
	});

	it('keeps room, track and format names through a sidebar click and reload', () => {
		const drafts = {
			'settings-new-rooms': 'Main hall',
			'settings-new-tracks': 'Applied AI',
			'settings-new-formats': 'Deep dive, 45'
		};

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		for (const [testId, text] of Object.entries(drafts)) {
			cy.get(`[data-testid="${testId}"]`).type(text);
		}

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		for (const [testId, text] of Object.entries(drafts)) {
			cy.get(`[data-testid="${testId}-restored"]`).should('be.visible');
			cy.get(`[data-testid="${testId}"]`).should('have.value', text);
		}

		cy.reload();
		cy.waitForHydration();
		for (const [testId, text] of Object.entries(drafts)) {
			cy.get(`[data-testid="${testId}"]`).should('have.value', text);
		}
	});

	it('restores an invalid format together with its validation error', () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-new-formats"]').type('Workshop, 5000');

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();

		cy.get('[data-testid="settings-new-formats"]')
			.should('have.value', 'Workshop, 5000')
			.and('have.attr', 'aria-invalid', 'true');
		cy.get('[data-testid="settings-new-formats-error"]')
			.should('be.visible')
			.and('contain', 'Minutes must be between 1 and 1440');
	});
});

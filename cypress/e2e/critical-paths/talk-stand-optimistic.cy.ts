/**
 * #721: advancing a stand on the talk paints the next name before the
 * action replies, and a refused write puts the badge back with a reason.
 * That form used to take the page-wide `busy` lock. One request flies
 * for the talk; a second click waits and is sent on the server stand.
 */
const uniqueSlug = () => `ts721-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk in the editorial loop';

const openTalk = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: [TALK],
				sessionStatus: 'accepted'
			}
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();

		cy.get('[data-testid="editorial-stand"]').should('exist');
		cy.chooseFromAppSelect('editorial-stand-select', 'Materials requested');
		cy.get('[data-testid="set-editorial-stand"]').click();
		cy.get('[data-testid="submission-editorial-stand"]')
			.should('contain', 'Materials requested')
			.and('have.attr', 'data-stand', 'materials_requested');
	});
};

describe('Advancing a stand on a talk', () => {
	it('paints the next stand before the action replies', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) }, (req) => {
			req.on('response', (res) => {
				res.setDelay(2500);
			});
		}).as('slowAdvance');

		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.get('[data-testid="submission-editorial-stand"]', { timeout: 800 }).should(
			'have.attr',
			'data-stand',
			'received'
		);
		cy.get('[data-testid="set-editorial-stand"]').should('not.be.disabled');
		cy.get('[data-testid="advance-editorial-stand"]').should('contain', 'reviewed');

		cy.wait('@slowAdvance');
		cy.get('[data-testid="submission-editorial-stand"]').should(
			'have.attr',
			'data-stand',
			'received'
		);
		cy.get('[data-testid="advance-editorial-stand"]').should('contain', 'reviewed');
	});

	it('rolls the badge back and shows the reason when the write is refused', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		cy.intercept(
			{ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) },
			{ statusCode: 500, body: 'nope' }
		).as('failedAdvance');

		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.wait('@failedAdvance');
		cy.get('[data-testid="submission-editorial-stand"]').should(
			'have.attr',
			'data-stand',
			'materials_requested'
		);
		cy.get('[data-testid="stand-write-error"]').should('be.visible');
	});

	it('keeps the clicked stands when a second advance flies while the first is in flight', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) }, (req) => {
			req.on('response', (res) => {
				res.setDelay(2500);
			});
		}).as('advance');

		cy.get('[data-testid="advance-editorial-stand"]').click();
		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.get('[data-testid="submission-editorial-stand"]', { timeout: 800 }).should(
			'have.attr',
			'data-stand',
			'reviewed'
		);

		cy.wait('@advance');
		cy.wait('@advance');
		cy.get('[data-testid="submission-editorial-stand"]').should(
			'have.attr',
			'data-stand',
			'reviewed'
		);
	});

	it('applies the waiting advance on the server stand when the first write is refused', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		let seen = 0;
		cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) }, (req) => {
			seen += 1;
			if (seen === 1) {
				req.reply({ statusCode: 500, delay: 2500, body: 'nope' });
				return;
			}
			req.continue();
		}).as('advances');

		cy.get('[data-testid="advance-editorial-stand"]').click();
		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.wait('@advances');
		cy.wait('@advances');
		cy.get('[data-testid="submission-editorial-stand"]').should(
			'have.attr',
			'data-stand',
			'received'
		);
	});
});

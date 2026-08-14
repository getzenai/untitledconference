/**
 * The public agenda's day switcher on a phone (#392).
 *
 * The bug this pins was not a broken control — every arrow always moved the
 * selected day correctly. It was a layout that told the visitor something false:
 * at 390 px the three day labels wrapped to one line each while the arrows stayed
 * vertically centred beside the block, so ← and → sat level with the *middle*
 * day. Whoever read the row read "these arrows belong to Thursday".
 *
 * So this spec asserts geometry, not behaviour: the boxes the browser actually
 * lays out, at the width a phone actually has. A screenshot would catch the same
 * thing and then need a human to look at it; rectangles fail by themselves.
 *
 * The desktop half of the assertion is here for the same reason: the fix is a
 * breakpoint, and a breakpoint that swallows the tabs at every width would also
 * make the phone assertion pass.
 */
const uniqueSlug = () => `day-switcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A box is "on the same line" as another when their vertical spans overlap. */
const overlapsVertically = (a: DOMRect, b: DOMRect) => a.top < b.bottom && b.top < a.bottom;

describe('Agenda day switcher on a phone', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					// Three days is the smallest fixture that can put an arrow next to a
					// day that is neither the first nor the selected one.
					days: ['2028-05-10', '2028-05-11', '2028-05-12'],
					sessions: ['Fixture Talk A']
				}
			})
				.its('status')
				.should('eq', 200);
		});

		// A fixture conference is a draft, and a draft has no public site. The
		// visitor journey starts at the switch the organizer flips.
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Publish')
			.click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');
	});

	it('keeps both arrows level with the selected day at 390 px', () => {
		cy.viewport(390, 844);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		// Only the selected day is offered on a phone — nothing left to wrap.
		cy.get('[data-testid="agenda-day"]:visible').should('have.length', 0);
		cy.get('[data-testid="agenda-day-selected"]').should('be.visible');

		cy.get('[data-testid="agenda-day-selected"]').then(($day) => {
			const day = $day[0].getBoundingClientRect();

			cy.get('[aria-label="Previous day"]').then(($prev) => {
				expect(
					overlapsVertically($prev[0].getBoundingClientRect(), day),
					'previous arrow'
				).to.equal(true);
			});
			cy.get('[aria-label="Next day"]').then(($next) => {
				expect(overlapsVertically($next[0].getBoundingClientRect(), day), 'next arrow').to.equal(
					true
				);
			});
		});

		// The ends of the range still say so, which is what makes stepping usable
		// when stepping is the only way across.
		cy.get('[aria-label="Previous day"]').should('be.disabled');
		cy.get('[aria-label="Next day"]').should('not.be.disabled');
		cy.get('[aria-label="Next day"]').click().click();
		cy.get('[aria-label="Next day"]').should('be.disabled');
		cy.get('[aria-label="Previous day"]').should('not.be.disabled');
	});

	it('still offers every day as a tab on a desktop width', () => {
		cy.viewport(1280, 800);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		cy.get('[data-testid="agenda-day-switcher"] [role="tab"]:visible').should('have.length', 3);

		cy.get('[data-testid="agenda-day-selected"]').then(($day) => {
			const day = $day[0].getBoundingClientRect();
			cy.get('[data-testid="agenda-day"]').each(($other) => {
				expect(
					overlapsVertically($other[0].getBoundingClientRect(), day),
					'day tab on one line'
				).to.equal(true);
			});
		});
	});
});

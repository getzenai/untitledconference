/**
 * #869: a floating star must not land in a home card. The live miss
 * was 4 px of Upload headshot under Ask Guus at 390. The case checks
 * the rectangles, not a start coordinate — 48 is today's gap, not
 * the property.
 *
 * A card that sits above the star would pass without a fix (#729).
 * The task is scrolled into the star's band first, then the boxes
 * must not meet. elementFromPoint on the star's midpoint hits the
 * star. 768 and 1280 stay put.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `home869-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

function openHomeWithTask() {
	cy.createAndLogin().then((speaker) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: speaker.id,
				slug: uniqueSlug(),
				days: ['2028-05-10'],
				sessions: ['A talk that needs a headshot'],
				speakerUserId: speaker.id
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit('/home');
	cy.waitForHydration();
	cy.get('[data-testid="home-dashboard"]').should('exist');
	cy.get('[data-testid="home-task"]').should('exist');
}

describe('The assistant and a home task card', () => {
	it('leaves the card free of the star at 390 and keeps the star put at 768 and 1280', function () {
		if (!chatEnabled) this.skip();

		openHomeWithTask();

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="assistant-open"]').should('be.visible');

		// At rest the task sits in the star's band — the live miss, not a
		// scroll we arranged. A card that never reaches the band would
		// pass without a fix (#729).
		cy.get('[data-testid="assistant-open"]').then(($star) => {
			cy.get('[data-testid="home-task"]').should(($card) => {
				const card = $card[0].getBoundingClientRect();
				const star = $star[0].getBoundingClientRect();
				const overlap =
					card.left < star.right &&
					card.right > star.left &&
					card.top < star.bottom &&
					card.bottom > star.top;
				expect(
					card.top < star.bottom && card.bottom > star.top,
					'the card reaches the star band so a miss would show'
				).to.equal(true);
				expect(overlap, 'the card and the assistant do not share pixels').to.equal(false);

				const x = star.left + star.width / 2;
				const y = star.top + star.height / 2;
				const hit = $star[0].ownerDocument.elementFromPoint(x, y);
				expect(
					hit && hit.closest('[data-testid="assistant-open"]'),
					'the star midpoint hits the star'
				).to.not.equal(null);
			});
		});

		cy.viewport(TABLET.width, TABLET.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			const contentWidth = $star[0].ownerDocument.documentElement.clientWidth;
			expect(box.width, 'star size at 768').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 768').to.be.closeTo(contentWidth, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 768').to.be.closeTo(
				$star[0].ownerDocument.documentElement.clientHeight / 2,
				1
			);
		});

		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			const contentWidth = $star[0].ownerDocument.documentElement.clientWidth;
			expect(box.width, 'star size at 1280').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 1280').to.be.closeTo(contentWidth, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 1280').to.be.closeTo(
				$star[0].ownerDocument.documentElement.clientHeight / 2,
				1
			);
		});
	});
});

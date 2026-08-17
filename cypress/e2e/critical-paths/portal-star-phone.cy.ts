/**
 * #875: a floating star must not land on Confirm participation at 390
 * on /portal. #873 reserved the column on /home; /portal still had the
 * same 4 px under Ask Guus, because the reservation was opt-in per page.
 *
 * Confirm participation is the anchor, not the star midpoint. The
 * midpoint was green at #870 because the element had no width. The
 * link is scrolled into the star's band first — at rest it sits
 * above, and a miss above the band would go green (#729). 768 and
 * 1280 stay put.
 *
 * Flip the new `:has([data-assistant-star])` rule back and the
 * shared-pixel line falls. `pageFits` is not in this spec.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `port875-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

function openPortalWithParticipation() {
	cy.createAndLogin().then((speaker) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: speaker.id,
				slug: uniqueSlug(),
				days: ['2028-05-10'],
				sessions: ['A talk that needs a speaker'],
				speakerUserId: speaker.id
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit('/portal');
	cy.waitForHydration();
	cy.contains('a', 'Confirm participation').should('be.visible');
}

describe('The assistant and a portal task', () => {
	it('leaves Confirm participation free of the star at 390 and keeps the star put at 768 and 1280', function () {
		if (!chatEnabled) this.skip();

		openPortalWithParticipation();

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="assistant-open"]').should('be.visible');

		// At rest Confirm participation sits above the star. Scroll it into
		// the band so a miss would show (#729). The width is the #870 trap:
		// a 0-wide box would make every later line green for the wrong reason.
		cy.get('[data-testid="assistant-open"]').then(($star) => {
			cy.contains('a', 'Confirm participation').then(($link) => {
				const star0 = $star[0].getBoundingClientRect();
				const link0 = $link[0].getBoundingClientRect();
				const delta = star0.top + star0.height / 2 - (link0.top + link0.height / 2);
				$link[0].ownerDocument.defaultView?.scrollBy(0, delta);
			});

			cy.contains('a', 'Confirm participation').should(($link) => {
				const link = $link[0].getBoundingClientRect();
				const star = $star[0].getBoundingClientRect();
				expect(star.width, 'the star has a box to measure').to.be.greaterThan(1);
				expect(link.width, `Confirm participation width ${link.width}`).to.be.greaterThan(1);
				expect(
					link.top < star.bottom && link.bottom > star.top,
					'the link reaches the star band so a miss would show'
				).to.equal(true);

				const overlap =
					link.left < star.right &&
					link.right > star.left &&
					link.top < star.bottom &&
					link.bottom > star.top;
				expect(
					overlap,
					`Confirm participation (${link.width}×${link.height} at ${link.left}) and the assistant do not share pixels`
				).to.equal(false);
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

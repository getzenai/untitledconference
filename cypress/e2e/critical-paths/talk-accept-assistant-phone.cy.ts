/**
 * #857: since #854 the four verbs wrap on a phone, and Accept lands in
 * line two — under the floating assistant. The wrap is right; the star
 * has to move. A tap on Accept must hit Accept, not Guus.
 *
 * Only a browser can prove the hit target: the classes sit on both
 * elements either way. The live miss is the right edge of Accept, not
 * its centre — elementFromPoint there, plus the two boxes sharing no
 * pixels. 768 and 1280 are the guard: the star stays where it was.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `acc857-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk waiting on a decision';

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

function openTalk(slug: string) {
	cy.createAndLogin().then((organizer) => {
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
	});

	cy.visit(`/manage/${slug}/submissions`);
	cy.waitForHydration();
	cy.contains('a', TALK).click();
	cy.waitForHydration();
	cy.get('[data-testid="decision-actions"]').should('exist');
}

describe('The assistant and Accept on a talk', () => {
	it('leaves Accept tappable at 390 and keeps the star put at 768 and 1280', function () {
		if (!chatEnabled) this.skip();

		const slug = uniqueSlug();
		openTalk(slug);

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="assistant-open"]').should('be.visible');
		cy.contains('[data-testid="decision-actions"] button', 'Accept').should('be.visible');

		// The star sits on the right edge and covers the last stretch of
		// Accept, not its geometric centre — "Accep" is what the live
		// picture showed. A tap on that stretch is the one that hits Guus.
		cy.get('[data-testid="assistant-open"]').then(($star) => {
			cy.contains('[data-testid="decision-actions"] button', 'Accept').should(($accept) => {
				const accept = $accept[0].getBoundingClientRect();
				const star = $star[0].getBoundingClientRect();
				const overlap =
					accept.left < star.right &&
					accept.right > star.left &&
					accept.top < star.bottom &&
					accept.bottom > star.top;
				expect(overlap, 'Accept and the assistant do not share pixels').to.equal(false);

				const x = accept.right - 4;
				const y = accept.top + accept.height / 2;
				const hit = $accept[0].ownerDocument.elementFromPoint(x, y);
				expect(
					hit && hit.closest('[data-testid="assistant-open"]'),
					'the right edge of Accept is not the assistant'
				).to.equal(null);
				expect(
					$accept[0] === hit || $accept[0].contains(hit),
					'that same point lands on Accept'
				).to.equal(true);
			});
		});

		// Same star as before the wrap: vertically centred, on the right edge.
		cy.viewport(TABLET.width, TABLET.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			expect(box.width, 'star size at 768').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 768').to.be.closeTo(TABLET.width, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 768').to.be.closeTo(
				TABLET.height / 2,
				1
			);
		});

		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			expect(box.width, 'star size at 1280').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 1280').to.be.closeTo(DESKTOP.width, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 1280').to.be.closeTo(
				DESKTOP.height / 2,
				1
			);
		});
	});
});

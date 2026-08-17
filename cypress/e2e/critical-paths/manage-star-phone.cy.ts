/**
 * #884: the conference shell is the other half of the reservation.
 * `(with-sidebar)` already carries `data-after-star`. `manage/[slug]`
 * did not, so the agenda measured NO SUCH ELEMENT while the star
 * still sat on it.
 *
 * The column is the same 44 px `/portal` gets. The Agenda heading is
 * the finger-sized anchor — width and height measured, not believed
 * as `> 0`. A 1×1 ghost would be #870 the other way around.
 *
 * Leave the attribute. Set the reserved `padding-left` to 0. Then
 * the 44 px line falls and `left ≥ 44` falls with it. Removing the
 * attribute only proves the hook exists.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `mgr884-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

describe('The assistant column on the conference shell', () => {
	it('gives the agenda the same 44 px column /portal already has', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin().then((organizer) => {
			const slug = uniqueSlug();
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['A talk on the grid']
				}
			})
				.its('status')
				.should('eq', 200)
				.then(() => {
					cy.viewport(PHONE.width, PHONE.height);
					cy.visit(`/manage/${slug}/agenda`);
					cy.waitForHydration();
					cy.get('[data-testid="assistant-open"]').should('be.visible');
					cy.contains('h1', 'Agenda').should('be.visible');

					// The heading sits in the page header, not in the star's
					// vertical band. The column is the thing that was missing.
					cy.get('[data-after-star]').should(($col) => {
						const pad = getComputedStyle($col[0]).paddingLeft;
						expect(pad, 'the conference shell reserves the same 44 px column').to.equal('44px');
					});

					cy.contains('h1', 'Agenda').should(($h) => {
						const box = $h[0].getBoundingClientRect();
						expect(box.width, `Agenda heading width ${box.width}`).to.be.at.least(16);
						expect(box.height, `Agenda heading height ${box.height}`).to.be.at.least(16);
						expect(box.left, 'Agenda starts after the reserved column').to.be.at.least(44);
					});

					cy.viewport(TABLET.width, TABLET.height);
					cy.get('[data-testid="assistant-open"]').should(($star) => {
						const box = $star[0].getBoundingClientRect();
						const contentWidth = $star[0].ownerDocument.documentElement.clientWidth;
						expect(box.width, 'star size at 768').to.be.closeTo(44, 1);
						expect(box.right, 'star on the right edge at 768').to.be.closeTo(contentWidth, 1);
					});

					cy.viewport(DESKTOP.width, DESKTOP.height);
					cy.get('[data-testid="assistant-open"]').should(($star) => {
						const box = $star[0].getBoundingClientRect();
						const contentWidth = $star[0].ownerDocument.documentElement.clientWidth;
						expect(box.width, 'star size at 1280').to.be.closeTo(44, 1);
						expect(box.right, 'star on the right edge at 1280').to.be.closeTo(contentWidth, 1);
					});
				});
		});
	});
});

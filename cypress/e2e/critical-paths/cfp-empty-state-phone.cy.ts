/**
 * #538: the very first screen of the CFP journey ran off the right edge of a
 * phone. Before a call exists, the page is one empty state with one form, and
 * that form put a fixed 288px field beside a 199px button in a row that never
 * wrapped — 495px of content in the 342px the page has to give.
 *
 * Only a browser can prove it: the classes sit on the element either way, what
 * changed is where the box lands. So the spec measures two things that fail
 * separately. The page must not scroll sideways at all — that is the symptom an
 * organizer feels — and the field itself must stay inside the page, because a
 * form that merely got clipped would satisfy the first check while the input
 * the organizer is meant to type in still sits off-screen.
 *
 * The desktop half is the guard on the fix: the row is supposed to be untouched
 * above the breakpoint, and `flex-wrap` on its own would happily wrap there too.
 */
const uniqueSlug = () => `cfp-empty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

describe('The call-for-papers empty state on a phone', () => {
	it('keeps the page and the title field inside the screen', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();

		// The empty state, not the builder: this only exists before a call is created.
		cy.contains('No call for papers yet').should('exist');

		cy.document().should((doc) => {
			const page = doc.documentElement;
			expect(page.scrollWidth, 'the page is no wider than the screen').to.be.at.most(
				page.clientWidth + 1
			);
		});

		cy.get('[data-testid="cfp-create-form"] input[name="title"]').should(($input) => {
			const field = $input[0].getBoundingClientRect();
			expect(field.left, 'the field starts on screen').to.be.at.least(-1);
			expect(field.right, 'the field ends on screen').to.be.at.most(PHONE.width + 1);
		});

		// Wrapping is what buys the room, so the button has to be under the field
		// rather than beside it — otherwise the two only fit because one shrank
		// into a tap target too small to hit.
		cy.get('[data-testid="cfp-create-form"]').should(($form) => {
			const field = $form.find('input[name="title"]')[0].getBoundingClientRect();
			const button = $form.find('button[type="submit"]')[0].getBoundingClientRect();
			expect(button.top, 'the button sits below the field').to.be.at.least(field.bottom - 1);
		});

		// Above the breakpoint the row is unchanged: one line, the field at its
		// fixed width.
		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.get('[data-testid="cfp-create-form"]').should(($form) => {
			const field = $form.find('input[name="title"]')[0].getBoundingClientRect();
			const button = $form.find('button[type="submit"]')[0].getBoundingClientRect();
			expect(field.width, 'the field keeps its 288px').to.be.closeTo(288, 1);
			expect(button.left, 'the button is beside the field').to.be.greaterThan(field.right - 1);
		});

		// And it still creates the call — the fix is a layout change, not a new form.
		cy.viewport(PHONE.width, PHONE.height);
		cy.contains('button', 'Create the call for papers').click();
		cy.get('[data-testid="cfp-publish-banner"]').should('exist');
	});
});

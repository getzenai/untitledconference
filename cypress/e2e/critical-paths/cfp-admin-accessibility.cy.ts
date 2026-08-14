/**
 * Two surfaces read by a machine that only has the accessibility tree (#475).
 *
 * Both findings were measured, not assumed: with the fix taken back out, axe
 * reports `label` twice on the call-for-papers editor (the preview's long-text
 * and file inputs, which have a visible caption above them and no label) and
 * `document-title` on both admin pages, where the tab keeps showing whatever
 * page came before.
 *
 * The button names are the part axe cannot see. Ten identically named `Remove`
 * buttons pass every rule — the inputs *are* labelled, all with the same word —
 * while a screen-reader user hears "Remove button" ten times and has to guess
 * which question goes away. So this spec asserts the names are distinct, not
 * merely present.
 *
 * Only the two rules that fired are asserted, same reasoning as
 * `dashboard-accessibility.cy.ts`: a blanket sweep would go red on an unrelated
 * addition and get disabled instead of fixed.
 */
import type { Result } from 'axe-core';
import 'cypress-axe';

const uniqueSlug = () => `a11y-cfp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const report = (violations: Result[]) => {
	for (const violation of violations) {
		cy.task(
			'log',
			`[axe] ${violation.id} (${violation.impact}) — ${violation.nodes
				.map((node) => `${node.target.join(' ')} :: ${node.html.slice(0, 160)}`)
				.join(' | ')}`
		);
	}
};

describe('Call for papers accessibility', () => {
	it('labels every preview field and names each question button after its question', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'] }
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/cfp`);
			cy.waitForHydration();
			cy.contains('button', 'Create the call for papers').click();
			cy.contains('h2', 'Settings').should('exist');

			// The two kinds that render an unlabelled control in the preview. A CFP
			// without them passes this rule while the real editor fails it.
			const addField = (label: string, kind: string) => {
				cy.get('form[action="?/addField"] input[name="label"]').clear().type(label);
				cy.get('form[action="?/addField"] [data-testid="app-select-kind"]').click();
				cy.get('[role="listbox"]:visible').within(() => {
					cy.contains('[role="option"]', kind).click();
				});
				cy.contains('form[action="?/addField"] button', 'Add field').click();
				cy.contains('summary', label).should('exist');
			};
			addField('Long answer', 'Long text');
			addField('Upload', 'File');

			cy.injectAxe();
			cy.checkA11y(undefined, { runOnly: { type: 'rule', values: ['label'] } }, report);

			// The fixed questions: one row per question, one button each.
			cy.get('[data-testid="cfp-fixed-questions"] button[type="submit"]').then((buttons) => {
				const names = [...buttons].map(
					(b) => b.getAttribute('aria-label') ?? b.textContent?.trim()
				);
				expect(names.length).to.be.greaterThan(1);
				expect(new Set(names).size, `distinct button names: ${JSON.stringify(names)}`).to.eq(
					names.length
				);
			});
		});
	});
});

describe('Admin page titles', () => {
	it('names both admin pages in the browser tab', () => {
		const stamp = Date.now();

		cy.createTestUser({ organizationName: `Admin Org ${stamp}` }).then((admin) => {
			cy.task('setUserRole', { email: admin.email, role: 'admin' });
			cy.login(admin.email, admin.password);

			cy.visit('/admin/users');
			cy.waitForHydration();
			cy.title().should('eq', 'Users — Admin');
			cy.injectAxe();
			cy.checkA11y(undefined, { runOnly: { type: 'rule', values: ['document-title'] } }, report);

			// Navigating within the app is the case that made this visible: without
			// a title of its own the tab keeps naming the page you just left.
			cy.visit('/admin/conferences');
			cy.waitForHydration();
			cy.title().should('eq', 'Front page listings — Admin');
			cy.injectAxe();
			cy.checkA11y(undefined, { runOnly: { type: 'rule', values: ['document-title'] } }, report);
		});
	});
});

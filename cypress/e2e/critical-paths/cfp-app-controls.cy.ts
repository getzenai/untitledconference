/**
 * The CFP builder's controls, in a browser (#124).
 *
 * Every `<select>` and `<input type="datetime-local">` on this screen is now a
 * shadcn control: a button, a portalled listbox, a calendar in a popover, and a
 * hidden input carrying what the native element used to carry. The SSR tests
 * beside the page pin those names; none of them can see the part that only
 * exists after hydration — the listbox opening, the pick landing in the hidden
 * input, and the value surviving a save.
 *
 * The disclosure logic is the other reason this runs in a browser. It used to be
 * `:has(option:checked)` in CSS, which a shadcn select cannot satisfy, so it
 * moved into component state. "Choose Dropdown and the options box appears" is
 * now a claim about running JavaScript, not about a stylesheet.
 */
const uniqueSlug = () => `cfp-controls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Open a shadcn select by its field name and take one of its options. */
const choose = (name: string, option: string) => {
	cy.get(`[data-testid="app-select-${name}"]`).first().click();
	cy.get('[role="option"]').contains(option).click();
};

describe('The call-for-papers builder without native controls', () => {
	it('saves a status picked from the app dropdown and a deadline picked from the calendar', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();

		// Nothing the browser drew itself is left on the page. Checked before the
		// calendar is opened on purpose: the shadcn calendar's month and year
		// dropdowns are native `<select>`s held at opacity 0 behind the label it
		// draws itself — the registry's own trick for keeping native keyboard and
		// mobile behaviour — and that is not what the complaint was about.
		cy.get('select').should('not.exist');
		cy.get('input[type="datetime-local"]').should('not.exist');

		choose('status', 'Published');
		cy.get('[data-testid="app-select-status"]').should('contain.text', 'Published');

		// The deadline: a day from the calendar, a time typed beside it. The
		// hidden input is what the action reads, so that is what is asserted —
		// `YYYY-MM-DDTHH:mm`, the string `datetime-local` used to post.
		cy.get('[data-testid="datetime-picker-closesAt"]').click();
		cy.get('[data-testid="datetime-picker-calendar-closesAt"]')
			.find('[data-bits-day]:not([data-outside-month]):not([data-disabled])')
			.first()
			.click();
		cy.get('[data-testid="datetime-picker-time-closesAt"]').clear().type('23:59');
		cy.get('[data-testid="datetime-picker-closesAt"]').click(); // close the popover

		cy.get('input[name="closesAt"]')
			.invoke('val')
			.should('match', /^\d{4}-\d{2}-\d{2}T23:59$/);

		cy.contains('button', 'Save settings').click();
		cy.contains('Call for papers updated.').should('exist');

		// The round trip is the point: reload and the page has to redisplay what
		// the server stored, through the same controls.
		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="app-select-status"]').should('contain.text', 'Published');
		cy.get('input[name="closesAt"]')
			.invoke('val')
			.should('match', /^\d{4}-\d{2}-\d{2}T23:59$/);
	});

	it('shows the options box only once the field is a dropdown', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();

		cy.get('textarea[name="options"]').should('not.exist');

		choose('kind', 'Dropdown');
		cy.get('textarea[name="options"]').should('exist').type('Beginner\nAdvanced');

		// And the condition controls, which used to be shown by the same CSS.
		// Both directions: appearing is half the claim, disappearing is the half
		// that decides what gets posted, because a hidden control is now an absent
		// one rather than a `display: none` one that still submits.
		cy.get('[name="conditionValueFormat"]').should('not.exist');
		choose('conditionSource', 'Only for session format…');
		cy.get('[name="conditionValueFormat"]').should('exist');
		choose('conditionSource', 'Always shown');
		cy.get('[name="conditionValueFormat"]').should('not.exist');

		// The field goes in with what the app controls chose: a dropdown, its
		// options, no rule.
		cy.get('input[name="label"]').last().type('Experience level');
		cy.contains('button', 'Add field').click();
		cy.contains('“Experience level” added.').should('exist');
		cy.contains('summary', 'Experience level').should('contain.text', 'Dropdown');
	});
});

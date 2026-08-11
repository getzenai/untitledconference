/**
 * Picking a date in the app's own calendar (#124).
 *
 * Fabian walked the product on 2026-08-11 and met the browser's native date
 * widget where every other control is shadcn. The field is now a trigger, a
 * popover and the shadcn calendar — which moves the value out of an input the
 * browser managed and into a hidden field this component writes.
 *
 * That is exactly why this test exists in a browser rather than beside the
 * component. The SSR tests prove the hidden input carries the right name and
 * the right `YYYY-MM-DD`; what they cannot prove is that clicking the 8th
 * writes the 8th, that the form posts it, and that it comes back after a
 * reload. A picker that shows the day before the one that was clicked — the
 * standard timezone accident — would pass every unit test in the repo.
 */
const uniqueSlug = () => `datepicker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Picking conference dates', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				// The fixture takes its range from the days, so the conference runs
				// 10–11 May 2028 and May 2028 is the month the calendar opens on.
				body: { userId: user.id, slug, days: ['2028-05-10', '2028-05-11'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	const openSettings = () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
	};

	const trigger = (name: string) => cy.get(`[data-testid="date-picker-${name}"]`);

	it('stores the day that was clicked, and shows it again after a reload', () => {
		openSettings();

		trigger('startsOn').should('contain.text', 'May 10, 2028').click();

		// Earlier than the current start, so the days holding the range stay
		// inside it and the action has nothing to refuse.
		cy.get('[data-bits-day][data-value="2028-05-08"]').click();

		trigger('startsOn').should('contain.text', 'May 8, 2028');
		cy.get('[data-testid="settings-dates"] input[name="startsOn"]').should(
			'have.value',
			'2028-05-08'
		);

		cy.get('[data-testid="settings-dates"]').contains('button', 'Save dates').click();
		cy.get('[data-testid="settings-message"]').should('exist');

		cy.reload();
		cy.waitForHydration();
		trigger('startsOn').should('contain.text', 'May 8, 2028');
		cy.get('[data-testid="settings-dates"] input[name="startsOn"]').should(
			'have.value',
			'2028-05-08'
		);
	});

	it('lets an optional date be taken back off', () => {
		// A native date input has the browser's own clear affordance; a popover has
		// none unless it is built. Without it a task deadline set by accident could
		// never be removed again.
		openSettings();

		cy.get('[data-testid="settings-task-templates"]').within(() => {
			trigger('dueOn').should('contain.text', 'Pick a date').click();
		});

		// Today, not a fixed date: an empty field opens on the current month, and
		// which day is picked does not matter here — the day that was clicked is
		// what the first test is about.
		cy.get('[data-bits-day][data-today]').click();
		cy.get('[data-testid="settings-task-templates"] input[name="dueOn"]')
			.invoke('val')
			.should('match', /^\d{4}-\d{2}-\d{2}$/);

		cy.get('[data-testid="settings-task-templates"]').within(() => {
			trigger('dueOn').click();
		});
		cy.get('[data-testid="date-picker-clear-dueOn"]').click();

		cy.get('[data-testid="settings-task-templates"] input[name="dueOn"]').should('have.value', '');
		cy.get('[data-testid="settings-task-templates"]')
			.find('[data-testid="date-picker-dueOn"]')
			.should('contain.text', 'Pick a date');
	});
});

describe('Starting a conference from an empty form', () => {
	/**
	 * The screen the feedback came from.
	 *
	 * Both fields are empty here, so the calendar has no stored month to open on
	 * and the trigger has no label — the state the settings page never shows. The
	 * claim is that the day picked on this page is the day the conference is
	 * created with, read back on a different page.
	 */
	it('carries the picked day through to the conference it creates', () => {
		const name = `Picker Conf ${Date.now()}`;

		cy.createAndLogin({ organizationName: 'Picker Org' });
		cy.setActiveOrganization('Picker Org');

		cy.visit('/manage/new');
		cy.waitForHydration();
		cy.get('input[name="name"]').clear().type(name);

		cy.get('[data-testid="date-picker-startsOn"]').should('contain.text', 'Pick a date').click();
		cy.get('[data-bits-day][data-today]').click();

		cy.get('[data-testid="date-picker-startsOn"]')
			.invoke('text')
			.then((picked) => {
				cy.get('input[name="startsOn"]').invoke('val').should('not.eq', '');
				cy.contains('button', 'Create conference').click();

				cy.location('pathname', { timeout: 30000 }).should('match', /^\/manage\/[^/]+\//);
				cy.location('pathname').then((path) => {
					cy.visit(`/manage/${path.split('/')[2]}/settings`);
					cy.waitForHydration();
					cy.get('[data-testid="date-picker-startsOn"]').should('contain.text', picked.trim());
				});
			});
	});
});

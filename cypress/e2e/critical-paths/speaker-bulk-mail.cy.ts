/**
 * SPK-13 through the organizer's real surface.
 *
 * The database test proves `queueSpeakerMail` applies conference and status
 * predicates. What it cannot prove is that the status chip, hidden form fields,
 * enhanced action and dashboard log remain wired together in a browser. This
 * spec makes the counts disagree on purpose: two confirmed speakers have mail,
 * one confirmed speaker does not, and one invited speaker has mail. A broken
 * filter therefore cannot accidentally produce the expected answer.
 *
 * `scripts/run-e2e.sh` removes the Resend variables before the preview starts.
 * The resulting queued state is deliberate evidence, not a provider mock hidden
 * inside the product code, and no synthetic address can leave the test machine.
 */
const uniqueSlug = () => `speaker-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Speaker bulk mail', () => {
	let slug: string;
	let suffix: string;

	beforeEach(() => {
		slug = uniqueSlug();
		suffix = slug.slice('speaker-mail-'.length);

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: [], sessions: [] }
			})
				.its('status')
				.should('eq', 200);

			addSpeaker('Ada Confirmed', `ada-${suffix}@example.test`, 'confirmed');
			addSpeaker('Priya Confirmed', `priya-${suffix}@example.test`, 'confirmed');
			addSpeaker('No Address', '', 'confirmed');
			addSpeaker('Ivan Invited', `ivan-${suffix}@example.test`, 'invited');
		});
	});

	const addSpeaker = (name: string, email: string, status: 'confirmed' | 'invited') => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/add`,
			form: true,
			headers: { Origin: Cypress.config('baseUrl') },
			body: { name, email, status }
		})
			.its('status')
			.should('eq', 200);
	};

	it('sends one message to every address in the current status filter', () => {
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		// All four exist before filtering. Otherwise two queued rows could be a
		// fixture accident rather than proof that the recipient set is correct.
		cy.get('[data-testid="speaker-row"]').should('have.length', 4);
		// One filter control, not a chip row beside it (#552): pick the status and
		// it applies itself.
		cy.get('[data-testid="speakers-status-filter"]').click();
		cy.get('[role="option"]').contains('Confirmed (3)').click();
		cy.url().should('include', 'status=confirmed');
		cy.get('[data-testid="speaker-row"]').should('have.length', 3);

		// Compose lives behind a dialog (issue #220): open it, then fill and send.
		cy.get('[data-testid="speaker-mail-open"]').click();
		cy.get('[data-testid="speaker-mail-compose"]')
			.should('contain', '2 recipients with an email address in the current filter')
			.within(() => {
				cy.get('[data-testid="speaker-mail-subject"]').type('Arrival details');
				cy.get('[data-testid="speaker-mail-body"]').type('Please reply with your travel time.');
				cy.get('[data-testid="speaker-mail-submit"]')
					.should('contain', 'Send to 2 speakers')
					.click();
			});

		// The dialog must close on success — the confirmation then sits on the
		// page, not behind a still-open overlay. Without this, a successful send
		// reads as "nothing happened" and invites a double-send (#220 review).
		cy.get('[data-testid="speaker-mail-compose"]').should('not.exist');

		cy.get('[data-testid="speakers-message"]')
			.should('contain', '2 emails queued')
			.and('contain', '1 without email skipped');

		// The visible audit trail is the organizer's evidence of who was contacted.
		cy.visit(`/manage/${slug}/dashboard`);
		cy.contains('section h2', /^Mail$/)
			.parents('section')
			.first()
			.within(() => {
				cy.contains(`ada-${suffix}@example.test`).should('exist');
				cy.contains(`priya-${suffix}@example.test`).should('exist');
				cy.contains(`ivan-${suffix}@example.test`).should('not.exist');
				cy.get('li')
					.should('have.length', 2)
					.each(($row) => expect($row).to.contain.text('Arrival details'));
				cy.contains('2 queued · 0 sent · 0 failed').should('exist');
			});
	});

	/**
	 * Escape must not cost a written message (#435).
	 *
	 * The dialog's own documented way out unmounts the form, and the form held
	 * the only copy of the text. This can only be seen in a browser: the fields
	 * render fine either way, and what is being tested is whether they still
	 * carry anything after the component that drew them has been destroyed and
	 * rebuilt.
	 */
	it('keeps a half-written message when the dialog is dismissed', () => {
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		cy.get('[data-testid="speaker-mail-open"]').click();
		cy.get('[data-testid="speaker-mail-compose"]').within(() => {
			cy.get('[data-testid="speaker-mail-subject"]').type('Arrival details');
			cy.get('[data-testid="speaker-mail-body"]').type('Please reply with your travel time.');
		});

		cy.get('body').type('{esc}');
		cy.get('[data-testid="speaker-mail-compose"]').should('not.exist');

		cy.get('[data-testid="speaker-mail-open"]').click();
		cy.get('[data-testid="speaker-mail-compose"]').within(() => {
			cy.get('[data-testid="speaker-mail-subject"]').should('have.value', 'Arrival details');
			cy.get('[data-testid="speaker-mail-body"]').should(
				'have.value',
				'Please reply with your travel time.'
			);
		});
	});

	/**
	 * A sent message must not come back (#435).
	 *
	 * Keeping the draft and clearing it after a send are the same feature seen
	 * from both ends: the second one is what stops the next mail from opening
	 * pre-filled with the last one and going out twice.
	 */
	it('starts empty again after the message has gone out', () => {
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		cy.get('[data-testid="speaker-mail-open"]').click();
		cy.get('[data-testid="speaker-mail-compose"]').within(() => {
			cy.get('[data-testid="speaker-mail-subject"]').type('Room change');
			cy.get('[data-testid="speaker-mail-body"]').type('We moved to the main hall.');
			cy.get('[data-testid="speaker-mail-submit"]').click();
		});
		cy.get('[data-testid="speaker-mail-compose"]').should('not.exist');
		cy.get('[data-testid="speakers-message"]').should('contain', 'queued');

		cy.get('[data-testid="speaker-mail-open"]').click();
		cy.get('[data-testid="speaker-mail-compose"]').within(() => {
			cy.get('[data-testid="speaker-mail-subject"]').should('have.value', '');
			cy.get('[data-testid="speaker-mail-body"]').should('have.value', '');
		});
	});

	/**
	 * The row's status control saves on pick, and now has to reach its form the
	 * long way round (#124).
	 *
	 * The native `<select>` submitted through `event.currentTarget.form`. The
	 * shadcn one hands back a value, synchronously, from inside its own setter —
	 * before Svelte has written the hidden input that carries it. Submitting on
	 * that callback posts the status the row had a moment ago, so the save is a
	 * no-op while the trigger shows the new value: exactly the kind of failure
	 * that leaves every test green and every screenshot right.
	 */
	it('saves the status picked on a speaker row', () => {
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		// The speaker's own name carries the word "Invited", so the status is read
		// from the one control that shows it (#552 removed the badge beside it).
		cy.contains('[data-testid="speaker-row"]', 'Ivan Invited')
			.find('[data-testid="speaker-status-select"]')
			.should('contain.text', 'Invited')
			.click();

		// The listbox is portalled to the body, so it is picked outside the row.
		cy.get('[role="option"]').contains('Confirmed').click();

		// A reload, not the trigger on the spot: it shows what was picked either
		// way. Only re-reading the row from the database can tell a real save from
		// a POST that carried the old value.
		cy.reload();
		cy.contains('[data-testid="speaker-row"]', 'Ivan Invited').should('contain.text', 'Confirmed');
	});
});

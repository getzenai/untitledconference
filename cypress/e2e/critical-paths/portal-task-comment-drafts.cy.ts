/**
 * Portal task comment drafts (#789): typed lines survive reload, a successful
 * send drops the copy, a refused send keeps it. Insert the body, do not set it —
 * `.invoke('val')` would hide an `<input>` that cannot hold the second line.
 */
const uniqueSlug = () =>
	`portal-task-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function openTaskWithFile() {
	const slug = uniqueSlug();
	const conference = 'DevFlow Conf 2028';
	cy.createAndLogin().then((speaker) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: speaker.id,
				slug,
				name: conference,
				days: ['2028-05-10'],
				sessions: ['A deck worth reading'],
				speakerUserId: speaker.id,
				contentFiles: [{ filename: 'slides.pdf', contentType: 'application/pdf' }]
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit('/portal');
	cy.waitForHydration();
	cy.contains('a', 'Upload slides.pdf').click();
	cy.waitForHydration();
}

/** Type the lines. Setting `.val` would hide an `<input>` that cannot hold them. */
function typeComment(lines: string[]) {
	cy.get('[data-testid^="task-comment-"]')
		.filter(':not([data-testid$="-restored"])')
		.first()
		.as('box')
		.should('have.prop', 'tagName', 'TEXTAREA')
		.clear()
		.click()
		.type(lines.join('{enter}'));
	cy.get('@box').should('have.value', lines.join('\n'));
}

describe('Portal task comment drafts', () => {
	it('keeps a two-line question through a reload', () => {
		const stamp = Date.now();
		const lines = [`Can you crop the title ${stamp}`, `Second thought ${stamp}`];

		openTaskWithFile();
		typeComment(lines);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid^="task-comment-"]')
			.filter(':not([data-testid$="-restored"])')
			.first()
			.should('have.prop', 'tagName', 'TEXTAREA')
			.and('have.value', lines.join('\n'));
		cy.get('[data-testid$="-restored"]').should('be.visible');
	});

	it('clears the parked copy after a successful send', () => {
		const stamp = Date.now();
		const lines = [`Please check the last slide ${stamp}`];

		openTaskWithFile();
		typeComment(lines);
		cy.contains('button', 'Send to the programme team').click();
		cy.contains(`Please check the last slide ${stamp}`).should('be.visible');
		cy.get('[data-testid^="task-comment-"]')
			.filter(':not([data-testid$="-restored"])')
			.first()
			.should('have.value', '');
		cy.get('[data-testid$="-restored"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		cy.contains(`Please check the last slide ${stamp}`).should('be.visible');
		cy.get('[data-testid^="task-comment-"]')
			.filter(':not([data-testid$="-restored"])')
			.first()
			.should('have.value', '');
		cy.get('[data-testid$="-restored"]').should('not.exist');
	});

	it('keeps a refused question through the error and a reload', () => {
		const stamp = Date.now();
		const lines = [`This should stay ${stamp}`, `after the refusal ${stamp}`];

		openTaskWithFile();
		typeComment(lines);
		// A missing file id is the action's 400. The typed body is what we keep.
		cy.get('input[name="deliverableId"]').invoke('val', 'x');
		cy.contains('button', 'Send to the programme team').click();
		cy.contains('Unknown file.').should('be.visible');
		cy.get('[data-testid^="task-comment-"]')
			.filter(':not([data-testid$="-restored"])')
			.first()
			.should('have.value', lines.join('\n'));

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid^="task-comment-"]')
			.filter(':not([data-testid$="-restored"])')
			.first()
			.should('have.value', lines.join('\n'));
		cy.get('[data-testid$="-restored"]').should('be.visible');
	});
});

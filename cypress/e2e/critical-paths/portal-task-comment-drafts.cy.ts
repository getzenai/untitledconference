/**
 * Portal task comment drafts (#789): typed lines survive reload, a successful
 * send drops the copy, a refused send keeps it, and a send on one file of a
 * two-file task leaves the other box. Insert the body, do not set it —
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

function commentBoxes() {
	return cy.get('[data-testid^="task-comment-"]').filter(':not([data-testid$="-restored"])');
}

/** Type the lines. Setting `.val` would hide an `<input>` that cannot hold them. */
function typeComment(lines: string[]) {
	commentBoxes()
		.first()
		.as('box')
		.should('have.prop', 'tagName', 'TEXTAREA')
		.clear()
		.click()
		.type(lines.join('{enter}'));
	cy.get('@box').should('have.value', lines.join('\n'));
}

function typeInBox(index: number, lines: string[]) {
	commentBoxes()
		.eq(index)
		.should('have.prop', 'tagName', 'TEXTAREA')
		.clear()
		.click()
		.type(lines.join('{enter}'));
	commentBoxes().eq(index).should('have.value', lines.join('\n'));
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

	/**
	 * `contentFiles: [a, b]` is two tasks, not two boxes. Two files on one
	 * task are versions — upload a second, then the page has two boxes.
	 * Send the older one: a loop over every file, or a bump of `files[0]`,
	 * would clear the latest box instead of leaving it.
	 */
	it('keeps a parked question on the other file of the same task', () => {
		const stamp = Date.now();
		const sent = [`Send the older file ${stamp}`];
		const kept = [`Leave this standing ${stamp}`, `second line ${stamp}`];

		openTaskWithFile();
		cy.get('[data-testid="task-upload"]').selectFile({
			contents: 'cypress/fixtures/slides.pdf',
			fileName: `second-${stamp}.pdf`,
			mimeType: 'application/pdf'
		});
		cy.get('[data-testid="file-open"]').should('have.length', 2);
		commentBoxes().should('have.length', 2);

		// Newest first. Type both, send the older — the one that is not `files[0]`.
		typeInBox(0, kept);
		typeInBox(1, sent);
		commentBoxes().eq(1).closest('form').contains('button', 'Send to the programme team').click();
		cy.contains(`Send the older file ${stamp}`).should('be.visible');

		commentBoxes().eq(0).should('have.value', kept.join('\n'));
		commentBoxes().eq(1).should('have.value', '');
		cy.get('[data-testid$="-restored"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		commentBoxes().eq(0).should('have.value', kept.join('\n'));
		commentBoxes().eq(1).should('have.value', '');
		cy.get('[data-testid$="-restored"]').should('be.visible');
		cy.contains(`Send the older file ${stamp}`).should('be.visible');
	});
});

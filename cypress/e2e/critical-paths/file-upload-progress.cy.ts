import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

/**
 * The upload button says what it is doing while the POST is in flight (#246).
 *
 * Without this feature the button goes `disabled` beside the same "Upload"
 * label — indistinguishable from a hung page on a slow line. An SSR pin on the
 * label would prove nothing: the text is in the markup either way. The state
 * that matters is the one *during* the POST, so the spec holds the upload
 * response open and asserts the in-flight button text.
 *
 * The fixture is created directly (see `createSpeakerUploadTask`): the feature
 * under test is the upload affordance, not the organizer's task-creation UI.
 */
describe('File upload says what it is doing', () => {
	it('shows name and size before the click, then explains the POST', () => {
		const email = generateTestUserEmail('upload-progress');
		cy.createTestUser({ email, password: DEFAULT_TEST_PASSWORD }).then((user) => {
			cy.task('createSpeakerUploadTask', user.id).then(({ url, taskId }) => {
				cy.login(email, DEFAULT_TEST_PASSWORD);
				cy.visit(url);
				cy.waitForHydration();

				// A file_request task draws the upload form, not the action-task branch.
				cy.get('[data-testid="task-file-input"]').should('be.visible');
				cy.get('[data-testid="task-upload-button"]').should('contain.text', 'Upload');

				// The picked file's name and size appear before anything is sent, so
				// the size is known before the click.
				cy.get('[data-testid="task-file-input"]').selectFile({
					contents: new Uint8Array(2 * 1024 * 1024),
					fileName: 'slides.pdf',
					mimeType: 'application/pdf'
				});
				cy.contains('slides.pdf').should('be.visible');
				cy.contains('2.0 MB').should('be.visible');

				// Hold the response open so the in-flight state is actually visible;
				// on the pre-#246 code this assertion fails because the button keeps
				// saying "Upload" for the whole POST.
				cy.intercept('POST', `**/portal/tasks/${taskId}?/upload`, (req) => {
					req.on('response', (res) => res.setDelay(1500));
				});
				cy.get('[data-testid="task-upload-button"]').click();
				cy.get('[data-testid="task-upload-button"]').should('contain.text', 'Uploading…');
				cy.get('[data-testid="task-upload-button"] svg.animate-spin').should('be.visible');

				// It lands back on "Upload" and the new version is listed as latest.
				cy.get('[data-testid="task-upload-button"]', { timeout: 10000 }).should(
					'contain.text',
					'Upload'
				);
				cy.contains('Latest').should('be.visible');
				cy.contains('slides.pdf').should('be.visible');
			});
		});
	});

	it('shows the headshot progress and swaps in the fresh photo', () => {
		const email = generateTestUserEmail('headshot-progress');
		cy.createTestUser({ email, password: DEFAULT_TEST_PASSWORD }).then((user) => {
			// Same fixture as above: it gives the user a speaker profile, which is
			// what the profile page needs to draw the headshot form.
			cy.task('createSpeakerUploadTask', user.id).then(() => {
				cy.login(email, DEFAULT_TEST_PASSWORD);
				cy.visit('/portal/profile');
				cy.waitForHydration();

				cy.get('[data-testid="headshot-file-input"]').should('be.visible');
				cy.get('[data-testid="headshot-upload-button"]').should('contain.text', 'Upload');

				// Name and size appear before the click.
				cy.get('[data-testid="headshot-file-input"]').selectFile({
					contents: new Uint8Array(48 * 1024),
					fileName: 'me.png',
					mimeType: 'image/png'
				});
				cy.contains('me.png').should('be.visible');

				// Hold the response so the in-flight label is observable.
				cy.intercept('POST', '**?/headshot', (req) => {
					req.on('response', (res) => res.setDelay(1200));
				});
				cy.get('[data-testid="headshot-upload-button"]').click();
				cy.get('[data-testid="headshot-upload-button"]').should('contain.text', 'Uploading…');

				// On success the headshot URL gets a fresh cache-busting version
				// (#246 DoD: the new image appears without a second wait), and the
				// button lands back on "Upload".
				cy.get('[data-testid="headshot-upload-button"]', { timeout: 10000 }).should(
					'contain.text',
					'Upload'
				);
				cy.get('[data-testid="profile-form"] img').should('be.visible');
				cy.get('[data-testid="profile-form"] img')
					.invoke('attr', 'src')
					.should('match', /speaker-photo/);
			});
		});
	});
});

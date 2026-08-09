// Cypress E2E support file - loaded before every spec.
//
// Replaces the Playwright global setup/teardown projects:
//   e2e/global.setup.ts    -> the `pushDatabaseSchema` task, run by scripts/run-e2e.sh
//   e2e/global.teardown.ts -> the `cleanupTestUsers` task in the `after` hook below
//
// Specs run serially (plain `cypress run`); parallel runs would race on the
// shared test-user cleanup.
import './commands';

after(() => {
	cy.task('cleanupTestUsers');
});

Cypress.on('uncaught:exception', (err) => {
	// ResizeObserver loop warnings are benign browser noise, not app failures.
	if (err.message.includes('ResizeObserver')) {
		return false;
	}
	return true;
});

if (Cypress.config('isInteractive')) {
	Cypress.Screenshot.defaults({ screenshotOnRunFailure: false });
}

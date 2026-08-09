import { FormActions } from '../../support/actions/form.actions';
import type { TestUser } from '../../support/globals';
import { UIComponentsPage } from '../../support/pages/ui-components.page';

/**
 * UI Components Showcase
 *
 * Ported 1:1 from e2e/critical-paths/ui-components.test.ts.
 * The showcase page sits behind the auth guard, so the spec logs in once and
 * replays the cached session before each test.
 */
describe('UI Components Showcase', () => {
	const ui = new UIComponentsPage();
	let testUser: TestUser;

	before(() => {
		cy.createTestUser({ organizationName: 'UI Components Org' }).then((user) => {
			testUser = user;
		});
	});

	beforeEach(() => {
		cy.login(testUser.email, testUser.password);
		ui.visit();
	});

	describe('Form Controls', () => {
		it('text inputs work correctly', () => {
			FormActions.fillTextField(ui.textInput(), 'Hello World');

			FormActions.clearField(ui.textInput());
			FormActions.fillTextField(ui.textInput(), 'New Value');

			FormActions.fillTextField(ui.emailInput(), 'test@example.com');
			FormActions.fillTextField(ui.passwordInput(), 'SecurePass123');
			FormActions.fillTextField(ui.numberInput(), '42');
			ui.textarea().clear().type('Multi-line{enter}text content');
			ui.textarea().should('have.value', 'Multi-line\ntext content');
		});

		it('checkboxes work correctly', () => {
			FormActions.shouldBeChecked(ui.singleCheckbox(), false);
			FormActions.toggleCheckbox(ui.singleCheckbox(), true);
			FormActions.toggleCheckbox(ui.singleCheckbox(), false);

			FormActions.toggleCheckbox(ui.checkboxOption(1), true);
			FormActions.toggleCheckbox(ui.checkboxOption(2), true);
			FormActions.toggleCheckbox(ui.checkboxOption(3), false);

			FormActions.shouldBeChecked(ui.checkboxOption(1), true);
			FormActions.shouldBeChecked(ui.checkboxOption(2), true);
			FormActions.shouldBeChecked(ui.checkboxOption(3), false);
		});

		it('radio buttons work correctly', () => {
			FormActions.selectRadioOption(ui.radioOption(1));
			FormActions.shouldBeChecked(ui.radioOption(1), true);
			FormActions.shouldBeChecked(ui.radioOption(2), false);

			FormActions.selectRadioOption(ui.radioOption(2));
			FormActions.shouldBeChecked(ui.radioOption(1), false);
			FormActions.shouldBeChecked(ui.radioOption(2), true);

			FormActions.selectRadioOption(ui.radioOption(3));
			FormActions.shouldBeChecked(ui.radioOption(3), true);
		});

		it('switch toggle works correctly', () => {
			ui.switchToggle().should('have.attr', 'data-state', 'unchecked');
			FormActions.toggleSwitch(ui.switchToggle(), true);
			FormActions.toggleSwitch(ui.switchToggle(), false);
		});

		it('select dropdown works correctly', () => {
			ui.selectOption('option1');
			ui.selectTrigger().should('contain.text', 'Option 1');

			ui.selectOption('option2');
			ui.selectTrigger().should('contain.text', 'Option 2');

			ui.selectOption('option3');
			ui.selectTrigger().should('contain.text', 'Option 3');
		});

		it('form submission works', () => {
			ui.fillTestForm();
			ui.submitForm();
			ui.waitForToast(/Form submitted successfully/i);
		});
	});

	describe('Buttons & Actions', () => {
		it('all button variants are clickable', () => {
			(['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const).forEach(
				(variant) => {
					ui.button(variant).should('be.enabled').click();
				}
			);
			ui.button('disabled').should('be.disabled');
		});

		it('loading button state works', () => {
			ui.loadingButton().click();
			ui.loadingButton().should('contain.text', 'Loading...').and('be.disabled');

			ui.loadingButton()
				.should('contain.text', 'Click for Loading State')
				.and('be.enabled')
				.then(() => {
					ui.waitForToast(/Action completed/i);
				});
		});
	});

	describe('Feedback Components', () => {
		it('alerts are visible', () => {
			ui.alert('default').should('be.visible').and('contain.text', 'Default Alert');
			ui.alert('destructive').should('be.visible').and('contain.text', 'Error Alert');
		});

		it('badges are visible', () => {
			(['default', 'secondary', 'destructive', 'outline'] as const).forEach((variant) => {
				ui.badge(variant).should('be.visible');
			});
		});

		it('progress bar updates correctly', () => {
			ui.progressValue().should('eq', 33);

			ui.updateProgress(true);
			ui.progressValue().should('eq', 43);

			ui.updateProgress(false);
			ui.updateProgress(false);
			ui.progressValue().should('eq', 23);
		});

		it('toast notifications work', () => {
			(['success', 'error', 'info', 'warning'] as const).forEach((type) => {
				ui.triggerToast(type);
				ui.waitForToast();
				ui.waitForToastToDisappear();
			});
		});
	});

	describe('Overlay Components', () => {
		it('dialog open and close works', () => {
			ui.openDialog();
			FormActions.fillTextField(ui.dialogInput(), 'Dialog test input');
			ui.closeDialog(false);

			ui.openDialog();
			ui.closeDialog(true);
			ui.waitForToast(/Dialog confirmed/i);
		});

		it('alert dialog works correctly', () => {
			ui.openAlertDialog();
			ui.alertDialogContent().should('contain.text', 'Are you sure?');
			ui.closeAlertDialog(false);

			ui.openAlertDialog();
			ui.closeAlertDialog(true);
			ui.waitForToast(/Action confirmed/i);
		});
	});

	describe('Data Display Components', () => {
		it('table data extraction works', () => {
			ui.tableCellValue('Name', 'Jane Smith', 'Email').should('eq', 'jane@example.com');
			ui.tableCellValue('Email', 'bob@example.com', 'Role').should('eq', 'User');
			ui.tableCellValue('ID', '4', 'Status').should('eq', 'Active');

			ui.rowsByColumnValue('Role', 'Admin').should('deep.eq', ['John Doe']);
			ui.rowsByColumnValue('Status', 'Active').should('have.length', 3);
		});
	});

	describe('Layout Components', () => {
		it('accordion expand and collapse works', () => {
			// bits-ui keeps the content mounted and toggles data-state, so
			// "closed" is asserted through the trigger's aria-expanded.
			ui.shouldHaveClosedAccordion(1);
			ui.shouldHaveClosedAccordion(2);
			ui.shouldHaveClosedAccordion(3);

			ui.toggleAccordion(1);
			ui.shouldHaveOpenAccordion(1);
			ui.accordionContent(1).should('be.visible');

			// Single-select accordion: opening #2 closes #1.
			ui.toggleAccordion(2);
			ui.shouldHaveOpenAccordion(2);
			ui.shouldHaveClosedAccordion(1);

			ui.toggleAccordion(2);
			ui.shouldHaveClosedAccordion(2);
		});

		it('tabs switching works', () => {
			ui.switchToTab(1);
			ui.shouldHaveActiveTab(1);
			ui.shouldHaveInactiveTab(2);
			ui.shouldHaveInactiveTab(3);

			ui.switchToTab(2);
			ui.shouldHaveInactiveTab(1);
			ui.shouldHaveActiveTab(2);
			ui.shouldHaveInactiveTab(3);

			ui.switchToTab(3);
			ui.shouldHaveInactiveTab(1);
			ui.shouldHaveInactiveTab(2);
			ui.shouldHaveActiveTab(3);

			ui.switchToTab(1);
			ui.shouldHaveActiveTab(1);
		});
	});

	it('complete form workflow with all components', () => {
		FormActions.fillTextField(ui.textInput(), 'Complete Test');
		FormActions.fillTextField(ui.emailInput(), 'complete@test.com');
		FormActions.fillTextField(ui.passwordInput(), 'CompletePass123');
		FormActions.fillTextField(ui.numberInput(), '100');
		FormActions.fillTextField(ui.textarea(), 'This is a complete test of all form components');

		FormActions.toggleCheckbox(ui.singleCheckbox(), true);
		FormActions.toggleCheckbox(ui.checkboxOption(1), true);
		FormActions.toggleCheckbox(ui.checkboxOption(2), false);
		FormActions.toggleCheckbox(ui.checkboxOption(3), true);

		FormActions.selectRadioOption(ui.radioOption(3));
		FormActions.toggleSwitch(ui.switchToggle(), true);
		ui.selectOption('option3');

		ui.submitForm();
		ui.waitForToast(/Form submitted successfully/i);
	});
});

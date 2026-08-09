/// <reference types="cypress" />
import { BasePage } from './base.page';

type Index = 1 | 2 | 3;
export type ToastType = 'success' | 'error' | 'info' | 'warning';

const byTestId = (id: string): Cypress.Chainable<JQuery<HTMLElement>> =>
	cy.get(`[data-testid="${id}"]`);

/** Column order of the showcase table. */
const COLUMN_INDEX: Record<string, number> = {
	ID: 0,
	Name: 1,
	Email: 2,
	Status: 3,
	Role: 4
};

export class UIComponentsPage extends BasePage {
	readonly path = '/examples/ui-components';

	// --- Form controls -----------------------------------------------------
	textInput = () => byTestId('text-input');
	emailInput = () => byTestId('email-input');
	passwordInput = () => byTestId('password-input');
	numberInput = () => byTestId('number-input');
	textarea = () => byTestId('textarea');
	singleCheckbox = () => byTestId('single-checkbox');
	checkboxOption = (n: Index) => byTestId(`checkbox-option${n}`);
	radioOption = (n: Index) => byTestId(`radio-option${n}`);
	switchToggle = () => byTestId('switch');
	selectTrigger = () => byTestId('select-trigger');
	submitButton = () => byTestId('submit-button');
	dataTable = () => byTestId('data-table');

	// --- Buttons -----------------------------------------------------------
	button = (
		variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' | 'disabled'
	) => byTestId(`button-${variant}`);
	loadingButton = () => byTestId('button-loading');

	// --- Feedback ----------------------------------------------------------
	alert = (variant: 'default' | 'destructive') => byTestId(`alert-${variant}`);
	badge = (variant: 'default' | 'secondary' | 'destructive' | 'outline') =>
		byTestId(`badge-${variant}`);
	progressBar = () => byTestId('progress-bar');
	toastButton = (type: ToastType) => byTestId(`toast-${type}`);

	// --- Overlays ----------------------------------------------------------
	dialogTrigger = () => byTestId('dialog-trigger');
	dialogContent = () => byTestId('dialog-content');
	dialogInput = () => byTestId('dialog-input');
	dialogCancel = () => byTestId('dialog-cancel');
	dialogConfirm = () => byTestId('dialog-confirm');
	alertDialogTrigger = () => byTestId('alert-dialog-trigger');
	alertDialogContent = () => byTestId('alert-dialog-content');
	alertDialogCancel = () => byTestId('alert-dialog-cancel');
	alertDialogConfirm = () => byTestId('alert-dialog-confirm');

	// --- Layout ------------------------------------------------------------
	accordionTrigger = (n: Index) => byTestId(`accordion-trigger-${n}`);
	accordionContent = (n: Index) => byTestId(`accordion-content-${n}`);
	tabTrigger = (n: Index) => byTestId(`tab-trigger-${n}`);
	tabContent = (n: Index) => byTestId(`tab-content-${n}`);

	// --- Actions -----------------------------------------------------------

	selectOption(value: string): this {
		this.selectTrigger().click();
		byTestId(`select-${value}`).click();
		return this;
	}

	openDialog(): this {
		this.dialogTrigger().click();
		this.dialogContent().should('be.visible');
		return this;
	}

	closeDialog(confirm = false): this {
		if (confirm) {
			this.dialogConfirm().click();
		} else {
			this.dialogCancel().click();
		}
		cy.get('[data-testid="dialog-content"]').should('not.exist');
		return this;
	}

	openAlertDialog(): this {
		this.alertDialogTrigger().click();
		this.alertDialogContent().should('be.visible');
		return this;
	}

	closeAlertDialog(confirm = false): this {
		if (confirm) {
			this.alertDialogConfirm().click();
		} else {
			this.alertDialogCancel().click();
		}
		cy.get('[data-testid="alert-dialog-content"]').should('not.exist');
		return this;
	}

	toggleAccordion(n: Index): this {
		this.accordionTrigger(n).click();
		return this;
	}

	shouldHaveOpenAccordion(n: Index): this {
		this.accordionTrigger(n).should('have.attr', 'aria-expanded', 'true');
		return this;
	}

	shouldHaveClosedAccordion(n: Index): this {
		this.accordionTrigger(n).should('have.attr', 'aria-expanded', 'false');
		return this;
	}

	switchToTab(n: Index): this {
		this.tabTrigger(n).click();
		return this;
	}

	shouldHaveActiveTab(n: Index): this {
		this.tabTrigger(n).should('have.attr', 'data-state', 'active');
		return this;
	}

	shouldHaveInactiveTab(n: Index): this {
		this.tabTrigger(n).should('not.have.attr', 'data-state', 'active');
		return this;
	}

	progressValue(): Cypress.Chainable<number> {
		return this.progressBar()
			.invoke('attr', 'aria-valuenow')
			.then((value) => Number(value ?? 0));
	}

	updateProgress(increase: boolean): this {
		byTestId(increase ? 'progress-increase' : 'progress-decrease').click();
		return this;
	}

	triggerToast(type: ToastType): this {
		this.toastButton(type).click();
		return this;
	}

	waitForToast(text?: string | RegExp): this {
		if (text === undefined) {
			cy.get('[data-sonner-toast]', { timeout: 10000 }).should('exist');
		} else {
			cy.contains('[data-sonner-toast]', text, { timeout: 10000 }).should('exist');
		}
		return this;
	}

	waitForToastToDisappear(): this {
		cy.get('[data-sonner-toast]', { timeout: 20000 }).should('not.exist');
		return this;
	}

	fillTestForm(): this {
		this.textInput().clear().type('Test Text');
		this.emailInput().clear().type('test@example.com');
		this.passwordInput().clear().type('TestPassword123');
		this.numberInput().clear().type('42');
		this.textarea().clear().type('This is a test description');
		this.singleCheckbox().click();
		this.checkboxOption(1).click();
		this.radioOption(2).click();
		this.switchToggle().click();
		this.selectOption('option2');
		return this;
	}

	submitForm(): this {
		this.submitButton().click();
		return this;
	}

	/**
	 * Read a cell from the showcase table by matching another column's value,
	 * mirroring UIComponentsPage.getTableCellValue() from the Playwright suite.
	 */
	tableCellValue(
		searchColumn: keyof typeof COLUMN_INDEX | string,
		searchValue: string,
		targetColumn: keyof typeof COLUMN_INDEX | string
	): Cypress.Chainable<string> {
		const searchIndex = COLUMN_INDEX[searchColumn];
		const targetIndex = COLUMN_INDEX[targetColumn];
		return this.dataTable()
			.find('tbody tr')
			.then(($rows) => {
				for (const row of $rows.toArray()) {
					const cells = Cypress.$(row).find('td');
					if (cells.eq(searchIndex).text().trim() === searchValue) {
						return cells.eq(targetIndex).text().trim();
					}
				}
				return '';
			});
	}

	/** All table rows whose given column holds the given value. */
	rowsByColumnValue(
		column: keyof typeof COLUMN_INDEX | string,
		value: string
	): Cypress.Chainable<string[]> {
		const columnIndex = COLUMN_INDEX[column];
		return this.dataTable()
			.find('tbody tr')
			.then(($rows) =>
				$rows
					.toArray()
					.filter((row) => Cypress.$(row).find('td').eq(columnIndex).text().trim() === value)
					.map((row) => Cypress.$(row).find('td').eq(COLUMN_INDEX.Name).text().trim())
			);
	}
}

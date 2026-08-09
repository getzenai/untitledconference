/// <reference types="cypress" />

type Target = string | Cypress.Chainable<JQuery<HTMLElement>>;

function resolve(target: Target): Cypress.Chainable<JQuery<HTMLElement>> {
	return typeof target === 'string' ? cy.get(target) : target;
}

/**
 * Standardised form interactions, ported from e2e/actions/form.actions.ts.
 *
 * The shadcn/bits-ui checkbox, radio and switch primitives render as buttons
 * with a `data-state` attribute rather than native inputs, so "checked" is
 * asserted through that attribute instead of `:checked`.
 */
export const FormActions = {
	fillTextField(target: Target, value: string): void {
		resolve(target).clear().type(value).should('have.value', value);
	},

	clearField(target: Target): void {
		resolve(target).clear().should('have.value', '');
	},

	setToggleState(target: Target, shouldBeChecked: boolean): void {
		resolve(target).then(($el) => {
			const isChecked = $el.attr('data-state') === 'checked';
			if (isChecked !== shouldBeChecked) {
				cy.wrap($el).click();
			}
			cy.wrap($el).should('have.attr', 'data-state', shouldBeChecked ? 'checked' : 'unchecked');
		});
	},

	toggleCheckbox(target: Target, shouldBeChecked: boolean): void {
		FormActions.setToggleState(target, shouldBeChecked);
	},

	toggleSwitch(target: Target, shouldBeOn: boolean): void {
		FormActions.setToggleState(target, shouldBeOn);
	},

	selectRadioOption(target: Target): void {
		resolve(target).click().should('have.attr', 'data-state', 'checked');
	},

	shouldBeChecked(target: Target, checked: boolean): void {
		resolve(target).should('have.attr', 'data-state', checked ? 'checked' : 'unchecked');
	},

	submitForm(target: Target): void {
		resolve(target).click();
	}
};

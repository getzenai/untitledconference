/** The reveal control has to be on the tab order — it used to be `tabindex={-1}`. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PasswordInput from './password-input.svelte';

describe('password reveal', () => {
	it('lets the keyboard reach the show/hide control', () => {
		const html = render(PasswordInput, { props: { value: 'secret' } }).body;

		expect(html).toContain('aria-label="Show password"');
		expect(html).not.toMatch(/tabindex="-1"/);
	});
});

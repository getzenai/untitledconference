import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AppSelect from './app-select.svelte';

/**
 * The dropdown the organizer sees (#124), and the one the server reads.
 *
 * Swapping `<select>` for a button and a popover is a change of appearance that
 * could quietly become a change of contract: a form posts what its inputs are
 * named, and the actions on the far side read `formData.get('status')` by hand.
 * So the claim worth pinning is not that a listbox opens — it is that the same
 * name still carries the same option value, and that a control with no name
 * posts nothing at all.
 */
const html = (props: ComponentProps<typeof AppSelect>) => render(AppSelect, { props }).body;

const STATUS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'published', label: 'Published' },
	{ value: 'closed', label: 'Closed' }
];

describe('what the select posts', () => {
	it('carries the chosen option under the field name, unchanged', () => {
		const body = html({ name: 'status', value: 'published', options: STATUS });

		expect(body).toContain('name="status"');
		expect(body).toContain('value="published"');
	});

	it('still posts the field when nothing is chosen', () => {
		// An action reading `formData.get('conditionSource')` gets '' and treats
		// the field as always shown; dropping the key would leave the old rule.
		const body = html({ name: 'conditionSource', value: '', options: STATUS });

		expect(body).toContain('name="conditionSource"');
		expect(body).toContain('value=""');
	});

	it('posts nothing when it has no name', () => {
		// The builder's preview column: a picture of the submitter's form, inside
		// the organizer's own <form>. An input here would ride along on their save.
		const body = html({ options: STATUS, placeholder: '—' });

		expect(body).not.toContain('<input');
	});

	it('leaves nothing native behind', () => {
		const body = html({ name: 'status', value: 'draft', options: STATUS });

		expect(body).not.toContain('<select');
		expect(body).not.toContain('<option');
	});
});

describe('what the select shows', () => {
	it('is the label of the stored value, not the value', () => {
		expect(html({ name: 'status', value: 'published', options: STATUS })).toContain('Published');
	});

	it('is the placeholder when the stored value is not one of the options', () => {
		// A track that was deleted after the rule was written, say. Showing the
		// orphaned id would read as a choice that is still standing.
		const body = html({ name: 'status', value: 'archived', options: STATUS, placeholder: 'Pick' });

		expect(body).toContain('Pick');
		expect(body).not.toContain('>archived<');
	});

	it('still posts that unknown value rather than silently clearing it', () => {
		// Showing a placeholder is a statement about the screen. Rewriting the
		// stored value on render would be a statement about the database, made by
		// a page the organizer only looked at.
		expect(html({ name: 'status', value: 'archived', options: STATUS })).toContain(
			'value="archived"'
		);
	});
});

/**
 * #414. A long option name used to run out of the trigger, because the
 * trigger sets `whitespace-nowrap` and its own clamp only reaches a
 * `[data-slot=select-value]` child — which a bare string never was.
 */
describe('a label longer than the control', () => {
	const LONG = 'Programme committee, second pass';
	const ROUNDS = [{ value: '10', label: LONG }];

	it('truncates inside the box instead of spilling out of it', () => {
		const body = html({ name: 'roundId', value: '10', options: ROUNDS });

		expect(body).toMatch(/class="[^"]*truncate[^"]*"[^>]*>Programme committee, second pass/);
	});

	it('keeps the whole name reachable in the trigger title', () => {
		expect(html({ name: 'roundId', value: '10', options: ROUNDS })).toContain(`title="${LONG}"`);
	});

	it('lets a caller with its own reason for a tooltip keep it', () => {
		// The disabled-criterion select explains why it cannot be changed. That
		// sentence outranks the label it is already showing.
		const body = html({
			name: 'roundId',
			value: '10',
			options: ROUNDS,
			title: 'Scores hang off this criterion'
		});

		expect(body).toContain('title="Scores hang off this criterion"');
	});

	it('says nothing at all when there is nothing chosen', () => {
		// A tooltip repeating the placeholder is noise on every empty control.
		expect(html({ name: 'roundId', options: ROUNDS, placeholder: 'Round' })).not.toContain(
			'title='
		);
	});
});

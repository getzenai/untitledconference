/**
 * The import is the fix (#482), so this is about what the import does: whatever
 * reaches SvelteKit's `enhance` through this module has already been wrapped —
 * including a form that passes no submit function of its own.
 *
 * The unit project has no DOM (see `vite.config.ts`), so the form here is the
 * three calls the wrapper actually makes on it. The browser proof that the page
 * survives is `cypress/e2e/critical-paths/cfp-save-error.cy.ts`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const kitEnhance = vi.fn();
vi.mock('$app/forms', () => ({ enhance: (...args: unknown[]) => kitEnhance(...args) }));

const { enhance } = await import('./enhance');

type FakeElement = { textContent: string; setAttribute: (name: string, value: string) => void };

/** A form that can hold one banner: prepend, find it again, remove it. */
function fakeForm() {
	let banner: FakeElement | null = null;
	return {
		element: {
			querySelector: () => banner,
			prepend: (el: FakeElement) => {
				banner = el;
			}
		} as unknown as HTMLFormElement,
		banner: () => banner
	};
}

beforeAll(() => {
	// The wrapper builds its banner with `document.createElement`.
	(globalThis as { document?: unknown }).document = {
		createElement: (): FakeElement => ({ textContent: '', setAttribute: () => {} })
	};
});

afterAll(() => {
	delete (globalThis as { document?: unknown }).document;
});

/** Drive the wrapped submit the way SvelteKit's `enhance` would. */
async function runSubmit(submit: (input: unknown) => unknown, result: unknown) {
	const form = fakeForm();
	const callback = await submit({ formElement: form.element, formData: null });
	let updated = false;
	await (callback as (opts: unknown) => Promise<void>)({
		result,
		update: async () => {
			updated = true;
		}
	});
	return { updated, banner: form.banner() };
}

const thrownAction = { type: 'error', status: 500, error: { message: 'Internal Error' } };

describe('the app enhance', () => {
	it('hands SvelteKit a wrapped submit, so a thrown action never replaces the page', async () => {
		const form = fakeForm();
		const inner = vi.fn(() => async ({ update }: { update: () => Promise<void> }) => {
			await update();
		});

		enhance(form.element, inner);

		expect(kitEnhance).toHaveBeenCalledWith(form.element, expect.any(Function));
		const wrapped = kitEnhance.mock.calls.at(-1)![1];

		const failed = await runSubmit(wrapped, thrownAction);
		// The form's own callback still ran — that is what clears `busy` — but the
		// `update()` that would have swapped in `+error.svelte` did not.
		expect(inner).toHaveBeenCalled();
		expect(failed.updated).toBe(false);
		expect(failed.banner?.textContent).toContain('Something went wrong on our side');

		const saved = await runSubmit(wrapped, { type: 'success', status: 200, data: {} });
		expect(saved.updated).toBe(true);
	});

	it('wraps a bare use:enhance too — the forms with no submit function of their own', async () => {
		const form = fakeForm();

		enhance(form.element);

		const wrapped = kitEnhance.mock.calls.at(-1)![1];
		const failed = await runSubmit(wrapped, thrownAction);

		expect(failed.updated).toBe(false);
		expect(failed.banner?.textContent).toContain('Something went wrong on our side');
	});
});

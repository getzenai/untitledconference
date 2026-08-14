/**
 * The `use:enhance` error path (#462).
 *
 * SvelteKit's default `update()` treats a failed action the same way it treats a
 * failed navigation: it applies the result and the nearest `+error.svelte`
 * replaces the page. That is the right answer for a broken route. It is the
 * wrong answer for a Save that the database could not take — the typed values
 * die with the page, and the only way back is "Back to your work".
 *
 * This wrapper keeps that default for everything except `result.type ===
 * 'error'`. Then it paints the same 5xx sentence the error page would have
 * used, on the form that was submitted, and leaves the page alone.
 */
import { errorDetail } from '$lib/error-copy';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

const FORM_ACTION_ERROR = 'form-action-error';

function isActionError(result: ActionResult): result is Extract<ActionResult, { type: 'error' }> {
	return result.type === 'error';
}

/** Apply the default enhance behaviour for every result except a thrown action. */
export function shouldApplyAction(result: ActionResult): boolean {
	return !isActionError(result);
}

/** Same sentence the error page uses — including the rule that a 5xx message never ships. */
export function actionErrorCopy(result: Extract<ActionResult, { type: 'error' }>): string {
	return errorDetail(result.status ?? 500, result.error?.message);
}

export function keepPageOnActionError(submit: SubmitFunction): SubmitFunction {
	return (input) => {
		clearActionError(input.formElement);
		const next = submit(input);
		return async (opts) => {
			const callback = await next;
			if (isActionError(opts.result)) {
				paintActionError(input.formElement, actionErrorCopy(opts.result));
				// The inner callback still runs so `busy` flags clear. `update` is a
				// no-op: that is the call that would have replaced the page.
				if (typeof callback === 'function') {
					await callback({ ...opts, update: async () => {} });
				}
				return;
			}
			if (typeof callback === 'function') {
				await callback(opts);
				return;
			}
			await opts.update();
		};
	};
}

function paintActionError(form: HTMLFormElement, message: string) {
	let el = form.querySelector<HTMLElement>(`[data-testid="${FORM_ACTION_ERROR}"]`);
	if (!el) {
		el = document.createElement('p');
		el.setAttribute('role', 'alert');
		el.setAttribute('data-testid', FORM_ACTION_ERROR);
		// `basis-full` so a flex-wrap row (the room rename) puts the banner on
		// its own line rather than squeezing it between the field and Save.
		el.className =
			'border-status-bad text-status-bad basis-full max-w-2xl rounded-md border px-3 py-2 text-sm';
		form.prepend(el);
	}
	el.textContent = message;
}

function clearActionError(form: HTMLFormElement) {
	form.querySelector(`[data-testid="${FORM_ACTION_ERROR}"]`)?.remove();
}

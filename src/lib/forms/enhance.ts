/**
 * The app's `use:enhance` (#462, #482).
 *
 * Import this instead of `$app/forms`. It is SvelteKit's action, with the one
 * change every form in this app wants: when the action throws, the typed values
 * stay on the screen instead of dying with the page.
 *
 * The default is right for a broken route and wrong for a Save the database
 * could not take — SvelteKit applies `type: 'error'` like a failed navigation,
 * so the nearest `+error.svelte` replaces the page and everything in the form
 * goes with it. On the proposal form that is a stranger's whole talk.
 *
 * Wrapping was opt-in first (#481) and 32 forms never opted in, which is what
 * an opt-in default means. So the wrapper became the import: the next form
 * someone writes gets it by typing the same line as every form above it, and
 * the ESLint rule in `eslint.config.js` says so if they reach past it.
 */
import { enhance as kitEnhance } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';
import { keepPageOnActionError } from './keep-page-on-action-error';

/** No-op submit, so a bare `use:enhance` still gets the error path. */
const passThrough: SubmitFunction = () => {};

export function enhance(form: HTMLFormElement, submit: SubmitFunction = passThrough) {
	return kitEnhance(form, keepPageOnActionError(submit));
}

/**
 * Which forms HTMLFormElement.reset() may run on after a successful
 * enhance (#461).
 *
 * SvelteKit's `update()` defaults to `reset: true`. On success that
 * calls `HTMLFormElement.reset()` *before* `invalidateAll()` — measured
 * in `@sveltejs/kit/src/runtime/app/forms.js`, not inferred from the
 * ticket. Reset restores `defaultValue` from the first paint.
 *
 * An empty "add another" field wants that. A form whose inputs are
 * filled from server data never does: the first paint was empty, so
 * reset puts the emptiness back. The badge and banner still update
 * (invalidate + applyAction), which is why submit can look like success
 * while the scorecard is blank. The next save then writes the blank
 * over the row that just stored.
 *
 * `true` = reset after success. `false` = leave the fields.
 */
export type FormResetKind = 'add' | 'edit';

export function shouldResetForm(kind: FormResetKind): boolean {
	return kind === 'add';
}

export function formUpdateOptions(kind: FormResetKind): { reset: boolean } {
	return { reset: shouldResetForm(kind) };
}

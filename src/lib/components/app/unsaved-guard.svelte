<script lang="ts">
	/**
	 * A form's unsaved input, and the click that would throw it away (#435).
	 *
	 * The sidebar is one click from every creation form, and until now that click
	 * was silent: a filled-in conference or organization simply stopped existing.
	 * There is no draft behind these forms — the typed content is the only copy.
	 *
	 * Renders nothing. `beforeNavigate` covers both halves: an in-app navigation
	 * we can ask about ourselves, and a reload or a closed tab, where cancelling
	 * is what makes the browser ask its own question. That is why there is no
	 * separate `beforeunload` listener — a second one would mean two dialogs for
	 * the same leaving.
	 */
	import { beforeNavigate } from '$app/navigation';
	import { leaveDecision, UNSAVED_PROMPT } from './unsaved-work';

	let {
		dirty,
		message = UNSAVED_PROMPT
	}: {
		/** True while the page holds input the server has not seen. */
		dirty: boolean;
		message?: string;
	} = $props();

	beforeNavigate((navigation) => {
		const decision = leaveDecision(dirty, navigation.type);
		if (decision === 'allow') return;
		// `defer`: cancelling an unload is the only way to reach the browser's own
		// "leave site?" dialog. Asking first would put two dialogs in a row.
		if (decision === 'defer' || !confirm(message)) navigation.cancel();
	});
</script>

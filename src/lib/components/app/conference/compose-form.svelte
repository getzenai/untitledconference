<script lang="ts">
	/**
	 * Compose an email to the speakers matched by the current roster filter
	 * (SPK-13, organizer surface).
	 *
	 * Lives in a dialog on the roster page (issue #220): at rest the list is a
	 * list, and this only appears when an organizer actually wants to write.
	 *
	 * The two fields are bound outwards on purpose (#435). Closing the dialog
	 * unmounts this component, and Escape is the documented way to close it — so
	 * a message to fourteen speakers used to die on the keystroke the app itself
	 * teaches. Holding the text one level up means dismissing the dialog only
	 * puts the draft away; reopening brings it back. Nothing here asks a question
	 * on the way out, because there is nothing to lose.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let {
		recipients,
		filtered,
		filters,
		busy,
		enhanceForm,
		form,
		subject = $bindable(''),
		body = $bindable('')
	}: {
		recipients: number;
		filtered: boolean;
		filters: { q?: string | null; status?: string | null };
		busy: boolean;
		/** The page's shared enhanced-action handler (disables with the other forms). */
		enhanceForm: Parameters<typeof enhance>[1];
		form: { scope?: string; message?: string; error?: string } | null;
		/** The draft, kept by the page so it survives this dialog closing. */
		subject?: string;
		body?: string;
	} = $props();

	const recipientLine = $derived(
		`${recipients} recipient${recipients === 1 ? '' : 's'} with an email address${filtered ? ' in the current filter' : ''}.`
	);
</script>

<p class="text-muted-foreground text-xs">{recipientLine}</p>
<form method="POST" action="?/compose" use:enhance={enhanceForm} class="mt-3 grid gap-3">
	<input type="hidden" name="q" value={filters.q ?? ''} />
	<input type="hidden" name="status" value={filters.status ?? ''} />
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="speaker-mail-subject">
			Subject
		</label>
		<Input
			id="speaker-mail-subject"
			name="subject"
			bind:value={subject}
			maxlength={200}
			required
			autofocus
			data-testid="speaker-mail-subject"
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="speaker-mail-body">
			Message
		</label>
		<textarea
			id="speaker-mail-body"
			name="body"
			bind:value={body}
			rows="5"
			maxlength="10000"
			required
			autocomplete="off"
			class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
			data-testid="speaker-mail-body"
		></textarea>
	</div>
	<div>
		<Button
			type="submit"
			size="sm"
			disabled={busy || recipients === 0}
			data-testid="speaker-mail-submit"
		>
			Send to {recipients} speaker{recipients === 1 ? '' : 's'}
		</Button>
	</div>

	{#if form?.scope === 'compose' && form?.error}
		<p
			class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm"
			role="alert"
			data-testid="compose-error"
		>
			{form.error}
		</p>
	{:else if form?.scope === 'compose' && form?.message}
		<!-- Dead by design: compose successes return without a scope and close
			 this dialog, so the page banner shows them. Keeping the branch guards
			 against a future success+scope vanishing silently in a closed dialog. -->
		<p
			class="border-status-good text-status-good rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="compose-message"
		>
			{form.message}
		</p>
	{/if}
</form>

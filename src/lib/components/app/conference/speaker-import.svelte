<script lang="ts">
	/**
	 * Import a speaker list from a spreadsheet (SPK-03 / CRM-05).
	 *
	 * Both inputs feed one action. The file picker is what an organizer with a
	 * committee spreadsheet reaches for; the paste box is for everybody who has the
	 * rows but not a file — two columns out of a mail, or a client that cannot attach
	 * one. Neither is the fallback of the other.
	 *
	 * The answer renders inside this section rather than at the top of the roster
	 * page. A confirmation one screen away from the thing it is about is what makes
	 * somebody reload to check.
	 *
	 * The paste box parks. Escape is not a navigation, so there is no leave
	 * prompt — the draft is the fix, same as the add dialog. The file picker
	 * is a file, not typed text.
	 *
	 * A refused import keeps the text on purpose (#829, #831): that is the case
	 * the parking exists for, and rejected rows are the ones somebody most needs
	 * back. What does not survive a reload is the *reason* — the error comes
	 * from the action, so a person returning later meets their rows and the
	 * restored hint rather than `Row 2 has no name.` The trade is deliberate:
	 * pressing Import again reproduces the message, and a refused import writes
	 * nothing. Only success clears the key, through `commitToken`.
	 */
	import { enhance } from '$lib/forms/enhance';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		busy = false,
		embedded = false,
		submitLabel = 'Import speakers',
		owner,
		scope,
		commitToken = 0,
		enhanceForm,
		form
	}: {
		busy?: boolean;
		/** Render without the card wrapper and heading when nested inside a dialog (issue #220). */
		embedded?: boolean;
		/** Contacts says "Import contacts"; the conference roster keeps speakers (#455). */
		submitLabel?: string;
		owner: string;
		/** Caller-owned: roster and contacts must not share a key (#789). */
		scope: string;
		commitToken?: number;
		/** The page's shared submit handler, so this form disables with the others. */
		enhanceForm: Parameters<typeof enhance>[1];
		form: { scope?: string; message?: string; error?: string } | null;
	} = $props();

	/**
	 * What the paste box shows before anybody types: a header row and one speaker.
	 *
	 * An example beats a sentence about the format, and it is built here rather than
	 * written in the markup because the line break has to be a real one.
	 */
	const csvExample = ['name,email,company', 'Ada Bennett,ada@example.com,Globex'].join('\n');
</script>

<div
	class={embedded ? 'space-y-3' : 'border-border bg-card max-w-3xl rounded-lg border p-4'}
	data-testid="speakers-import"
>
	{#if !embedded}
		<h2 class="text-sm font-semibold">Import a list</h2>
	{/if}
	<p class="text-muted-foreground mt-0.5 text-xs">
		A CSV with a header row. <code class="text-foreground">name</code> is the only column that has
		to be there; <code class="text-foreground">email</code>,
		<code class="text-foreground">job title</code>, <code class="text-foreground">company</code>,
		<code class="text-foreground">bio</code>, <code class="text-foreground">notes</code> and
		<code class="text-foreground">status</code> are used when present and anything else is ignored. A
		matching email is skipped, so sending the same file twice is safe. Two rows with different emails
		become two people — even if the names match. Check the email column before you import.
	</p>

	<form
		method="POST"
		action="?/import"
		enctype="multipart/form-data"
		use:enhance={enhanceForm}
		class="mt-3 space-y-3"
	>
		<div>
			<label class="text-muted-foreground mb-1 block text-xs font-medium" for="import-file">
				CSV file
			</label>
			<input
				id="import-file"
				name="file"
				type="file"
				accept=".csv,text/csv"
				class="border-input bg-background file:text-foreground w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
				data-testid="import-file"
			/>
		</div>
		<div>
			<label class="text-muted-foreground mb-1 block text-xs font-medium" for="import-csv">
				…or paste the rows
			</label>
			<BrowserDraftInput
				id="import-csv"
				name="csv"
				{scope}
				{owner}
				baseline=""
				rows={4}
				placeholder={csvExample}
				testId="import-csv"
				{commitToken}
			/>
		</div>

		{#if form?.scope === 'import' && form?.error}
			<p
				class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="import-error"
			>
				{form.error}
			</p>
		{:else if form?.scope === 'import' && form?.message}
			<p
				class="border-status-good text-status-good rounded-md border px-3 py-2 text-sm"
				role="status"
				data-testid="import-message"
			>
				{form.message}
			</p>
		{/if}

		<Button type="submit" size="sm" disabled={busy} data-testid="import-submit">
			{submitLabel}
		</Button>
	</form>
</div>

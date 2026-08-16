<script lang="ts">
	/**
	 * Add a speaker to the roster (SPK-02, organizer surface).
	 *
	 * Lives in a dialog on the roster page (issue #220): at rest the list is a
	 * list, and this only appears when an organizer actually wants to add. Creates
	 * an org-wide profile (or reuses one by email) and puts them on this
	 * conference.
	 *
	 * Closing is not a navigation, so there is no UnsavedGuard — the draft is
	 * the fix. `add` answers with success, not a redirect, so the parent
	 * increments `commitToken` on `success` and the fields clear.
	 */
	import { enhance } from '$lib/forms/enhance';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import { Button } from '$lib/components/ui/button';
	import { NEW_SPEAKER_FIELDS, newSpeakerFieldScope } from '$lib/conference/speaker-notes-draft';

	let {
		slug,
		owner,
		commitToken = 0,
		statusOptions,
		busy,
		enhanceForm,
		form
	}: {
		slug: string;
		owner: string;
		commitToken?: number;
		statusOptions: { value: string; label: string }[];
		busy: boolean;
		/** The page's shared enhanced-action handler (disables with the other forms). */
		enhanceForm: Parameters<typeof enhance>[1];
		form: { scope?: string; message?: string; error?: string } | null;
	} = $props();

	const scopes = $derived(
		Object.fromEntries(
			NEW_SPEAKER_FIELDS.map((field) => [field, newSpeakerFieldScope(slug, field)])
		) as Record<(typeof NEW_SPEAKER_FIELDS)[number], string>
	);
</script>

<form method="POST" action="?/add" use:enhance={enhanceForm} class="grid gap-3 sm:grid-cols-2">
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-name">
			Name <span class="text-status-bad">*</span>
		</label>
		<BrowserDraftInput
			id="add-name"
			name="name"
			scope={scopes.name}
			{owner}
			baseline=""
			required
			testId="add-name"
			{commitToken}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-email">
			Email
		</label>
		<BrowserDraftInput
			id="add-email"
			name="email"
			type="email"
			scope={scopes.email}
			{owner}
			baseline=""
			testId="add-email"
			{commitToken}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-status">
			Status
		</label>
		<AppSelect
			id="add-status"
			name="status"
			testId="add-status"
			value="invited"
			options={statusOptions}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-job">
			Job title
		</label>
		<BrowserDraftInput
			id="add-job"
			name="jobTitle"
			scope={scopes.jobTitle}
			{owner}
			baseline=""
			testId="add-jobTitle"
			{commitToken}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-company">
			Company
		</label>
		<BrowserDraftInput
			id="add-company"
			name="company"
			scope={scopes.company}
			{owner}
			baseline=""
			testId="add-company"
			{commitToken}
		/>
	</div>
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-bio">Bio</label>
		<BrowserDraftInput
			id="add-bio"
			name="bio"
			scope={scopes.bio}
			{owner}
			baseline=""
			rows={2}
			testId="add-bio"
			{commitToken}
		/>
	</div>
	<div class="sm:col-span-2">
		<Button type="submit" size="sm" disabled={busy} data-testid="add-submit">Add to roster</Button>
	</div>

	{#if form?.scope === 'add' && form?.error}
		<p
			class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm sm:col-span-2"
			role="alert"
			data-testid="add-error"
		>
			{form.error}
		</p>
	{:else if form?.scope === 'add' && form?.message}
		<!-- Dead by design: add successes return without a scope and close this
			 dialog, so the page banner shows them. Keeping the branch guards
			 against a future success+scope vanishing silently in a closed dialog. -->
		<p
			class="border-status-good text-status-good rounded-md border px-3 py-2 text-sm sm:col-span-2"
			role="status"
			data-testid="add-message"
		>
			{form.message}
		</p>
	{/if}
</form>

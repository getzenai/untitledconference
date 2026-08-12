<script lang="ts">
	/**
	 * Add a speaker to the roster (SPK-02, organizer surface).
	 *
	 * Lives in a dialog on the roster page (issue #220): at rest the list is a
	 * list, and this only appears when an organizer actually wants to add. Creates
	 * an org-wide profile (or reuses one by email) and puts them on this
	 * conference.
	 */
	import { enhance } from '$app/forms';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let {
		statusOptions,
		busy,
		enhanceForm,
		form
	}: {
		statusOptions: { value: string; label: string }[];
		busy: boolean;
		/** The page's shared enhanced-action handler (disables with the other forms). */
		enhanceForm: Parameters<typeof enhance>[1];
		form: { scope?: string; message?: string; error?: string } | null;
	} = $props();
</script>

<form method="POST" action="?/add" use:enhance={enhanceForm} class="grid gap-3 sm:grid-cols-2">
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-name">
			Name <span class="text-status-bad">*</span>
		</label>
		<Input
			id="add-name"
			name="name"
			required
			autofocus
			autocomplete="name"
			data-testid="add-name"
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-email">
			Email
		</label>
		<Input id="add-email" name="email" type="email" autocomplete="email" data-testid="add-email" />
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
		<Input id="add-job" name="jobTitle" data-testid="add-jobTitle" />
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-company">
			Company
		</label>
		<Input id="add-company" name="company" data-testid="add-company" />
	</div>
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-bio">Bio</label>
		<textarea
			id="add-bio"
			name="bio"
			rows="2"
			autocomplete="off"
			class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
			data-testid="add-bio"
		></textarea>
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

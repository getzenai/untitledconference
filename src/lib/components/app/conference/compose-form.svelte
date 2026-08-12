<script lang="ts">
	/**
	 * Compose an email to the speakers matched by the current roster filter
	 * (SPK-13, organizer surface).
	 *
	 * Lives in a dialog on the roster page (issue #220): at rest the list is a
	 * list, and this only appears when an organizer actually wants to write.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let {
		recipients,
		filtered,
		filters,
		busy,
		enhanceForm
	}: {
		recipients: number;
		filtered: boolean;
		filters: { q?: string | null; status?: string | null };
		busy: boolean;
		/** The page's shared enhanced-action handler (disables with the other forms). */
		enhanceForm: Parameters<typeof enhance>[1];
	} = $props();
</script>

<p class="text-muted-foreground text-xs">
	{recipients} recipient{recipients === 1 ? '' : 's'} with an email address
	{#if filtered}in the current filter{/if}. Delivery is recorded in the conference mail log.
</p>
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
</form>

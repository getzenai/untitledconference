<script lang="ts">
	/**
	 * Open roster-row profile form. Typed fields park with BrowserDraftInput;
	 * notes stay on the #759 key. Status is chosen on the row, not here.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { speakerFieldScope } from '$lib/conference/speaker-notes-draft';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import SpeakerNotesDraft from '$lib/components/app/conference/speaker-notes-draft.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		slug,
		owner,
		speaker,
		busy,
		enhanceForm,
		ondirtychange
	}: {
		slug: string;
		owner: string;
		speaker: {
			speakerProfileId: number;
			name: string;
			email: string | null;
			sortName: string;
			jobTitle: string | null;
			company: string | null;
			bio: string | null;
			notes: string | null;
		};
		busy: boolean;
		enhanceForm: Parameters<typeof enhance>[1];
		ondirtychange: (field: string, dirty: boolean) => void;
	} = $props();

	const id = $derived(speaker.speakerProfileId);
	const field = (name: string) => speakerFieldScope(slug, id, name);
</script>

<form
	method="POST"
	action="?/updateProfile"
	use:enhance={enhanceForm}
	class="grid max-w-3xl gap-3 sm:grid-cols-2"
	data-testid="speaker-edit-form"
>
	<input type="hidden" name="speakerProfileId" value={id} />
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-name-{id}">
			Name
		</label>
		<BrowserDraftInput
			id="edit-name-{id}"
			name="name"
			scope={field('name')}
			{owner}
			baseline={speaker.name}
			required
			testId="edit-name"
			ondirtychange={(dirty) => ondirtychange('name', dirty)}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-email-{id}">
			Email
		</label>
		<BrowserDraftInput
			id="edit-email-{id}"
			name="email"
			type="email"
			scope={field('email')}
			{owner}
			baseline={speaker.email ?? ''}
			testId="edit-email"
			ondirtychange={(dirty) => ondirtychange('email', dirty)}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-sortName-{id}">
			Sort name
		</label>
		<BrowserDraftInput
			id="edit-sortName-{id}"
			name="sortName"
			scope={field('sortName')}
			{owner}
			baseline={speaker.sortName}
			testId="edit-sortName"
			ondirtychange={(dirty) => ondirtychange('sortName', dirty)}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-jobTitle-{id}">
			Job title
		</label>
		<BrowserDraftInput
			id="edit-jobTitle-{id}"
			name="jobTitle"
			scope={field('jobTitle')}
			{owner}
			baseline={speaker.jobTitle ?? ''}
			testId="edit-jobTitle"
			ondirtychange={(dirty) => ondirtychange('jobTitle', dirty)}
		/>
	</div>
	<div>
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-company-{id}">
			Company
		</label>
		<BrowserDraftInput
			id="edit-company-{id}"
			name="company"
			scope={field('company')}
			{owner}
			baseline={speaker.company ?? ''}
			testId="edit-company"
			ondirtychange={(dirty) => ondirtychange('company', dirty)}
		/>
	</div>
	<div class="sm:col-span-2">
		<label class="text-muted-foreground mb-1 block text-xs font-medium" for="edit-bio-{id}">
			Bio
		</label>
		<BrowserDraftInput
			id="edit-bio-{id}"
			name="bio"
			scope={field('bio')}
			{owner}
			baseline={speaker.bio ?? ''}
			rows={3}
			testId="edit-bio"
			ondirtychange={(dirty) => ondirtychange('bio', dirty)}
		/>
	</div>
	<div class="sm:col-span-2">
		<SpeakerNotesDraft
			{slug}
			speakerProfileId={id}
			{owner}
			baseline={speaker.notes ?? ''}
			fieldId={`edit-notes-${id}`}
		/>
	</div>
	<div class="sm:col-span-2">
		<Button type="submit" size="sm" disabled={busy} data-testid="edit-submit">Save profile</Button>
	</div>
</form>

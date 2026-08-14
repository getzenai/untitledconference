<script lang="ts">
	/**
	 * The first conference (SET-01).
	 *
	 * Four fields. The slug is prefilled from the name and stays editable — the
	 * organizer should see the public address before it is theirs, not discover it
	 * afterwards, but should not have to invent it.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import DatePicker from '$lib/components/app/date-picker.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CONFERENCE_CREATE_FIELDS, createFormBlockReason } from '$lib/conference/create-form';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { slugify } from '$lib/conference/slug';

	let { data, form } = $props();

	// Null until the organizer types, so each field can fall back to whatever the
	// server sent back after a rejected submit. Seeding `$state` from `form`
	// directly would capture only its first value — and on a submit without
	// JavaScript, where `form` arrives with the page, the fields would come back
	// empty and make them retype everything a validation message just complained
	// about.
	let nameEdit = $state<string | null>(null);
	let slugEdit = $state<string | null>(null);
	let busy = $state(false);

	const name = $derived(nameEdit ?? form?.values?.name ?? '');
	// The address follows the name until the organizer touches it, and then stops
	// — otherwise their edit would disappear on the next keystroke in the name.
	const slug = $derived(slugEdit ?? form?.values?.slug ?? slugify(name));

	const submitBlockReason = $derived(
		createFormBlockReason([
			{ ...CONFERENCE_CREATE_FIELDS.name, value: name },
			{ ...CONFERENCE_CREATE_FIELDS.slug, value: slug },
			{ ...CONFERENCE_CREATE_FIELDS.startsOn, value: form?.values?.startsOn ?? '' },
			{ ...CONFERENCE_CREATE_FIELDS.endsOn, value: form?.values?.endsOn ?? '' }
		])
	);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>New conference</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl px-6 py-10">
	<a class="text-muted-foreground text-sm hover:underline" href="/manage">← My conferences</a>

	{#if !data.canCreate}
		<EmptyState
			class="mt-8"
			title="A conference belongs to an organization"
			description="Create yours first — it takes one field. Then start a conference under it from My conferences."
			action={{ href: '/settings/organization/new', label: 'Create an organization' }}
		/>
	{:else}
		<h1 class="mt-6 text-lg font-semibold tracking-tight">New conference</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Name it and pick the dates. You land in Settings next — rooms, tracks and formats first — then
			open the call for papers when the structure is ready.
		</p>

		<form method="POST" use:enhance={submitting} class="mt-8 space-y-5">
			<div class="space-y-2">
				<Label for="name">
					Name{#if CONFERENCE_CREATE_FIELDS.name.required}<span class="text-status-bad"
							>&nbsp;*</span
						>{/if}
				</Label>
				<Input
					id="name"
					name="name"
					value={name}
					oninput={(event) => (nameEdit = event.currentTarget.value)}
					required={CONFERENCE_CREATE_FIELDS.name.required}
					maxlength={120}
				/>
			</div>

			<div class="space-y-2">
				<Label for="slug">Public address</Label>
				<div class="flex items-center gap-1">
					<span class="text-muted-foreground text-sm">/c/</span>
					<Input
						id="slug"
						name="slug"
						value={slug}
						oninput={(event) => (slugEdit = event.currentTarget.value)}
						maxlength={60}
						placeholder="your-conference-2027"
					/>
				</div>
				<p class="text-muted-foreground text-xs">
					Lowercase letters, numbers and hyphens. This is the link you share.
				</p>
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="startsOn">Starts</Label>
					<DatePicker name="startsOn" value={form?.values?.startsOn ?? ''} />
				</div>
				<div class="space-y-2">
					<Label for="endsOn">Ends</Label>
					<DatePicker name="endsOn" value={form?.values?.endsOn ?? ''} />
				</div>
			</div>

			{#if form?.error}
				<p class="text-destructive text-sm" role="alert">{form.error}</p>
			{/if}

			<div class="flex flex-col items-start gap-1">
				<Button
					type="submit"
					disabled={busy}
					aria-describedby={submitBlockReason ? 'create-block-reason' : undefined}
				>
					Create conference
				</Button>
				{#if submitBlockReason}
					<p
						id="create-block-reason"
						class="text-muted-foreground text-xs"
						data-testid="create-block-reason"
					>
						{submitBlockReason}
					</p>
				{/if}
			</div>
		</form>
	{/if}
</div>

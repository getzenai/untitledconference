<script lang="ts">
	/**
	 * Speaker roster — who is on this conference, and where they are in the
	 * workflow (SPK-01 list/search, SPK-02 add/edit, SPK-04 status filter + change).
	 *
	 * Filters in the URL so a search survives reload and can be pasted. Edits are
	 * per-row forms rather than a drawer: organizers change one field and move on.
	 */
	import { enhance } from '$app/forms';
	import { page as currentPage } from '$app/state';
	import AddSpeakerForm from '$lib/components/app/conference/add-speaker-form.svelte';
	import ComposeForm from '$lib/components/app/conference/compose-form.svelte';
	import SpeakerImport from '$lib/components/app/conference/speaker-import.svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { tick } from 'svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const filtered = $derived(Boolean(data.filters.q || data.filters.status));
	const mailRecipients = $derived(
		new Set(
			data.speakers
				.map((speaker: { email: string | null }) => speaker.email?.toLowerCase())
				.filter(Boolean)
		).size
	);

	let busy = $state(false);
	let editingId = $state<number | null>(null);
	let composeOpen = $state(false);
	let addOpen = $state(false);
	let importOpen = $state(false);

	const statusOptions = $derived(
		data.statuses.map((status: string) => ({ value: status, label: status }))
	);

	/**
	 * Submits the form a row's status control belongs to.
	 *
	 * The native `<select>` reached it through `event.currentTarget.form`, which a
	 * shadcn select cannot offer: it is a button plus a hidden input, and the
	 * change arrives as a value rather than as a DOM event. So the row's form
	 * carries an id and the control names it — one indirection, and the same
	 * "picking a status IS the save" behaviour the organizer already has.
	 */
	const submitOwnForm = async (id: string) => {
		// bits-ui calls back synchronously from its value setter; the hidden input
		// carrying that value is written on Svelte's next flush, and `use:enhance`
		// reads the FormData synchronously. Submitting first posts the status the
		// row had before the click — a save that changes nothing while the trigger
		// shows the new value, and a second click on the same value never fires the
		// setter again.
		await tick();
		const form = document.getElementById(id);
		if (form instanceof HTMLFormElement) form.requestSubmit();
	};

	const submitting = (onSuccess?: () => void) => {
		return (_input: unknown) => {
			busy = true;
			return async ({
				update,
				result
			}: {
				update: () => Promise<void>;
				result: { type: string };
			}) => {
				try {
					await update();
					if (result.type === 'success') {
						editingId = null;
						onSuccess?.();
					}
				} finally {
					busy = false;
				}
			};
		};
	};

	const statusHref = (status: string | null) => {
		const params = new SvelteURLSearchParams(currentPage.url.searchParams);
		if (status) params.set('status', status);
		else params.delete('status');
		const query = params.toString();
		return `${base}/speakers${query ? `?${query}` : ''}`;
	};

	const roleLine = (speaker: { jobTitle: string | null; company: string | null }) => {
		if (speaker.jobTitle && speaker.company) return `${speaker.jobTitle}, ${speaker.company}`;
		return speaker.jobTitle ?? speaker.company ?? '—';
	};
</script>

<svelte:head>
	<title>Speakers — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Speakers</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
				{data.counts.total} on the roster · {data.counts.confirmed} confirmed ·
				{data.counts.invited} invited
				{#if filtered}
					<span class="text-foreground">· {data.speakers.length} match the filter</span>
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Dialog.Root bind:open={composeOpen}>
				<Dialog.Trigger
					class={buttonVariants({ size: 'sm', variant: 'secondary' })}
					data-testid="speaker-mail-open"
				>
					Email speakers
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-lg" data-testid="speaker-mail-compose">
					<Dialog.Header>
						<Dialog.Title>Email speakers</Dialog.Title>
						<Dialog.Description>
							One message to the addresses in the current filter. Delivery is recorded in the
							conference mail log.
						</Dialog.Description>
					</Dialog.Header>
					<ComposeForm
						recipients={mailRecipients}
						{filtered}
						filters={data.filters}
						{busy}
						{form}
						enhanceForm={submitting(() => (composeOpen = false))}
					/>
				</Dialog.Content>
			</Dialog.Root>

			<Dialog.Root bind:open={addOpen}>
				<Dialog.Trigger
					class={buttonVariants({ size: 'sm', variant: 'secondary' })}
					data-testid="speakers-add"
				>
					Add speaker
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-lg">
					<Dialog.Header>
						<Dialog.Title>Add a speaker</Dialog.Title>
						<Dialog.Description>
							Creates an org-wide profile (or reuses one by email) and puts them on this conference.
						</Dialog.Description>
					</Dialog.Header>
					<AddSpeakerForm
						{statusOptions}
						{busy}
						{form}
						enhanceForm={submitting(() => (addOpen = false))}
					/>
				</Dialog.Content>
			</Dialog.Root>

			<Dialog.Root bind:open={importOpen}>
				<Dialog.Trigger
					class={buttonVariants({ size: 'sm', variant: 'secondary' })}
					data-testid="speakers-import-open"
				>
					Import
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-lg">
					<Dialog.Header>
						<Dialog.Title>Import a list</Dialog.Title>
						<Dialog.Description>
							Load speakers from a CSV file or pasted rows; speakers already on the roster by email
							are skipped.
						</Dialog.Description>
					</Dialog.Header>
					<SpeakerImport embedded {busy} enhanceForm={submitting()} {form} />
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>
</div>

<div class="space-y-6 px-6 py-5">
	{#if form?.scope === 'import' || form?.scope === 'add' || form?.scope === 'compose'}
		<!-- Scoped actions answer inside their own dialog: import, compose and add
			 render the result where the click was, never behind the overlay. -->
	{:else if form?.error}
		<p
			class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="alert"
			data-testid="speakers-error"
		>
			{form.error}
		</p>
	{:else if form?.message}
		<p
			class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="speakers-message"
		>
			{form.message}
		</p>
	{/if}

	<!-- Search + status filter (GET so the URL is the source of truth). -->
	<form
		method="GET"
		action="{base}/speakers"
		class="flex flex-wrap items-end gap-3"
		data-testid="speakers-filters"
	>
		<div class="min-w-[12rem] flex-1">
			<label class="text-muted-foreground mb-1 block text-xs font-medium" for="speakers-q">
				Search
			</label>
			<Input
				id="speakers-q"
				name="q"
				type="search"
				placeholder="Name, email, company…"
				value={data.filters.q ?? ''}
				data-testid="speakers-search"
			/>
		</div>
		<div>
			<label class="text-muted-foreground mb-1 block text-xs font-medium" for="speakers-status">
				Status
			</label>
			<AppSelect
				id="speakers-status"
				name="status"
				class="w-44"
				testId="speakers-status-filter"
				value={data.filters.status ?? ''}
				options={[{ value: '', label: 'All statuses' }, ...statusOptions]}
			/>
		</div>
		<Button type="submit" size="sm" variant="secondary">Apply</Button>
		{#if filtered}
			<Button href="{base}/speakers" size="sm" variant="ghost">Clear</Button>
		{/if}
	</form>

	<!-- Quick status chips for one-click filtering. -->
	<div class="flex flex-wrap gap-2 text-xs" data-testid="speakers-status-chips">
		<a
			href={statusHref(null)}
			class="rounded-full border px-2.5 py-1 {data.filters.status
				? 'border-border text-muted-foreground'
				: 'border-primary bg-primary text-primary-foreground'}"
		>
			All ({data.counts.total})
		</a>
		{#each data.statuses as status (status)}
			<a
				href={statusHref(status)}
				class="rounded-full border px-2.5 py-1 {data.filters.status === status
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				{status} ({data.counts[status]})
			</a>
		{/each}
	</div>

	<!-- The compose, add and import forms live in the header dialogs above; at
		 rest this list is a list. -->

	<!-- Roster table -->
	{#if data.speakers.length === 0}
		<p
			class="border-border bg-muted/40 text-muted-foreground rounded-lg border p-4 text-sm"
			data-testid="speakers-empty"
		>
			{#if filtered}
				No speakers match this filter.
			{:else}
				No speakers on this conference yet. Add one above, or accept a talk — accepted speakers land
				here as confirmed.
			{/if}
		</p>
	{:else}
		<!--
			Long rosters (#64): keep the header in view while scrolling a tall table.
			max-h is viewport-relative so ~100 speakers stay usable without virtualization.
		-->
		<div
			class="border-border max-h-[min(70vh,40rem)] overflow-auto rounded-lg border"
			data-testid="speakers-table"
		>
			<table class="w-full min-w-[40rem] text-left text-sm">
				<thead
					class="border-border bg-muted sticky top-0 z-10 border-b text-xs"
					data-testid="speakers-table-head"
				>
					<tr>
						<th class="px-3 py-2 font-medium">Speaker</th>
						<th class="px-3 py-2 font-medium">Role</th>
						<th class="px-3 py-2 font-medium">Status</th>
						<th class="px-3 py-2 font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody class="divide-border divide-y">
					{#each data.speakers as speaker (speaker.speakerProfileId)}
						<tr data-testid="speaker-row" data-speaker-id={speaker.speakerProfileId}>
							<td class="px-3 py-3 align-top">
								<div class="font-medium">{speaker.name}</div>
								<div class="text-muted-foreground text-xs">
									{speaker.email ?? 'No email'}
									{#if !speaker.hasAccount}
										<span class="px-1">·</span>
										<span title="No login yet">no account</span>
									{/if}
								</div>
							</td>
							<td class="text-muted-foreground px-3 py-3 align-top text-xs">
								{roleLine(speaker)}
							</td>
							<td class="px-3 py-3 align-top">
								<form
									id="speaker-status-{speaker.speakerProfileId}"
									method="POST"
									action="?/setStatus"
									use:enhance={submitting()}
									class="flex flex-wrap items-center gap-2"
									data-testid="speaker-status-form"
								>
									<input type="hidden" name="speakerProfileId" value={speaker.speakerProfileId} />
									<StatusBadge status={speaker.status} />
									<AppSelect
										name="status"
										size="sm"
										class="w-36"
										testId="speaker-status-select"
										aria-label="Status for {speaker.name}"
										value={speaker.status}
										options={statusOptions}
										onValueChange={() =>
											submitOwnForm(`speaker-status-${speaker.speakerProfileId}`)}
									/>
								</form>
							</td>
							<td class="px-3 py-3 text-right align-top">
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onclick={() =>
										(editingId =
											editingId === speaker.speakerProfileId ? null : speaker.speakerProfileId)}
									data-testid="speaker-edit-toggle"
								>
									{editingId === speaker.speakerProfileId ? 'Close' : 'Edit'}
								</Button>
							</td>
						</tr>
						{#if editingId === speaker.speakerProfileId}
							<tr class="bg-muted/20" data-testid="speaker-edit-row">
								<td colspan="4" class="px-3 py-4">
									<form
										method="POST"
										action="?/updateProfile"
										use:enhance={submitting()}
										class="grid max-w-3xl gap-3 sm:grid-cols-2"
										data-testid="speaker-edit-form"
									>
										<input type="hidden" name="speakerProfileId" value={speaker.speakerProfileId} />
										<div class="sm:col-span-2">
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-name-{speaker.speakerProfileId}"
											>
												Name
											</label>
											<Input
												id="edit-name-{speaker.speakerProfileId}"
												name="name"
												value={speaker.name}
												required
												data-testid="edit-name"
											/>
										</div>
										<div>
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-email-{speaker.speakerProfileId}"
											>
												Email
											</label>
											<Input
												id="edit-email-{speaker.speakerProfileId}"
												name="email"
												type="email"
												value={speaker.email ?? ''}
												data-testid="edit-email"
											/>
										</div>
										<div>
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-sortName-{speaker.speakerProfileId}"
											>
												Sort name
											</label>
											<Input
												id="edit-sortName-{speaker.speakerProfileId}"
												name="sortName"
												value={speaker.sortName}
												data-testid="edit-sortName"
											/>
										</div>
										<div>
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-jobTitle-{speaker.speakerProfileId}"
											>
												Job title
											</label>
											<Input
												id="edit-jobTitle-{speaker.speakerProfileId}"
												name="jobTitle"
												value={speaker.jobTitle ?? ''}
												data-testid="edit-jobTitle"
											/>
										</div>
										<div>
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-company-{speaker.speakerProfileId}"
											>
												Company
											</label>
											<Input
												id="edit-company-{speaker.speakerProfileId}"
												name="company"
												value={speaker.company ?? ''}
												data-testid="edit-company"
											/>
										</div>
										<div class="sm:col-span-2">
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-bio-{speaker.speakerProfileId}"
											>
												Bio
											</label>
											<textarea
												id="edit-bio-{speaker.speakerProfileId}"
												name="bio"
												rows="3"
												class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
												data-testid="edit-bio">{speaker.bio ?? ''}</textarea
											>
										</div>
										<div class="sm:col-span-2">
											<label
												class="text-muted-foreground mb-1 block text-xs font-medium"
												for="edit-notes-{speaker.speakerProfileId}"
											>
												Internal notes
											</label>
											<textarea
												id="edit-notes-{speaker.speakerProfileId}"
												name="notes"
												rows="2"
												class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
												data-testid="edit-notes"
												placeholder="Never shown publicly">{speaker.notes ?? ''}</textarea
											>
										</div>
										<div class="sm:col-span-2">
											<Button type="submit" size="sm" disabled={busy} data-testid="edit-submit">
												Save profile
											</Button>
										</div>
									</form>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

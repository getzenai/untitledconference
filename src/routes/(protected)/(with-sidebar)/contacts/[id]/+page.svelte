<script lang="ts">
	/**
	 * One contact: identity + notes + tags + history + push to event.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	let busy = $state(false);

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

	const tagsValue = $derived(data.contact.tags.join(', '));
	const eventOptions = $derived([
		{ value: '', label: 'Select an event…' },
		...data.availableEvents.map((e: { slug: string; name: string }) => ({
			value: e.slug,
			label: e.name
		}))
	]);
</script>

<svelte:head>
	<title>{data.contact.name} — Contacts</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p class="text-muted-foreground text-xs">
			<a href="/contacts" class="hover:text-foreground underline-offset-2 hover:underline"
				>← Contacts</a
			>
		</p>
		<h1 class="mt-1 text-lg font-semibold tracking-tight" data-testid="contact-detail-heading">
			{data.contact.name}
		</h1>
		<p class="text-muted-foreground mt-0.5 text-sm">
			{data.contact.jobTitle ?? '—'}{#if data.contact.company}
				· {data.contact.company}{/if}
		</p>
	</div>

	{#if form?.error}
		<p
			class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="alert"
			data-testid="contact-error"
		>
			{form.error}
		</p>
	{:else if form?.message}
		<p
			class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="contact-message"
		>
			{form.message}
		</p>
	{/if}

	<!-- Identity + notes + tags (CRM-03 / CRM-04) -->
	<section
		class="border-border bg-card max-w-3xl rounded-lg border p-4"
		data-testid="contact-profile"
	>
		<h2 class="text-sm font-semibold">Profile</h2>
		<form
			method="POST"
			action="?/save"
			use:enhance={submitting}
			class="mt-3 grid gap-3 sm:grid-cols-2"
		>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="name">Name</label>
				<Input
					id="name"
					name="name"
					value={data.contact.name}
					required
					data-testid="contact-name"
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="email">Email</label
				>
				<Input
					id="email"
					name="email"
					type="email"
					value={data.contact.email ?? ''}
					data-testid="contact-email"
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="company"
					>Company</label
				>
				<Input
					id="company"
					name="company"
					value={data.contact.company ?? ''}
					data-testid="contact-company"
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="jobTitle"
					>Job title</label
				>
				<Input
					id="jobTitle"
					name="jobTitle"
					value={data.contact.jobTitle ?? ''}
					data-testid="contact-jobtitle"
				/>
			</div>
			<div class="sm:col-span-2">
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="sortName"
					>Sort name</label
				>
				<Input
					id="sortName"
					name="sortName"
					value={data.contact.sortName}
					data-testid="contact-sortname"
				/>
			</div>
			<div class="sm:col-span-2">
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="bio">Bio</label>
				<textarea
					id="bio"
					name="bio"
					rows="3"
					class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					data-testid="contact-bio">{data.contact.bio ?? ''}</textarea
				>
			</div>
			<div class="sm:col-span-2">
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="notes">
					Internal notes
				</label>
				<textarea
					id="notes"
					name="notes"
					rows="3"
					class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Only organizers see this."
					data-testid="contact-notes">{data.contact.notes ?? ''}</textarea
				>
			</div>
			<div class="sm:col-span-2">
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="tags">
					Tags (comma-separated)
				</label>
				<Input
					id="tags"
					name="tags"
					value={tagsValue}
					placeholder="keynote, vip, alumni"
					data-testid="contact-tags"
				/>
			</div>
			<div class="sm:col-span-2">
				<Button type="submit" size="sm" disabled={busy} data-testid="contact-save">Save</Button>
			</div>
		</form>
	</section>

	<!-- Push to event (CRM-10) -->
	<section class="border-border bg-card max-w-3xl rounded-lg border p-4" data-testid="contact-push">
		<h2 class="text-sm font-semibold">Add to an event</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Adds them to this event’s speaker roster. Edits here show up on every event they are on.
		</p>
		{#if data.availableEvents.length === 0}
			<p class="text-muted-foreground mt-3 text-sm" data-testid="contact-push-empty">
				{#if data.contact.events.length > 0}
					Already on every event in this organization.
				{:else}
					No events available to add them to. Create an event first.
				{/if}
			</p>
		{:else}
			<form
				method="POST"
				action="?/push"
				use:enhance={submitting}
				class="mt-3 flex flex-wrap items-end gap-3"
			>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="conferenceSlug">
						Event
					</label>
					<AppSelect
						id="conferenceSlug"
						name="conferenceSlug"
						class="w-56"
						testId="contact-push-event"
						value=""
						options={eventOptions}
					/>
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="status">
						Status
					</label>
					<AppSelect
						id="status"
						name="status"
						class="w-36"
						testId="contact-push-status"
						value="invited"
						options={[
							{ value: 'invited', label: 'invited' },
							{ value: 'confirmed', label: 'confirmed' },
							{ value: 'declined', label: 'declined' },
							{ value: 'cancelled', label: 'cancelled' }
						]}
					/>
				</div>
				<Button type="submit" size="sm" disabled={busy} data-testid="contact-push-submit">
					Add to roster
				</Button>
			</form>
		{/if}
	</section>

	<!-- Near-duplicates (CRM-06): same name, different email/profile. -->
	{#if data.duplicates.length > 0}
		<section
			class="border-border bg-card max-w-3xl rounded-lg border p-4"
			data-testid="contact-duplicates"
		>
			<h2 class="text-sm font-semibold">Possible duplicates</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Same name, different record. Merge keeps <strong>this</strong> contact as primary and deletes
				the other. Cannot be undone.
			</p>
			<ul class="mt-3 space-y-3" data-testid="contact-duplicates-list">
				{#each data.duplicates as dup (dup.id)}
					<li
						class="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
						data-testid="contact-duplicate-row"
					>
						<div class="min-w-0">
							<a href="/contacts/{dup.id}" class="font-medium underline-offset-2 hover:underline">
								{dup.name}
							</a>
							<p class="text-muted-foreground truncate text-xs">
								{dup.email ?? 'no email'}
								{#if dup.company}
									· {dup.company}{/if}
							</p>
						</div>
						<form method="POST" action="?/merge" use:enhance={submitting}>
							<input type="hidden" name="secondaryId" value={dup.id} />
							<Button
								type="submit"
								size="sm"
								variant="secondary"
								disabled={busy}
								data-testid="contact-merge-submit"
								onclick={(e: MouseEvent) => {
									if (
										!confirm(
											`Merge “${dup.name}” (${dup.email ?? 'no email'}) into this contact? The other record will be deleted.`
										)
									) {
										e.preventDefault();
									}
								}}
							>
								Merge into this
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Cross-event history (CRM-03) -->
	<section class="max-w-3xl space-y-4" data-testid="contact-history">
		<div>
			<h2 class="text-sm font-semibold">Linked events</h2>
			{#if data.contact.events.length === 0}
				<p class="text-muted-foreground mt-1 text-sm">Not on any event roster yet.</p>
			{:else}
				<ul class="mt-2 space-y-1 text-sm">
					{#each data.contact.events as event (event.conferenceId)}
						<li class="flex flex-wrap items-center gap-2">
							<a
								href="/manage/{event.slug}/speakers"
								class="font-medium underline-offset-2 hover:underline"
							>
								{event.name}
							</a>
							<span class="text-muted-foreground text-xs">({event.status})</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div>
			<h2 class="text-sm font-semibold">Sessions / submissions</h2>
			{#if data.contact.sessions.length === 0}
				<p class="text-muted-foreground mt-1 text-sm">No linked submissions.</p>
			{:else}
				<ul class="mt-2 space-y-1 text-sm">
					{#each data.contact.sessions as session (session.submissionId)}
						<li>
							<span class="font-medium">{session.title}</span>
							<span class="text-muted-foreground"> · {session.conferenceName}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>

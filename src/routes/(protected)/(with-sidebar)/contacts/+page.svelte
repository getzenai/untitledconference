<script lang="ts">
	/**
	 * Speaker CRM directory — org-wide contacts across events (CRM-01 / CRM-02 / CRM-05).
	 */
	import { enhance } from '$app/forms';
	import SpeakerImport from '$lib/components/app/conference/speaker-import.svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	const filtered = $derived(
		Boolean(data.filters.q || data.filters.company || data.filters.jobTitle || data.filters.tag)
	);

	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};

	const companyOptions = $derived([
		{ value: '', label: 'Any company' },
		...data.filterOptions.companies.map((c: string) => ({ value: c, label: c }))
	]);
	const jobTitleOptions = $derived([
		{ value: '', label: 'Any job title' },
		...data.filterOptions.jobTitles.map((t: string) => ({ value: t, label: t }))
	]);
	const tagOptions = $derived([
		{ value: '', label: 'Any tag' },
		...data.filterOptions.tags.map((t: string) => ({ value: t, label: t }))
	]);
</script>

<svelte:head>
	<title>Contacts — Speaker CRM</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight" data-testid="contacts-heading">Contacts</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				Organization-wide speaker directory across every event you administer.
				{#if data.canManage}
					<span class="text-foreground tabular-nums"> · {data.contacts.length} shown</span>
				{/if}
			</p>
		</div>
	</div>

	{#if !data.canManage}
		<p
			class="border-border bg-card text-muted-foreground max-w-2xl rounded-lg border px-4 py-3 text-sm"
			data-testid="contacts-empty-org"
		>
			You need to own or administer an organization to use the speaker directory. Create one under
			<a href="/settings/organization" class="text-foreground underline">Settings → Organization</a
			>.
		</p>
	{:else}
		{#if form?.scope === 'import'}
			<!-- import answers in its section -->
		{:else if form?.error}
			<p
				class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="contacts-error"
			>
				{form.error}
			</p>
		{:else if form?.message}
			<p
				class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
				role="status"
				data-testid="contacts-message"
			>
				{form.message}
			</p>
		{/if}

		<!-- Multi-criteria filters (CRM-02): GET so the URL is the source of truth. -->
		<form
			method="GET"
			action="/contacts"
			class="flex flex-wrap items-end gap-3"
			data-testid="contacts-filters"
		>
			<div class="min-w-[10rem] flex-1">
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="contacts-q">
					Search
				</label>
				<Input
					id="contacts-q"
					name="q"
					type="search"
					placeholder="Name, email, company…"
					value={data.filters.q ?? ''}
					data-testid="contacts-search"
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="contacts-company">
					Company
				</label>
				<AppSelect
					id="contacts-company"
					name="company"
					class="w-44"
					testId="contacts-company-filter"
					value={data.filters.company ?? ''}
					options={companyOptions}
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="contacts-jobTitle">
					Job title
				</label>
				<AppSelect
					id="contacts-jobTitle"
					name="jobTitle"
					class="w-44"
					testId="contacts-jobtitle-filter"
					value={data.filters.jobTitle ?? ''}
					options={jobTitleOptions}
				/>
			</div>
			<div>
				<label class="text-muted-foreground mb-1 block text-xs font-medium" for="contacts-tag">
					Tag
				</label>
				<AppSelect
					id="contacts-tag"
					name="tag"
					class="w-40"
					testId="contacts-tag-filter"
					value={data.filters.tag ?? ''}
					options={tagOptions}
				/>
			</div>
			<Button type="submit" size="sm" variant="secondary">Apply</Button>
			{#if filtered}
				<Button href="/contacts" size="sm" variant="ghost" data-testid="contacts-clear-filters">
					Clear
				</Button>
			{/if}
		</form>

		<!-- Directory table (CRM-01) -->
		<div class="border-border overflow-x-auto rounded-lg border" data-testid="contacts-table">
			<table class="w-full min-w-[40rem] text-left text-sm">
				<thead class="bg-muted/40 text-muted-foreground border-b text-xs font-medium">
					<tr>
						<th class="px-3 py-2 font-medium">Name</th>
						<th class="px-3 py-2 font-medium">Company</th>
						<th class="px-3 py-2 font-medium">Job title</th>
						<th class="px-3 py-2 font-medium">Email</th>
						<th class="px-3 py-2 font-medium">Events</th>
						<th class="px-3 py-2 font-medium">Tags</th>
					</tr>
				</thead>
				<tbody>
					{#if data.contacts.length === 0}
						<tr>
							<td colspan="6" class="text-muted-foreground px-3 py-8 text-center text-sm">
								No contacts match. Add one below, import a CSV, or clear the filters.
							</td>
						</tr>
					{:else}
						{#each data.contacts as contact (contact.id)}
							<tr class="border-border hover:bg-muted/20 border-b last:border-0">
								<td class="px-3 py-2">
									<a
										href="/contacts/{contact.id}"
										class="text-foreground font-medium underline-offset-2 hover:underline"
										data-testid="contact-row-link"
									>
										{contact.name}
									</a>
								</td>
								<td class="text-muted-foreground px-3 py-2">{contact.company ?? '—'}</td>
								<td class="text-muted-foreground px-3 py-2">{contact.jobTitle ?? '—'}</td>
								<td class="text-muted-foreground px-3 py-2">{contact.email ?? '—'}</td>
								<td class="px-3 py-2">
									{#if contact.events.length === 0}
										<span class="text-muted-foreground">—</span>
									{:else}
										<span class="flex flex-wrap gap-1">
											{#each contact.events as event (event.conferenceId)}
												<a
													href="/manage/{event.slug}/speakers"
													class="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs hover:underline"
													title={event.status}
												>
													{event.name}
												</a>
											{/each}
										</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if contact.tags.length === 0}
										<span class="text-muted-foreground">—</span>
									{:else}
										<span class="flex flex-wrap gap-1">
											{#each contact.tags as tag (tag)}
												<span class="border-border rounded-full border px-1.5 py-0.5 text-xs">
													{tag}
												</span>
											{/each}
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Add contact -->
		<section
			class="border-border bg-card max-w-3xl rounded-lg border p-4"
			data-testid="contacts-add"
		>
			<h2 class="text-sm font-semibold">Add a contact</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Creates an org-wide profile. Push them onto an event from their detail page.
			</p>
			<form
				method="POST"
				action="?/add"
				use:enhance={submitting}
				class="mt-3 grid gap-3 sm:grid-cols-2"
			>
				<input type="hidden" name="organizationId" value={data.organizationId ?? ''} />
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-name">
						Name
					</label>
					<Input id="add-name" name="name" required data-testid="contacts-add-name" />
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-email">
						Email
					</label>
					<Input id="add-email" name="email" type="email" data-testid="contacts-add-email" />
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-company">
						Company
					</label>
					<Input id="add-company" name="company" data-testid="contacts-add-company" />
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-jobTitle">
						Job title
					</label>
					<Input id="add-jobTitle" name="jobTitle" data-testid="contacts-add-jobtitle" />
				</div>
				<div class="sm:col-span-2">
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-tags">
						Tags (comma-separated)
					</label>
					<Input
						id="add-tags"
						name="tags"
						placeholder="keynote, vip"
						data-testid="contacts-add-tags"
					/>
				</div>
				<div class="sm:col-span-2">
					<Button type="submit" size="sm" disabled={busy} data-testid="contacts-add-submit">
						Add contact
					</Button>
				</div>
			</form>
		</section>

		<SpeakerImport {busy} enhanceForm={submitting} form={form?.scope === 'import' ? form : null} />
	{/if}
</div>

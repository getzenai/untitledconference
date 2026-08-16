<script lang="ts">
	/**
	 * Contacts directory — org-wide contacts across events (CRM-01 / CRM-02 / CRM-05)
	 * plus overview KPIs and top-companies analytics (CRM-12).
	 *
	 * The add-contact dialog parks with BrowserDraftInput, same envelope as the
	 * profile (#789). Escape is not a navigation, so there is no UnsavedGuard —
	 * the draft is the fix, not a second line of defence (#763).
	 */
	import { browser } from '$app/environment';
	import { enhance } from '$lib/forms/enhance';
	import { clearBrowserDraft } from '$lib/forms/browser-draft';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import SpeakerImport from '$lib/components/app/conference/speaker-import.svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { contactFiltersHref } from '$lib/conference/contact-filters';
	import {
		NEW_CONTACT_FIELDS,
		contactImportCsvScope,
		newContactFieldScope
	} from '$lib/conference/contact-notes-draft';

	let { data, form } = $props();

	const filtered = $derived(
		Boolean(data.filters.q || data.filters.company || data.filters.jobTitle || data.filters.tag)
	);

	let busy = $state(false);
	let addOpen = $state(false);
	let importOpen = $state(false);
	let addCommit = $state(0);
	let importCommit = $state(0);

	const submitting = (kind: FormResetKind, onSuccess?: () => void) => () => {
		busy = true;
		return async ({
			update,
			result
		}: {
			update: (opts?: { reset?: boolean }) => Promise<void>;
			result: { type: string };
		}) => {
			try {
				await update(formUpdateOptions(kind));
				if (result.type === 'success') onSuccess?.();
			} finally {
				busy = false;
			}
		};
	};

	/** `add` redirects on success, so the result is `redirect`, not `success`. */
	const submittingAdd = () => {
		busy = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			try {
				if (result.type === 'redirect' && browser) {
					addCommit += 1;
					for (const field of NEW_CONTACT_FIELDS) {
						clearBrowserDraft(localStorage, newContactFieldScope(field), data.user.id);
					}
				}
				await update(formUpdateOptions('add'));
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

	const overview = $derived(data.overview);
	const maxCompanyCount = $derived(
		overview.topCompanies.reduce((m: number, c: { count: number }) => Math.max(m, c.count), 1)
	);
	const minCompanyCount = $derived(
		overview.topCompanies.reduce(
			(m: number, c: { count: number }) => Math.min(m, c.count),
			Number.POSITIVE_INFINITY
		)
	);
	/** #477: bars normalised to the max look identical when every company has the same count. */
	const companiesHaveALeader = $derived(
		overview.topCompanies.length > 0 && maxCompanyCount > minCompanyCount
	);
	const duplicateIdSet = $derived(new Set(data.duplicateIds ?? []));
</script>

<svelte:head>
	<title>Contacts</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight" data-testid="contacts-heading">Contacts</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				Organization-wide contacts across every event you administer.
				{#if data.canManage}
					<span class="text-foreground tabular-nums"> · {data.contacts.length} shown</span>
				{/if}
			</p>
		</div>
		{#if data.canManage}
			<div class="flex flex-wrap items-center gap-2">
				<Button
					href="/contacts/pipeline"
					size="sm"
					variant="secondary"
					data-testid="contacts-pipeline-link"
				>
					Sourcing pipeline
				</Button>

				<Dialog.Root bind:open={addOpen}>
					<Dialog.Trigger
						class={buttonVariants({ size: 'sm', variant: 'secondary' })}
						data-testid="contacts-add-open"
					>
						Add contact
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-lg" data-testid="contacts-add">
						<Dialog.Header>
							<Dialog.Title>Add a contact</Dialog.Title>
							<Dialog.Description>
								They appear in this directory. Open their page to add them to an event.
							</Dialog.Description>
						</Dialog.Header>
						<form
							method="POST"
							action="?/add"
							use:enhance={submittingAdd}
							class="grid gap-3 sm:grid-cols-2"
						>
							<input type="hidden" name="organizationId" value={data.organizationId ?? ''} />
							<div>
								<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-name">
									Name
								</label>
								<BrowserDraftInput
									id="add-name"
									name="name"
									scope={newContactFieldScope('name')}
									owner={data.user.id}
									baseline=""
									required
									testId="contacts-add-name"
									commitToken={addCommit}
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
									scope={newContactFieldScope('email')}
									owner={data.user.id}
									baseline=""
									testId="contacts-add-email"
									commitToken={addCommit}
								/>
							</div>
							<div>
								<label
									class="text-muted-foreground mb-1 block text-xs font-medium"
									for="add-company"
								>
									Company
								</label>
								<BrowserDraftInput
									id="add-company"
									name="company"
									scope={newContactFieldScope('company')}
									owner={data.user.id}
									baseline=""
									testId="contacts-add-company"
									commitToken={addCommit}
								/>
							</div>
							<div>
								<label
									class="text-muted-foreground mb-1 block text-xs font-medium"
									for="add-jobTitle"
								>
									Job title
								</label>
								<BrowserDraftInput
									id="add-jobTitle"
									name="jobTitle"
									scope={newContactFieldScope('jobTitle')}
									owner={data.user.id}
									baseline=""
									testId="contacts-add-jobtitle"
									commitToken={addCommit}
								/>
							</div>
							<div class="sm:col-span-2">
								<label class="text-muted-foreground mb-1 block text-xs font-medium" for="add-tags">
									Tags (one per line, or comma-separated)
								</label>
								<BrowserDraftInput
									id="add-tags"
									name="tags"
									scope={newContactFieldScope('tags')}
									owner={data.user.id}
									baseline=""
									rows={2}
									placeholder="keynote, vip"
									testId="contacts-add-tags"
									commitToken={addCommit}
								/>
							</div>
							{#if form?.scope === 'add' && form?.error}
								<p
									class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm sm:col-span-2"
									role="alert"
									data-testid="contacts-add-error"
								>
									{form.error}
								</p>
							{/if}
							<div class="sm:col-span-2">
								<Button type="submit" size="sm" disabled={busy} data-testid="contacts-add-submit">
									Add contact
								</Button>
							</div>
						</form>
					</Dialog.Content>
				</Dialog.Root>

				<Dialog.Root bind:open={importOpen}>
					<Dialog.Trigger
						class={buttonVariants({ size: 'sm', variant: 'secondary' })}
						data-testid="contacts-import-open"
					>
						Import
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-lg">
						<Dialog.Header>
							<Dialog.Title>Import contacts</Dialog.Title>
							<Dialog.Description>
								Load contacts from a CSV file or pasted rows; a contact already in the directory
								with the same email is skipped.
							</Dialog.Description>
						</Dialog.Header>
						<SpeakerImport
							embedded
							submitLabel="Import contacts"
							{busy}
							owner={data.user.id}
							scope={contactImportCsvScope(data.organizationId ?? 'none')}
							commitToken={importCommit}
							enhanceForm={submitting('add', () => {
								importCommit += 1;
							})}
							form={form?.scope === 'import' ? form : null}
						/>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		{/if}
	</div>

	{#if !data.canManage}
		<p
			class="border-border bg-card text-muted-foreground max-w-2xl rounded-lg border px-4 py-3 text-sm"
			data-testid="contacts-empty-org"
		>
			You need to own or administer an organization to use Contacts. Create one under
			<a href="/settings/organization" class="text-foreground underline">Settings → Organization</a
			>.
		</p>
	{:else}
		<!-- Add and import answer inside their own dialog, where the click was; a
			 confirmation behind the overlay is one nobody reads. -->
		{#if form?.scope === 'add' || form?.scope === 'import'}
			<!-- rendered in the dialog -->
		{:else if form?.scope === 'segment'}
			{#if form?.error}
				<p
					class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
					role="alert"
					data-testid="contacts-segment-error"
				>
					{form.error}
				</p>
			{:else if form?.message}
				<p
					class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
					role="status"
					data-testid="contacts-segment-message"
				>
					{form.message}
				</p>
			{/if}
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

		<!-- CRM-12: counts sit in a single line so the directory table stays
		     on screen. The company chart only renders when one firm actually
		     leads — otherwise every bar is full-width black (#477). -->
		<section class="space-y-3" aria-label="CRM overview" data-testid="crm-overview">
			<p
				class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums"
				data-testid="crm-kpis"
			>
				<span
					><span class="text-foreground font-medium" data-testid="crm-kpi-total-contacts"
						>{overview.totalContacts}</span
					>
					{overview.totalContacts === 1 ? 'contact' : 'contacts'}</span
				>
				<span
					><span class="text-foreground font-medium" data-testid="crm-kpi-events"
						>{overview.eventsWithSpeakers}</span
					>
					{overview.eventsWithSpeakers === 1 ? 'event with speakers' : 'events with speakers'}</span
				>
				<span
					><span class="text-foreground font-medium" data-testid="crm-kpi-returning"
						>{overview.returningSpeakers}</span
					>
					{overview.returningSpeakers === 1 ? 'returning speaker' : 'returning speakers'}</span
				>
			</p>

			{#if companiesHaveALeader}
				<div class="border-border bg-card rounded-lg border p-4" data-testid="crm-top-companies">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2 class="text-sm font-semibold tracking-tight">Top companies</h2>
						<p class="text-muted-foreground text-xs">Click a company to filter the directory</p>
					</div>
					<ul class="mt-3 space-y-2" data-testid="crm-top-companies-list">
						{#each overview.topCompanies as bucket (bucket.company)}
							<li>
								<a
									href="/contacts?company={encodeURIComponent(bucket.company)}"
									class="hover:bg-muted/40 focus-visible:ring-ring group flex items-center gap-3 rounded-md px-1 py-1 focus-visible:ring-[3px] focus-visible:outline-none"
									data-testid="crm-company-link"
									data-company={bucket.company}
								>
									<span class="min-w-0 flex-1 truncate text-sm font-medium">{bucket.company}</span>
									<span
										class="bg-muted relative h-2 w-28 shrink-0 overflow-hidden rounded-full sm:w-40"
										aria-hidden="true"
									>
										<span
											class="bg-primary absolute inset-y-0 left-0 rounded-full"
											style="width: {(bucket.count / maxCompanyCount) * 100}%"
										></span>
									</span>
									<span class="text-muted-foreground w-8 shrink-0 text-right text-sm tabular-nums">
										{bucket.count}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

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

		<!-- Saved segments (CRM-09): dynamic filters re-run against the live directory. -->
		<section class="space-y-3" data-testid="contacts-segments">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold tracking-tight">Saved segments</h2>
					<p class="text-muted-foreground text-xs">
						Named filter sets that reopen with matching contacts (auto-updating).
					</p>
				</div>
			</div>

			{#if filtered}
				<form
					method="POST"
					action="?/saveSegment"
					use:enhance={submitting('add')}
					class="border-border bg-card flex flex-wrap items-end gap-2 rounded-lg border p-3"
					data-testid="contacts-save-segment"
				>
					<input type="hidden" name="organizationId" value={data.organizationId ?? ''} />
					<input type="hidden" name="q" value={data.filters.q ?? ''} />
					<input type="hidden" name="company" value={data.filters.company ?? ''} />
					<input type="hidden" name="jobTitle" value={data.filters.jobTitle ?? ''} />
					<input type="hidden" name="tag" value={data.filters.tag ?? ''} />
					<div class="min-w-[12rem] flex-1">
						<label class="text-muted-foreground mb-1 block text-xs font-medium" for="segment-name">
							Save current filters as
						</label>
						<Input
							id="segment-name"
							name="name"
							placeholder="AI Experts"
							required
							data-testid="contacts-segment-name"
						/>
					</div>
					<Button type="submit" size="sm" disabled={busy} data-testid="contacts-segment-save">
						Save segment
					</Button>
				</form>
			{/if}

			{#if data.segments.length === 0}
				<p class="text-muted-foreground text-sm" data-testid="contacts-segments-empty">
					No saved segments yet. Apply a filter above, then save it with a name.
				</p>
			{:else}
				<ul class="flex flex-wrap gap-2" data-testid="contacts-segments-list">
					{#each data.segments as segment (segment.id)}
						<li
							class="border-border bg-card flex items-center gap-1 rounded-full border pr-1 pl-3 text-sm"
						>
							<a
								href={contactFiltersHref(segment.filters)}
								class="font-medium hover:underline"
								data-testid="contacts-segment-link"
								data-segment={segment.name}
							>
								{segment.name}
							</a>
							<form method="POST" action="?/deleteSegment" use:enhance={submitting('edit')}>
								<input type="hidden" name="segmentId" value={segment.id} />
								<button
									type="submit"
									class="text-muted-foreground hover:text-foreground rounded-full px-2 py-1 text-xs"
									aria-label="Delete segment {segment.name}"
									data-testid="contacts-segment-delete"
								>
									×
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

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
								No contacts match. Add one, import a CSV, or clear the filters.
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
									{#if duplicateIdSet.has(contact.id)}
										<span
											class="border-status-warn text-status-warn ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
											data-testid="contact-duplicate-badge"
											title="Another contact shares this name"
										>
											Duplicate
										</span>
									{/if}
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
	{/if}
</div>

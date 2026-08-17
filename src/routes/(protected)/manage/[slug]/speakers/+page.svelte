<script lang="ts">
	/**
	 * Speaker roster — who is on this conference, and where they are in the
	 * workflow (SPK-01 list/search, SPK-02 add/edit, SPK-04 status filter + change).
	 *
	 * Filters in the URL so a search survives reload and can be pasted. Edits are
	 * per-row forms rather than a drawer: organizers change one field and move on.
	 *
	 * The open row parks in `SpeakerRowEditForm` with a leave prompt. The add
	 * dialog parks the same way, without a prompt — Escape is not a navigation.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import {
		SPEAKER_ROW_LEAVE_PROMPT,
		clearSpeakerRowDrafts,
		speakerImportCsvScope
	} from '$lib/conference/speaker-notes-draft';
	import AddSpeakerForm from '$lib/components/app/conference/add-speaker-form.svelte';
	import ComposeForm from '$lib/components/app/conference/compose-form.svelte';
	import ScrollTable from '$lib/components/app/conference/scroll-table.svelte';
	import SpeakerImport from '$lib/components/app/conference/speaker-import.svelte';
	import SpeakerRowEditForm from '$lib/components/app/conference/speaker-row-edit-form.svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import { humanise } from '$lib/components/status-badge.svelte';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';

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
	// The compose draft lives here, not in the dialog, so Escape — the documented
	// way out of that dialog — puts a half-written message to fourteen speakers
	// away instead of destroying it (#435). Cleared only once it has been sent.
	let mailSubject = $state('');
	let mailBody = $state('');
	let addOpen = $state(false);
	let addCommit = $state(0);
	let importOpen = $state(false);
	let importCommit = $state(0);
	const dirtyFields = new SvelteSet<string>();

	function setFieldDirty(id: string, dirty: boolean) {
		if (dirty) dirtyFields.add(id);
		else dirtyFields.delete(id);
	}

	/**
	 * The row control and the Add dialog: the status in the product's own casing.
	 *
	 * `humanise` is the same function the badge used, so `confirmed` reads
	 * `Confirmed` here exactly as it did there — the raw enum was only ever
	 * visible because this list passed the database value through as its label.
	 */
	const statusOptions = $derived(
		data.statuses.map((status: string) => ({ value: status, label: humanise(status) }))
	);

	/**
	 * The filter's own list, with the counts the removed chip row used to carry.
	 *
	 * Same values, one extra job: `Confirmed (14)` answers "how many are there"
	 * while you are choosing. The counts are of the whole roster, not of the
	 * current filter — that is what makes them useful while a filter is on.
	 */
	const statusFilterOptions = $derived([
		{ value: '', label: `All statuses (${data.counts.total})` },
		...data.statuses.map((status) => ({
			value: status,
			label: `${humanise(status)} (${data.counts[status] ?? 0})`
		}))
	]);

	/**
	 * The counts at a glance, in the subtitle rather than in a row of filter pills.
	 *
	 * The pills were a second filter; the numbers on them were not — that part was
	 * worth keeping, so it moved to the one place on this page that is prose. Empty
	 * statuses are left out: "0 declined" is a fact about nothing.
	 */
	const breakdown = $derived(
		data.statuses
			.map((status) => ({
				status,
				count: Number(data.counts[status] ?? 0),
				label: humanise(status)
			}))
			.filter((entry) => entry.count > 0)
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

	const submitting = (kind: FormResetKind, onSuccess?: () => void) => {
		return (_input: unknown) => {
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

	let filterForm: HTMLFormElement;

	/**
	 * Apply the moment a filter changes — the same contract `/manage/:conf/submissions`
	 * already has (#552).
	 *
	 * `change` rather than `input`: this is a GET form and submitting it navigates,
	 * so firing per keystroke would reload the page under the organizer's caret. On
	 * the search box `change` means blur or Enter.
	 */
	const applyFilters = (event: Event) => {
		(event.currentTarget as HTMLFormElement).requestSubmit();
	};

	/**
	 * The app-drawn dropdown applies itself, because nothing else will: a shadcn
	 * select writes its hidden input programmatically and dispatches no bubbling
	 * `change`, so the form's own handler never hears it. `tick()` first, for the
	 * same reason `submitOwnForm` needs one — the hidden input lands on the next
	 * flush, and submitting before it does would post the previous choice.
	 */
	const applyFiltersAfterFlush = async () => {
		await tick();
		filterForm?.requestSubmit();
	};

	const roleLine = (speaker: { jobTitle: string | null; company: string | null }) => {
		if (speaker.jobTitle && speaker.company) return `${speaker.jobTitle}, ${speaker.company}`;
		return speaker.jobTitle ?? speaker.company ?? '—';
	};
</script>

<svelte:head>
	<title>Speakers — {data.conference.name}</title>
</svelte:head>

<UnsavedGuard dirty={dirtyFields.size > 0} message={SPEAKER_ROW_LEAVE_PROMPT} />

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Speakers</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
				{data.counts.total} on the roster{#each breakdown as entry (entry.status)}&nbsp;·
					{entry.count}
					{entry.label}{/each}
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
							One message to the addresses in the current filter. You can look this send up later in
							the conference mail log.
						</Dialog.Description>
					</Dialog.Header>
					<ComposeForm
						recipients={mailRecipients}
						{filtered}
						filters={data.filters}
						{busy}
						{form}
						bind:subject={mailSubject}
						bind:body={mailBody}
						enhanceForm={submitting('add', () => {
							composeOpen = false;
							mailSubject = '';
							mailBody = '';
						})}
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
				<Dialog.Content class="sm:max-w-lg" data-testid="speakers-add-dialog">
					<Dialog.Header>
						<Dialog.Title>Add a speaker</Dialog.Title>
						<Dialog.Description>
							Creates an org-wide profile (or reuses one by email) and puts them on this conference.
						</Dialog.Description>
					</Dialog.Header>
					<AddSpeakerForm
						slug={data.conference.slug}
						owner={data.user.id}
						commitToken={addCommit}
						{statusOptions}
						{busy}
						{form}
						enhanceForm={submitting('add', () => {
							addOpen = false;
							addCommit += 1;
						})}
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
					<SpeakerImport
						embedded
						{busy}
						owner={data.user.id}
						scope={speakerImportCsvScope(data.conference.slug)}
						commitToken={importCommit}
						enhanceForm={submitting('add', () => {
							importCommit += 1;
						})}
						{form}
					/>
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

	<!--
		Search + status filter (GET so the URL is the source of truth).

		One filter mechanism, not two (#552). This row used to sit above a second
		row of status pills that filtered the same column by a different route, with
		nothing on screen saying whether the two combined or overrode each other —
		they overrode, which is the reading nobody makes. The pills' counts moved
		into the options of the control that survived.
	-->
	<form
		bind:this={filterForm}
		method="GET"
		action="{base}/speakers"
		class="flex flex-wrap items-end gap-3"
		data-testid="speakers-filters"
		onchange={applyFilters}
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
				class="w-56"
				testId="speakers-status-filter"
				value={data.filters.status ?? ''}
				options={statusFilterOptions}
				onValueChange={applyFiltersAfterFlush}
			/>
		</div>

		<!--
			No "Apply": both controls apply themselves, so the button was a second
			step that only ever meant "yes, I meant it". Without JavaScript nothing
			would apply at all, so the fallback is a real submit that only exists
			in that case.
		-->
		<noscript>
			<button
				type="submit"
				class="border-input bg-background hover:bg-muted h-9 rounded-md border px-3 text-sm"
			>
				Filter
			</button>
		</noscript>

		{#if filtered}
			<a
				href="{base}/speakers"
				class="text-muted-foreground hover:text-foreground pb-1.5 text-sm underline underline-offset-4"
			>
				Clear
			</a>
		{/if}
	</form>

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
			Four columns do not fit a phone, and this box did not own that scroll:
			the table is `min-w-[40rem]` (640px) inside a wrapper whose
			`overflow-x` was `visible`, so the *document* scrolled sideways
			instead (#897). `ScrollTable` is the same wrapper /submissions and
			/decisions already use — the rounding stays on the outer box, the
			scroll lives on an inner one, and `relative` on that viewport keeps
			the Actions `sr-only` span from resolving against the page.
		-->
		<ScrollTable label="Scroll sideways for role, status and actions" data-testid="speakers-table">
			<table class="w-full min-w-[40rem] text-left text-sm">
				<thead class="border-border bg-muted border-b text-xs" data-testid="speakers-table-head">
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
									use:enhance={submitting('edit')}
									class="flex flex-wrap items-center gap-2"
									data-testid="speaker-status-form"
								>
									<input type="hidden" name="speakerProfileId" value={speaker.speakerProfileId} />
									<!--
										One control, not two (#552). A read-only badge used to sit above
										this select showing the same word in a different casing, which
										doubled every row's height and made the organizer look for a
										distinction that was not there. The select already shows the
										status, and it is the one you can act on.
									-->
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
									<SpeakerRowEditForm
										slug={data.conference.slug}
										owner={data.user.id}
										{speaker}
										{busy}
										enhanceForm={submitting('edit', () => {
											clearSpeakerRowDrafts(
												localStorage,
												data.conference.slug,
												speaker.speakerProfileId,
												data.user.id
											);
											dirtyFields.clear();
										})}
										ondirtychange={(field, dirty) =>
											setFieldDirty(`${field}:${speaker.speakerProfileId}`, dirty)}
									/>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</ScrollTable>
	{/if}
</div>

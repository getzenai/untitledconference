<script lang="ts">
	/**
	 * The CFP form builder (Ü1, CFP-01/02).
	 *
	 * Two columns, and the right one is the point: the organizer is building a form
	 * somebody else has to fill in, so the preview beside the editor answers "what will
	 * they see" without publishing anything. Conditional fields are the reason it has
	 * to be interactive — a rule like "only for workshops" is invisible in a field list
	 * and obvious the moment the preview's format selector changes.
	 *
	 * The preview renders through the same `visibleFields` the public form and the
	 * submission handler use. A preview with its own rendering logic is a demo, not a
	 * preview.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { callWindow } from '$lib/conference/call-window';
	import { callHint } from '$lib/conference/deadline';
	import { readerZone } from '$lib/conference/reader-zone.svelte';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import { fixedQuestionVisibility } from '$lib/conference/fixed-questions';
	import {
		FIELD_KINDS,
		parseOptions,
		visibleFields,
		type AnswerContext,
		type FieldDefinition
	} from '$lib/conference/form-definition';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import DateTimePicker from '$lib/components/app/datetime-picker.svelte';
	import CfpFieldEditor from '$lib/components/app/conference/cfp-field-editor.svelte';
	import FixedQuestionsList from '$lib/components/app/conference/fixed-questions-list.svelte';
	import FixedQuestionsPreview from '$lib/components/app/conference/fixed-questions-preview.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();

	let busy = $state(false);

	// A placeholder rather than a default value: the real text is the one thing on
	// this screen only the organizer knows, and a prefilled box invites shipping
	// someone else's words.
	const DESCRIPTION_HINT = `## What we are looking for

We want talks that show the work — **the migration that failed first**, the number that moved.

- Reviews are anonymous; your name is hidden from reviewers.
- Travel is covered for accepted speakers.
- You can edit until the call closes. See [last year's programme](https://example.com/2026).`;

	const submitting = (kind: FormResetKind) => () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions(kind));
			} finally {
				busy = false;
			}
		};
	};

	/**
	 * The picker posts wall time with no zone — the same string `datetime-local` posted
	 * — and the server runs in UTC, so a plain submit stores 14:00 CEST as 14:00Z,
	 * redisplays it as 16:00, and the next save persists 16:00Z. Both deadlines walk by
	 * the offset on every click, and one of them locks submissions.
	 *
	 * The browser knows the offset the organizer meant, including which side of DST
	 * the date is on, so the conversion happens here and the server receives an
	 * instant. Without JavaScript the raw value is still read as UTC — one honest
	 * fallback rather than a value that drifts.
	 */
	const saveSettings = ({ formData }: { formData: FormData }) => {
		for (const name of ['opensAt', 'closesAt']) {
			const raw = formData.get(name);
			if (typeof raw === 'string' && raw) formData.set(name, new Date(raw).toISOString());
		}
		return submitting('edit')();
	};

	const fields = $derived(data.fields as unknown as FieldDefinition[]);

	/**
	 * Which built-in questions this call still asks (#159), read from the stored
	 * column through the same function the public form uses. Two readers of one
	 * value, never two interpretations of it.
	 */
	const fixedVisibility = $derived(fixedQuestionVisibility(data.form?.hiddenFixedFields));

	// Preview state. Deliberately not persisted: it is a what-if, not a draft.
	let previewFormat = $state<number | null>(null);
	let previewTrack = $state<number | null>(null);
	let previewAnswers = $state<Record<number, string>>({});

	const previewContext = $derived<AnswerContext>({
		sessionFormatId: previewFormat,
		trackId: previewTrack,
		answers: previewAnswers
	});

	const shown = $derived(visibleFields(fields, previewContext));
	const hiddenCount = $derived(fields.length - shown.length);

	const kindLabel = (kind: string) =>
		FIELD_KINDS.find((k) => k.value === kind)?.label ?? kind.replace(/_/g, ' ');

	/** The picker reads local wall time without the zone suffix, as the native field did. */
	const localInput = (value: Date | string | null) => {
		if (!value) return '';
		const date = new Date(value);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};

	const named = (list: { id: number; name: string }[], value: string) =>
		list.find((entry) => String(entry.id) === value)?.name ?? '—';

	const conditionLabel = (field: FieldDefinition) => {
		const value = field.conditionValue ?? '';
		if (field.conditionSource === 'session_format') {
			return `Shown for format: ${named(data.formats, value)}`;
		}
		if (field.conditionSource === 'track') return `Shown for track: ${named(data.tracks, value)}`;
		if (field.conditionSource === 'field') {
			const parent = fields.find((f) => f.id === field.conditionFieldId);
			return `Shown when “${parent?.label ?? 'a deleted field'}” is “${value}”`;
		}
		return null;
	};

	const STATUS_OPTIONS = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'published', label: 'Published' },
		{ value: 'closed', label: 'Closed' }
	];

	/**
	 * Same window the public form uses (`$lib/conference/call-window`): a published
	 * form is not "live" when opensAt is still ahead or closesAt has passed. Shared
	 * so the banner can never claim Live while speakers see closed/not yet open.
	 */
	const publicCallWindow = $derived.by(() => {
		const form = data.form;
		if (!form || form.status !== 'published') return null;
		return callWindow(form.opensAt, form.closesAt, false, new Date());
	});

	/** The sentence under each picker: which clock this field is on (#468). */
	const zone = readerZone();
	const deadlineHint = (value: Date | string | null) => callHint(value, zone.current);

	const YES_NO_OPTIONS = [
		{ value: '', label: '—' },
		{ value: 'true', label: 'Yes' },
		{ value: 'false', label: 'No' }
	];

	const choiceOptions = (field: FieldDefinition) => [
		{ value: '', label: '—' },
		...parseOptions(field.options).map((option) => ({ value: option, label: option }))
	];
</script>

<svelte:head>
	<title>Call for papers — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Call for papers</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				The form submitters fill in. What you build here is what they see, and what the server
				checks when they send it.
			</p>
		</div>
		{#if data.form}
			<StatusBadge status={data.form.status} />
		{/if}
	</div>
</div>

<div class="px-6 py-5">
	{#if form?.message}
		<p
			class="mb-3 rounded-md border px-3 py-2 text-sm {form.success === false
				? 'border-status-bad text-status-bad'
				: 'border-status-good text-status-good'}"
			role="status"
		>
			{form.message}
		</p>
	{/if}

	{#if !data.form}
		<EmptyState
			title="No call for papers yet"
			description="Create it and it already asks for a title, an abstract and who the speaker is — you add the questions you want on top of those. Nothing is public until you publish it."
		>
			<form
				method="POST"
				action="?/createForm"
				use:enhance={submitting('add')}
				class="mt-3 flex gap-2"
			>
				<Input
					name="title"
					value="{data.conference.name} — Call for papers"
					class="w-72"
					aria-label="Title"
				/>
				<Button type="submit" disabled={busy}>Create the call for papers</Button>
			</form>
		</EmptyState>
	{:else}
		<!-- Publish is a one-click act, not a buried Status select. Fabian's review
		     hit "I published the conference and still see no CFP" — the form stayed
		     draft until someone found Status → Published → Save settings. -->
		{#if data.form.status === 'draft'}
			<section
				class="border-status-warn/40 bg-status-warn-bg mb-4 max-w-3xl rounded-lg border p-4"
				data-testid="cfp-publish-banner"
				role="status"
			>
				<h2 class="text-sm font-semibold">This call is still a draft</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Speakers cannot submit until you publish it
					{#if data.conference.status !== 'published'}
						— and the conference itself must be published in
						<a
							class="underline underline-offset-4"
							href={`/manage/${data.conference.slug}/settings`}>Settings</a
						>
						for the public site to appear
					{/if}.
				</p>
				<form method="POST" action="?/publishForm" use:enhance={submitting('edit')} class="mt-3">
					<Button type="submit" size="sm" disabled={busy} data-testid="cfp-publish">
						Publish call for papers
					</Button>
				</form>
			</section>
		{:else if data.form.status === 'published'}
			<section
				class="border-status-good/40 bg-status-good-bg mb-4 max-w-3xl rounded-lg border p-4"
				data-testid="cfp-live-banner"
				role="status"
			>
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold">Call for papers is published</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							{#if data.conference.status !== 'published'}
								The form is ready, but the conference is still a draft — publish it in
								<a
									class="underline underline-offset-4"
									href={`/manage/${data.conference.slug}/settings`}>Settings</a
								>
								so speakers can reach the public site.
							{:else if publicCallWindow === 'not_yet_open'}
								Published, but not open yet (opens date is in the future) —
								<a
									class="underline underline-offset-4"
									href={`/c/${data.conference.slug}/cfp`}
									target="_blank"
									rel="noopener">public form</a
								>
								shows “not opened yet”.
							{:else if publicCallWindow === 'closed'}
								Published, but past the closes date —
								<a
									class="underline underline-offset-4"
									href={`/c/${data.conference.slug}/cfp`}
									target="_blank"
									rel="noopener">public form</a
								>
								shows closed to new submissions.
							{:else}
								Live on the public site —
								<a
									class="underline underline-offset-4"
									href={`/c/${data.conference.slug}/cfp`}
									target="_blank"
									rel="noopener">open the public form</a
								>.
							{/if}
						</p>
					</div>
					<form method="POST" action="?/closeForm" use:enhance={submitting('edit')}>
						<Button
							type="submit"
							variant="outline"
							size="sm"
							disabled={busy}
							data-testid="cfp-close"
						>
							Close call
						</Button>
					</form>
				</div>
			</section>
		{:else if data.form.status === 'closed'}
			<section
				class="border-border bg-muted/40 mb-4 max-w-3xl rounded-lg border p-4"
				data-testid="cfp-closed-banner"
				role="status"
			>
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold">Call for papers is closed</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							No new submissions. Re-open by setting Status to Published below and saving, or
							publish again.
						</p>
					</div>
					<form method="POST" action="?/publishForm" use:enhance={submitting('edit')}>
						<Button type="submit" size="sm" disabled={busy} data-testid="cfp-publish">
							Re-open call
						</Button>
					</form>
				</div>
			</section>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
			<div class="space-y-4">
				<section class="border-border bg-card rounded-lg border p-4">
					<h2 class="text-sm font-semibold">Settings</h2>
					<form
						method="POST"
						action="?/updateForm"
						use:enhance={saveSettings}
						class="mt-3 grid gap-2 sm:grid-cols-2"
					>
						<label class="text-muted-foreground text-xs">
							Title
							<Input name="title" value={data.form.title} class="mt-1" />
						</label>
						<!-- A trigger button is not a labelable element, so these three get a
						     `for`/`id` pair and a plain <label> rather than a wrapping one that
						     would look connected and do nothing on click. -->
						<div class="text-muted-foreground text-xs">
							<label for="cfp-status">Status</label>
							<AppSelect
								id="cfp-status"
								name="status"
								value={data.form.status}
								options={STATUS_OPTIONS}
								class="mt-1"
							/>
						</div>
						<div class="text-muted-foreground text-xs">
							<label for="cfp-opens-at">Opens</label>
							<DateTimePicker
								id="cfp-opens-at"
								name="opensAt"
								value={localInput(data.form.opensAt)}
								placeholder="No opening date"
								class="mt-1"
							/>
							<span class="mt-1 block">{deadlineHint(data.form.opensAt)}</span>
						</div>
						<div class="text-muted-foreground text-xs">
							<label for="cfp-closes-at">Closes — after this, submissions and edits lock</label>
							<DateTimePicker
								id="cfp-closes-at"
								name="closesAt"
								value={localInput(data.form.closesAt)}
								placeholder="No closing date"
								class="mt-1"
							/>
							<span class="mt-1 block">{deadlineHint(data.form.closesAt)}</span>
						</div>
						<label class="text-muted-foreground text-xs sm:col-span-2">
							What submitters should know before they start
							<Textarea
								name="description"
								rows={8}
								value={data.form.description ?? ''}
								class="mt-1"
								placeholder={DESCRIPTION_HINT}
							/>
							<span class="mt-1 block">
								Shown above the form. Markdown: <code>#</code> headings, <code>-</code> or
								<code>1.</code> lists, <code>**bold**</code>, <code>[text](https://…)</code>, and
								<code>---</code> for a rule. A blank line starts a paragraph.
							</span>
						</label>
						<div class="sm:col-span-2">
							<Button type="submit" size="sm" disabled={busy}>Save settings</Button>
						</div>
					</form>
				</section>

				<FixedQuestionsList visibility={fixedVisibility} {busy} />

				<section class="border-border bg-card rounded-lg border p-4">
					<h2 class="text-sm font-semibold">
						Fields <span class="text-muted-foreground font-normal tabular-nums"
							>({fields.length})</span
						>
					</h2>
					<p class="text-muted-foreground mt-0.5 text-xs">
						Extra questions, asked after the ones above.
					</p>

					{#if fields.length === 0}
						<p class="text-muted-foreground mt-2 text-sm">
							No extra questions yet. The form still asks everything under “Always asked”.
						</p>
					{/if}

					<ul class="mt-3 space-y-2">
						{#each fields as field, index (field.id)}
							<li class="border-border rounded-md border">
								<details>
									<summary
										class="hover:bg-muted/50 flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm"
									>
										<span class="font-medium">{field.label}</span>
										<span class="text-muted-foreground text-xs">{kindLabel(field.kind)}</span>
										{#if field.required}
											<StatusBadge status="pending" label="Required" />
										{/if}
										{#if conditionLabel(field)}
											<span class="text-muted-foreground text-xs">· {conditionLabel(field)}</span>
										{/if}
									</summary>

									<div class="border-border space-y-2 border-t px-3 py-3">
										<form
											method="POST"
											action="?/updateField"
											use:enhance={submitting('edit')}
											class="space-y-2"
										>
											<input type="hidden" name="id" value={field.id} />
											<CfpFieldEditor
												{field}
												{fields}
												formats={data.formats}
												tracks={data.tracks}
											/>
											<!--
												Every open field repeats the same four words. The row it
												belongs to is on screen and absent from the accessible
												name, so each button carries its field (#475).
											-->
											<Button
												type="submit"
												size="sm"
												disabled={busy}
												aria-label={`Save “${field.label}”`}
											>
												Save field
											</Button>
										</form>

										<div class="flex flex-wrap gap-2">
											<form method="POST" action="?/moveField" use:enhance={submitting('edit')}>
												<input type="hidden" name="id" value={field.id} />
												<input type="hidden" name="direction" value="up" />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													disabled={busy || index === 0}
													aria-label={`Move “${field.label}” up`}
												>
													Move up
												</Button>
											</form>
											<form method="POST" action="?/moveField" use:enhance={submitting('edit')}>
												<input type="hidden" name="id" value={field.id} />
												<input type="hidden" name="direction" value="down" />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													disabled={busy || index === fields.length - 1}
													aria-label={`Move “${field.label}” down`}
												>
													Move down
												</Button>
											</form>
											<form method="POST" action="?/deleteField" use:enhance={submitting('edit')}>
												<input type="hidden" name="id" value={field.id} />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													disabled={busy}
													aria-label={`Remove “${field.label}”`}
												>
													Remove
												</Button>
											</form>
										</div>
									</div>
								</details>
							</li>
						{/each}
					</ul>

					<form
						method="POST"
						action="?/addField"
						use:enhance={submitting('add')}
						class="border-border mt-4 space-y-2 border-t pt-4"
					>
						<h3 class="text-sm font-medium">Add a field</h3>
						<CfpFieldEditor field={null} {fields} formats={data.formats} tracks={data.tracks} />
						<Button type="submit" size="sm" disabled={busy}>Add field</Button>
					</form>
				</section>
			</div>

			<section class="border-border bg-card h-fit rounded-lg border p-4">
				<h2 class="text-sm font-semibold">What the submitter sees</h2>
				<p class="text-muted-foreground mt-0.5 text-xs">
					Change the format or track to watch conditional fields appear and disappear.
					{#if hiddenCount > 0}
						<span class="text-status-warn">
							{hiddenCount === 1 ? '1 field is' : `${hiddenCount} fields are`} hidden right now.
						</span>
					{/if}
				</p>

				<div class="mt-3 space-y-3">
					<FixedQuestionsPreview
						formats={data.formats}
						tracks={data.tracks}
						visibility={fixedVisibility}
						onFormat={(id) => (previewFormat = id)}
						onTrack={(id) => (previewTrack = id)}
					/>

					{#if shown.length > 0}
						<h3 class="text-muted-foreground pt-1 text-xs font-semibold tracking-wide uppercase">
							Questions from the organizers
						</h3>
					{/if}

					{#each shown as field (field.id)}
						<!-- A picture of the field, not a copy of it: no `name`, so nothing here
						     posts. The dropdowns still answer the preview's own question — which
						     conditional fields a given answer reveals. -->
						<div class="block text-sm">
							<span class="text-muted-foreground text-xs">
								{field.label}{#if field.required}<span class="text-status-bad"> *</span>{/if}
							</span>

							{#if field.kind === 'long_text'}
								<Textarea
									rows={2}
									class="mt-1"
									aria-label={field.label}
									oninput={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								/>
							{:else if field.kind === 'select'}
								<AppSelect
									options={choiceOptions(field)}
									placeholder="—"
									class="mt-1"
									aria-label={field.label}
									onValueChange={(value) => (previewAnswers[field.id] = value)}
								/>
							{:else if field.kind === 'boolean'}
								<AppSelect
									options={YES_NO_OPTIONS}
									placeholder="—"
									class="mt-1"
									aria-label={field.label}
									onValueChange={(value) => (previewAnswers[field.id] = value)}
								/>
							{:else if field.kind === 'file'}
								<input type="file" disabled aria-label={field.label} class="mt-1 w-full text-sm" />
							{:else}
								<Input
									class="mt-1"
									aria-label={field.label}
									oninput={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								/>
							{/if}
						</div>
					{/each}

					{#if shown.length === 0}
						<p class="text-muted-foreground text-sm">
							No extra questions right now — the submitter still fills in everything above.
						</p>
					{/if}
				</div>
			</section>
		</div>
	{/if}
</div>

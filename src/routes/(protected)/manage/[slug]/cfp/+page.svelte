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
	import { enhance } from '$app/forms';
	import {
		FIELD_KINDS,
		parseOptions,
		visibleFields,
		type AnswerContext,
		type FieldDefinition
	} from '$lib/conference/form-definition';
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
	const DESCRIPTION_HINT = `We want talks that show the work — the migration that failed first, the number that moved.

- Reviews are anonymous; your name is hidden from reviewers.
- Travel is covered for accepted speakers.
- You can edit until the call closes.`;

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

	/**
	 * `datetime-local` gives wall time with no zone, and the server runs in UTC — so a
	 * plain submit stores 14:00 CEST as 14:00Z, redisplays it as 16:00, and the next
	 * save persists 16:00Z. Both deadlines walk by the offset on every click, and one
	 * of them locks submissions.
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
		return submitting();
	};

	const fields = $derived(data.fields as unknown as FieldDefinition[]);

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

	/** `<input type="datetime-local">` wants local wall time without the zone suffix. */
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

	const optionsText = (field: FieldDefinition) => parseOptions(field.options).join('\n');

	const selectClass =
		'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none';
</script>

<svelte:head>
	<title>Call for papers — {data.conference.name}</title>
</svelte:head>

{#snippet conditionInputs(field: FieldDefinition | null)}
	{@const source = field?.conditionSource ?? ''}
	<div class="flex flex-wrap items-center gap-2">
		<select name="conditionSource" aria-label="Show this field" class={selectClass}>
			<option value="" selected={!source}>Always shown</option>
			<option value="session_format" selected={source === 'session_format'}>
				Only for session format…
			</option>
			<option value="track" selected={source === 'track'}>Only for track…</option>
			<option value="field" selected={source === 'field'}>Only when another answer is…</option>
		</select>

		<!-- One control per source rather than one box that means three things. The
		     server reads the one its source names; a format or track is chosen by name,
		     never by an id typed from memory. Irrelevant controls stay out of the way
		     via :has() on .field-editor (see <style>) so the chosen rule is readable. -->
		<select
			name="conditionFieldId"
			aria-label="Depends on field"
			class="field-editor-when-field {selectClass}"
		>
			<option value="">(field)</option>
			{#each fields as other (other.id)}
				{#if other.id !== field?.id}
					<option value={other.id} selected={field?.conditionFieldId === other.id}>
						{other.label}
					</option>
				{/if}
			{/each}
		</select>

		<select
			name="conditionValueFormat"
			aria-label="Which session format"
			class="field-editor-when-format {selectClass}"
		>
			<option value="">(format)</option>
			{#each data.formats as format (format.id)}
				<option
					value={format.id}
					selected={source === 'session_format' && field?.conditionValue === String(format.id)}
				>
					{format.name}
				</option>
			{/each}
		</select>

		<select
			name="conditionValueTrack"
			aria-label="Which track"
			class="field-editor-when-track {selectClass}"
		>
			<option value="">(track)</option>
			{#each data.tracks as track (track.id)}
				<option
					value={track.id}
					selected={source === 'track' && field?.conditionValue === String(track.id)}
				>
					{track.name}
				</option>
			{/each}
		</select>

		<div class="field-editor-when-field">
			<Input
				name="conditionValue"
				value={source === 'field' ? (field?.conditionValue ?? '') : ''}
				placeholder="answer must equal…"
				class="w-44"
				aria-label="Answer the rule matches"
			/>
		</div>
	</div>
{/snippet}

{#snippet fieldInputs(field: FieldDefinition | null)}
	<!--
		.field-editor scopes the :has() rules that show only the controls that apply
		to the current kind / visibility rule. Pure CSS so changing a select updates
		the form without a round-trip, and without JS the initial selection still
		hides the rest (dropdown options stay available for a no-JS Dropdown pick).
	-->
	<div class="field-editor space-y-2">
		<div class="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
			<Input
				name="label"
				value={field?.label ?? ''}
				placeholder="Label"
				aria-label="Label"
				required
			/>
			<select name="kind" aria-label="Field type" class={selectClass}>
				{#each FIELD_KINDS as kind (kind.value)}
					<option value={kind.value} selected={field?.kind === kind.value}>{kind.label}</option>
				{/each}
			</select>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="required"
					checked={field?.required ?? false}
					class="border-input accent-primary size-4 rounded"
				/>
				Required
			</label>
		</div>

		<textarea
			name="options"
			rows="2"
			placeholder="Dropdown options — one per line"
			aria-label="Dropdown options"
			class="field-editor-options border-input bg-background focus-visible:ring-ring w-full rounded-md border px-2 py-1.5 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
			>{field ? optionsText(field) : ''}</textarea
		>

		{@render conditionInputs(field)}
	</div>
{/snippet}

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
			description="Create it, then add the fields you want submitters to answer. Nothing is public until you publish it."
		>
			<form method="POST" action="?/createForm" use:enhance={submitting} class="mt-3 flex gap-2">
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
						<label class="text-muted-foreground text-xs">
							Status
							<select name="status" class="{selectClass} mt-1 w-full">
								<option value="draft" selected={data.form.status === 'draft'}>Draft</option>
								<option value="published" selected={data.form.status === 'published'}>
									Published
								</option>
								<option value="closed" selected={data.form.status === 'closed'}>Closed</option>
							</select>
						</label>
						<label class="text-muted-foreground text-xs">
							Opens
							<Input
								type="datetime-local"
								name="opensAt"
								value={localInput(data.form.opensAt)}
								class="mt-1"
							/>
						</label>
						<label class="text-muted-foreground text-xs">
							Closes — after this, submissions and edits lock
							<Input
								type="datetime-local"
								name="closesAt"
								value={localInput(data.form.closesAt)}
								class="mt-1"
							/>
						</label>
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
								Shown above the form. Blank line starts a paragraph, a line beginning with “-”
								becomes a bullet.
							</span>
						</label>
						<div class="sm:col-span-2">
							<Button type="submit" size="sm" disabled={busy}>Save settings</Button>
						</div>
					</form>
				</section>

				<section class="border-border bg-card rounded-lg border p-4">
					<h2 class="text-sm font-semibold">
						Fields <span class="text-muted-foreground font-normal tabular-nums"
							>({fields.length})</span
						>
					</h2>

					{#if fields.length === 0}
						<p class="text-muted-foreground mt-2 text-sm">
							No fields yet. A form with no fields collects nothing but a title.
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
											use:enhance={submitting}
											class="space-y-2"
										>
											<input type="hidden" name="id" value={field.id} />
											{@render fieldInputs(field)}
											<Button type="submit" size="sm" disabled={busy}>Save field</Button>
										</form>

										<div class="flex flex-wrap gap-2">
											<form method="POST" action="?/moveField" use:enhance={submitting}>
												<input type="hidden" name="id" value={field.id} />
												<input type="hidden" name="direction" value="up" />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													disabled={busy || index === 0}
												>
													Move up
												</Button>
											</form>
											<form method="POST" action="?/moveField" use:enhance={submitting}>
												<input type="hidden" name="id" value={field.id} />
												<input type="hidden" name="direction" value="down" />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													disabled={busy || index === fields.length - 1}
												>
													Move down
												</Button>
											</form>
											<form method="POST" action="?/deleteField" use:enhance={submitting}>
												<input type="hidden" name="id" value={field.id} />
												<Button type="submit" variant="outline" size="sm" disabled={busy}>
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
						use:enhance={submitting}
						class="border-border mt-4 space-y-2 border-t pt-4"
					>
						<h3 class="text-sm font-medium">Add a field</h3>
						{@render fieldInputs(null)}
						<Button type="submit" size="sm" disabled={busy}>Add field</Button>
					</form>
				</section>
			</div>

			<section class="border-border bg-card h-fit rounded-lg border p-4">
				<h2 class="text-sm font-semibold">What the submitter sees</h2>
				<p class="text-muted-foreground mt-0.5 text-xs">
					Change the format or track to watch conditional fields appear and disappear.
					{#if hiddenCount > 0}
						<span class="text-status-warn">{hiddenCount} field(s) hidden right now.</span>
					{/if}
				</p>

				<div class="mt-3 space-y-3">
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Session format</span>
						<select
							class="{selectClass} mt-1 w-full"
							onchange={(e) => (previewFormat = Number(e.currentTarget.value) || null)}
						>
							<option value="">—</option>
							{#each data.formats as format (format.id)}
								<option value={format.id}>{format.name}</option>
							{/each}
						</select>
					</label>

					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Track</span>
						<select
							class="{selectClass} mt-1 w-full"
							onchange={(e) => (previewTrack = Number(e.currentTarget.value) || null)}
						>
							<option value="">—</option>
							{#each data.tracks as track (track.id)}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>

					{#each shown as field (field.id)}
						<label class="block text-sm">
							<span class="text-muted-foreground text-xs">
								{field.label}{#if field.required}<span class="text-status-bad"> *</span>{/if}
							</span>

							{#if field.kind === 'long_text'}
								<textarea
									rows="2"
									class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
									oninput={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								></textarea>
							{:else if field.kind === 'select'}
								<select
									class="{selectClass} mt-1 w-full"
									onchange={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								>
									<option value="">—</option>
									{#each parseOptions(field.options) as option (option)}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else if field.kind === 'boolean'}
								<select
									class="{selectClass} mt-1 w-full"
									onchange={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								>
									<option value="">—</option>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							{:else if field.kind === 'file'}
								<input type="file" disabled class="mt-1 w-full text-sm" />
							{:else}
								<Input
									class="mt-1"
									oninput={(e) => (previewAnswers[field.id] = e.currentTarget.value)}
								/>
							{/if}
						</label>
					{/each}

					{#if shown.length === 0}
						<p class="text-muted-foreground text-sm">Nothing to fill in yet.</p>
					{/if}
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	/*
	 * Only the controls that apply to the current kind / visibility rule are shown.
	 * Driven by the live :checked option so changing a select updates the form
	 * immediately (no Svelte state, works without JS for the initial selection).
	 * Hidden controls remain in the form; the server already ignores options for
	 * non-select kinds and condition values that do not match the chosen source.
	 */
	.field-editor:not(:has(select[name='kind'] > option[value='select']:checked))
		.field-editor-options {
		display: none;
	}

	.field-editor:not(:has(select[name='conditionSource'] > option[value='field']:checked))
		.field-editor-when-field {
		display: none;
	}

	.field-editor:not(:has(select[name='conditionSource'] > option[value='session_format']:checked))
		.field-editor-when-format {
		display: none;
	}

	.field-editor:not(:has(select[name='conditionSource'] > option[value='track']:checked))
		.field-editor-when-track {
		display: none;
	}
</style>

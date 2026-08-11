<script lang="ts">
	/**
	 * One extra question, as the organizer edits it (CFP-02).
	 *
	 * This used to be two snippets on the page, and the "only show the controls
	 * that apply" logic was a set of `:has(option:checked)` rules in a `<style>`
	 * block — pure CSS, because a native `<select>` publishes its selection to
	 * the DOM and CSS can read it. A shadcn select does not: it is a button and a
	 * hidden input, and `option:checked` has nothing to match. So the disclosure
	 * moves into state, and the state has to be per editor — the page renders one
	 * of these per field plus one for "add a field" — which is why this is a
	 * component rather than a snippet.
	 *
	 * The names posted are unchanged: `label`, `kind`, `required`, `options`,
	 * `conditionSource`, `conditionFieldId`, `conditionValueFormat`,
	 * `conditionValueTrack`, `conditionValue`. `fieldInput()` on the server reads
	 * exactly those, and reads the condition value from whichever control the
	 * source names.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { FIELD_KINDS, parseOptions, type FieldDefinition } from '$lib/conference/form-definition';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		field,
		fields,
		formats,
		tracks
	}: {
		/** The field being edited, or `null` for the "add a field" form. */
		field: FieldDefinition | null;
		fields: FieldDefinition[];
		formats: { id: number; name: string }[];
		tracks: { id: number; name: string }[];
	} = $props();

	let kind = $state(field?.kind ?? FIELD_KINDS[0].value);
	let source = $state(field?.conditionSource ?? '');

	/**
	 * The typed options, kept while the kind is something else.
	 *
	 * Since #156 the textarea is unmounted rather than hidden when the kind is not
	 * `select`, and an unmounted control takes its value with it: switching to
	 * short text and back cost the organizer the list they had just typed. Two
	 * lines of buffer are cheaper than that surprise.
	 */
	// Reading `field` once is what makes it a buffer: the editor is keyed by field
	// id, so a re-render is the same field, and re-seeding from it would overwrite
	// whatever the organizer has typed since.
	// svelte-ignore state_referenced_locally
	let optionsText = $state(field ? parseOptions(field.options).join('\n') : '');

	const kindOptions = FIELD_KINDS.map((entry) => ({ value: entry.value, label: entry.label }));

	const SOURCE_OPTIONS = [
		{ value: '', label: 'Always shown' },
		{ value: 'session_format', label: 'Only for session format…' },
		{ value: 'track', label: 'Only for track…' },
		{ value: 'field', label: 'Only when another answer is…' }
	];

	// A field cannot depend on itself.
	const fieldOptions = $derived([
		{ value: '', label: '(field)' },
		...fields
			.filter((other) => other.id !== field?.id)
			.map((other) => ({ value: String(other.id), label: other.label }))
	]);

	const formatOptions = $derived([
		{ value: '', label: '(format)' },
		...formats.map((format) => ({ value: String(format.id), label: format.name }))
	]);

	const trackOptions = $derived([
		{ value: '', label: '(track)' },
		...tracks.map((track) => ({ value: String(track.id), label: track.name }))
	]);

	/**
	 * The stored condition value belongs to the stored source.
	 *
	 * Handing "3" to the track select because the format select happens to be
	 * showing it would preselect a track the organizer never chose.
	 */
	const valueFor = (wanted: string) =>
		field?.conditionSource === wanted ? (field?.conditionValue ?? '') : '';
</script>

<div class="space-y-2">
	<div class="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
		<Input
			name="label"
			value={field?.label ?? ''}
			placeholder="Label"
			aria-label="Label"
			required
		/>
		<AppSelect
			name="kind"
			value={kind}
			options={kindOptions}
			aria-label="Field type"
			onValueChange={(next) => (kind = next as typeof kind)}
		/>
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

	{#if kind === 'select'}
		<Textarea
			name="options"
			rows={2}
			bind:value={optionsText}
			placeholder="Dropdown options — one per line"
			aria-label="Dropdown options"
		/>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<AppSelect
			name="conditionSource"
			value={source}
			options={SOURCE_OPTIONS}
			aria-label="Show this field"
			class="w-56"
			onValueChange={(next) => (source = next as typeof source)}
		/>

		<!-- One control per source rather than one box that means three things.
		     The server reads the one its source names; a format or track is chosen
		     by name, never by an id typed from memory. -->
		{#if source === 'field'}
			<AppSelect
				name="conditionFieldId"
				value={String(field?.conditionFieldId ?? '')}
				options={fieldOptions}
				aria-label="Depends on field"
				class="w-44"
			/>
			<Input
				name="conditionValue"
				value={valueFor('field')}
				placeholder="answer must equal…"
				class="w-44"
				aria-label="Answer the rule matches"
			/>
		{:else if source === 'session_format'}
			<AppSelect
				name="conditionValueFormat"
				value={valueFor('session_format')}
				options={formatOptions}
				aria-label="Which session format"
				class="w-44"
			/>
		{:else if source === 'track'}
			<AppSelect
				name="conditionValueTrack"
				value={valueFor('track')}
				options={trackOptions}
				aria-label="Which track"
				class="w-44"
			/>
		{/if}
	</div>
</div>

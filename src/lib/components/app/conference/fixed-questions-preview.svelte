<script lang="ts">
	/**
	 * The fixed half of the proposal form, as the submitter meets it (#126).
	 *
	 * A picture of the form, not a second copy of it: every control is disabled
	 * except format and track. Those two stay live because choosing them is what
	 * makes a conditional field appear, which is the whole reason the preview
	 * beside the builder is interactive at all.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import {
		asks,
		FIXED_QUESTION_GROUPS,
		type FixedQuestionVisibility
	} from '$lib/conference/fixed-questions';
	import { Input } from '$lib/components/ui/input';

	let {
		formats,
		tracks,
		visibility,
		onFormat,
		onTrack
	}: {
		formats: { id: number; name: string }[];
		tracks: { id: number; name: string }[];
		/**
		 * The removals the organizer has made (#159). The preview answers "what
		 * will they see", so a question this call no longer asks must be gone from
		 * it — a picture that still shows a removed control is the same lie the
		 * read-only list used to tell.
		 */
		visibility: FixedQuestionVisibility;
		onFormat: (id: number | null) => void;
		onTrack: (id: number | null) => void;
	} = $props();

	const chosen = (value: string) => Number(value) || null;

	// No `name` on either: the preview is a picture of the form, and a picture
	// that posts would add `sessionFormatId` to the organizer's own save.
	const options = (entries: { id: number; name: string }[]) => [
		{ value: '', label: '—' },
		...entries.map((entry) => ({ value: String(entry.id), label: entry.name }))
	];
</script>

{#each FIXED_QUESTION_GROUPS as group (group.title)}
	{@const questions = group.questions.filter((question) => asks(visibility, question.key))}
	{#if questions.length > 0}
		<h3 class="text-muted-foreground pt-1 text-xs font-semibold tracking-wide uppercase">
			{group.title}
		</h3>
	{/if}

	{#each questions as question (question.key)}
		<div class="block text-sm">
			<span class="text-muted-foreground text-xs">
				{question.label}{#if question.required}<span class="text-status-bad"> *</span>{/if}
			</span>

			{#if question.names[0] === 'sessionFormatId'}
				<AppSelect
					options={options(formats)}
					placeholder="—"
					class="mt-1"
					aria-label={question.label}
					onValueChange={(value) => onFormat(chosen(value))}
				/>
			{:else if question.names[0] === 'trackId'}
				<AppSelect
					options={options(tracks)}
					placeholder="—"
					class="mt-1"
					aria-label={question.label}
					onValueChange={(value) => onTrack(chosen(value))}
				/>
			{:else}
				<Input
					class="mt-1"
					disabled
					placeholder={question.hint ?? ''}
					aria-label={question.label}
				/>
			{/if}
		</div>
	{/each}
{/each}

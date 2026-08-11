<script lang="ts">
	/**
	 * The fixed half of the proposal form, as the submitter meets it (#126).
	 *
	 * A picture of the form, not a second copy of it: every control is disabled
	 * except format and track. Those two stay live because choosing them is what
	 * makes a conditional field appear, which is the whole reason the preview
	 * beside the builder is interactive at all.
	 */
	import { FIXED_QUESTION_GROUPS } from '$lib/conference/fixed-questions';
	import { Input } from '$lib/components/ui/input';

	let {
		formats,
		tracks,
		selectClass,
		onFormat,
		onTrack
	}: {
		formats: { id: number; name: string }[];
		tracks: { id: number; name: string }[];
		/** The builder's own select styling, so the preview matches the page. */
		selectClass: string;
		onFormat: (id: number | null) => void;
		onTrack: (id: number | null) => void;
	} = $props();

	const chosen = (value: string) => Number(value) || null;
</script>

{#each FIXED_QUESTION_GROUPS as group (group.title)}
	<h3 class="text-muted-foreground pt-1 text-xs font-semibold tracking-wide uppercase">
		{group.title}
	</h3>

	{#each group.questions as question (question.label)}
		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">
				{question.label}{#if question.required}<span class="text-status-bad"> *</span>{/if}
			</span>

			{#if question.names[0] === 'sessionFormatId'}
				<select
					class="{selectClass} mt-1 w-full"
					onchange={(event) => onFormat(chosen(event.currentTarget.value))}
				>
					<option value="">—</option>
					{#each formats as format (format.id)}
						<option value={format.id}>{format.name}</option>
					{/each}
				</select>
			{:else if question.names[0] === 'trackId'}
				<select
					class="{selectClass} mt-1 w-full"
					onchange={(event) => onTrack(chosen(event.currentTarget.value))}
				>
					<option value="">—</option>
					{#each tracks as track (track.id)}
						<option value={track.id}>{track.name}</option>
					{/each}
				</select>
			{:else}
				<Input class="mt-1" disabled placeholder={question.hint ?? ''} />
			{/if}
		</label>
	{/each}
{/each}

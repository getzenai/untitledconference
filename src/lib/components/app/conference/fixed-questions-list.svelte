<script lang="ts">
	/**
	 * The proposal form's built-in questions, as rows the organizer can remove
	 * (#126 showed them; #159 made them configurable).
	 *
	 * They were read-only because they are controls in `proposal-form.svelte`
	 * rather than rows in `form_field` — but that is an implementation detail of
	 * ours, and an organizer has no reason to accept "this question is hard for us
	 * to remove" as an answer. What is stored is which ones this call does NOT
	 * ask, so a form nobody has configured asks all of them.
	 *
	 * Three cannot be removed and say why on the row itself. A rule with its
	 * reason next to it is one an organizer can argue with; a greyed-out button is
	 * not.
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		asks,
		FIXED_QUESTION_GROUPS,
		type FixedQuestionVisibility
	} from '$lib/conference/fixed-questions';

	let {
		visibility,
		busy = false
	}: {
		visibility: FixedQuestionVisibility;
		busy?: boolean;
	} = $props();

	const removedCount = $derived(
		FIXED_QUESTION_GROUPS.flatMap((g) => g.questions).filter((q) => !asks(visibility, q.key)).length
	);
</script>

<section class="border-border bg-card rounded-lg border p-4" data-testid="cfp-fixed-questions">
	<h2 class="text-sm font-semibold">
		Standard questions
		{#if removedCount > 0}
			<span class="text-muted-foreground font-normal tabular-nums">
				({removedCount} removed)
			</span>
		{/if}
	</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Every form starts with these. Remove the ones your call does not need — the form stops asking
		and stops storing them.
	</p>

	{#each FIXED_QUESTION_GROUPS as group (group.title)}
		<h3 class="text-muted-foreground mt-3 text-xs font-semibold tracking-wide uppercase">
			{group.title}
		</h3>
		<ul class="mt-1.5 space-y-1">
			{#each group.questions as question (question.key)}
				{@const shown = asks(visibility, question.key)}
				<li
					class="flex flex-wrap items-baseline gap-x-2 text-sm"
					data-testid="fixed-question-{question.key}"
					data-shown={shown}
				>
					<span class={shown ? '' : 'text-muted-foreground line-through'}>{question.label}</span>
					{#if question.required && shown}
						<span class="text-status-bad text-xs">Required</span>
					{/if}
					{#if question.hint && shown}
						<span class="text-muted-foreground text-xs">· {question.hint}</span>
					{/if}

					{#if question.permanentBecause}
						<span class="text-muted-foreground text-xs">· {question.permanentBecause}</span>
					{:else}
						<!--
							A form per row rather than one form with a hidden key per button:
							without JavaScript the browser posts the submitter it was clicked
							in, and nothing else on the page can be along for the ride.
						-->
						<form method="POST" action={shown ? '?/hideFixedQuestion' : '?/showFixedQuestion'}>
							<input type="hidden" name="key" value={question.key} />
							<!--
								The visible word is short on purpose — the question it belongs to
								is the line it sits on. A screen reader reads the button alone,
								and ten rows of "Remove" name nothing, so the question travels
								with the button in its accessible name (#475).
							-->
							<Button
								type="submit"
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								disabled={busy}
								aria-label={shown ? `Remove “${question.label}”` : `Add back “${question.label}”`}
							>
								{shown ? 'Remove' : 'Add back'}
							</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
</section>

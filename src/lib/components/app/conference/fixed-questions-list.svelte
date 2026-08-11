<script lang="ts">
	/**
	 * What the proposal form asks whether or not anybody configures it (#126).
	 *
	 * The builder used to imply the opposite — an empty field list read as an
	 * empty form — and an organizer who believes that goes off to rebuild the
	 * title and the abstract by hand. The list is a plain reading of
	 * `FIXED_QUESTION_GROUPS`, which is itself checked against the names the form
	 * really posts.
	 */
	import { FIXED_QUESTION_GROUPS } from '$lib/conference/fixed-questions';
</script>

<section class="border-border bg-card rounded-lg border p-4" data-testid="cfp-fixed-questions">
	<h2 class="text-sm font-semibold">Always asked</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Part of every proposal form. They cannot be removed or reordered here — the fields below are the
		questions you add on top of them.
	</p>

	{#each FIXED_QUESTION_GROUPS as group (group.title)}
		<h3 class="text-muted-foreground mt-3 text-xs font-semibold tracking-wide uppercase">
			{group.title}
		</h3>
		<ul class="mt-1.5 space-y-1">
			{#each group.questions as question (question.label)}
				<li class="flex flex-wrap items-baseline gap-x-2 text-sm">
					<span>{question.label}</span>
					{#if question.required}
						<span class="text-status-bad text-xs">Required</span>
					{/if}
					{#if question.hint}
						<span class="text-muted-foreground text-xs">· {question.hint}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
</section>

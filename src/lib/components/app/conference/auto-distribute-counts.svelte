<script module lang="ts">
	export const EACH_HINT = 'How many reviewers each selected talk gets';
	export const CAP_HINT =
		'Most talks any one reviewer may end up with, including what they already have';
</script>

<script lang="ts">
	/**
	 * The two numbers on auto-distribute (#415).
	 *
	 * Labels stay "each" and "cap" — they have to fit the strip. The sentence
	 * lives on the field: tooltip on hover/focus, and `aria-describedby` so a
	 * keyboard user hears the same words without a mouse.
	 */
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';

	let {
		reviewsPerSubmission = $bindable(),
		capPerReviewer = $bindable()
	}: {
		reviewsPerSubmission: string;
		capPerReviewer: string;
	} = $props();
</script>

<TooltipProvider delayDuration={200}>
	<div class="flex flex-wrap items-center gap-2">
		<label class="text-muted-foreground flex items-center gap-1 text-sm">
			<Tooltip>
				<TooltipTrigger>
					{#snippet child({ props })}
						<input
							{...props}
							type="number"
							name="reviewsPerSubmission"
							min="1"
							step="1"
							class="border-input bg-background h-8 w-14 rounded-md border px-2 text-sm tabular-nums"
							bind:value={reviewsPerSubmission}
							data-testid="bulk-assign-per-talk"
							aria-label="Reviewers per talk"
							aria-describedby="bulk-assign-each-hint"
						/>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent side="top" class="max-w-xs">{EACH_HINT}</TooltipContent>
			</Tooltip>
			each
			<span id="bulk-assign-each-hint" class="sr-only">{EACH_HINT}</span>
		</label>
		<label class="text-muted-foreground flex items-center gap-1 text-sm">
			cap
			<Tooltip>
				<TooltipTrigger>
					{#snippet child({ props })}
						<input
							{...props}
							type="number"
							name="capPerReviewer"
							min="1"
							step="1"
							class="border-input bg-background h-8 w-14 rounded-md border px-2 text-sm tabular-nums"
							bind:value={capPerReviewer}
							data-testid="bulk-assign-cap"
							aria-label="Cap per reviewer"
							aria-describedby="bulk-assign-cap-hint"
						/>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent side="top" class="max-w-xs">{CAP_HINT}</TooltipContent>
			</Tooltip>
			<span id="bulk-assign-cap-hint" class="sr-only">{CAP_HINT}</span>
		</label>
	</div>
</TooltipProvider>

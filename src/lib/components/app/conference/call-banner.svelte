<script lang="ts">
	/**
	 * "The call for papers closes in 6 days" — across the whole public site.
	 *
	 * The deadline is the one fact that expires, and a speaker who lands on the
	 * agenda or the gallery has no other way to learn it exists. That is why the
	 * banner rides the layout rather than the call page, where it would only ever
	 * be read by people who already found their way there.
	 */
	import XIcon from '@lucide/svelte/icons/x';

	// No `embed` prop: the layout drops all site chrome inside an embed, and this
	// bar is chrome.
	let { slug, days }: { slug: string; days: number } = $props();

	// Deliberately not persisted. The banner reappears on the next visit, which is
	// the point of a countdown — a localStorage flag written on day 20 would
	// silence the reminder on the last day, when it matters most.
	let dismissed = $state(false);

	// The last few days read louder. Earlier than that a permanent bold bar is
	// just noise the visitor learns to skip past.
	const urgency = $derived(days <= 3 ? 'text-foreground font-medium' : 'text-muted-foreground');

	const label = $derived(
		days === 0 ? 'closes today' : days === 1 ? 'closes tomorrow' : `closes in ${days} days`
	);
</script>

{#if !dismissed}
	<div class="border-border bg-muted/40 border-b">
		<div class="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5 text-sm">
			<p class="min-w-0 flex-1 {urgency}">
				The call for papers {label} —
				<a href={`/c/${slug}/cfp`} class="underline underline-offset-2 hover:no-underline"
					>submit a proposal</a
				>.
			</p>
			<button
				type="button"
				onclick={() => (dismissed = true)}
				class="text-muted-foreground hover:text-foreground -mr-2 shrink-0 rounded-md p-1 transition-colors"
				aria-label="Dismiss the call for papers reminder"
			>
				<XIcon class="size-4" aria-hidden="true" />
			</button>
		</div>
	</div>
{/if}

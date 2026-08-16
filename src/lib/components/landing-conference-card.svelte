<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import { Badge } from '$lib/components/ui/badge';
	import type { DirectoryCall } from '$lib/conference/call-window';
	import { formatDateRange } from '$lib/conference/public-view';

	let {
		conference
	}: {
		conference: {
			slug: string;
			name: string;
			venue: string | null;
			startsOn: string | null;
			endsOn: string | null;
			call: DirectoryCall;
		};
	} = $props();

	const dates = $derived(formatDateRange(conference));
</script>

<li>
	<a
		href="/c/{conference.slug}"
		class="border-border bg-background hover:border-foreground/30 group flex h-full flex-col rounded-2xl border p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
	>
		<div class="flex items-start justify-between gap-4">
			<CalendarDaysIcon class="text-muted-foreground size-5" />
			<div class="flex items-center gap-2">
				{#if conference.call === 'open'}
					<Badge variant="outline" class="rounded-full px-2 py-0.5 text-[10px]">Call open</Badge>
				{/if}
				<ArrowRightIcon
					class="text-muted-foreground size-4 transition-transform group-hover:translate-x-1"
				/>
			</div>
		</div>
		<h3 class="mt-8 font-semibold">{conference.name}</h3>
		<p class="text-muted-foreground mt-2 text-sm">
			{#if dates}{dates}{/if}{#if dates && conference.venue}<span class="px-1.5">·</span
				>{/if}{#if conference.venue}{conference.venue}{/if}
		</p>
	</a>
</li>

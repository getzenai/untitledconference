<script lang="ts">
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { buildIcs, PersonalSchedule } from '$lib/conference/personal-schedule.svelte';
	import { buildView, formatFullStamp } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));
	// Derived, not constructed once: navigating to a different conference must
	// pick up that conference's own list rather than keep showing the first one's.
	const starred = $derived(new PersonalSchedule(data.conference.id));

	let dayIndex = $state(0);
	let mineOnly = $state(false);

	const day = $derived(view.conference.days[dayIndex]);
	const sessions = $derived(
		(view.sessionsByDay.get(day.id) ?? []).filter((s) => !mineOnly || starred.has(s.id))
	);

	// The export takes the whole personal schedule, not the visible day: an
	// attendee exporting "my schedule" means all of it, and a day tab is a
	// browsing device, not a selection.
	const mine = $derived(view.sessions.filter((s) => starred.has(s.id)));

	function exportIcs() {
		const blob = new Blob([buildIcs(view.conference.name, mine)], {
			type: 'text/calendar;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${view.conference.slug}-my-schedule.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Schedule itinerary — {view.conference.name}</title>
</svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
	<div role="tablist" aria-label="Conference days" class="flex flex-wrap gap-2">
		{#each view.conference.days as d, i (d.id)}
			<button
				type="button"
				role="tab"
				aria-selected={i === dayIndex}
				onclick={() => (dayIndex = i)}
				class="rounded-md px-3 py-1.5 text-sm transition-colors {i === dayIndex
					? 'bg-primary text-primary-foreground font-medium'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				{d.label}
			</button>
		{/each}
	</div>

	<div class="flex items-center gap-3">
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<Checkbox bind:checked={mineOnly} />
			<span class="text-muted-foreground">My schedule ({starred.size})</span>
		</label>
		<Button variant="outline" size="sm" disabled={mine.length === 0} onclick={exportIcs}>
			Add to calendar
		</Button>
	</div>
</div>

{#if sessions.length === 0}
	<EmptyState
		title={mineOnly ? 'Nothing starred on this day yet.' : 'Nothing is scheduled on this day yet.'}
		description={mineOnly
			? 'Star a session and it lands here, ready to export to your calendar.'
			: 'The programme for this day is still being built.'}
		action={{ href: `/c/${view.conference.slug}/agenda`, label: 'Open the agenda →' }}
	/>
{/if}

<ol class="space-y-4">
	{#each sessions as session (session.id)}
		<li class="border-border rounded-lg border p-5">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						{#if session.track}<Badge variant="secondary">{session.track}</Badge>{/if}
						{#if session.format}<Badge variant="outline">{session.format}</Badge>{/if}
					</div>
					<h2 class="mt-2 text-lg leading-snug font-semibold">{session.title}</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
							>{session.room}{/if}
					</p>
				</div>

				<button
					type="button"
					onclick={() => starred.toggle(session.id)}
					aria-pressed={starred.has(session.id)}
					aria-label={starred.has(session.id)
						? `Remove ${session.title} from my schedule`
						: `Add ${session.title} to my schedule`}
					class="hover:bg-muted focus-visible:ring-ring shrink-0 rounded-md px-2 py-1 text-lg leading-none transition-colors focus-visible:ring-2 focus-visible:outline-none {starred.has(
						session.id
					)
						? 'text-status-warn'
						: 'text-muted-foreground'}"
				>
					{starred.has(session.id) ? '★' : '☆'}
				</button>
			</div>

			<p class="text-muted-foreground mt-3 text-sm leading-relaxed">{session.description}</p>

			<ul class="mt-4 flex flex-wrap gap-x-6 gap-y-3">
				{#each session.speakers as speaker (speaker.id)}
					<li class="flex items-center gap-2.5">
						<SpeakerAvatar {speaker} size="sm" />
						<span class="text-sm leading-tight">
							<a
								href="/c/{view.conference.slug}/speakers/{speaker.id}"
								class="font-medium hover:underline">{speaker.name}</a
							>
							{#if speaker.jobTitle || speaker.company}
								<span class="text-muted-foreground block text-xs">
									{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
								</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</li>
	{/each}
</ol>

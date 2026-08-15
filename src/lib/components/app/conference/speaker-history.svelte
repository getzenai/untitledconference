<script lang="ts">
	/**
	 * "Have we had them before?" — the returning-speaker argument, on the screens
	 * where the argument is made (#451).
	 *
	 * The committee member who wins this argument does it with two facts: how many
	 * times, and how recently. Those are the two the summary line carries; the
	 * talks themselves sit underneath, because the follow-up question is always
	 * "on what?".
	 *
	 * A first-timer gets a line of their own rather than nothing. "We have never
	 * had them" is an answer, and a panel that renders only for returning speakers
	 * cannot be told apart from a panel that failed to load.
	 *
	 * The body only, no heading and no card: the organizer's detail page puts its
	 * side panels in bordered cards and the reviewer's page runs plain sections
	 * down one column. Each caller keeps its own frame; only what is inside it is
	 * shared.
	 */
	import { speakerHistorySummary, type SpeakerHistory } from '$lib/conference/speaker-history';

	let { history }: { history: SpeakerHistory[] } = $props();
</script>

<ul class="space-y-3" data-testid="speaker-history">
	{#each history as entry (entry.speakerProfileId)}
		<li class="text-sm" data-testid="speaker-history-row">
			<div class="font-medium">{entry.name}</div>
			<div
				class="text-muted-foreground text-xs"
				data-testid="speaker-history-summary-{entry.speakerProfileId}"
			>
				{speakerHistorySummary(entry)}
			</div>
			{#if entry.appearances.length > 0}
				<ul class="text-muted-foreground mt-1 space-y-0.5 text-xs">
					{#each entry.appearances as appearance (appearance.conferenceId + ':' + appearance.talkTitle)}
						<li>{appearance.year ?? appearance.conferenceName} · {appearance.talkTitle}</li>
					{/each}
				</ul>
			{/if}
		</li>
	{/each}
</ul>

<!--
	Layer 2 of #451 — the attendee rating the organizer called the single most
	decisive input — needs a post-event feedback capture the product does not have.
	Saying so beats a panel that looks like it holds the number and does not.
-->
<p class="text-muted-foreground mt-3 text-xs">
	Attendee ratings from past editions are not recorded yet.
</p>

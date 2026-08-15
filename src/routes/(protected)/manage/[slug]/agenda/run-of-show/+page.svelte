<script lang="ts">
	/**
	 * A printable run of show for the person at the backstage table (#449).
	 *
	 * CSV would make them open a spreadsheet. This is a page they keep open, or
	 * print. Day, room, clock, the title as it will be said, every speaker, the
	 * abstract if we have one, and a link to the latest upload if we have one.
	 * Intro text and AV notes are not fields; empty stays empty.
	 */
	import { formatDayLong, formatTime } from '$lib/conference/public-view';
	import { groupShowTalksByDay, showFileHref } from '$lib/conference/run-of-show';

	let { data } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const days = $derived(groupShowTalksByDay(data.talks));

	const clock = (startsAt: Date, endsAt: Date | null) =>
		endsAt ? `${formatTime(startsAt)} – ${formatTime(endsAt)}` : formatTime(startsAt);
</script>

<svelte:head>
	<title>Run of show — {data.conference.name}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8" data-testid="run-of-show">
	<p class="text-muted-foreground mb-6 text-sm print:hidden">
		<a href="{base}/agenda" class="hover:text-foreground underline-offset-4 hover:underline"
			>Agenda</a
		>
	</p>

	<h1 class="text-2xl font-semibold tracking-tight">Run of show</h1>
	<p class="text-muted-foreground mt-1 text-sm">{data.conference.name}</p>
	<p class="text-muted-foreground mt-3 max-w-prose text-sm">
		The programme in order, for the table. Print this page. What we do not know is left blank.
	</p>

	{#if days.length === 0}
		<p class="text-muted-foreground mt-10 text-sm" data-testid="run-of-show-empty">
			Nothing is on the programme yet. Place talks on the agenda first.
		</p>
	{/if}

	{#each days as day (day.day)}
		<section class="mt-10" data-testid="run-of-show-day">
			<h2 class="border-border border-b pb-2 text-base font-semibold tracking-tight">
				{formatDayLong(day.day)}
			</h2>
			<ol class="mt-4 space-y-8">
				{#each day.talks as talk (`${talk.day}-${talk.startsAt.toISOString()}-${talk.room ?? ''}-${talk.title}`)}
					<li data-testid="run-of-show-talk">
						<p class="text-muted-foreground text-sm">
							<span data-testid="run-of-show-time">{clock(talk.startsAt, talk.endsAt)}</span>
							{#if talk.room}
								<span aria-hidden="true"> · </span>
								<span data-testid="run-of-show-room">{talk.room}</span>
							{/if}
						</p>
						<h3 class="mt-1 text-lg font-medium tracking-tight" data-testid="run-of-show-title">
							{talk.title}
						</h3>
						{#if talk.speakers.length > 0}
							<p class="mt-1 text-sm" data-testid="run-of-show-speakers">
								{talk.speakers.join(', ')}
							</p>
						{/if}
						{#if talk.abstract}
							<p
								class="mt-3 max-w-prose text-sm leading-relaxed"
								data-testid="run-of-show-abstract"
							>
								{talk.abstract}
							</p>
						{/if}
						{#if talk.file}
							<p class="mt-3 text-sm">
								<a
									href={showFileHref(data.conference.slug, talk.file.id)}
									class="underline-offset-4 hover:underline"
									data-testid="run-of-show-file"
								>
									{talk.file.filename}
								</a>
							</p>
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	@media print {
		:global([data-slot='sidebar']),
		:global([data-sidebar='sidebar']),
		:global(header) {
			display: none !important;
		}
		:global([data-slot='sidebar-inset']) {
			margin: 0 !important;
			padding: 0 !important;
		}
	}
</style>

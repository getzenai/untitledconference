<script lang="ts">
	/**
	 * The speaker directory, in the two shapes a visitor can ask for.
	 *
	 * Speakers and Gallery were two pages showing the same people from the same
	 * `buildView` — one as a list, one as a photo grid — with their own search
	 * box, their own count line and their own copy of the empty state. A visitor
	 * who wanted the other shape had to find a second tab and start over. They
	 * are one screen now, with a toggle.
	 *
	 * The toggle is two links, not a piece of client state, and the two URLs stay
	 * what they were. That keeps three things true at once: the shape survives a
	 * reload and can be sent to somebody; an organizer can still embed either
	 * shape on their site (both remain their own `EMBEDDABLE_SURFACES` entry);
	 * and an agent driving a browser can reach the grid by navigating rather than
	 * by finding and clicking a control.
	 */
	import { withEmbed } from '$lib/conference/embed';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import ShowMore from '$lib/components/app/conference/show-more.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { formatFullStamp, type ConferenceView } from '$lib/conference/public-view';
	import type { PublicSpeaker } from '$lib/conference/public-types';

	let {
		view,
		shape,
		embed
	}: {
		view: ConferenceView;
		/** Which of the two directories this page is. */
		shape: 'list' | 'grid';
		embed: boolean;
	} = $props();

	const base = $derived(`/c/${view.conference.slug}`);

	let query = $state('');
	let open = $state(false);
	let selected = $state<PublicSpeaker | null>(null);

	const visible = $derived(
		view.speakers.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const sessions = $derived(selected ? (view.sessionsBySpeaker.get(selected.id) ?? []) : []);

	// The grid is never unmounted while the dialog is open, so closing it returns
	// to exactly the grid the visitor left — same scroll position, same search
	// text. EMB-13 grades that return, not just the opening.
	const openSpeaker = (speaker: PublicSpeaker) => {
		selected = speaker;
		open = true;
	};

	const shapes = [
		{ key: 'list' as const, path: '/speakers', label: 'List' },
		{ key: 'grid' as const, path: '/gallery', label: 'Gallery' }
	];
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div class="w-full max-w-sm">
		<label for="speaker-search" class="mb-2 block text-sm font-medium">Search speakers</label>
		<Input
			id="speaker-search"
			type="search"
			bind:value={query}
			placeholder="Name"
			autocomplete="off"
		/>
	</div>

	<!--
		A search typed in one shape is not carried into the other: the query lives
		in the browser, and these are two documents. Rather than pretend otherwise
		with a query parameter nobody asked for, the toggle sits beside the box so
		the visitor can see what they are leaving behind.
	-->
	<div
		class="border-border inline-flex rounded-md border p-0.5 text-sm"
		role="group"
		aria-label="Speaker view"
		data-testid="speaker-view-toggle"
	>
		{#each shapes as option (option.key)}
			{@const current = option.key === shape}
			<a
				href={withEmbed(base + option.path, embed)}
				aria-current={current ? 'page' : undefined}
				data-testid="speaker-view-{option.key}"
				class="rounded px-3 py-1.5 transition-colors {current
					? 'bg-muted text-foreground font-medium'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				{option.label}
			</a>
		{/each}
	</div>
</div>

<p class="text-muted-foreground mb-4 text-sm" aria-live="polite">
	{visible.length} of {view.speakers.length} speakers
</p>

{#if visible.length === 0}
	<EmptyState title="Nobody by that name.">
		<Button variant="outline" size="sm" class="mt-1" onclick={() => (query = '')}>
			Clear the search
		</Button>
	</EmptyState>
{/if}

<!-- Ordered by surname, as the directory convention expects — the sort happens
     once in buildView so the two shapes cannot disagree about it. -->
{#if shape === 'list'}
	<ul class="divide-border divide-y">
		{#each visible as speaker (speaker.id)}
			<li>
				<a
					href={withEmbed(`${base}/speakers/${speaker.id}`, embed)}
					class="hover:bg-muted/50 -mx-3 flex items-center gap-4 rounded-md px-3 py-4 transition-colors"
				>
					<SpeakerAvatar {speaker} />
					<span class="min-w-0">
						<span class="block font-medium">{speaker.name}</span>
						{#if speaker.jobTitle || speaker.company}
							<span class="text-muted-foreground block text-sm">
								{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
							</span>
						{:else}
							<span class="text-muted-foreground block text-sm italic">Speaker</span>
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<ul class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
		{#each visible as speaker (speaker.id)}
			<li>
				<button
					type="button"
					onclick={() => openSpeaker(speaker)}
					class="hover:bg-muted/50 focus-visible:ring-ring flex w-full flex-col items-center rounded-lg p-4 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<SpeakerAvatar {speaker} size="lg" />
					<span class="mt-3 block font-medium">{speaker.name}</span>
					{#if speaker.jobTitle}
						<span class="text-muted-foreground mt-0.5 block text-sm">{speaker.jobTitle}</span>
					{/if}
					{#if speaker.company}
						<span class="text-muted-foreground block text-sm">{speaker.company}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>

	<Dialog.Root bind:open>
		<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
			{#if selected}
				<Dialog.Header>
					<div class="flex items-start gap-4 text-left">
						<SpeakerAvatar speaker={selected} size="lg" />
						<div class="pt-1">
							<Dialog.Title class="text-xl">{selected.name}</Dialog.Title>
							{#if selected.jobTitle || selected.company}
								<Dialog.Description>
									{[selected.jobTitle, selected.company].filter(Boolean).join(', ')}
								</Dialog.Description>
							{/if}
						</div>
					</div>
				</Dialog.Header>

				{#if selected.bio}
					<ShowMore text={selected.bio} limit={200} />
				{/if}

				{#if sessions.length > 0}
					<h3 class="text-sm font-medium">{sessions.length === 1 ? 'Session' : 'Sessions'}</h3>
					<ul class="divide-border divide-y">
						{#each sessions as session (session.id)}
							<li class="py-3">
								<div class="flex flex-wrap items-center gap-2">
									{#if session.track}<Badge variant="secondary">{session.track}</Badge>{/if}
								</div>
								<p class="mt-1.5 text-sm font-medium">{session.title}</p>
								<p class="text-muted-foreground mt-0.5 text-sm">
									{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
										>{session.room}{/if}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

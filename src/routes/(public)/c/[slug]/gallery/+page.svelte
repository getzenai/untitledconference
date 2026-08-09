<script lang="ts">
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import ShowMore from '$lib/components/app/conference/show-more.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { buildView, formatFullStamp } from '$lib/conference/public-view';
	import type { PublicSpeaker } from '$lib/conference/public-types';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

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
</script>

<svelte:head>
	<title>Speaker gallery — {view.conference.name}</title>
</svelte:head>

<div class="mb-6 max-w-sm">
	<label for="gallery-search" class="mb-2 block text-sm font-medium">Search speakers</label>
	<Input
		id="gallery-search"
		type="search"
		bind:value={query}
		placeholder="Name"
		autocomplete="off"
	/>
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

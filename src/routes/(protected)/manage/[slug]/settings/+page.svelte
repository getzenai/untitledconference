<script lang="ts">
	/**
	 * Conference configuration (#63): rooms, tracks, session formats.
	 *
	 * Reviewer-visibility lives under Team & reviewers. Days are derived from the
	 * conference date range (#86) — not listed here yet.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const config = $derived(data.config);

	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Settings — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Settings</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		Rooms, tracks and session formats for this conference. Reviewer visibility is under
		<a class="underline underline-offset-4" href="{base}/people">Team &amp; reviewers</a>.
	</p>
</div>

<div class="space-y-6 px-6 py-5">
	{#if form?.message}
		<p
			class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="settings-message"
		>
			{form.message}
		</p>
	{/if}

	<section class="border-border bg-card max-w-2xl rounded-lg border p-4" data-testid="settings-rooms">
		<h2 class="text-sm font-semibold">Rooms</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Columns on the agenda grid. Add them here, not while scheduling.
		</p>

		{#if config.rooms.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">No rooms yet.</p>
		{:else}
			<ul class="mt-3 divide-border divide-y text-sm">
				{#each config.rooms as room (room.id)}
					<li class="py-2">{room.name}</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action="?/addRoom"
			use:enhance={submitting}
			class="mt-3 flex flex-wrap items-end gap-2"
		>
			<label class="min-w-[12rem] flex-1 text-xs">
				<span class="text-muted-foreground">New room</span>
				<Input name="name" class="mt-1 h-8 text-sm" placeholder="Room 3C" required />
			</label>
			<Button type="submit" size="sm" disabled={busy}>Add room</Button>
		</form>
	</section>

	<section class="border-border bg-card max-w-2xl rounded-lg border p-4" data-testid="settings-tracks">
		<h2 class="text-sm font-semibold">Tracks</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Thematic streams on the call for papers and the public site.
		</p>

		{#if config.tracks.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">No tracks yet.</p>
		{:else}
			<ul class="mt-3 divide-border divide-y text-sm">
				{#each config.tracks as track (track.id)}
					<li class="py-2">{track.name}</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action="?/addTrack"
			use:enhance={submitting}
			class="mt-3 flex flex-wrap items-end gap-2"
		>
			<label class="min-w-[12rem] flex-1 text-xs">
				<span class="text-muted-foreground">New track</span>
				<Input name="name" class="mt-1 h-8 text-sm" placeholder="Security" required />
			</label>
			<Button type="submit" size="sm" disabled={busy}>Add track</Button>
		</form>
	</section>

	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-formats"
	>
		<h2 class="text-sm font-semibold">Session formats</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			What a speaker proposes (Keynote, Talk, Workshop…). Length drives agenda end times.
		</p>

		{#if config.formats.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">
				No formats yet — speakers cannot pick a format on the call until you add one.
			</p>
		{:else}
			<ul class="mt-3 divide-border divide-y text-sm">
				{#each config.formats as format (format.id)}
					<li class="flex items-center justify-between gap-3 py-2">
						<span>{format.name}</span>
						<span class="text-muted-foreground text-xs">
							{#if format.minutes}
								{format.minutes} min
							{:else}
								no length set
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action="?/addFormat"
			use:enhance={submitting}
			class="mt-3 flex flex-wrap items-end gap-2"
		>
			<label class="min-w-[10rem] flex-1 text-xs">
				<span class="text-muted-foreground">Name</span>
				<Input name="name" class="mt-1 h-8 text-sm" placeholder="Talk" required />
			</label>
			<label class="w-28 text-xs">
				<span class="text-muted-foreground">Minutes</span>
				<Input
					name="minutes"
					type="number"
					min="1"
					max="1440"
					class="mt-1 h-8 text-sm"
					placeholder="30"
				/>
			</label>
			<Button type="submit" size="sm" disabled={busy}>Add format</Button>
		</form>
	</section>
</div>

<script lang="ts">
	/**
	 * Conference configuration (#63, #86): dates, rooms, tracks, session formats.
	 *
	 * Reviewer-visibility lives under Team & reviewers. The days of the agenda grid
	 * are not a list here — they follow from the date range at the top (#86).
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const config = $derived(data.config);
	const published = $derived(data.conference.status === 'published');

	let busy = $state(false);

	/** A stored timestamp back into the `YYYY-MM-DD` an `<input type="date">` takes. */
	const isoDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

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
		Whether this conference is public, plus its dates, rooms, tracks and session formats. Reviewer
		visibility is under
		<a class="underline underline-offset-4" href="{base}/people">Team &amp; reviewers</a>.
	</p>
</div>

<div class="space-y-6 px-6 py-5">
	{#if form?.error}
		<p
			class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="alert"
			data-testid="settings-error"
		>
			{form.error}
		</p>
	{:else if form?.message}
		<p
			class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="settings-message"
		>
			{form.message}
		</p>
	{/if}

	<!--
		First on the page, because until this is on, half the product does not exist:
		the public site, the conference directory on the front door and the public
		submission form all filter on `status = 'published'`. The Embed & share page
		has been telling organizers to "publish it in Settings" while there was
		nothing here to press.
	-->
	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-visibility"
	>
		<h2 class="text-sm font-semibold">Draft or live</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			A draft conference is yours alone. Publishing puts the public site online and lets speakers
			reach the call for papers — it does not decide what is on the programme, only whether anyone
			outside can see it.
		</p>

		<div class="mt-3 flex flex-wrap items-center gap-3">
			<span
				class="rounded-md border px-2 py-1 text-xs {published
					? 'border-status-good text-status-good'
					: 'text-muted-foreground'}"
				data-testid="visibility-state"
			>
				{published ? 'Live' : 'Draft'}
			</span>

			<form method="POST" action="?/visibility" use:enhance={submitting}>
				<!-- The state we want, not "toggle": a tab left open on the old value would
				     otherwise flip the conference the wrong way when it is submitted. -->
				<input type="hidden" name="published" value={published ? 'false' : 'true'} />
				<Button
					type="submit"
					size="sm"
					variant={published ? 'outline' : 'default'}
					disabled={busy}
					data-testid="visibility-submit"
				>
					{published ? 'Return to draft' : 'Publish'}
				</Button>
			</form>

			{#if published}
				<a
					href="/c/{data.conference.slug}"
					target="_blank"
					rel="noopener"
					class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
				>
					/c/{data.conference.slug}
				</a>
			{/if}
		</div>

		{#if !published}
			<p class="text-muted-foreground mt-3 text-xs">
				While it is a draft, <code>/c/{data.conference.slug}</code> and the public submission form answer
				404.
			</p>
		{/if}
	</section>

	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-dates"
	>
		<h2 class="text-sm font-semibold">When it runs</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			The agenda grid is built from these dates — one column per day. Change them and the grid
			follows. A day that still holds sessions is never dropped silently; you are told which ones to
			clear first.
		</p>

		<form method="POST" action="?/dates" use:enhance={submitting} class="mt-3 space-y-3">
			<div class="flex flex-wrap items-end gap-2">
				<label class="w-44 text-xs">
					<span class="text-muted-foreground">Starts on</span>
					<Input
						name="startsOn"
						type="date"
						value={data.conference.startsOn ?? ''}
						class="mt-1 h-8 text-sm"
					/>
				</label>
				<label class="w-44 text-xs">
					<span class="text-muted-foreground">Ends on</span>
					<Input
						name="endsOn"
						type="date"
						value={data.conference.endsOn ?? ''}
						class="mt-1 h-8 text-sm"
					/>
				</label>
				<Button type="submit" size="sm" disabled={busy}>Save dates</Button>
			</div>
			<p class="text-muted-foreground text-xs">
				Leave the end date blank for a one-day conference.
			</p>
		</form>
	</section>

	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-rooms"
	>
		<h2 class="text-sm font-semibold">Rooms</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Columns on the agenda grid. Add them here, not while scheduling.
		</p>

		{#if config.rooms.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">No rooms yet.</p>
		{:else}
			<ul class="divide-border mt-3 divide-y text-sm">
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

	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-tracks"
	>
		<h2 class="text-sm font-semibold">Tracks</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Thematic streams on the call for papers and the public site.
		</p>

		{#if config.tracks.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">No tracks yet.</p>
		{:else}
			<ul class="divide-border mt-3 divide-y text-sm">
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
			<ul class="divide-border mt-3 divide-y text-sm">
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

	<!--
		The deliverables screen has been promising this section for as long as it has
		existed: "tasks are created from the templates in settings". There were no
		templates in settings. The generator on the accept path was fine — nothing
		could feed it, so every speaker portal stayed empty and the journey ended at
		the first step.

		Deliberately not a template designer. A title, what it is, and when it is due
		is the whole of what `createSpeakerTasks` reads; anything more would be a
		screen about the screen.
	-->
	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="settings-task-templates"
	>
		<h2 class="text-sm font-semibold">Speaker tasks</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			What every speaker is asked for once their talk is accepted — a slide deck, a headshot, a bio.
			Accepting a talk creates these for its speakers; changing them here changes what the
			<em>next</em>
			acceptance hands out, never a task somebody already has.
		</p>

		{#if data.templates.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">
				No tasks yet — accepting a talk will ask its speakers for nothing.
			</p>
		{:else}
			<ul class="divide-border mt-3 divide-y">
				{#each data.templates as template (template.id)}
					<li class="py-3">
						<form
							method="POST"
							action="?/updateTemplate"
							use:enhance={submitting}
							class="space-y-2"
						>
							<input type="hidden" name="id" value={template.id} />
							<div class="flex flex-wrap items-end gap-2">
								<label class="min-w-[12rem] flex-1 text-xs">
									<span class="text-muted-foreground">Title</span>
									<Input name="title" value={template.title} class="mt-1 h-8 text-sm" required />
								</label>
								<label class="w-36 text-xs">
									<span class="text-muted-foreground">Speaker has to</span>
									<select
										name="kind"
										class="border-input bg-background mt-1 h-8 w-full rounded-md border px-2 text-sm"
									>
										<option value="action" selected={template.kind === 'action'}
											>Do something</option
										>
										<option value="file_request" selected={template.kind === 'file_request'}>
											Upload a file
										</option>
									</select>
								</label>
							</div>
							<div class="flex flex-wrap items-end gap-2">
								<label class="w-40 text-xs">
									<span class="text-muted-foreground">Days after accept</span>
									<Input
										name="dueOffsetDays"
										type="number"
										min="0"
										max="365"
										value={template.dueOffsetDays ?? ''}
										class="mt-1 h-8 text-sm"
									/>
								</label>
								<label class="w-40 text-xs">
									<span class="text-muted-foreground">or a fixed date</span>
									<Input
										name="dueOn"
										type="date"
										value={template.dueOn ? isoDay(template.dueOn) : ''}
										class="mt-1 h-8 text-sm"
									/>
								</label>
								<Button type="submit" size="sm" variant="outline" disabled={busy}>Save</Button>
							</div>
							<label class="block text-xs">
								<span class="text-muted-foreground">Instructions (optional)</span>
								<Input
									name="instructions"
									value={template.instructions ?? ''}
									class="mt-1 h-8 text-sm"
									placeholder="16:9, PDF, no larger than 20 MB"
								/>
							</label>
						</form>

						<!-- Its own form: nesting it in the edit form would post the edited
						     fields with the delete, and a browser will not nest them anyway. -->
						<form method="POST" action="?/deleteTemplate" use:enhance={submitting} class="mt-2">
							<input type="hidden" name="id" value={template.id} />
							<Button
								type="submit"
								size="sm"
								variant="ghost"
								class="text-muted-foreground h-7 px-2 text-xs"
								disabled={busy}
							>
								Remove
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form method="POST" action="?/addTemplate" use:enhance={submitting} class="mt-4 space-y-2">
			<div class="flex flex-wrap items-end gap-2">
				<label class="min-w-[12rem] flex-1 text-xs">
					<span class="text-muted-foreground">New task</span>
					<Input name="title" class="mt-1 h-8 text-sm" placeholder="Upload your slides" required />
				</label>
				<label class="w-36 text-xs">
					<span class="text-muted-foreground">Speaker has to</span>
					<select
						name="kind"
						class="border-input bg-background mt-1 h-8 w-full rounded-md border px-2 text-sm"
					>
						<option value="file_request">Upload a file</option>
						<option value="action">Do something</option>
					</select>
				</label>
			</div>
			<div class="flex flex-wrap items-end gap-2">
				<label class="w-40 text-xs">
					<span class="text-muted-foreground">Days after accept</span>
					<Input
						name="dueOffsetDays"
						type="number"
						min="0"
						max="365"
						class="mt-1 h-8 text-sm"
						placeholder="14"
					/>
				</label>
				<label class="w-40 text-xs">
					<span class="text-muted-foreground">or a fixed date</span>
					<Input name="dueOn" type="date" class="mt-1 h-8 text-sm" />
				</label>
				<Button type="submit" size="sm" disabled={busy}>Add task</Button>
			</div>
		</form>
	</section>
</div>

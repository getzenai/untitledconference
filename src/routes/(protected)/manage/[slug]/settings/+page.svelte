<script lang="ts">
	/**
	 * Conference configuration (#63, #86, #153): dates, rooms, tracks, session formats.
	 *
	 * Reviewer-visibility lives under Team & reviewers. The days of the agenda grid
	 * are not a list here — they follow from the date range (#86). The long page is
	 * split with a sticky jump nav (#153), not tabs: every section stays on one page
	 * so form posts can keep their own save feedback without a tab-state machine.
	 */
	import { enhance } from '$app/forms';
	import { MAX_MINUTES } from '$lib/conference/structure-lines';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import DatePicker from '$lib/components/app/date-picker.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();

	/** The two task kinds, in the wording the organizer reads on the row. */
	const TASK_KINDS = [
		{ value: 'file_request', label: 'Upload a file' },
		{ value: 'action', label: 'Do something' }
	];

	/**
	 * The page's own table of contents (#153).
	 *
	 * Six sections, one under the other, made this the longest column in the
	 * product — you had to scroll past the rooms to learn that session formats
	 * exist. The list is written out rather than derived from the DOM so the order
	 * is decided here, next to the sections themselves, and so the nav renders
	 * identically on the server. Labels match the section headings so the current
	 * mark and the heading say the same thing.
	 */
	const SECTIONS = [
		{ id: 'visibility', label: 'General' },
		{ id: 'dates', label: 'Dates' },
		{ id: 'rooms', label: 'Rooms' },
		{ id: 'tracks', label: 'Tracks' },
		{ id: 'formats', label: 'Session formats' },
		{ id: 'tasks', label: 'Speaker tasks' }
	] as const;

	/**
	 * How many list rows show before "Show all".
	 *
	 * A venue with twelve rooms used to force every organizer past all twelve to
	 * reach the add field. Five is enough to recognise the list; the rest opens on
	 * demand. Small lists never show the control.
	 */
	const LIST_PREVIEW = 5;

	const base = $derived(`/manage/${data.conference.slug}`);
	const config = $derived(data.config);
	const published = $derived(data.conference.status === 'published');
	const archived = $derived(data.conference.status === 'archived');
	const listed = $derived(data.conference.listedPublicly);

	let busy = $state(false);
	let roomsExpanded = $state(false);
	let tracksExpanded = $state(false);
	let formatsExpanded = $state(false);
	let tasksExpanded = $state(false);

	/**
	 * Which entry the nav marks as current.
	 *
	 * A jump list with no sense of where you are is a menu, not a map. The
	 * observer keeps a set of the sections currently on screen and marks the
	 * topmost of them; the bottom margin keeps a section from claiming the mark
	 * while it is only just peeking in from below. Without JS the first entry
	 * stays marked and every link still works — it is an anchor.
	 */
	let currentSection = $state<string>(SECTIONS[0].id);

	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return;

		// An array rather than a Set: this is bookkeeping inside the observer, not
		// reactive state, and `svelte/prefer-svelte-reactivity` rightly refuses to
		// tell the two apart from the outside.
		const onScreen: string[] = [];
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const seen = onScreen.indexOf(entry.target.id);
					if (entry.isIntersecting && seen === -1) onScreen.push(entry.target.id);
					else if (!entry.isIntersecting && seen !== -1) onScreen.splice(seen, 1);
				}
				const topmost = SECTIONS.find((section) => onScreen.includes(section.id));
				if (topmost) currentSection = topmost.id;
			},
			{ rootMargin: '-72px 0px -55% 0px' }
		);

		for (const section of SECTIONS) {
			const element = document.getElementById(section.id);
			if (element) observer.observe(element);
		}

		return () => observer.disconnect();
	});

	/** Slice a long list to the preview unless the organizer opened it. */
	const preview = <T,>(items: T[], expanded: boolean): T[] =>
		expanded || items.length <= LIST_PREVIEW ? items : items.slice(0, LIST_PREVIEW);

	/**
	 * The add-task form's own Instructions field needs the kind that is about to be
	 * submitted, not the one on a stored template — there is no template yet. Kept
	 * in its own piece of state (rather than reading the select at submit time) so
	 * the Instructions placeholder updates the moment "Upload a file" is picked,
	 * instead of only after the row round-trips through a save.
	 */
	let newTaskKind = $state('file_request');

	/** A stored timestamp back into the `YYYY-MM-DD` the date picker takes. */
	const isoDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

	/**
	 * The example shown in an empty Instructions box.
	 *
	 * A file example under a task the speaker only has to tick is worse than no
	 * example: a greyed placeholder is easy to read as stored text, and this one
	 * described an upload the task does not accept.
	 */
	const instructionsHint = (kind: string) =>
		kind === 'file_request'
			? '16:9, PDF, no larger than 20 MB'
			: 'Anything the speaker needs to know';

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

	/**
	 * The structure forms, which are typed into over and over.
	 *
	 * On success the cursor goes back where it was. `update()` already clears the
	 * field — what it does not do is give it back, and being dropped out of the
	 * form after every add is what turns "add five rooms" into five journeys across
	 * the page. The same click that saves you leaves you ready for the next line.
	 *
	 * A successful add also opens the section's list. The page lands with long
	 * lists collapsed (LIST_PREVIEW), which is right for "I came to change one
	 * name". It is wrong for the moment you just typed six rooms and pressed
	 * Enter: the sixth would sit behind "Show all" and look like it never saved.
	 * Expanding only on success keeps the quiet entry for everyone else.
	 */
	const addingLines =
		(expand: () => void) =>
		({ formElement }: { formElement: HTMLFormElement }) => {
			busy = true;
			return async ({
				result,
				update
			}: {
				result: { type: string };
				update: () => Promise<void>;
			}) => {
				try {
					await update();
					if (result.type === 'success') {
						expand();
						formElement.querySelector('textarea')?.focus();
					}
				} finally {
					busy = false;
				}
			};
		};

	/**
	 * Examples in the field itself, so the shape of a batch is visible before the
	 * first one is typed rather than explained in prose above it.
	 */
	const ROOM_LINES = 'Room 3C\nMain Stage';
	const TRACK_LINES = 'Security\nPlatform';
	const FORMAT_LINES = 'Talk, 30\nWorkshop, 90\nPanel';

	/**
	 * Enter adds, shift+enter starts another line.
	 *
	 * A textarea swallows enter, and the field these replaced was a single-line
	 * input where enter submitted. Taking that away to gain the second line would
	 * be trading one person's speed for another's.
	 */
	const submitOnEnter = (event: KeyboardEvent) => {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;

		event.preventDefault();
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	};
</script>

<!--
	Where the answer to "did that work?" appears.

	At the top of the page for the things there is one of — publishing, the dates —
	and inside the section that was submitted for the lists, which is where the eye
	already is after pressing Add. A confirmation a screen away from the thing it
	confirms is what sends people back to reload the page to check.
-->
{#snippet feedback(section: string | null)}
	{#if (form?.section ?? null) === section}
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
	{/if}
{/snippet}

<!--
	Remove, as its own form beside the rename form rather than inside it.

	A browser will not nest forms at all, and even if it would, a Remove that
	posted the half-typed name next to it would be two intentions on one button.
-->
{#snippet removeRow(action: string, id: number, label: string)}
	<form method="POST" {action} use:enhance={submitting}>
		<input type="hidden" name="id" value={id} />
		<Button
			type="submit"
			size="sm"
			variant="ghost"
			class="text-muted-foreground h-8 px-2 text-xs"
			disabled={busy}
			aria-label={label}
		>
			Remove
		</Button>
	</form>
{/snippet}

<!--
	One row of a list whose whole content is a name: a field that starts at what is
	stored, Save beside it, Remove beside that.

	Rooms and tracks share it because they are the same thing to an organizer. A
	session format does not — it carries a length as well, and folding a field that
	only one of the three has into here would cost more in conditionals than the
	repetition it saves.
-->
{#snippet nameRow(
	noun: string,
	row: { id: number; name: string },
	renameAction: string,
	deleteAction: string
)}
	<li
		class="flex flex-wrap items-center gap-2 py-2"
		data-testid="settings-{noun}-row"
		data-name={row.name}
	>
		<form
			method="POST"
			action={renameAction}
			use:enhance={submitting}
			class="flex flex-1 flex-wrap items-center gap-2"
		>
			<input type="hidden" name="id" value={row.id} />
			<Input
				name="name"
				value={row.name}
				aria-label="{noun} name"
				class="h-8 min-w-[10rem] flex-1 text-sm"
				required
			/>
			<Button type="submit" size="sm" variant="outline" disabled={busy}>Save</Button>
		</form>
		{@render removeRow(deleteAction, row.id, `Remove ${noun}`)}
	</li>
{/snippet}

<!--
	Expand control for long structure lists.

	Rendered only when the list is longer than LIST_PREVIEW. Hidden rows stay out
	of the DOM until opened so the page stays short on entry; opening is a client
	toggle, not a form post.
-->
{#snippet showMore(count: number, noun: string, expanded: boolean, toggle: () => void)}
	{#if count > LIST_PREVIEW}
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground mt-1 text-xs underline underline-offset-4"
			onclick={toggle}
			data-testid="settings-show-more-{noun}"
		>
			{expanded ? `Show fewer ${noun}` : `Show all ${count} ${noun}`}
		</button>
	{/if}
{/snippet}

<svelte:head>
	<title>Settings — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Settings</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		Whether this conference is public, plus its dates, rooms, tracks and session formats. Reviewer
		visibility is under
		<a class="underline underline-offset-4" href="{base}/people">Reviewer pool</a>.
	</p>
</div>

<!--
	Nav beside the sections, not tabs over them (#153).

	Tabs would hide five of the six sections behind a click and put the page into a
	state that has to survive every form post on it — six actions, each returning
	its own confirmation into the section it came from. An anchor list costs none
	of that: everything stays on one page and reachable by Ctrl-F, the section
	headings keep working as headings, and the answer to "what can I configure
	here?" is on screen before the first scroll.

	Desktop: sticky left column. Narrow screens: horizontal jump strip so the map
	is still reachable without a sidebar.
-->
<div class="px-6 py-5 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
	<nav
		class="border-border bg-background/95 sticky top-0 z-10 -mx-6 mb-6 border-b px-6 py-2 backdrop-blur lg:top-5 lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
		aria-label="Settings sections"
		data-testid="settings-section-nav"
	>
		<ul class="flex gap-1 overflow-x-auto text-sm lg:flex-col lg:space-y-1 lg:overflow-visible">
			{#each SECTIONS as section (section.id)}
				<li class="shrink-0">
					<a
						href="#{section.id}"
						class="block rounded-md px-2 py-1 whitespace-nowrap {currentSection === section.id
							? 'bg-muted text-foreground font-medium'
							: 'text-muted-foreground hover:text-foreground'}"
						aria-current={currentSection === section.id ? 'true' : undefined}
					>
						{section.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="max-w-3xl space-y-6">
		{#if data.setup && !published}
			<!-- After "New conference" the next click a juror must find is Publish.
			     The old banner pointed at rooms and the CFP, so /c/<slug> stayed 404. -->
			<section
				class="border-status-warn/40 bg-status-warn-bg max-w-2xl rounded-lg border p-4"
				data-testid="settings-setup-hint"
				role="status"
			>
				<h2 class="text-sm font-semibold">This conference is a draft</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Nobody outside can see it yet —
					<code class="text-foreground">/c/{data.conference.slug}</code>
					answers 404. The switch is
					<a class="underline underline-offset-4" href="#visibility">Publish, in General below</a>.
				</p>
			</section>
		{/if}

		<!--
			First on the page, because until this is on, half the product does not exist:
			the public site, the conference directory on the front door and the public
			submission form all filter on `status = 'published'`. The Embed & share page
			has been telling organizers to "publish it in Settings" while there was
			nothing here to press.
		-->
		<section
			id="visibility"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-visibility"
		>
			<h2 class="text-sm font-semibold">General</h2>
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
					{archived ? 'Archived' : published ? 'Live' : 'Draft'}
				</span>

				{#if archived}
					<!-- Publish is deliberately not a second way out of the archive
					     (`visibility.ts`), so while it is archived the only control here is
					     the one door back. -->
					{#if data.canArchive}
						<form method="POST" action="?/restore" use:enhance={submitting}>
							<Button type="submit" size="sm" disabled={busy} data-testid="restore-submit">
								Restore
							</Button>
						</form>
					{/if}
				{:else}
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
				{/if}

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

			{#if archived}
				<p class="text-muted-foreground mt-3 text-xs">
					Archived: <code>/c/{data.conference.slug}</code> answers 404 and the conference is out of
					every list. Nothing was deleted, and it can still be edited here — restoring puts it back
					{data.conference.statusBeforeArchive === 'published' ? 'live' : 'as a draft'}, exactly as
					it was.
				</p>
			{:else if !published}
				<p class="text-muted-foreground mt-3 text-xs">
					While it is a draft, <code>/c/{data.conference.slug}</code> and the public submission form answer
					404.
				</p>
			{/if}

			<!-- Published and listed are two questions (#402). The front page is the one
			     surface a visitor reaches without a link, so what it names is a decision,
			     not a side effect of publishing. -->
			{#if published}
				<div class="border-border mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
					<form method="POST" action="?/listing" use:enhance={submitting}>
						<input type="hidden" name="listed" value={listed ? 'false' : 'true'} />
						<Button
							type="submit"
							size="sm"
							variant="outline"
							disabled={busy}
							data-testid="listing-submit"
						>
							{listed ? 'Remove from the front page' : 'Show on the front page'}
						</Button>
					</form>
					<p class="text-muted-foreground text-xs" data-testid="listing-state">
						{listed
							? 'Listed in the public directory on the front page.'
							: 'Not in the public directory — reachable only through its own link.'}
					</p>
				</div>
			{/if}

			<div class="mt-3">
				{@render feedback('visibility')}
			</div>

			{#if data.canArchive && !archived}
				<!--
					Archiving sits at the foot of the section it undoes, behind its own
					disclosure: it is rare, and a button of the same weight as Publish
					standing next to Publish is the one that gets pressed by accident.

					The slug field appears only for a published conference — the same
					grading `archive_conference` uses. A confirmation asked for every time
					is one nobody reads, and then it does not guard the case it was for.
				-->
				<details class="border-border mt-4 border-t pt-3">
					<summary
						class="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
						data-testid="archive-disclosure"
					>
						Archive this conference
					</summary>
					<form
						method="POST"
						action="?/archive"
						use:enhance={submitting}
						class="mt-3 max-w-2xl space-y-2"
					>
						<p class="text-muted-foreground text-xs">
							{#if published}
								Archiving takes <code>/c/{data.conference.slug}</code> offline for everyone holding the
								link, closes the call for papers and hides the conference from every list. Every row stays;
								Restore brings it back live. Copies already cached at the edge can answer for up to a
								minute longer.
							{:else}
								Archiving hides the conference from every list. Every row stays, and Restore brings
								it back as a draft.
							{/if}
						</p>
						{#if published}
							<label class="block text-xs" for="archive-confirm-slug">
								Type <code>{data.conference.slug}</code> to confirm
							</label>
							<Input
								id="archive-confirm-slug"
								name="confirmSlug"
								autocomplete="off"
								class="max-w-xs"
								data-testid="archive-confirm-slug"
							/>
						{/if}
						<Button
							type="submit"
							size="sm"
							variant="outline"
							disabled={busy}
							data-testid="archive-submit"
						>
							Archive
						</Button>
					</form>
				</details>
			{/if}
		</section>

		<section
			id="dates"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-dates"
		>
			<h2 class="text-sm font-semibold">Dates</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				The agenda grid is built from these dates — one column per day. Change them and the grid
				follows. A day that still holds sessions is never dropped silently; you are told which ones
				to clear first.
			</p>

			<form method="POST" action="?/dates" use:enhance={submitting} class="mt-3 space-y-3">
				<div class="flex flex-wrap items-end gap-2">
					<!-- A picker is a button, and a button takes its accessible name from
				     what is inside it — which here is a date, not a field name. The
				     caption above it is therefore repeated as `aria-label`, otherwise a
				     screen reader announces two buttons both called "May 12, 2027". -->
					<div class="w-44 text-xs">
						<span class="text-muted-foreground">Starts on</span>
						<DatePicker
							name="startsOn"
							value={data.conference.startsOn ?? ''}
							size="sm"
							aria-label="Starts on"
							class="mt-1 text-sm"
						/>
					</div>
					<div class="w-44 text-xs">
						<span class="text-muted-foreground">Ends on</span>
						<DatePicker
							name="endsOn"
							value={data.conference.endsOn ?? ''}
							size="sm"
							aria-label="Ends on"
							class="mt-1 text-sm"
						/>
					</div>
					<Button type="submit" size="sm" disabled={busy}>Save dates</Button>
				</div>
				<p class="text-muted-foreground text-xs">
					Leave the end date blank for a one-day conference.
				</p>
				{@render feedback('dates')}
			</form>
		</section>

		<section
			id="rooms"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-rooms"
		>
			<h2 class="text-sm font-semibold">Rooms</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Columns on the agenda grid. Add them here, not while scheduling. Renaming one keeps
				everything scheduled in it; a room can only go once nothing is.
			</p>

			{#if config.rooms.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">No rooms yet.</p>
			{:else}
				<ul class="divide-border mt-3 divide-y text-sm">
					{#each preview(config.rooms, roomsExpanded) as room (room.id)}
						{@render nameRow('room', room, '?/renameRoom', '?/deleteRoom')}
					{/each}
				</ul>
				{@render showMore(config.rooms.length, 'rooms', roomsExpanded, () => {
					roomsExpanded = !roomsExpanded;
				})}
			{/if}

			<form
				method="POST"
				action="?/addRoom"
				use:enhance={addingLines(() => {
					roomsExpanded = true;
				})}
				class="mt-3 space-y-2"
			>
				<label class="block text-xs">
					<span class="text-muted-foreground">New rooms — one per line</span>
					<Textarea
						name="names"
						rows={2}
						class="mt-1 min-h-0 py-1.5 text-sm"
						placeholder={ROOM_LINES}
						onkeydown={submitOnEnter}
						required
					/>
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit" size="sm" disabled={busy}>Add rooms</Button>
					<span class="text-muted-foreground text-xs">
						Enter adds, shift+enter starts another line.
					</span>
				</div>
				{@render feedback('rooms')}
			</form>
		</section>

		<section
			id="tracks"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-tracks"
		>
			<h2 class="text-sm font-semibold">Tracks</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Thematic streams on the call for papers and the public site. A track can only go once no
				submission is in it and no reviewer is limited to it.
			</p>

			{#if config.tracks.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">No tracks yet.</p>
			{:else}
				<ul class="divide-border mt-3 divide-y text-sm">
					{#each preview(config.tracks, tracksExpanded) as track (track.id)}
						{@render nameRow('track', track, '?/renameTrack', '?/deleteTrack')}
					{/each}
				</ul>
				{@render showMore(config.tracks.length, 'tracks', tracksExpanded, () => {
					tracksExpanded = !tracksExpanded;
				})}
			{/if}

			<form
				method="POST"
				action="?/addTrack"
				use:enhance={addingLines(() => {
					tracksExpanded = true;
				})}
				class="mt-3 space-y-2"
			>
				<label class="block text-xs">
					<span class="text-muted-foreground">New tracks — one per line</span>
					<Textarea
						name="names"
						rows={2}
						class="mt-1 min-h-0 py-1.5 text-sm"
						placeholder={TRACK_LINES}
						onkeydown={submitOnEnter}
						required
					/>
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit" size="sm" disabled={busy}>Add tracks</Button>
					<span class="text-muted-foreground text-xs">
						Enter adds, shift+enter starts another line.
					</span>
				</div>
				{@render feedback('tracks')}
			</form>
		</section>

		<section
			id="formats"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-formats"
		>
			<h2 class="text-sm font-semibold">Session formats</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				What a speaker proposes (Keynote, Talk, Workshop…). Length drives agenda end times. A format
				can only go once nothing was proposed as it.
			</p>

			{#if config.formats.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">
					No formats yet — speakers cannot pick a format on the call until you add one.
				</p>
			{:else}
				<ul class="divide-border mt-3 divide-y text-sm">
					{#each preview(config.formats, formatsExpanded) as format (format.id)}
						<li
							class="flex flex-wrap items-center gap-2 py-2"
							data-testid="settings-format-row"
							data-name={format.name}
						>
							<form
								method="POST"
								action="?/updateFormat"
								use:enhance={submitting}
								class="flex flex-1 flex-wrap items-center gap-2"
							>
								<input type="hidden" name="id" value={format.id} />
								<Input
									name="name"
									value={format.name}
									aria-label="Session format name"
									class="h-8 min-w-[10rem] flex-1 text-sm"
									required
								/>
								<!-- Blank is "no length set", which is why there is no default here:
							     a format nobody has measured yet is a real state, and typing a
							     number in is how it stops being one. -->
								<Input
									name="minutes"
									type="number"
									min="1"
									max={MAX_MINUTES}
									value={format.minutes ?? ''}
									aria-label="Length in minutes"
									placeholder="min"
									class="h-8 w-20 text-sm"
								/>
								<Button type="submit" size="sm" variant="outline" disabled={busy}>Save</Button>
							</form>
							{@render removeRow('?/deleteFormat', format.id, 'Remove session format')}
						</li>
					{/each}
				</ul>
				{@render showMore(config.formats.length, 'formats', formatsExpanded, () => {
					formatsExpanded = !formatsExpanded;
				})}
			{/if}

			<form
				method="POST"
				action="?/addFormat"
				use:enhance={addingLines(() => {
					formatsExpanded = true;
				})}
				class="mt-3 space-y-2"
			>
				<label class="block text-xs">
					<span class="text-muted-foreground">New formats — one per line, length optional</span>
					<Textarea
						name="formats"
						rows={2}
						class="mt-1 min-h-0 py-1.5 text-sm"
						placeholder={FORMAT_LINES}
						onkeydown={submitOnEnter}
						required
					/>
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit" size="sm" disabled={busy}>Add formats</Button>
					<span class="text-muted-foreground text-xs">
						Put the minutes after a comma. Enter adds, shift+enter starts another line.
					</span>
				</div>
				{@render feedback('formats')}
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
			id="tasks"
			class="border-border bg-card scroll-mt-5 rounded-lg border p-4"
			data-testid="settings-task-templates"
		>
			<h2 class="text-sm font-semibold">Speaker tasks</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				What every speaker is asked for once their talk is accepted — a slide deck, a headshot, a
				bio. Accepting a talk creates these for its speakers; changing them here changes what the
				<em>next</em>
				acceptance hands out, never a task somebody already has. A task nobody has yet can be given to
				the speakers already accepted.
			</p>

			{#if data.templates.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">
					No tasks yet — accepting a talk will ask its speakers for nothing.
				</p>
			{:else}
				<ul class="divide-border mt-3 divide-y">
					{#each preview(data.templates, tasksExpanded) as template (template.id)}
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
										<AppSelect
											name="kind"
											size="sm"
											class="mt-1"
											aria-label="Speaker has to"
											value={template.kind}
											options={TASK_KINDS}
										/>
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
									<div class="w-40 text-xs">
										<span class="text-muted-foreground">or a fixed date</span>
										<DatePicker
											name="dueOn"
											value={template.dueOn ? isoDay(template.dueOn) : ''}
											size="sm"
											aria-label="Due on a fixed date"
											class="mt-1 text-sm"
										/>
									</div>
									<Button type="submit" size="sm" variant="outline" disabled={busy}>Save</Button>
								</div>
								<label class="block text-xs">
									<span class="text-muted-foreground">Instructions (optional)</span>
									<!-- The hint follows the kind. A "Do something" task showed the file
								     example — "Confirm participation … 16:9, PDF, no larger than 20 MB"
								     reads as stored text rather than as a greyed suggestion, and it
								     describes an upload the task does not accept. -->
									<Input
										name="instructions"
										value={template.instructions ?? ''}
										class="mt-1 h-8 text-sm"
										placeholder={instructionsHint(template.kind)}
									/>
								</label>
							</form>

							<!-- Its own form: nesting it in the edit form would post the edited
						     fields with the delete, and a browser will not nest them anyway. -->
							<div class="mt-2 flex flex-wrap items-center gap-2">
								<form method="POST" action="?/deleteTemplate" use:enhance={submitting}>
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

								<!-- Only drawn when somebody is actually missing it: a button that
							     always says "give to 0 speakers" teaches an organizer to ignore it. -->
								{#if (data.pending[template.id] ?? 0) > 0}
									<form method="POST" action="?/handOutTemplate" use:enhance={submitting}>
										<input type="hidden" name="id" value={template.id} />
										<Button
											type="submit"
											size="sm"
											variant="outline"
											class="h-7 px-2 text-xs"
											disabled={busy}
											title="Assign this task to accepted speakers who do not have it yet. New acceptances already get templates automatically."
										>
											Give to {data.pending[template.id]} accepted {data.pending[template.id] === 1
												? 'speaker'
												: 'speakers'} still missing it
										</Button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				{@render showMore(data.templates.length, 'tasks', tasksExpanded, () => {
					tasksExpanded = !tasksExpanded;
				})}
			{/if}

			<form
				method="POST"
				action="?/addTemplate"
				use:enhance={addingLines(() => {
					tasksExpanded = true;
				})}
				class="mt-4 space-y-2"
			>
				<div class="flex flex-wrap items-end gap-2">
					<label class="min-w-[12rem] flex-1 text-xs">
						<span class="text-muted-foreground">New task</span>
						<Input
							name="title"
							class="mt-1 h-8 text-sm"
							placeholder="Upload your slides"
							required
						/>
					</label>
					<label class="w-36 text-xs">
						<span class="text-muted-foreground">Speaker has to</span>
						<AppSelect
							name="kind"
							size="sm"
							class="mt-1"
							aria-label="Speaker has to"
							value={newTaskKind}
							onValueChange={(value) => (newTaskKind = value)}
							options={TASK_KINDS}
						/>
					</label>
				</div>
				<label class="block text-xs">
					<span class="text-muted-foreground">Instructions (optional)</span>
					<Input
						name="instructions"
						class="mt-1 h-8 text-sm"
						placeholder={instructionsHint(newTaskKind)}
					/>
				</label>
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
					<div class="w-40 text-xs">
						<span class="text-muted-foreground">or a fixed date</span>
						<DatePicker
							name="dueOn"
							size="sm"
							aria-label="Due on a fixed date"
							class="mt-1 text-sm"
						/>
					</div>
					<Button type="submit" size="sm" disabled={busy}>Add task</Button>
				</div>
			</form>

			{@render feedback('tasks')}
		</section>
	</div>
</div>

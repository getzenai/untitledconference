<script lang="ts">
	/**
	 * Who owes the conference something, and what.
	 *
	 * Grouped by speaker rather than listed by task, because the organizer's real
	 * question is "who do I chase" — a flat task list makes them do the grouping in
	 * their head, and chasing is per person, not per row.
	 *
	 * Speakers with something outstanding sort first. A page that opens on the people
	 * who are already finished buries the work.
	 */
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { cn } from '$lib/utils.js';
	import ContentTaskList from './content-task-list.svelte';

	let { data, form } = $props();

	/**
	 * A conference with a hundred speakers turns this page into a scroll of a hundred
	 * cards. Full virtualization is not the answer before the room is booked — being
	 * able to type a name is. The box only appears once scrolling is actually the
	 * problem; below that it would be furniture.
	 */
	const FILTER_FROM = 8;
	let query = $state('');

	/**
	 * Collapsed by default. A hundred speakers means a hundred cards each showing
	 * every task, which turns the page into a scroll before it answers anything —
	 * the header line (name, N of M to do) already says who needs chasing; the task
	 * list is only worth opening for the ones that do. Not persisted across
	 * reloads: there is nothing here worth remembering between visits.
	 */
	const expanded = new SvelteSet<number>();
	const toggle = (speakerProfileId: number) => {
		if (expanded.has(speakerProfileId)) expanded.delete(speakerProfileId);
		else expanded.add(speakerProfileId);
	};

	const base = $derived(`/manage/${data.conference.slug}`);
	const t = $derived(data.totals);

	const ordered = $derived(
		[...data.speakers].sort(
			(a, b) => b.waiting - a.waiting || b.open - a.open || a.name.localeCompare(b.name)
		)
	);

	const shown = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return ordered;
		return ordered.filter((s) =>
			`${s.name} ${s.email ?? ''} ${s.tasks.map((t) => `${t.title} ${t.sessionTitle ?? ''}`).join(' ')}`
				.toLowerCase()
				.includes(needle)
		);
	});

	/**
	 * Who a reminder would actually reach (CNT-08).
	 *
	 * Only speakers with an open task and an address get a checkbox: a box that
	 * quietly does nothing is worse than no box, and it would make "6 selected" a lie
	 * about how many emails leave. A speaker waiting on the organizer's approval is
	 * not behind on anything, so `waiting` does not count here — `open` does.
	 */
	const remindable = $derived(
		new Set(data.speakers.filter((s) => s.open > 0 && s.email).map((s) => s.speakerProfileId))
	);

	let picked = $state<number[]>([]);
	let sending = $state(false);

	// The list is a page-load old. A speaker who was chased or finished in the
	// meantime drops off `remindable`, and a stale tick must not be counted.
	const pickedCount = $derived(picked.filter((id) => remindable.has(id)).length);

	const headline = $derived.by(() => {
		if (t.waiting > 0) return `${t.waiting} handed in and waiting on you.`;
		if (t.open > 0) return `${t.open} still outstanding with the speakers.`;
		return 'Everything is done.';
	});
</script>

<svelte:head>
	<title>Speaker content — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Speaker content</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				{headline}
				{#if t.overdue > 0}
					<span class="text-status-bad font-medium">{t.overdue} overdue.</span>
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<!--
				The library is the same files seen the other way round: by file rather than
				by the person who owes it. Chasing is per person, finding is per file.
			-->
			<Button href="{base}/content/files" size="sm" variant="secondary" data-testid="files-link">
				All files
			</Button>
		</div>
		{#if ordered.length >= FILTER_FROM}
			<label class="w-full max-w-xs text-sm">
				<span class="sr-only">Find a speaker</span>
				<Input
					bind:value={query}
					type="search"
					placeholder="Find a speaker or task"
					data-testid="content-filter"
				/>
			</label>
		{/if}
	</div>
</div>

<!--
	max-w-5xl, not full bleed: these are rows of names on a wide screen, and a card
	that runs the whole width of a 34" monitor puts the name and its counts an arm's
	length apart.
-->
<div class="mx-auto max-w-5xl space-y-6 px-6 py-5">
	{#if ordered.length === 0}
		<p class="border-border bg-muted/40 rounded-lg border p-4 text-sm">
			No speaker has any tasks yet. Tasks are created from the templates in
			<a class="underline" href="{base}/settings">settings</a> when a talk is accepted.
		</p>
	{:else if shown.length === 0}
		<p class="border-border bg-muted/40 rounded-lg border p-4 text-sm">
			No speaker or task matches “{query}”.
		</p>
	{:else}
		<!--
			One form around the whole list: chasing is per person, but an organizer chases
			the six people who are behind in one go, not six times in a row. The tick boxes
			are the selection and the bar is the send — the same shape the reviewer progress
			table uses for ABS-09, so the two do not have to be learned separately.
		-->
		<form
			method="POST"
			action="?/remindSpeakers"
			use:enhance={() => {
				sending = true;
				// `finally`, so a dropped connection cannot leave the button dead.
				return async ({ update }) => {
					try {
						await update(formUpdateOptions('edit'));
					} finally {
						sending = false;
					}
				};
			}}
		>
			{#if remindable.size > 0}
				<div
					class="border-border bg-muted/40 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
					data-testid="deliverable-reminder-bar"
				>
					<p class="text-muted-foreground text-sm">
						{#if pickedCount === 0}
							Tick the speakers who still owe you something to chase them in one go.
						{:else}
							<span
								class="text-foreground font-medium tabular-nums"
								data-testid="deliverable-selected-count">{pickedCount} selected</span
							> · one email each, queued now and sent with the next dispatch.
						{/if}
					</p>
					<Button
						type="submit"
						size="sm"
						data-testid="send-deliverable-reminders"
						disabled={pickedCount === 0 || sending}
					>
						Send reminders
					</Button>
				</div>
			{/if}

			{#if form?.reminderMessage}
				<p class="border-border mb-4 rounded-md border px-3 py-2 text-sm" role="status">
					{form.reminderMessage}
				</p>
			{/if}

			<div class="space-y-4">
				{#each shown as speaker (speaker.speakerProfileId)}
					{@const isOpen = expanded.has(speaker.speakerProfileId)}
					{@const outstanding = speaker.open + speaker.waiting}
					<section class="border-border bg-card rounded-lg border">
						<div class="flex items-start gap-3 pl-4">
							{#if remindable.has(speaker.speakerProfileId)}
								<input
									type="checkbox"
									name="speakerProfileIds"
									value={speaker.speakerProfileId}
									bind:group={picked}
									class="border-input accent-primary mt-4.5 size-4 shrink-0 rounded"
									aria-label="Select {speaker.name}"
									data-testid="select-speaker"
								/>
							{:else}
								<!-- Keeps the names in one column whether or not a box is there. -->
								<span class="size-4 shrink-0" aria-hidden="true"></span>
							{/if}
							<button
								type="button"
								class="flex flex-1 flex-wrap items-baseline justify-between gap-2 py-4 pr-4 text-left"
								aria-expanded={isOpen}
								onclick={() => toggle(speaker.speakerProfileId)}
							>
								<div class="flex items-baseline gap-2">
									<ChevronRightIcon
										class={cn(
											'text-muted-foreground size-4 shrink-0 self-center transition-transform',
											isOpen && 'rotate-90'
										)}
									/>
									<div>
										<h2 class="text-sm font-medium">{speaker.name}</h2>
										<p class="text-muted-foreground text-xs">
											{speaker.email ?? 'No email'}
											{#if !speaker.hasAccount}
												<span class="px-1">·</span>
												<!--
											Worth stating rather than hiding: this person cannot sign in,
											so nothing here will be done by them. Chasing them means email.
										-->
												<span title="Created by an organizer — no login">no account</span>
											{/if}
										</p>
									</div>
								</div>
								<StatusBadge
									status="open"
									tone={outstanding > 0 ? 'warn' : 'good'}
									label="{outstanding} of {speaker.tasks.length} {speaker.tasks.length === 1
										? 'task'
										: 'tasks'} to do"
								/>
							</button>
						</div>

						{#if isOpen}
							<ContentTaskList {base} tasks={speaker.tasks} />
						{/if}
					</section>
				{/each}
			</div>
		</form>
	{/if}

	<p class="text-muted-foreground text-xs">
		<Button href="{base}/dashboard" variant="ghost" size="sm">Back to the dashboard</Button>
	</p>
</div>

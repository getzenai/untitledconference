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
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { cn } from '$lib/utils.js';

	let { data } = $props();

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
	 * the header line (name, open/total) already says who needs chasing; the task
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
			`${s.name} ${s.email ?? ''} ${s.tasks.map((t) => t.title).join(' ')}`
				.toLowerCase()
				.includes(needle)
		);
	});

	const due = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : null;

	const overdue = (value: Date | string | null, status: string) =>
		Boolean(value && status !== 'done' && new Date(value) < new Date());

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
		<div class="space-y-4">
			{#each shown as speaker (speaker.speakerProfileId)}
				{@const isOpen = expanded.has(speaker.speakerProfileId)}
				{@const outstanding = speaker.open + speaker.waiting}
				<section class="border-border bg-card rounded-lg border">
					<button
						type="button"
						class="flex w-full flex-wrap items-baseline justify-between gap-2 p-4 text-left"
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
							label="{outstanding} open · {speaker.tasks.length} {speaker.tasks.length === 1
								? 'task'
								: 'tasks'}"
						/>
					</button>

					{#if isOpen}
						<ul class="divide-border border-border mt-0 divide-y border-t px-4 pb-4">
							{#each speaker.tasks as task (task.id)}
								<li class="flex flex-wrap items-center justify-between gap-2 py-2">
									<div class="min-w-0">
										<a class="text-sm hover:underline" href="{base}/content/tasks/{task.id}">
											{task.title}
										</a>
										<span class="text-muted-foreground ml-2 text-xs">
											{#if task.fileCount > 0}
												{task.latestFilename}{#if task.fileCount > 1}
													<span class="px-1">·</span>v{task.fileCount}{/if}
											{:else if task.kind === 'file_request'}
												nothing handed in
											{:else}
												no file needed
											{/if}
											{#if task.dueOn}
												<span class="px-1">·</span>
												<span class={overdue(task.dueOn, task.status) ? 'text-status-bad' : ''}>
													due {due(task.dueOn)}
												</span>
											{/if}
										</span>
									</div>

									<div class="flex items-center gap-2">
										{#if task.latestApproval && task.fileCount > 0}
											<Badge variant={task.latestApproval === 'approved' ? 'secondary' : 'outline'}>
												{task.latestApproval === 'approved'
													? 'Approved'
													: task.latestApproval === 'rejected'
														? 'Rejected'
														: 'Needs a look'}
											</Badge>
										{/if}
										<Badge variant={task.status === 'open' ? 'outline' : 'secondary'}>
											{task.status === 'open'
												? 'Open'
												: task.status === 'submitted'
													? 'Handed in'
													: 'Done'}
										</Badge>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}

	<p class="text-muted-foreground text-xs">
		<Button href="{base}/dashboard" variant="ghost" size="sm">Back to the dashboard</Button>
	</p>
</div>

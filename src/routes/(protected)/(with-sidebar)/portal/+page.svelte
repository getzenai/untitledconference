<script lang="ts">
	/**
	 * The speaker portal (CNT-02).
	 *
	 * Two lists, in this order for a reason: what is expected of me, then what I
	 * proposed. A speaker who opens this page has usually been sent here by a
	 * deadline, not by curiosity about their own back catalogue.
	 */
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { formatInstant } from '$lib/conference/deadline';
	import { readerZone } from '$lib/conference/reader-zone.svelte';
	import { isParticipationTaskTitle } from '$lib/conference/task-purpose';

	let { data } = $props();

	const zone = readerZone();

	const open = $derived(data.tasks.filter((t) => t.status === 'open'));
	const settled = $derived(data.tasks.filter((t) => t.status !== 'open'));
	type Task = (typeof data.tasks)[number];
	type TaskGroup = {
		key: string;
		title: string;
		conferenceName: string;
		conferenceSlug: string;
		tasks: Task[];
		doneCount: number;
	};

	/**
	 * A withdrawal is an answer, not an achievement (#495).
	 *
	 * Answering the participation task closes it, so a speaker who has just told
	 * the organizers they cannot come used to find that task ticked and counted
	 * in "4 of 5 done". The one thing that is emphatically not done was marked
	 * done. The row says what the answer was; the count leaves it out rather than
	 * claiming either.
	 */
	const withdrawn = (task: Task) =>
		task.status !== 'open' &&
		isParticipationTaskTitle(task.title) &&
		task.participationStatus === 'declined';

	const groupBySession = (tasks: Task[]) => {
		const groups: TaskGroup[] = [];

		for (const task of tasks) {
			const key = `${task.conference.slug}:${task.submissionId ?? 'event-wide'}`;
			const existing = groups.find((group) => group.key === key);
			if (existing) {
				existing.tasks.push(task);
				continue;
			}

			groups.push({
				key,
				title: task.submissionTitle ?? 'Event-wide tasks',
				conferenceName: task.conference.name,
				conferenceSlug: task.conference.slug,
				tasks: [task],
				doneCount: 0
			});
		}

		for (const group of groups)
			group.doneCount = group.tasks.filter((t) => t.status !== 'open' && !withdrawn(t)).length;

		return groups;
	};

	/**
	 * Every task under its talk, open ones first (#244).
	 *
	 * A finished task used to leave its group for a collapsed "N already done" list
	 * that named the conference and not the talk — so a speaker with two talks could
	 * not tell which finished task belonged to which, and the pleasant part, five
	 * things ticked off under your own talk, was missing entirely.
	 *
	 * The concatenation does the ordering on its own, because `myTasks` already sorts
	 * by deadline: open tasks first means groups appear in order of their soonest
	 * deadline, a group with nothing left to do sinks below the ones that still want
	 * something, and inside a group the finished rows settle at the bottom.
	 */
	const groups = $derived(groupBySession([...open, ...settled]));

	const statusTone: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
		draft: 'outline',
		submitted: 'secondary',
		in_review: 'secondary',
		accepted: 'default',
		rejected: 'destructive',
		waitlisted: 'secondary',
		withdrawn: 'outline'
	};

	const statusLabel: Record<string, string> = {
		draft: 'Draft — not submitted',
		submitted: 'Submitted',
		in_review: 'In review',
		accepted: 'Accepted',
		rejected: 'Not accepted',
		waitlisted: 'Waitlisted',
		withdrawn: 'Withdrawn'
	};

	/**
	 * A deadline is an instant, and it says which clock it is on (#498).
	 *
	 * `due_on` is `timestamptz` — one moment of the world — and this list used to
	 * print its calendar day in whatever zone happened to be rendering. On the
	 * server that is UTC and in the browser it is the speaker's own, so the same
	 * row could read "Sun, 2 May" before hydration and "Mon, 3 May" after it, with
	 * nothing on screen to say either was a zone at all. A speaker abroad who hands
	 * in on the last evening loses a talk to that difference.
	 *
	 * `formatInstant` is the app's one shape for this, from #468 on the organizer
	 * side. It carries the year, which the old heuristic added only for other
	 * years — the reason for that heuristic was noise, and the time and zone this
	 * row now has to carry make the year the cheapest part of the line.
	 */
	const dueLabel = (dueOn: Date | string | null) =>
		dueOn ? formatInstant(dueOn, zone.current) : 'No deadline';

	const overdue = (dueOn: Date | string | null) => Boolean(dueOn && new Date(dueOn) < new Date());
</script>

<svelte:head>
	<title>Speaker portal</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Speaker portal</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				Your deadlines and your proposals, across every conference you have submitted to.
			</p>
			<p class="text-muted-foreground mt-1 text-sm">
				Signed in as <span class="text-foreground font-medium"
					>{data.account.name || data.account.email}</span
				>
				{#if data.account.name}<span class="px-1">·</span>{data.account.email}{/if}
			</p>
		</div>

		<Button href="/portal/profile" variant="outline" size="sm">Edit your profile</Button>
	</div>

	<section class="mt-8">
		<h2 class="text-sm font-medium">Your tasks</h2>

		{#if data.tasks.length === 0}
			<EmptyState title="Nothing is waiting on you.">
				<p class="text-muted-foreground mt-1 text-sm">
					Tasks appear here once a talk of yours is accepted.
				</p>
			</EmptyState>
		{:else}
			{#if open.length === 0}
				<p class="text-muted-foreground mt-1 text-sm">
					Nothing is waiting on you — everything here is done.
				</p>
			{/if}
			<!-- The gap between talks has to beat the gap within one, or the next heading
			     reads as another row of the previous list (#245). `space-y-10` against
			     `py-3` rows, and a heading that outranks a task title by size as well as
			     weight — the rows themselves are not made smaller to pay for it. -->
			<div class="mt-4 space-y-10">
				{#each groups as group (group.key)}
					<section aria-labelledby="task-group-{group.key}">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3">
							<h3 id="task-group-{group.key}" class="text-base font-semibold">{group.title}</h3>
							{#if group.doneCount > 0}
								<span class="text-muted-foreground text-sm"
									>{group.doneCount} of {group.tasks.length} done</span
								>
							{/if}
						</div>
						<!-- The conference was plain text here: the portal knew which event was
					     asking and offered no way to it — no programme, no venue, no
					     organizers (#498). -->
						<p class="text-muted-foreground mt-0.5 text-sm">
							<a class="hover:underline" href="/c/{group.conferenceSlug}">{group.conferenceName}</a>
						</p>
						<ul class="divide-border mt-2 divide-y border-y">
							{#each group.tasks as task (task.id)}
								{@const gone = withdrawn(task)}
								{@const done = task.status !== 'open' && !gone}
								{@const closed = done || gone}
								<li class="flex flex-wrap items-start justify-between gap-3 py-3">
									<div class="flex items-start gap-2">
										{#if done}
											<!-- The tick is the whole status, so it is not decorative: a muted row
											     with no due date is otherwise just a row someone forgot to date. -->
											<CheckIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
											<span class="sr-only">Done —</span>
										{/if}
										<div>
											<a
												class="text-sm hover:underline {closed
													? 'text-muted-foreground'
													: 'font-medium'}"
												href="/portal/tasks/{task.id}"
											>
												{task.title}
											</a>
											{#if task.instructions && !closed}
												<p class="text-muted-foreground mt-1 text-sm">{task.instructions}</p>
											{/if}
										</div>
									</div>
									{#if gone}
										<!-- Not a tick and not a deadline: the answer itself. This task is
										     closed and the speaker is not coming (#495). -->
										<Badge variant="outline" data-testid="task-withdrawn">Withdrawn</Badge>
									{:else if !done}
										<span
											class="text-sm {overdue(task.dueOn)
												? 'text-status-bad font-medium'
												: 'text-muted-foreground'}"
										>
											<!-- One expression rather than an {#if} block: Svelte trims the whitespace
											     that starts a block, and the line read "11 Aug— overdue" without it. -->
											{dueLabel(task.dueOn)}{overdue(task.dueOn) ? ' — overdue' : ''}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	</section>

	<section class="mt-10">
		<h2 class="text-sm font-medium">Your proposals</h2>

		{#if data.submissions.length === 0}
			<EmptyState title="You have not proposed anything yet.">
				<p class="text-muted-foreground mt-1 text-sm">
					Open a conference's call for papers to submit a talk.
				</p>
			</EmptyState>
		{:else}
			<ul class="divide-border mt-3 divide-y">
				{#each data.submissions as submission (submission.id)}
					<li class="flex flex-wrap items-start justify-between gap-3 py-3">
						<div>
							<a
								class="text-sm font-medium hover:underline"
								href="/portal/submissions/{submission.id}"
							>
								{submission.title}
							</a>
							<p class="text-muted-foreground mt-0.5 text-sm">
								{submission.conference.name}{#if !submission.isPrimary}<span class="px-1.5">·</span
									>co-presenting{/if}
							</p>
						</div>
						<div class="flex items-center gap-3">
							{#if submission.status === 'draft'}
								<a class="text-sm underline" href="/portal/submissions/{submission.id}/edit">
									Finish it
								</a>
							{/if}
							<Badge variant={statusTone[submission.status] ?? 'secondary'}>
								{statusLabel[submission.status] ?? submission.status}
							</Badge>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

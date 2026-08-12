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

	let { data } = $props();

	const open = $derived(data.tasks.filter((t) => t.status === 'open'));
	const settled = $derived(data.tasks.filter((t) => t.status !== 'open'));
	type Task = (typeof data.tasks)[number];
	type TaskGroup = {
		key: string;
		title: string;
		conferenceName: string;
		tasks: Task[];
		doneCount: number;
	};

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
				tasks: [task],
				doneCount: 0
			});
		}

		for (const group of groups)
			group.doneCount = group.tasks.filter((t) => t.status !== 'open').length;

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
	 * The year appears only when it is not this one.
	 *
	 * The list is sorted by deadline and spans a CFP, so without it the run reads
	 * "Tue, 25 Aug" and then "Wed, 14 Apr" — which looks like the sort is broken
	 * rather than like the next year has begun. Printing the year on every row
	 * would pay for that with noise on the rows that are actually due soon.
	 */
	const dueLabel = (dueOn: Date | string | null) => {
		if (!dueOn) return 'No deadline';
		const date = new Date(dueOn);
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		};
		if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
		return date.toLocaleDateString('en-GB', options);
	};

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
						<p class="text-muted-foreground mt-0.5 text-sm">{group.conferenceName}</p>
						<ul class="divide-border mt-2 divide-y border-y">
							{#each group.tasks as task (task.id)}
								{@const done = task.status !== 'open'}
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
												class="text-sm hover:underline {done
													? 'text-muted-foreground'
													: 'font-medium'}"
												href="/portal/tasks/{task.id}"
											>
												{task.title}
											</a>
											{#if task.instructions && !done}
												<p class="text-muted-foreground mt-1 text-sm">{task.instructions}</p>
											{/if}
										</div>
									</div>
									{#if !done}
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

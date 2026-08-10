<script lang="ts">
	/**
	 * The speaker portal (CNT-02).
	 *
	 * Two lists, in this order for a reason: what is expected of me, then what I
	 * proposed. A speaker who opens this page has usually been sent here by a
	 * deadline, not by curiosity about their own back catalogue.
	 */
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/empty-state.svelte';

	let { data } = $props();

	const open = $derived(data.tasks.filter((t) => t.status === 'open'));
	const settled = $derived(data.tasks.filter((t) => t.status !== 'open'));

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

	const dueLabel = (dueOn: Date | string | null) => {
		if (!dueOn) return 'No deadline';
		return new Date(dueOn).toLocaleDateString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	};

	const overdue = (dueOn: Date | string | null) => Boolean(dueOn && new Date(dueOn) < new Date());
</script>

<svelte:head>
	<title>Speaker portal</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-8">
	<h1 class="text-2xl font-semibold tracking-tight">Speaker portal</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Your deadlines and your proposals, across every conference you have submitted to.
	</p>

	<section class="mt-8">
		<h2 class="text-sm font-medium">What is due</h2>

		{#if open.length === 0}
			<EmptyState title="Nothing is waiting on you.">
				<p class="text-muted-foreground mt-1 text-sm">
					Tasks appear here once a talk of yours is accepted.
				</p>
			</EmptyState>
		{:else}
			<ul class="divide-border mt-3 divide-y">
				{#each open as task (task.id)}
					<li class="flex flex-wrap items-start justify-between gap-3 py-3">
						<div>
							<a class="text-sm font-medium hover:underline" href="/portal/tasks/{task.id}">
								{task.title}
							</a>
							<p class="text-muted-foreground mt-0.5 text-sm">
								{task.conference.name}{#if task.submissionTitle}<span class="px-1.5">·</span
									>{task.submissionTitle}{/if}
							</p>
							{#if task.instructions}
								<p class="text-muted-foreground mt-1 text-sm">{task.instructions}</p>
							{/if}
						</div>
						<span
							class="text-sm {overdue(task.dueOn)
								? 'text-status-bad font-medium'
								: 'text-muted-foreground'}"
						>
							{dueLabel(task.dueOn)}{#if overdue(task.dueOn)}
								— overdue{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if settled.length > 0}
			<details class="mt-4">
				<summary class="text-muted-foreground cursor-pointer text-sm">
					{settled.length} already done
				</summary>
				<ul class="divide-border mt-2 divide-y">
					{#each settled as task (task.id)}
						<li class="py-2">
							<a class="text-sm hover:underline" href="/portal/tasks/{task.id}">{task.title}</a>
							<span class="text-muted-foreground ml-2 text-sm">{task.conference.name}</span>
						</li>
					{/each}
				</ul>
			</details>
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

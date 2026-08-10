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
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const t = $derived(data.totals);

	const ordered = $derived(
		[...data.speakers].sort(
			(a, b) => b.waiting - a.waiting || b.open - a.open || a.name.localeCompare(b.name)
		)
	);

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

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Speaker content</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			{headline}
			{#if t.overdue > 0}
				<span class="text-status-bad font-medium">{t.overdue} overdue.</span>
			{/if}
		</p>
	</div>

	{#if ordered.length === 0}
		<p class="border-border bg-muted/40 rounded-lg border p-4 text-sm">
			No speaker has any tasks yet. Tasks are created from the templates in
			<a class="underline" href="{base}/settings">settings</a> when a talk is accepted.
		</p>
	{:else}
		<div class="space-y-4">
			{#each ordered as speaker (speaker.speakerProfileId)}
				<section class="border-border bg-card rounded-lg border p-4">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
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
						<p class="text-muted-foreground text-xs">
							{speaker.waiting > 0 ? `${speaker.waiting} waiting · ` : ''}{speaker.open} open ·
							{speaker.done} done
						</p>
					</div>

					<ul class="divide-border mt-3 divide-y">
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
				</section>
			{/each}
		</div>
	{/if}

	<p class="text-muted-foreground text-xs">
		<Button href="{base}/dashboard" variant="ghost" size="sm">Back to the dashboard</Button>
	</p>
</div>

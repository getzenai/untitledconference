<script lang="ts">
	/**
	 * The organizer's landing surface (journey 2, step 10).
	 *
	 * The submissions table shows what exists; this shows what is stuck. Everything on
	 * screen is a queue with a real count and a way in — no vanity totals, no chart
	 * that needs a second screen to act on.
	 *
	 * Order is deliberate and is the order the work actually happens in: decide, then
	 * schedule, then chase the speakers, then check that the mail went out. The
	 * inconsistency strip sits above all of it because it is the only thing here that
	 * means something is *wrong* rather than merely unfinished.
	 */
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	let { data } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const d = $derived(data.dashboard);

	const stamp = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '—';

	/** The one line under the title: only the numbers that mean somebody has to act. */
	const headline = $derived.by(() => {
		const parts: string[] = [];
		if (d.decisions.undecided > 0) parts.push(`${d.decisions.undecided} awaiting a decision`);
		if (d.scheduling.unplaced + d.scheduling.tentative > 0) {
			parts.push(`${d.scheduling.unplaced + d.scheduling.tentative} accepted without a slot`);
		}
		if (d.tasks.overdue > 0) parts.push(`${d.tasks.overdue} speaker tasks overdue`);
		if (d.mail.failed > 0) parts.push(`${d.mail.failed} emails failed`);
		return parts.length > 0 ? parts.join(' · ') : 'Nothing is waiting on you right now.';
	});
</script>

<svelte:head>
	<title>Dashboard — {data.conference.name}</title>
</svelte:head>

{#snippet card(title: string, lead: string, body: Snippet, footer?: Snippet)}
	<section class="border-border bg-card flex flex-col rounded-lg border p-4">
		<h2 class="text-sm font-semibold tracking-tight">{title}</h2>
		<p class="text-muted-foreground mt-0.5 text-xs tabular-nums">{lead}</p>
		<div class="mt-3 flex-1">{@render body()}</div>
		{#if footer}
			<div class="border-border mt-3 border-t pt-2 text-xs">{@render footer()}</div>
		{/if}
	</section>
{/snippet}

{#snippet nothing(text: string)}
	<p class="text-muted-foreground py-2 text-sm">{text}</p>
{/snippet}

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">{headline}</p>
		</div>
		<Button href="{base}/submissions" variant="outline">Open the submissions table</Button>
	</div>
</div>

<div class="space-y-4 px-6 py-5">
	{#if d.inconsistencies.count > 0}
		<!-- Taking an acceptance back leaves a confirmed slot and any touched task in
		     place on purpose — a bulk click must not empty the grid or delete an
		     upload. That promise only holds if the leftovers are visible somewhere. -->
		<section
			class="border-status-warn/40 bg-status-warn-bg text-status-warn rounded-lg border p-4"
			data-testid="dashboard-inconsistencies"
		>
			<h2 class="text-sm font-semibold">
				{d.inconsistencies.count} decided talk{d.inconsistencies.count === 1 ? '' : 's'} still held in
				the programme
			</h2>
			<p class="mt-0.5 text-xs">
				Declining a talk leaves a confirmed slot and any task the speaker already touched in place,
				so nothing disappears behind your back. Resolve these by hand.
			</p>
			<ul class="mt-2 space-y-1 text-sm">
				{#each d.inconsistencies.items as item (`${item.kind}-${item.id}`)}
					<li>
						<a class="font-medium underline underline-offset-4" href="{base}/submissions/{item.id}"
							>{item.title}</a
						>
						<span class="opacity-80">— {item.status.replace(/_/g, ' ')}, {item.detail}.</span>
					</li>
				{/each}
			</ul>
			{#if d.inconsistencies.count > d.inconsistencies.items.length}
				<p class="mt-2 text-xs">
					and {d.inconsistencies.count - d.inconsistencies.items.length} more.
				</p>
			{/if}
		</section>
	{/if}

	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#snippet decisionsBody()}
			{#if d.decisions.items.length === 0}
				{@render nothing('Every submission has an answer.')}
			{:else}
				<ul class="space-y-2 text-sm">
					{#each d.decisions.items as item (item.id)}
						<li class="flex items-baseline justify-between gap-2">
							<a class="min-w-0 truncate hover:underline" href="{base}/submissions/{item.id}">
								{item.title}
							</a>
							<span class="text-muted-foreground shrink-0 text-xs tabular-nums">
								{item.reviewsSubmitted}/{item.reviewsAssigned} reviewed
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{#snippet decisionsFooter()}
			<a
				class="underline underline-offset-4"
				href="{base}/submissions?status=submitted&status=in_review"
			>
				Decide all {d.decisions.undecided}
			</a>
		{/snippet}
		{@render card(
			'Waiting for a decision',
			`${d.decisions.undecided} open · ${d.decisions.unreviewed} with no review yet`,
			decisionsBody,
			d.decisions.undecided > 0 ? decisionsFooter : undefined
		)}

		{#snippet schedulingBody()}
			{#if d.scheduling.items.length === 0}
				{@render nothing(
					d.scheduling.accepted === 0
						? 'Nothing accepted yet.'
						: 'Every accepted talk has a confirmed slot.'
				)}
			{:else}
				<ul class="space-y-2 text-sm">
					{#each d.scheduling.items as item (item.id)}
						<li class="flex items-baseline justify-between gap-2">
							<a class="min-w-0 truncate hover:underline" href="{base}/submissions/{item.id}">
								{item.title}
							</a>
							<StatusBadge
								status={item.state === 'unplaced' ? 'submitted' : 'tentative'}
								label={item.state === 'unplaced' ? 'Not in the tray' : 'In the tray'}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{#snippet schedulingFooter()}
			<a class="underline underline-offset-4" href="{base}/submissions?status=accepted">
				See all {d.scheduling.accepted} accepted
			</a>
		{/snippet}
		{@render card(
			'Accepted, not scheduled',
			`${d.scheduling.tentative} in the agenda tray · ${d.scheduling.unplaced} not even parked`,
			schedulingBody,
			d.scheduling.accepted > 0 ? schedulingFooter : undefined
		)}

		{#snippet tasksBody()}
			{#if d.tasks.items.length === 0}
				{@render nothing(
					d.tasks.open === 0
						? 'No open speaker tasks.'
						: `${d.tasks.open} open, none due in the next week.`
				)}
			{:else}
				<ul class="space-y-2 text-sm">
					{#each d.tasks.items as item (item.id)}
						<li class="flex items-baseline justify-between gap-2">
							<span class="min-w-0 truncate">
								{item.title}
								<span class="text-muted-foreground">· {item.speaker}</span>
							</span>
							<span
								class="shrink-0 text-xs tabular-nums {item.overdue
									? 'text-status-bad font-medium'
									: 'text-muted-foreground'}"
							>
								{stamp(item.dueOn)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{@render card(
			'Speaker tasks',
			`${d.tasks.overdue} overdue · ${d.tasks.dueSoon} due this week · ${d.tasks.open} open`,
			tasksBody
		)}

		{#snippet mailBody()}
			{#if d.mail.items.length === 0}
				{@render nothing('Nothing has been sent for this conference yet.')}
			{:else}
				<ul class="space-y-2 text-sm">
					{#each d.mail.items as item (item.id)}
						<li class="flex items-baseline justify-between gap-2">
							<span class="min-w-0 truncate" title={item.subject}>
								{item.subject}
								<span class="text-muted-foreground">· {item.toEmail}</span>
							</span>
							<StatusBadge status={item.status} class="shrink-0" />
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{@render card(
			'Mail',
			`${d.mail.queued} queued · ${d.mail.sent} sent · ${d.mail.failed} failed`,
			mailBody
		)}
	</div>
</div>

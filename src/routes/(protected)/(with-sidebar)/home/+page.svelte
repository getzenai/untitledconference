<script lang="ts">
	/**
	 * First screen after login: events, open work, and a jump into sourcing.
	 *
	 * Deliberately not three static role cards. The harness (and a real user)
	 * lands here and needs to see *their* work — not a starter template that
	 * asks "where do you want to go?". Empty is a real state with a next step.
	 */
	import { reviewQueueHref } from '$lib/conference/nav-access';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const hub = $derived(data.hub);

	const dateRange = (startsOn: string | null, endsOn: string | null) => {
		if (!startsOn) return 'Dates not set';
		const start = new Date(startsOn);
		const end = endsOn ? new Date(endsOn) : null;
		const month = { month: 'short', day: 'numeric' } as const;
		const full = { year: 'numeric', month: 'short', day: 'numeric' } as const;
		if (!end) return start.toLocaleDateString('en-GB', full);
		return `${start.toLocaleDateString('en-GB', month)} – ${end.toLocaleDateString('en-GB', full)}`;
	};

	/** Conference, plus the talk when the task belongs to one. Event-wide stays conference alone. */
	const taskWhere = (task: { conference: { name: string }; submissionTitle: string | null }) =>
		task.submissionTitle
			? `${task.conference.name} · ${task.submissionTitle}`
			: task.conference.name;

	const hasAnyWork = $derived(
		Boolean(
			hub &&
			(hub.events.length > 0 ||
				hub.openSubmissions.length > 0 ||
				hub.openTasks.length > 0 ||
				hub.openReviews.length > 0 ||
				hub.reviewConferences.length > 0)
		)
	);
</script>

<svelte:head>
	<title>Home</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-8 px-6 py-10" data-testid="home-dashboard">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Home</h1>
			{#if data.user?.email}
				<p class="text-muted-foreground mt-1 text-sm">Welcome, {data.user.email}</p>
			{:else}
				<p class="text-muted-foreground mt-1 text-sm">Welcome</p>
			{/if}
		</div>
		{#if hub?.canSourcing}
			<Button href="/contacts" variant="outline" size="sm">Speaker sourcing</Button>
		{/if}
	</div>

	{#if data.onboarding}
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-semibold">
				{#if data.onboarding.pendingInvitationCount > 0}
					You have {data.onboarding.pendingInvitationCount} pending invitation{data.onboarding
						.pendingInvitationCount === 1
						? ''
						: 's'}
				{:else}
					Finish setting up your account
				{/if}
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.onboarding.pendingInvitationCount > 0}
					Join an organization you have been invited to.
				{:else}
					Create an organization to start collaborating.
				{/if}
			</p>
			<p class="mt-3">
				<a
					href={data.onboarding.href}
					class="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 items-center rounded-md px-3 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
				>
					{data.onboarding.pendingInvitationCount > 0
						? 'Review invitations'
						: 'Create organization'}
				</a>
			</p>
		</section>
	{/if}

	{#if hub}
		<section aria-label="Your events">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-sm font-semibold tracking-tight">Your events</h2>
				{#if hub.events.length > 0}
					<a
						href="/manage"
						class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
					>
						All events
					</a>
				{/if}
			</div>

			{#if hub.events.length === 0}
				{#if hub.canCreateEvent}
					<EmptyState
						class="mt-3"
						goose={false}
						title="No events yet"
						description="Start a conference — a name and the dates are enough."
						action={{ href: '/manage/new', label: 'Create an event' }}
					/>
				{:else if !data.onboarding}
					<EmptyState
						class="mt-3"
						goose={false}
						title="No events yet"
						description="An organizer adds you to a conference, or you create an organization and start one."
						action={{ href: '/settings/organization/new', label: 'Create an organization' }}
					/>
				{:else}
					<p class="text-muted-foreground mt-3 text-sm">
						Finish account setup above, then you can start or join an event.
					</p>
				{/if}
			{:else}
				<ul class="mt-3 space-y-2">
					{#each hub.events as conference (conference.id)}
						<li>
							<a
								href="/manage/{conference.slug}/dashboard"
								class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
							>
								<div>
									<div class="font-medium">{conference.name}</div>
									<div class="text-muted-foreground text-xs">
										{dateRange(conference.startsOn, conference.endsOn)}{conference.venue
											? ` · ${conference.venue}`
											: ''}
									</div>
								</div>
								<StatusBadge status={conference.status} />
							</a>
						</li>
					{/each}
				</ul>
				{#if hub.canCreateEvent}
					<p class="mt-3">
						<a
							href="/manage/new"
							class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
						>
							New event
						</a>
					</p>
				{/if}
			{/if}
		</section>

		{#if hub.openReviews.length > 0 || hub.reviewConferences.length > 0}
			<section aria-label="Reviews waiting">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="text-sm font-semibold tracking-tight">Reviews waiting</h2>
					<a
						data-testid="home-review-queue-link"
						href={reviewQueueHref(
							hub.reviewConferences.length === 1 ? hub.reviewConferences[0].slug : null
						)}
						class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
					>
						Review queue
					</a>
				</div>
				{#if hub.openReviews.length === 0}
					<p class="text-muted-foreground mt-3 text-sm">
						Nothing pending. You review for
						{hub.reviewConferences.length === 1
							? hub.reviewConferences[0].name
							: `${hub.reviewConferences.length} events`}.
					</p>
				{:else}
					<ul class="mt-3 space-y-2">
						{#each hub.openReviews as item (item.submissionId)}
							<li>
								<a
									href="/review/{item.conference.slug}/{item.submissionId}"
									class="border-border hover:bg-muted/50 focus-visible:ring-ring block rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
								>
									<div class="font-medium">{item.title}</div>
									<div class="text-muted-foreground text-xs">{item.conference.name}</div>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		{#if hub.openSubmissions.length > 0 || hub.openTasks.length > 0}
			<section aria-label="Your proposals and tasks">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="text-sm font-semibold tracking-tight">Your proposals</h2>
					<a
						href="/portal"
						class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
					>
						Speaker portal
					</a>
				</div>

				{#if hub.openTasks.length > 0}
					<ul class="mt-3 space-y-2">
						{#each hub.openTasks as task (task.id)}
							<li>
								<a
									href="/portal/tasks/{task.id}"
									class="border-border hover:bg-muted/50 focus-visible:ring-ring block rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
								>
									<div class="font-medium">{task.title}</div>
									<div class="text-muted-foreground text-xs">
										{taskWhere(task)}{#if task.dueOn}
											· due {new Date(task.dueOn).toLocaleDateString('en-GB', {
												day: 'numeric',
												month: 'short'
											})}{/if}
									</div>
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				{#if hub.openSubmissions.length > 0}
					<ul class="mt-3 space-y-2">
						{#each hub.openSubmissions as submission (submission.id)}
							<li>
								<a
									href="/portal/submissions/{submission.id}"
									class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
								>
									<div>
										<div class="font-medium">{submission.title}</div>
										<div class="text-muted-foreground text-xs">{submission.conference.name}</div>
									</div>
									<StatusBadge status={submission.status} />
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		{#if hub.canSourcing && hub.events.length > 0}
			<section
				aria-label="Speaker sourcing"
				class="border-border bg-muted/30 rounded-lg border p-4"
			>
				<h2 class="text-sm font-semibold tracking-tight">Speaker sourcing</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Org-wide contacts, pipeline, and import — across every event you organize.
				</p>
				<p class="mt-3">
					<a
						href="/contacts"
						class="text-sm font-medium underline-offset-4 hover:underline"
						data-testid="home-sourcing-link"
					>
						Open contacts
					</a>
				</p>
			</section>
		{/if}

		{#if !hasAnyWork && !data.onboarding && !hub.canCreateEvent && !hub.canSourcing}
			<EmptyState
				title="Nothing here yet"
				description="When you organize, speak, or review, your events and open work show up on this page."
				action={{ href: '/settings/account', label: 'Account settings' }}
			/>
		{/if}
	{/if}
</div>

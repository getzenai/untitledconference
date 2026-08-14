<script lang="ts">
	/**
	 * The organizer's landing surface (journey 2, step 10).
	 *
	 * Day one is a different screen, not an emptier one (#473). Until something
	 * is waiting there is nothing to measure, so this is the three setup steps
	 * the create form already named. A submission, a speaker, queued or failed
	 * mail, or an open task flips to the queues below.
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
	import SubmissionsChart from '$lib/components/app/conference/submissions-chart.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { publicSiteLink } from '$lib/conference/conference-status';
	import { nextSetupStep } from '$lib/conference/dashboard-mode';
	import {
		dashboardSchedulingEmpty,
		dashboardSchedulingHeadline,
		dashboardSchedulingLabel,
		dashboardSchedulingSubhead,
		dashboardSchedulingTile
	} from '$lib/conference/program-states';
	import { submissionsTrend, TREND_WINDOW } from '$lib/conference/submissions-trend';
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check-big';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import GavelIcon from '@lucide/svelte/icons/gavel';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import type { Component, Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const d = $derived(data.dashboard);
	const settingUp = $derived(d.mode === 'setup');
	const setupNext = $derived(settingUp ? nextSetupStep(d.setup) : 'ready');
	const publicSite = $derived(publicSiteLink(data.conference.status, data.conference.slug));

	const setupHeadline = $derived(
		setupNext === 'rooms'
			? 'Add rooms, then open the call.'
			: setupNext === 'cfp'
				? 'Structure is ready. Open the call when you are.'
				: 'Share the call. The first submission turns this into a dashboard.'
	);

	const setupAction = $derived(
		setupNext === 'rooms'
			? { href: `${base}/settings#rooms`, label: 'Add rooms' }
			: setupNext === 'cfp'
				? { href: `${base}/cfp`, label: 'Open the call' }
				: publicSite.available
					? { href: publicSite.href, label: 'Share the call' }
					: { href: `${base}/settings`, label: 'Publish the event' }
	);

	const stamp = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '—';

	/** The one line under the title: only the numbers that mean somebody has to act. */
	const headline = $derived.by(() => {
		const parts: string[] = [];
		if (d.decisions.undecided > 0) parts.push(`${d.decisions.undecided} awaiting a decision`);
		const schedulingLine = dashboardSchedulingHeadline({
			unplaced: d.scheduling.unplaced,
			draft: d.scheduling.tentative
		});
		if (schedulingLine) parts.push(schedulingLine);
		if (d.tasks.overdue > 0) parts.push(`${d.tasks.overdue} speaker tasks overdue`);
		if (d.mail.failed > 0) parts.push(`${d.mail.failed} emails failed`);
		return parts.length > 0 ? parts.join(' · ') : 'Nothing is waiting on you right now.';
	});

	/**
	 * Reviewers, most outstanding work first.
	 *
	 * The query hands them back alphabetically, which is the right default for a
	 * general-purpose function and the wrong order for this box: the whole reason an
	 * organizer opens it is to find who to chase, and alphabetical puts that person
	 * anywhere. Sorted here rather than in `reviewerProgress` because it is a property
	 * of this screen, not of the data — the name stays the tiebreaker so the order is
	 * stable between two reviewers who owe the same amount.
	 */
	const reviewers = $derived(
		[...d.reviews.items].sort(
			(a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name)
		)
	);

	/**
	 * The reviewers a reminder would actually do something for (ABS-09).
	 *
	 * A reviewer who is done, or who already has a reminder waiting, has no checkbox
	 * at all rather than a checkbox that quietly does nothing: the selection is then
	 * the same set as the outcome, and "6 selected" means six emails. The server still
	 * re-checks every one of them — the list on screen is a page-load old, and two
	 * organizers on the same conference is the normal case, not the exotic one.
	 */
	const remindable = $derived(
		reviewers.filter(
			(r) => r.outstanding > 0 && r.reminderStatus !== 'queued' && r.reminderStatus !== 'sent'
		)
	);

	const remindableIds = $derived(new Set(remindable.map((r) => r.userId)));

	const selected = new SvelteSet<string>();
	let busy = $state(false);

	/** In-page confirm, gated in `use:enhance` — `preventDefault` does not stop it (#409). */
	let mailForm: HTMLFormElement | undefined = $state();
	let mailConfirmOpen = $state(false);
	let allowMailDispatch = $state(false);

	const mailUnconfigured = 'Mail delivery is not configured.';
	const mailIdleCopy = 'Queued messages go out when you send them, or with the next dispatch.';
	const mailBlockReason = $derived(
		!data.mailDeliveryConfigured
			? mailUnconfigured
			: d.mail.queued === 0
				? 'Nothing is queued.'
				: null
	);
	const mailQueuedPhrase = $derived(
		d.mail.queued === 1 ? '1 queued message' : `${d.mail.queued} queued messages`
	);

	const confirmMailDispatch = () => {
		if (!mailForm) return;
		allowMailDispatch = true;
		mailConfirmOpen = false;
		mailForm.requestSubmit();
	};

	// A reviewer who dropped off the remindable list — reminded by someone else, or
	// finished — must not stay selected across the reload that told us so.
	$effect(() => {
		const open = remindableIds;
		untrack(() => {
			for (const id of [...selected]) if (!open.has(id)) selected.delete(id);
		});
	});

	const allRemindableSelected = $derived(
		remindable.length > 0 && remindable.every((r) => selected.has(r.userId))
	);

	const toggleAll = () => {
		if (allRemindableSelected) selected.clear();
		else for (const r of remindable) selected.add(r.userId);
	};

	const toggle = (userId: string) => {
		if (selected.has(userId)) selected.delete(userId);
		else selected.add(userId);
	};

	const trend = $derived(submissionsTrend(d.submissionsOverTime));
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

<!--
	A stat tile: an icon to find it by, the label, the value, one line of context,
	and a link to the screen where the number can be acted on. The value carries
	the font's proportional figures — `tabular-nums` gives every digit the width of
	a zero, which makes a large `121` look like it has come loose.

	The four sit in one panel divided by hairlines rather than as four floating
	boxes: they are four readings of one conference, and a row of separate cards
	says four unrelated things. `alert` tints exactly one kind of number — the one
	that means late, not merely open. Everything here is a queue; if all four
	shouted, none would.
-->
{#snippet tile(
	Icon: Component,
	label: string,
	value: number,
	context: string,
	href: string,
	alert = false
)}
	<a
		{href}
		class="bg-card hover:bg-muted/40 focus-visible:ring-ring group relative flex flex-col p-5 transition-colors focus-visible:ring-[3px] focus-visible:-outline-offset-1 focus-visible:outline-none"
	>
		<span class="flex items-center gap-2">
			<!--
				The two branches set the same three properties rather than layering an
				override on a base: two utilities for one property have the same
				specificity, so which wins is decided by their order in the stylesheet,
				not by their order in this attribute.
			-->
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors {alert
					? 'border-status-bad/30 bg-status-bad-bg text-status-bad'
					: 'border-border bg-muted/50 text-muted-foreground group-hover:text-foreground'}"
				aria-hidden="true"
			>
				<Icon class="size-3.5" />
			</span>
			<span class="text-muted-foreground text-xs font-medium">{label}</span>
		</span>
		<span
			class="mt-3 text-3xl leading-none font-semibold tracking-tight {alert
				? 'text-status-bad'
				: ''}"
		>
			{value}
		</span>
		<span class="text-muted-foreground mt-2 text-xs">{context}</span>
	</a>
{/snippet}

{#if settingUp}
	<div class="border-border bg-card border-b px-6 py-5">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="text-lg font-semibold tracking-tight">Set up this event</h1>
				<p class="text-muted-foreground mt-0.5 text-sm">{setupHeadline}</p>
			</div>
			<Button href={setupAction.href} variant="act">{setupAction.label}</Button>
		</div>
	</div>

	<ol class="space-y-3 px-6 py-5" data-testid="dashboard-setup">
		<li>
			<a
				href="{base}/settings#rooms"
				class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
				data-testid="dashboard-setup-rooms"
			>
				<div>
					<p class="text-muted-foreground text-xs">1</p>
					<p class="font-medium">Rooms</p>
					<p class="text-muted-foreground mt-0.5 text-xs tabular-nums">
						{d.setup.rooms === 1 ? '1 room' : `${d.setup.rooms} rooms`}
					</p>
				</div>
				<span class="text-sm font-medium">{d.setup.rooms === 0 ? 'Add rooms' : 'Edit rooms'}</span>
			</a>
		</li>
		<li>
			<a
				href="{base}/settings#tracks"
				class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
				data-testid="dashboard-setup-tracks"
			>
				<div>
					<p class="text-muted-foreground text-xs">2</p>
					<p class="font-medium">Tracks</p>
					<p class="text-muted-foreground mt-0.5 text-xs tabular-nums">
						{d.setup.tracks === 1 ? '1 track' : `${d.setup.tracks} tracks`}
					</p>
				</div>
				<span class="text-sm font-medium"
					>{d.setup.tracks === 0 ? 'Add tracks' : 'Edit tracks'}</span
				>
			</a>
		</li>
		<li>
			<a
				href="{base}/cfp"
				class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
				data-testid="dashboard-setup-cfp"
			>
				<div>
					<p class="text-muted-foreground text-xs">3</p>
					<p class="font-medium">Call for papers</p>
					<p class="text-muted-foreground mt-0.5 text-xs">{d.setup.cfpOpen ? 'Open' : 'Closed'}</p>
				</div>
				<span class="text-sm font-medium"
					>{d.setup.cfpOpen ? 'Edit the call' : 'Open the call'}</span
				>
			</a>
		</li>
	</ol>
{:else}
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
					{d.inconsistencies.count} leftover{d.inconsistencies.count === 1 ? '' : 's'} from talks you
					decided against
				</h2>
				<p class="mt-0.5 text-xs">
					Taking an acceptance back clears the agenda tray and the untouched tasks, and deliberately
					leaves the rest: a confirmed slot somebody may have announced, work the speaker already
					handed in, and tasks an organizer typed by hand. Nothing disappears behind your back — so
					these need a human.
				</p>
				<ul class="mt-2 space-y-1 text-sm">
					{#each d.inconsistencies.items as item (`${item.kind}-${item.id}`)}
						<li>
							<a
								class="font-medium underline underline-offset-4"
								href="{base}/submissions/{item.id}">{item.title}</a
							>
							<!--
							No `opacity-*` on text. Every colour pair in the token file is
							measured against 4.5:1 when the palette is built, and a wash over
							the top is invisible to that check: `status-warn` on its own plate
							is 4.91:1 and 3.46:1 at 80% (#456). The clause is already
							subordinate — it follows a link and is not bold.
						-->
							<span>— {item.status.replace(/_/g, ' ')}, {item.detail}.</span>
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

		<!--
		Four numbers, and every one of them is a queue with somewhere to go. The
		temptation on a dashboard is a row of totals — submissions, speakers, days —
		which look like a summary and are read once and never again. These are the
		counts that decide what the organizer does next, which is why each tile is a
		link rather than a figure.
	-->
		<!--
		The hairlines are the panel's own background showing through a one-pixel
		gap, not `divide-*`. Divide utilities walk the children in document order —
		"every one but the first gets a top border" — which is a row's logic, not a
		grid's: at two columns they draw a line above the second tile, which is
		beside the first, and none between the two tiles in a column.
	-->
		<div
			class="border-border bg-border grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-4"
			data-testid="dashboard-metrics"
		>
			{@render tile(
				GavelIcon,
				'Awaiting a decision',
				d.decisions.undecided,
				`${d.decisions.unreviewed} with no review yet`,
				`${base}/submissions?status=submitted&status=in_review`
			)}
			{@render tile(
				CheckCircleIcon,
				'Accepted',
				d.scheduling.accepted,
				dashboardSchedulingTile({
					unplaced: d.scheduling.unplaced,
					draft: d.scheduling.tentative
				}),
				`${base}/submissions?status=accepted`
			)}
			{@render tile(
				ClipboardListIcon,
				'Reviews outstanding',
				d.reviews.outstanding,
				`${d.reviews.submitted} of ${d.reviews.assigned} assigned are in`,
				`${base}/people`
			)}
			{@render tile(
				CalendarClockIcon,
				'Speaker tasks overdue',
				d.tasks.overdue,
				`${d.tasks.dueSoon} more due this week`,
				`${base}/content`,
				d.tasks.overdue > 0
			)}
		</div>

		<section class="border-border bg-card rounded-lg border" data-testid="submissions-over-time">
			<div class="flex flex-wrap items-start justify-between gap-4 p-4 pb-3">
				<div>
					<h2 class="text-sm font-semibold tracking-tight">Submissions over time</h2>
					<p class="text-muted-foreground mt-0.5 text-xs">
						Per day, counted when the submission was started. Quiet days are on the axis as zeroes —
						the gaps are the point of the chart.
					</p>
				</div>
				<!--
				The line shows the shape; this says which way it points. It is the last
				seven days against the seven before them — the comparison an organizer
				makes in their head anyway — and it is absent rather than approximate
				before two full weeks exist. An arrow with no number beside it would be
				a mood, so the counts are printed and the icon is `aria-hidden`.
			-->
				{#if trend}
					<p
						class="flex items-center gap-1.5 text-xs tabular-nums {trend.direction === 'up'
							? 'text-status-good'
							: trend.direction === 'down'
								? 'text-status-warn'
								: 'text-muted-foreground'}"
						data-testid="submissions-trend"
					>
						{#if trend.direction !== 'flat'}
							{@const Arrow = trend.direction === 'up' ? TrendingUpIcon : TrendingDownIcon}
							<Arrow class="size-3.5 shrink-0" aria-hidden="true" />
						{/if}
						<span>
							{trend.recent} in the last {TREND_WINDOW} days
							<!-- Same reason as the leftovers list: no wash over coloured text. -->
							<span>
								{trend.direction === 'flat'
									? 'and'
									: trend.direction === 'up'
										? 'up from'
										: 'down from'}
								{trend.previous} the week before
							</span>
						</span>
					</p>
				{/if}
			</div>
			<!--
			Full width of the card. The plot lays out to that width at a fixed
			height (`h-48`); a viewBox-only scale left the marks looking blown
			up and the axis type larger than the rest of the page.
		-->
			<div class="border-border border-t p-4">
				<SubmissionsChart days={d.submissionsOverTime} />
			</div>
		</section>

		<section class="border-border bg-card rounded-lg border p-4" data-testid="reviewer-progress">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold tracking-tight">Reviewer progress</h2>
					<p class="text-muted-foreground mt-0.5 text-xs tabular-nums">
						{d.reviews.submitted}/{d.reviews.assigned} submitted · {d.reviews.outstanding} outstanding
					</p>
				</div>
				{#if form?.reminderMessage}
					<p class="text-sm" role="status" data-testid="reminder-message">{form.reminderMessage}</p>
				{/if}
			</div>
			{#if d.reviews.items.length === 0}
				{@render nothing('No reviewer assignments yet.')}
			{:else}
				<!--
				One form around the whole table, because the two ways to send a reminder are
				the same request with a different set of ids: the row button carries its own
				reviewer in `reviewerUserId` and the checkboxes carry theirs in `reviewerIds`,
				so neither can pick up the other's selection.
			-->
				<form
					method="POST"
					action="?/remindReviewers"
					use:enhance={() => {
						busy = true;
						// `finally`, so a dropped connection cannot leave the button dead.
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
							}
						};
					}}
				>
					{#if remindable.length > 0}
						<div
							class="border-border bg-muted/40 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
							data-testid="reminder-bulk-bar"
						>
							<p class="text-muted-foreground text-sm">
								{#if selected.size === 0}
									Tick the reviewers who are behind to chase them in one go.
								{:else}
									<span
										class="text-foreground font-medium tabular-nums"
										data-testid="reminder-selected-count">{selected.size} selected</span
									> · one email each, queued now and sent with the next dispatch.
								{/if}
							</p>
							<Button
								type="submit"
								size="sm"
								data-testid="send-reminders"
								disabled={selected.size === 0 || busy}
							>
								Send reminders
							</Button>
						</div>
					{/if}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="text-muted-foreground text-xs">
								<tr>
									<th class="w-10 pr-3 pb-2 font-medium">
										{#if remindable.length > 0}
											<input
												type="checkbox"
												class="border-input accent-primary size-4 rounded"
												aria-label="Select every reviewer who is behind"
												data-testid="select-all-reviewers"
												checked={allRemindableSelected}
												onchange={toggleAll}
											/>
										{/if}
									</th>
									<th class="pb-2 font-medium">Reviewer</th>
									<th class="pb-2 font-medium">Progress</th>
									<th class="pb-2 text-right font-medium">Reminder</th>
								</tr>
							</thead>
							<tbody>
								{#each reviewers as reviewer (reviewer.userId)}
									<tr class="border-border border-t" data-testid="reviewer-row">
										<td class="py-2 pr-3">
											{#if remindableIds.has(reviewer.userId)}
												<input
													type="checkbox"
													name="reviewerIds"
													value={reviewer.userId}
													class="border-input accent-primary size-4 rounded"
													aria-label="Select {reviewer.name}"
													checked={selected.has(reviewer.userId)}
													onchange={() => toggle(reviewer.userId)}
												/>
											{/if}
										</td>
										<td class="py-2 pr-4">
											<p class="font-medium">{reviewer.name}</p>
											<p class="text-muted-foreground text-xs">{reviewer.email}</p>
										</td>
										<td class="w-1/2 py-2 pr-4">
											<!--
										The bar is the comparison; the numbers are the answer.
										Side by side down a column, a dozen bars say "these four are the
										problem" in one glance, which a dozen "3/8 submitted" lines never
										do — but a bar alone cannot be read out, printed in greyscale or
										trusted to the pixel, so the count stays and the bar is
										`aria-hidden`. Same reason the chart above keeps its table.
									-->
											<p class="tabular-nums">
												{reviewer.submitted}/{reviewer.assigned} submitted
												{#if reviewer.outstanding > 0}
													<span class="text-muted-foreground">· {reviewer.outstanding} to go</span>
												{/if}
											</p>
											<div
												class="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full"
												aria-hidden="true"
											>
												<!--
											`assigned` is never 0 here — a reviewer only appears in this
											table because a review row exists — but the guard stays,
											because the day a recused-only reviewer slips through, a
											0/0 row should render an empty bar, not `NaN%`.
										-->
												<div
													class="bg-status-good h-full rounded-full"
													style="width: {reviewer.assigned > 0
														? (reviewer.submitted / reviewer.assigned) * 100
														: 0}%"
												></div>
											</div>
										</td>
										<td class="py-2 text-right">
											{#if reviewer.outstanding === 0}
												<StatusBadge status="submitted" label="Complete" />
											{:else if reviewer.reminderStatus === 'queued' || reviewer.reminderStatus === 'sent'}
												<StatusBadge
													status={reviewer.reminderStatus}
													label={reviewer.reminderStatus === 'queued'
														? 'Reminder queued'
														: 'Reminded'}
												/>
											{:else}
												<!--
												Same form, different action and a different field: `formaction`
												sends this one reviewer through the single-reviewer path, whose
												message ("already reminded") is the more useful sentence when
												exactly one person is meant.
											-->
												<Button
													type="submit"
													formaction="?/remindReviewer"
													name="reviewerUserId"
													value={reviewer.userId}
													variant="outline"
													size="sm"
													disabled={busy}
												>
													Send reminder
												</Button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</form>
			{/if}
		</section>

		<!--
		Two columns, never four. These four cards list talk titles, and a title is the
		only thing on them worth reading; at four columns a card is ~250 px wide, of
		which the status on the right takes a third, so every line ended after about
		twenty characters ("Five minutes on f…"). Two columns roughly triples the room
		for the title and the block is at the bottom of the page, where the extra height
		costs nothing. The stat strip above stays at four — it holds numbers, not prose.
	-->
		<div class="grid gap-4 md:grid-cols-2">
			{#snippet decisionsBody()}
				{#if d.decisions.items.length === 0}
					{@render nothing('Every submission has an answer.')}
				{:else}
					<ul class="space-y-2 text-sm">
						{#each d.decisions.items as item (item.id)}
							<li class="flex items-baseline justify-between gap-2">
								<a
									class="line-clamp-2 min-w-0 hover:underline"
									href="{base}/submissions/{item.id}"
									title={item.title}
								>
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
					{@render nothing(dashboardSchedulingEmpty(d.scheduling.accepted))}
				{:else}
					<ul class="space-y-2 text-sm">
						{#each d.scheduling.items as item (item.id)}
							<li class="flex items-baseline justify-between gap-2">
								<a
									class="line-clamp-2 min-w-0 hover:underline"
									href="{base}/submissions/{item.id}"
									title={item.title}
								>
									{item.title}
								</a>
								<StatusBadge
									status={item.state === 'unplaced' ? 'submitted' : 'tentative'}
									label={dashboardSchedulingLabel(item.state)}
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
				'Accepted, not published',
				dashboardSchedulingSubhead({
					unplaced: d.scheduling.unplaced,
					draft: d.scheduling.tentative
				}),
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
								<a
									class="line-clamp-2 min-w-0 hover:underline"
									href="{base}/content/tasks/{item.id}"
									title="{item.title} · {item.speaker}"
								>
									{item.title}
									<span class="text-muted-foreground">· {item.speaker}</span>
								</a>
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
								<span class="min-w-0">
									<span class="line-clamp-2" title={item.subject}>
										{item.subject}
										<span class="text-muted-foreground">· {item.toEmail}</span>
									</span>
									{#if item.error}
										<span class="text-status-bad block truncate text-xs" title={item.error}
											>{item.error}</span
										>
									{/if}
								</span>
								<StatusBadge status={item.status} class="shrink-0" />
							</li>
						{/each}
					</ul>
				{/if}
			{/snippet}
			{#snippet mailFooter()}
				<form
					bind:this={mailForm}
					method="POST"
					action="?/dispatchMail"
					class="flex items-center justify-between gap-2"
					data-testid="dispatch-mail"
					use:enhance={({ cancel }) => {
						if (mailBlockReason || busy) {
							cancel();
							return;
						}
						if (!allowMailDispatch) {
							cancel();
							mailConfirmOpen = true;
							return;
						}
						allowMailDispatch = false;
						busy = true;
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
							}
						};
					}}
				>
					<span data-testid="mail-panel-copy">
						{form?.mailMessage ?? mailBlockReason ?? mailIdleCopy}
					</span>
					<Button
						type="submit"
						size="sm"
						variant="outline"
						data-testid="send-queued"
						disabled={mailBlockReason !== null || busy}
						title={mailBlockReason ?? undefined}
					>
						Send queued
					</Button>
				</form>
			{/snippet}
			{@render card(
				'Mail',
				`${d.mail.queued} queued · ${d.mail.sent} sent · ${d.mail.failed} failed`,
				mailBody,
				mailFooter
			)}
		</div>
	</div>
{/if}

<AlertDialog bind:open={mailConfirmOpen}>
	<AlertDialogContent data-testid="dispatch-mail-dialog">
		<AlertDialogHeader>
			<AlertDialogTitle>Send {mailQueuedPhrase} now?</AlertDialogTitle>
			<AlertDialogDescription>
				They go to the speakers they were written for. This cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel data-testid="dispatch-mail-cancel">Cancel</AlertDialogCancel>
			<Button data-testid="dispatch-mail-confirm" onclick={confirmMailDispatch}>
				Send {d.mail.queued} queued
			</Button>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

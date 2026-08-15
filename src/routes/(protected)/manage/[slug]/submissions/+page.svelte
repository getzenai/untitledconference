<script lang="ts">
	/**
	 * The organizer's workplace (journey 2, step 4 — and R7).
	 *
	 * Working density, seven columns, filters above the table rather than behind a
	 * drawer, and the row click opens the detail. The selection plus the bulk bar is
	 * the point of the screen: deciding and assigning happen to many rows at once,
	 * never one at a time. That is the only way the "submissions per hour" measure in
	 * ROLES_AND_JOURNEYS moves.
	 */
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { enhance } from '$lib/forms/enhance';
	import { page as currentPage } from '$app/state';
	import {
		BULK_SELECT_REASON,
		bulkToolbarBlockReason,
		type BulkToolbarFacts
	} from '$lib/conference/bulk-toolbar';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import {
		describeBulkAssign,
		describeDecision,
		describeNotification,
		notificationTone
	} from '$lib/conference/decision-summary';
	import { formatDayShort, formatTime, isoDay } from '$lib/conference/public-view';
	// Type only — erased at build, so the server module never reaches the browser.
	import type { AgendaSlot } from '$lib/server/conference/organizer-submissions';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import ScrollTable from '$lib/components/app/conference/scroll-table.svelte';
	import SubmissionFilters from '$lib/components/app/conference/submission-filters.svelte';
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
	import * as Dialog from '$lib/components/ui/dialog';
	import { untrack } from 'svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

	type BulkDecision = 'accepted' | 'rejected' | 'waitlisted';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);

	const selected = new SvelteSet<number>();
	let busy = $state(false);
	let decideForm = $state<HTMLFormElement | undefined>(undefined);
	let pendingDecision = $state<BulkDecision | null>(null);
	let confirmOpen = $state(false);
	/** The confirm click re-submits the same button; skip the dialog that time. */
	let allowDecision = false;
	/** Round for bulk assignment; empty until the organizer picks one. */
	let assignRoundId = $state('');
	/** The assignment dialog (#413) — staffing a round is not deciding a programme. */
	let assignOpen = $state(false);
	const assignReviewerIds = new SvelteSet<string>();
	let reviewsPerSubmission = $state('2');
	let capPerReviewer = $state('10');

	const assignRoundOptions = $derived(
		data.assignmentTargets.map((round) => ({ value: String(round.id), label: round.name }))
	);
	const assignReviewers = $derived(
		data.assignmentTargets.find((round) => String(round.id) === assignRoundId)?.reviewers ?? []
	);
	const toolbarFacts: BulkToolbarFacts = $derived({
		selectedCount: selected.size,
		hasRound: assignRoundId !== '',
		reviewerCount: assignReviewerIds.size,
		reviewsPerSubmission: Number(reviewsPerSubmission),
		capPerReviewer: Number(capPerReviewer)
	});
	const notifyBlockReason = $derived(bulkToolbarBlockReason('notify', toolbarFacts));
	const assignBlockReason = $derived(bulkToolbarBlockReason('assign', toolbarFacts));
	const distributeBlockReason = $derived(bulkToolbarBlockReason('distribute', toolbarFacts));

	// A selection that survives a filter change would decide rows the organizer can
	// no longer see — so anything that scrolled out of view drops out of the selection.
	// `untrack` on the write keeps this from re-triggering on its own edit.
	$effect(() => {
		const visible = new Set(data.submissions.map((s) => s.id));
		untrack(() => {
			for (const id of [...selected]) if (!visible.has(id)) selected.delete(id);
		});
	});

	const allVisibleSelected = $derived(
		data.submissions.length > 0 && data.submissions.every((s) => selected.has(s.id))
	);

	const toggleAll = () => {
		if (allVisibleSelected) selected.clear();
		else for (const s of data.submissions) selected.add(s.id);
	};

	const toggle = (id: number) => {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	};

	const decisionVerb = (decision: BulkDecision) =>
		decision === 'accepted' ? 'Accept' : decision === 'rejected' ? 'Decline' : 'Waitlist';

	const pendingVerb = $derived(pendingDecision ? decisionVerb(pendingDecision) : '');
	const pendingNoun = $derived(selected.size === 1 ? 'submission' : 'submissions');

	/**
	 * Bulk Accept / Decline / Waitlist used to fire on the first click.
	 * A confirm names the count and the verb so a missed click does not
	 * decide forty talks. It lives in the page — not `window.confirm` —
	 * so a Playwright agent can press the same button a human does.
	 * Notify and assign stay one-click: they do not change the programme.
	 *
	 * The gate lives inside `use:enhance` and uses its own `cancel()`. An
	 * `onsubmit` handler calling `preventDefault()` looked right and was not:
	 * both listeners hang on the same form, `preventDefault` does not stop the
	 * one registered after it, and `enhance` never asks whether the event was
	 * already cancelled — so the decision went out while the dialog was still
	 * asking, and "Cancel" cancelled nothing (#409).
	 */
	const decisionToConfirm = (submitter: HTMLElement | null): BulkDecision | null => {
		if (!(submitter instanceof HTMLButtonElement) || submitter.name !== 'decision') return null;
		return submitter.value === 'accepted' ||
			submitter.value === 'rejected' ||
			submitter.value === 'waitlisted'
			? submitter.value
			: null;
	};

	const confirmPendingDecision = () => {
		const decision = pendingDecision;
		if (!decision || !decideForm) return;
		const button = decideForm.querySelector<HTMLButtonElement>(
			`button[name="decision"][value="${decision}"]`
		);
		if (!button) return;
		allowDecision = true;
		confirmOpen = false;
		pendingDecision = null;
		decideForm.requestSubmit(button);
	};

	const filtered = $derived(
		Boolean(
			data.filters.q ||
			data.filters.trackId ||
			data.filters.sessionFormatId ||
			data.filters.status?.length ||
			data.filters.needsReview ||
			data.filters.agenda ||
			data.filters.includeDrafts
		)
	);

	/**
	 * Where the talk sits on the grid, in one line (#412).
	 *
	 * Day, room and time in that order, and only the parts that exist — a slot on a
	 * conference with one room and one day would otherwise read as two em dashes and
	 * a clock. "Not scheduled" covers both no placement at all and one still waiting
	 * in the tray: neither is in the programme, which is the question this column
	 * answers.
	 */
	const agendaLine = (slot: AgendaSlot | null) => {
		if (!slot) return 'Not scheduled';
		const day = slot.day ?? isoDay(slot.startsAt);
		return [formatDayShort(day), slot.room, formatTime(slot.startsAt)].filter(Boolean).join(' · ');
	};

	const DECIDED: string[] = ['accepted', 'rejected', 'waitlisted', 'withdrawn'];
	const NOTIFIABLE: string[] = ['accepted', 'rejected', 'waitlisted'];

	/**
	 * How many of the selected rows already carry a decision.
	 *
	 * Re-deciding is legitimate — waitlisted becomes accepted all the time — so the
	 * buttons stay live. What must not happen is a bulk click that quietly takes a
	 * talk back out of the programme, so the bar says it out loud first (R3).
	 */
	const selectedDecided = $derived(
		data.submissions.filter((s) => selected.has(s.id) && DECIDED.includes(s.status)).length
	);

	/**
	 * A link to another page of the same view.
	 *
	 * Built from the URL that is actually on screen rather than from the parsed
	 * filters: anything the loader learns to read later travels with the page number
	 * on its own, instead of being silently dropped on the first "Next".
	 */
	const pageHref = (n: number) => {
		// The reactive flavour, because the plain one is a lint error in a component:
		// a mutable built-in read inside a template is exactly the thing that renders
		// once and then never updates.
		const params = new SvelteURLSearchParams(currentPage.url.searchParams);
		if (n <= 1) params.delete('page');
		else params.set('page', String(n));
		const query = params.toString();
		return `${base}/submissions${query ? `?${query}` : ''}`;
	};

	type Sort = typeof data.sort;

	/**
	 * The same view, ordered differently (ABS-10).
	 *
	 * Built from the URL on screen so the filters travel with the sort, and the page
	 * number deliberately does NOT: row 51 of the old order has nothing to do with row
	 * 51 of the new one, so re-sorting starts at the top of the pile.
	 */
	const sortHref = (next: Sort) => {
		const params = new SvelteURLSearchParams(currentPage.url.searchParams);
		params.delete('page');
		if (next === 'newest') params.delete('sort');
		else params.set('sort', next);
		const query = params.toString();
		return `${base}/submissions${query ? `?${query}` : ''}`;
	};

	/**
	 * One sortable column, as three states on one control.
	 *
	 * A click cycles first direction, other direction, and back to the newest-first
	 * order the screen opens in. The third click is the way out — a two-state toggle
	 * never has one, and "undo the sort" is a thing organizers ask for constantly
	 * because the default order is the one that answers "what just came in".
	 *
	 * `first` is the direction the column opens in, and it differs per column on
	 * purpose: nobody sorts a score ascending to begin with, and nobody sorts titles
	 * Z–A to begin with either.
	 */
	const column = (first: Sort, second: Sort) => ({
		next: data.sort === first ? second : data.sort === second ? ('newest' as Sort) : first,
		active: data.sort === first || data.sort === second,
		ascending: data.sort.endsWith('-asc')
	});

	const score = $derived(column('score-desc', 'score-asc'));
	const title = $derived(column('title-asc', 'title-desc'));
	// Fewest first is the direction this column opens in, and it is the only one of
	// the three where the ascending end is the interesting one: nobody sorts to find
	// the most-reviewed talk, they sort to find the ones nobody has touched.
	const reviews = $derived(column('reviews-asc', 'reviews-desc'));

	// The control says what it will do AND what it has already done, because the arrow
	// alone cannot: "↓" is unreadable to anyone who is not looking at the other two.
	const scoreHint = $derived(
		!score.active
			? 'Sort by score, highest first'
			: score.ascending
				? 'Sorted by score, lowest first. Back to newest first'
				: 'Sorted by score, highest first. Sort lowest first'
	);

	const reviewsHint = $derived(
		!reviews.active
			? 'Sort by reviews, fewest first'
			: reviews.ascending
				? 'Sorted by reviews, fewest first. Sort most first'
				: 'Sorted by reviews, most first. Back to newest first'
	);

	const titleHint = $derived(
		!title.active
			? 'Sort by title, A to Z'
			: title.ascending
				? 'Sorted by title, A to Z. Sort Z to A'
				: 'Sorted by title, Z to A. Back to newest first'
	);

	/**
	 * The export of exactly what is on screen (ABS-13).
	 *
	 * Carries the filters and the sort and drops the page: the file is the whole
	 * filtered set, and a `?page=2` in its URL would read like a promise that it is not.
	 */
	const exportHref = $derived.by(() => {
		const params = new SvelteURLSearchParams(currentPage.url.searchParams);
		params.delete('page');
		const query = params.toString();
		return `${base}/submissions/export.csv${query ? `?${query}` : ''}`;
	});

	const firstOnPage = $derived((data.pagination.page - 1) * data.pagination.pageSize + 1);
	const lastOnPage = $derived(firstOnPage + data.submissions.length - 1);

	const speakerLine = (speakers: { name: string }[]) =>
		speakers.length === 0
			? '—'
			: speakers.length === 1
				? speakers[0].name
				: `${speakers[0].name} +${speakers.length - 1}`;

	const notificationLabel = (submission: { id: number; status: string }) => {
		if (!NOTIFIABLE.includes(submission.status)) return 'Not ready';
		const status = data.notificationStatuses[submission.id];
		if (status === 'queued') return 'Queued';
		if (status === 'sent') return 'Sent';
		if (status === 'failed') return 'Failed';
		return 'Not sent';
	};
</script>

<svelte:head>
	<title>Submissions — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Submissions</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
				{data.counts.total} total ·
				<!-- The number and the way to act on it are the same thing (#122). Reading
				     "37 still to review" and then having to build the filter by hand is the
				     gap that issue is about; the count is the shortest route to the pile.
				     After #261 this is the live pipeline, same set as "awaiting a decision"
				     used to be — so that second number is gone rather than printed twice. -->
				<a
					href="{base}/submissions?needsReview=on"
					class="hover:text-foreground underline underline-offset-4"
					data-testid="unreviewed-count"
				>
					{data.counts.unreviewed} still to review
				</a>
				{#if filtered}
					<!-- The filter's own count, not the page's: "12 shown" under a filter that
					     matches 300 is a wrong answer to the question the organizer is asking. -->
					<span class="text-foreground">· {data.pagination.matching} match the filter</span>
				{/if}
			</p>
			<!--
				Named doors into the rest of abstract management. The rail has them too,
				but an agent (or organizer) sitting on this table is hunting by word —
				scorecard, weight, pool, export — and those words used to appear only
				after a second click into a vaguely labelled section.
			-->
			<p
				class="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs"
				data-testid="submissions-abs-links"
			>
				<!--
					Export lives once, as the outline button in this header — a second
					"Export scores (CSV)" link here read as a bug to humans and gave the
					eval agent nothing the button does not already say.
				-->
				<a class="underline underline-offset-4" href="{base}/rounds">Scorecards &amp; weights</a>
				<a class="underline underline-offset-4" href="{base}/people">Reviewer pool</a>
			</p>
		</div>
		<div class="flex gap-2">
			<!-- The file is the view: same filters, same order, every matching row. The
			     query travels so the download and the screen cannot disagree, and
			     `download` is on the anchor because a CSV in a tab is nobody's plan. -->
			<!-- "View the public site" used to sit here and only here. It lives in the
			     rail now, on every organizer page, so this row keeps just the action
			     that belongs to this screen. -->
			<Button href={exportHref} variant="outline" download data-testid="export-csv">
				Export scores (CSV)
			</Button>
		</div>
	</div>
</div>

<div class="px-6 py-5">
	<!--
		The filter row lives in its own component: this file is the table, the
		selection and the bulk bar, and those three already earn every line they take.
		The split is along the seam that was already there — the filters talk to the
		loader through the URL and to nothing on this page.
	-->
	<SubmissionFilters
		facets={data.facets}
		filters={data.filters}
		sort={data.sort}
		clearHref={data.sort === 'newest'
			? `${base}/submissions`
			: `${base}/submissions?sort=${data.sort}`}
	/>

	{#if form?.notificationResult}
		{@const tone = notificationTone(form.notificationResult)}
		<p
			class={tone === 'bad'
				? 'border-status-bad text-status-bad mb-3 rounded-md border px-3 py-2 text-sm'
				: tone === 'warn'
					? 'border-status-warn text-status-warn mb-3 rounded-md border px-3 py-2 text-sm'
					: 'border-status-good text-status-good mb-3 rounded-md border px-3 py-2 text-sm'}
			role={tone === 'bad' ? 'alert' : 'status'}
		>
			{describeNotification(form.notificationResult)}
		</p>
	{:else if form?.assignResult}
		<p
			class="border-status-good text-status-good mb-3 rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="bulk-assign-message"
		>
			{describeBulkAssign(form.assignResult)}
		</p>
	{:else if form?.result}
		<p
			class="border-status-good text-status-good mb-3 rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			{describeDecision(form.decision, form.result)}
		</p>
	{:else if form?.message}
		<p
			class="border-status-bad text-status-bad mb-3 rounded-md border px-3 py-2 text-sm"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if data.submissions.length === 0}
		<!-- Three empty tables, not two (#412). Since drafts are out by default, a
		     conference whose only proposals are drafts would otherwise be told
		     "No submissions yet" while the header beside it counts them — the one
		     way an inverted default turns into a support question. -->
		<EmptyState
			title={filtered
				? 'No submission matches these filters'
				: data.counts.total > 0
					? 'Nothing handed in yet'
					: 'No submissions yet'}
			description={filtered
				? 'Widen the filters, or clear them to see the whole pile again.'
				: data.counts.total > 0
					? 'Every proposal so far is still a draft on its speaker’s desk. Tick “Include drafts” to look at them.'
					: 'Nothing has come in through the call for papers. Share the link and the table fills itself.'}
			action={{ href: `/c/${data.conference.slug}`, label: 'Open the public conference page' }}
		/>
	{:else}
		<form
			bind:this={decideForm}
			method="POST"
			action="?/decide"
			data-testid="bulk-decide"
			data-confirm-decision
			data-confirm="dialog"
			use:enhance={({ submitter, cancel }) => {
				const decision = decisionToConfirm(submitter);
				if (decision && !allowDecision) {
					cancel();
					pendingDecision = decision;
					confirmOpen = true;
					return;
				}
				// The confirm click re-submits the same button; that one goes through.
				allowDecision = false;
				busy = true;
				// `finally`, not a trailing line: a dropped connection would otherwise
				// leave every button disabled with no way back except a reload.
				return async ({ update }) => {
					try {
						await update(formUpdateOptions('edit'));
					} finally {
						busy = false;
					}
				};
			}}
		>
			<!-- The programme changes now; communication is a separate, explicit step. -->
			<div
				class="border-border bg-muted/40 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
			>
				<p class="text-muted-foreground text-sm">
					{#if selected.size === 0}
						Select rows to decide on them together. Decisions do not notify speakers; notifications
						are sent separately after the programme is checked.
					{:else}
						<span class="text-foreground font-medium tabular-nums">{selected.size} selected</span> ·
						accepting also creates the session in the agenda tray and the speaker's tasks.
						Notifications are sent separately after the programme is checked.
						{#if data.pagination.pageCount > 1}
							<!-- Said out loud because the alternative is worse: a selection that
							     survived a page change would decide rows nobody can see. -->
							Leaving this page clears the selection.
						{/if}
					{/if}
				</p>
				{#if selectedDecided > 0}
					<p class="text-status-warn w-full text-sm" role="status">
						<span class="font-medium tabular-nums">{selectedDecided}</span>
						of them {selectedDecided === 1 ? 'is' : 'are'} already decided. Deciding again the same way
						changes nothing; deciding differently takes the talk back out of the agenda tray and withdraws
						the speaker tasks nobody has touched yet.
					</p>
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="submit"
						name="decision"
						value="rejected"
						variant="outline"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Decline
					</Button>
					<Button
						type="submit"
						name="decision"
						value="waitlisted"
						variant="outline"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Waitlist
					</Button>
					<Button
						type="submit"
						name="decision"
						value="accepted"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Accept
					</Button>
					<div class="flex flex-col items-start gap-1">
						<Button
							type="submit"
							formaction="?/notify"
							variant="secondary"
							size="sm"
							disabled={busy || Boolean(notifyBlockReason)}
							aria-describedby={notifyBlockReason ? 'notify-block-reason' : undefined}
						>
							Notify decisions
						</Button>
						{#if notifyBlockReason}
							<p
								id="notify-block-reason"
								class="text-muted-foreground max-w-48 text-xs"
								data-testid="notify-block-reason"
							>
								{notifyBlockReason}
							</p>
						{/if}
					</div>
					{#if data.assignmentTargets.length > 0}
						<!--
							#413: staffing a review round and deciding a programme happen in
							different weeks. The strip keeps the decisions; assignment is one
							button that opens its own dialog (and its own form — a nested one
							would post the round under `?/decide`).
						-->
						<span class="bg-border mx-1 hidden h-5 w-px sm:block" aria-hidden="true"></span>
						<div class="flex flex-col items-start gap-1" data-testid="bulk-assign">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								disabled={busy || selected.size === 0}
								onclick={() => (assignOpen = true)}
								data-testid="bulk-assign-open"
								aria-describedby={selected.size === 0 ? 'assign-block-reason' : undefined}
							>
								Assign reviewers…
							</Button>
							{#if selected.size === 0}
								<p
									id="assign-block-reason"
									class="text-muted-foreground max-w-48 text-xs"
									data-testid="assign-block-reason"
								>
									{BULK_SELECT_REASON}
								</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!--
				One sortable column, rendered from its three-state cycle. A link and not a
				button, because the order lives in the URL: middle-click, back and "send
				this to a colleague" all work, and inside this form a <button> would
				submit the decisions instead.
			-->
			{#snippet sortable(
				label: string,
				state: { next: Sort; active: boolean; ascending: boolean },
				hint: string,
				testid: string
			)}
				<th
					class="py-2 pr-4 font-medium"
					aria-sort={state.active ? (state.ascending ? 'ascending' : 'descending') : 'none'}
				>
					<a
						href={sortHref(state.next)}
						data-testid={testid}
						aria-label={hint}
						title={hint}
						class="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none {state.active
							? 'text-foreground'
							: ''}"
					>
						{label}
						<!-- `aria-sort` above already told a screen reader the state; the arrow is
						     the same fact for everyone else, so it is hidden rather than read twice. -->
						{#if state.active}
							{#if state.ascending}
								<ArrowUpIcon aria-hidden="true" class="size-3.5" />
							{:else}
								<ArrowDownIcon aria-hidden="true" class="size-3.5" />
							{/if}
						{:else}
							<ChevronsUpDownIcon aria-hidden="true" class="size-3.5" />
						{/if}
					</a>
				</th>
			{/snippet}

			<ScrollTable label="Scroll sideways for score, reviews, status and notification">
				<table class="w-full min-w-3xl text-left text-sm">
					<!--
						No `sticky top-0`. It was here and it never worked: sticky positions
						against the nearest scrolling ancestor, and the box around this table
						is the one that scrolls sideways — so the header stuck to a container
						that never scrolls vertically. Keeping a dead rule that looks alive is
						worse than not having the feature.
					-->
					<thead class="bg-muted text-muted-foreground text-xs">
						<tr>
							<th class="w-10 py-2 pr-3 pl-4">
								<input
									type="checkbox"
									class="border-input accent-primary size-4 rounded"
									aria-label="Select every submission in view"
									checked={allVisibleSelected}
									onchange={toggleAll}
								/>
							</th>
							{@render sortable('Title', title, titleHint, 'sort-by-title')}
							<th class="py-2 pr-4 font-medium">Speaker</th>
							<th class="py-2 pr-4 font-medium">Track</th>
							<th class="py-2 pr-4 font-medium">Format</th>
							<th class="py-2 pr-4 font-medium">Agenda</th>
							<th class="py-2 pr-4 font-medium">Sponsor</th>
							{@render sortable('Score', score, scoreHint, 'sort-by-score')}
							{@render sortable('Reviews', reviews, reviewsHint, 'sort-by-reviews')}
							<th class="py-2 pr-4 font-medium">Status</th>
							<th class="py-2 pr-4 font-medium">Notification</th>
						</tr>
					</thead>
					<tbody>
						{#each data.submissions as submission (submission.id)}
							<tr class="border-border hover:bg-muted/50 border-t">
								<td class="py-2 pr-3 pl-4">
									<input
										type="checkbox"
										name="id"
										value={submission.id}
										class="border-input accent-primary size-4 rounded"
										aria-label="Select {submission.title}"
										checked={selected.has(submission.id)}
										onchange={() => toggle(submission.id)}
									/>
								</td>
								<!--
									Capped and truncated (#470). One long title used to set the
									width of this column for all thirty rows and push Status and
									Notification off the screen. The full text is one hover or one
									click away; the other rows are not worth spending for it.
								-->
								<td class="max-w-[26rem] py-2 pr-4">
									<a
										href="{base}/submissions/{submission.id}"
										title={submission.title}
										class="focus-visible:ring-ring block truncate font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
									>
										{submission.title}
									</a>
									{#if submission.acceptCondition}
										<span class="mt-1 block" data-testid="submission-condition">
											<StatusBadge
												status="open"
												tone="warn"
												label={submission.acceptConditionOwner
													? `${submission.acceptCondition} · ${submission.acceptConditionOwner}`
													: submission.acceptCondition}
											/>
										</span>
									{/if}
									{#if submission.editorialStand}
										<span class="mt-1 block" data-testid="submission-editorial-stand">
											<StatusBadge status={submission.editorialStand} />
										</span>
									{/if}
								</td>
								<td class="text-muted-foreground py-2 pr-4">{speakerLine(submission.speakers)}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.track ?? '—'}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.sessionFormat ?? '—'}</td>
								<!-- Tentative is said out loud: a slot that is only pencilled in is
								     not yet a promise to the speaker. -->
								<td
									class="py-2 pr-4 whitespace-nowrap {submission.agenda
										? 'text-foreground'
										: 'text-muted-foreground'}"
									data-testid="agenda-cell"
								>
									{agendaLine(
										submission.agenda
									)}{#if submission.agenda && !submission.agenda.confirmed}<span
											class="text-muted-foreground"
										>
											· tentative</span
										>{/if}
								</td>
								<td class="py-2 pr-4">
									{#if submission.sponsorTier}
										<!-- R6: internal. The reviewer's view and every public surface load
										     through queries that never select this column at all. -->
										<StatusBadge
											status="internal"
											tone="internal"
											label="{submission.sponsorTier} · internal"
										/>
									{/if}
								</td>
								<td class="py-2 pr-4 tabular-nums">{formatScore(submission.score)}</td>
								<!--
									Handed in over assigned, in its own column now that it is sortable.
									Both halves matter and they are different facts: 0/3 is three
									reviewers sitting on a talk, 0/0 is a talk nobody has been asked
									about. The first needs a nudge, the second needs an assignment.
								-->
								<td class="py-2 pr-4 tabular-nums" data-testid="reviews-cell">
									{submission.reviewsSubmitted}/{submission.reviewsAssigned}
								</td>
								<td class="py-2 pr-4"><StatusBadge status={submission.status} /></td>
								<td class="text-muted-foreground py-2 pr-4">
									{notificationLabel(submission)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</ScrollTable>

			{#if data.pagination.pageCount > 1}
				<nav
					class="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"
					aria-label="Pagination"
					data-testid="submission-pagination"
				>
					<p class="tabular-nums">
						{firstOnPage}–{lastOnPage} of {data.pagination.matching} · page {data.pagination.page} of
						{data.pagination.pageCount}
					</p>
					<div class="flex gap-2">
						<!-- Links, not buttons: they are inside the decide form, and a <button>
						     here would submit it. They are also the reason a page of the table
						     can be sent to a colleague at all. -->
						{#if data.pagination.page > 1}
							<Button href={pageHref(data.pagination.page - 1)} variant="outline" size="sm">
								Previous
							</Button>
						{/if}
						{#if data.pagination.page < data.pagination.pageCount}
							<Button href={pageHref(data.pagination.page + 1)} variant="outline" size="sm">
								Next
							</Button>
						{/if}
					</div>
				</nav>
			{/if}
		</form>
	{/if}
</div>

<AlertDialog
	bind:open={confirmOpen}
	onOpenChange={(open) => {
		if (!open) pendingDecision = null;
	}}
>
	<AlertDialogContent data-testid="bulk-decide-dialog">
		<AlertDialogHeader>
			<AlertDialogTitle>{pendingVerb} {selected.size} {pendingNoun}?</AlertDialogTitle>
			<AlertDialogDescription>
				Speakers are not emailed. Notifications are sent separately after the programme is checked.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel data-testid="bulk-decide-cancel">Cancel</AlertDialogCancel>
			<Button data-testid="bulk-decide-confirm" onclick={confirmPendingDecision}>
				{pendingVerb}
			</Button>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<!--
	#413: the assignment form, with its own `<form>` outside the decide form.
	It carries the selection as hidden fields — the row checkboxes live in the
	other form and a dialog cannot borrow them. The server actions are
	unchanged: same `id`, `roundId`, `reviewerUserId`, `reviewsPerSubmission`
	and `capPerReviewer` as before.
-->
<Dialog.Root bind:open={assignOpen}>
	<Dialog.Content class="sm:max-w-lg" data-testid="bulk-assign-dialog">
		<Dialog.Header>
			<Dialog.Title>Assign reviewers to {selected.size} {pendingNoun}</Dialog.Title>
			<Dialog.Description>
				Round first, then any subset of that round's committee. Each pair is still checked for
				speaker, track and recusal conflicts; seats that already exist are skipped, not rewritten.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/assign"
			class="flex flex-col gap-3"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					try {
						await update(formUpdateOptions('edit'));
						// The result line sits above the table, behind this dialog.
						assignOpen = false;
					} finally {
						busy = false;
					}
				};
			}}
		>
			{#each [...selected] as id (id)}
				<input type="hidden" name="id" value={id} />
			{/each}
			<div class="flex flex-wrap items-center gap-2">
				<AppSelect
					name="roundId"
					size="sm"
					class="w-40"
					placeholder="Round"
					aria-label="Review round for bulk assignment"
					testId="bulk-assign-round"
					value={assignRoundId}
					options={assignRoundOptions}
					onValueChange={(value) => {
						assignRoundId = value;
						// A reviewer from the previous round must not post under
						// the new one just because their id string still sits in state.
						assignReviewerIds.clear();
					}}
				/>
				<label class="text-muted-foreground flex items-center gap-1 text-sm">
					<input
						type="number"
						name="reviewsPerSubmission"
						min="1"
						step="1"
						class="border-input bg-background h-8 w-14 rounded-md border px-2 text-sm tabular-nums"
						bind:value={reviewsPerSubmission}
						data-testid="bulk-assign-per-talk"
						aria-label="Reviewers per talk"
					/>
					each
				</label>
				<label class="text-muted-foreground flex items-center gap-1 text-sm">
					cap
					<input
						type="number"
						name="capPerReviewer"
						min="1"
						step="1"
						class="border-input bg-background h-8 w-14 rounded-md border px-2 text-sm tabular-nums"
						bind:value={capPerReviewer}
						data-testid="bulk-assign-cap"
						aria-label="Cap per reviewer"
					/>
				</label>
			</div>
			<!--
				Remount when the round changes so a checked box from the
				previous committee cannot post under the new roundId.
			-->
			{#key assignRoundId}
				{#if assignRoundId !== '' && assignReviewers.length > 0}
					<fieldset
						class="flex flex-wrap items-center gap-x-3 gap-y-1"
						data-testid="bulk-assign-reviewers"
					>
						<legend class="sr-only">Reviewers to assign or auto-distribute among</legend>
						{#each assignReviewers as reviewer (reviewer.userId)}
							<label class="flex items-center gap-1.5 text-sm">
								<input
									type="checkbox"
									name="reviewerUserId"
									value={reviewer.userId}
									class="border-input size-4 rounded"
									checked={assignReviewerIds.has(reviewer.userId)}
									onchange={(event) => {
										if (event.currentTarget.checked) {
											assignReviewerIds.add(reviewer.userId);
										} else {
											assignReviewerIds.delete(reviewer.userId);
										}
									}}
								/>
								<span>{reviewer.name}</span>
							</label>
						{/each}
					</fieldset>
				{/if}
			{/key}
			<p class="text-muted-foreground text-xs">
				Auto-distribute fills from the checked reviewers, or the whole committee if none are
				checked.
			</p>
			<Dialog.Footer class="flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-end">
				<div class="flex flex-col items-start gap-1">
					<Button
						type="submit"
						formaction="?/distribute"
						variant="secondary"
						size="sm"
						disabled={busy || Boolean(distributeBlockReason)}
						data-testid="bulk-distribute-submit"
						aria-describedby={distributeBlockReason ? 'distribute-block-reason' : undefined}
					>
						Auto-distribute
					</Button>
					{#if distributeBlockReason}
						<p
							id="distribute-block-reason"
							class="text-muted-foreground max-w-48 text-xs"
							data-testid="distribute-block-reason"
						>
							{distributeBlockReason}
						</p>
					{/if}
				</div>
				<div class="flex flex-col items-start gap-1">
					<Button
						type="submit"
						size="sm"
						disabled={busy || Boolean(assignBlockReason)}
						data-testid="bulk-assign-submit"
						aria-describedby={assignBlockReason ? 'assign-dialog-block-reason' : undefined}
					>
						Assign reviewers
					</Button>
					{#if assignBlockReason}
						<p
							id="assign-dialog-block-reason"
							class="text-muted-foreground max-w-48 text-xs"
							data-testid="assign-dialog-block-reason"
						>
							{assignBlockReason}
						</p>
					{/if}
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

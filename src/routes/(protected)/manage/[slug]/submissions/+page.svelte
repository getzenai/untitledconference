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
	import { enhance } from '$app/forms';
	import { page as currentPage } from '$app/state';
	import { describeDecision, describeNotification } from '$lib/conference/decision-summary';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { untrack } from 'svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);

	const selected = new SvelteSet<number>();
	let busy = $state(false);

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

	const filtered = $derived(
		Boolean(
			data.filters.q ||
			data.filters.trackId ||
			data.filters.sessionFormatId ||
			data.filters.status?.length
		)
	);

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

	const STATUSES = [
		'draft',
		'submitted',
		'in_review',
		'accepted',
		'waitlisted',
		'rejected',
		'withdrawn'
	];

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

	/**
	 * The same view, ordered differently (ABS-10).
	 *
	 * Built from the URL on screen so the filters travel with the sort, and the page
	 * number deliberately does NOT: row 51 of the old order has nothing to do with row
	 * 51 of the new one, so re-sorting starts at the top of the pile.
	 */
	const sortHref = (next: 'newest' | 'score-desc' | 'score-asc') => {
		const params = new SvelteURLSearchParams(currentPage.url.searchParams);
		params.delete('page');
		if (next === 'newest') params.delete('sort');
		else params.set('sort', next);
		const query = params.toString();
		return `${base}/submissions${query ? `?${query}` : ''}`;
	};

	// One click cycles: highest first, lowest first, and back to the newest-first
	// order the screen opens in. Three states, one control — the third click is the
	// way out, which a two-state toggle never has.
	const nextScoreSort = $derived(
		data.sort === 'score-desc' ? 'score-asc' : data.sort === 'score-asc' ? 'newest' : 'score-desc'
	);

	const scoreSortLabel = $derived(
		data.sort === 'score-desc'
			? 'Sorted by score, highest first. Sort lowest first'
			: data.sort === 'score-asc'
				? 'Sorted by score, lowest first. Back to newest first'
				: 'Sort by score, highest first'
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
				{data.counts.total} total · {data.counts.undecided} awaiting a decision · {data.counts
					.unreviewed} unreviewed
				{#if filtered}
					<!-- The filter's own count, not the page's: "12 shown" under a filter that
					     matches 300 is a wrong answer to the question the organizer is asking. -->
					<span class="text-foreground">· {data.pagination.matching} match the filter</span>
				{/if}
			</p>
		</div>
		<div class="flex gap-2">
			<!-- The file is the view: same filters, same order, every matching row. The
			     query travels so the download and the screen cannot disagree, and
			     `download` is on the anchor because a CSV in a tab is nobody's plan. -->
			<Button href={exportHref} variant="outline" download data-testid="export-csv">
				Export CSV
			</Button>
			<Button href="/c/{data.conference.slug}" variant="outline">View the public site</Button>
		</div>
	</div>
</div>

<div class="px-6 py-5">
	<form
		method="GET"
		class="mb-3 flex flex-wrap items-center gap-2"
		data-testid="submission-filters"
	>
		<!-- A GET form submits only its own fields, so without this the first "Filter"
		     click would quietly throw the chosen order away. -->
		{#if data.sort !== 'newest'}
			<input type="hidden" name="sort" value={data.sort} />
		{/if}

		<Input
			name="q"
			value={data.filters.q ?? ''}
			placeholder="Search title or speaker…"
			class="w-60"
			aria-label="Search submissions"
		/>

		<select
			name="track"
			aria-label="Track"
			class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<option value="">All tracks</option>
			{#each data.facets.tracks as track (track.id)}
				<option value={track.id} selected={data.filters.trackId === track.id}>{track.name}</option>
			{/each}
		</select>

		<select
			name="format"
			aria-label="Format"
			class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<option value="">All formats</option>
			{#each data.facets.formats as format (format.id)}
				<option value={format.id} selected={data.filters.sessionFormatId === format.id}>
					{format.name}
				</option>
			{/each}
		</select>

		<!-- Multiple on purpose: "undecided" is `submitted` OR `in_review`, and that pair
		     is the single most useful view on this screen. The server has read the
		     status parameter as a list since day one — this is the control catching up
		     with it, rather than the plumbing being torn out. -->
		<select
			name="status"
			multiple
			size={3}
			aria-label="Status (pick several with ⌘ or Ctrl)"
			title="Pick several with ⌘ or Ctrl"
			class="border-input bg-background focus-visible:ring-ring w-40 rounded-md border px-2 py-1 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			{#each STATUSES as status (status)}
				<option value={status} selected={data.filters.status?.includes(status)}>
					{status.replace(/_/g, ' ')}
				</option>
			{/each}
		</select>

		<Button type="submit" variant="outline" size="sm">Filter</Button>
		{#if filtered}
			<!-- Clears the filters and keeps the order: the button says "Clear", and the
			     organizer means the boxes above it, not the column they just sorted by. -->
			<a
				href={data.sort === 'newest'
					? `${base}/submissions`
					: `${base}/submissions?sort=${data.sort}`}
				class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
			>
				Clear
			</a>
		{/if}
	</form>

	{#if form?.notificationResult}
		<p
			class="border-status-good text-status-good mb-3 rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			{describeNotification(form.notificationResult)}
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
		<EmptyState
			title={filtered ? 'No submission matches these filters' : 'No submissions yet'}
			description={filtered
				? 'Widen the filters, or clear them to see the whole pile again.'
				: 'Nothing has come in through the call for papers. Share the link and the table fills itself.'}
			action={{ href: `/c/${data.conference.slug}`, label: 'Open the public conference page' }}
		/>
	{:else}
		<form
			method="POST"
			action="?/decide"
			use:enhance={() => {
				busy = true;
				// `finally`, not a trailing line: a dropped connection would otherwise
				// leave every button disabled with no way back except a reload.
				return async ({ update }) => {
					try {
						await update();
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
				<div class="flex gap-2">
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
					<Button
						type="submit"
						formaction="?/notify"
						variant="secondary"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Notify decisions
					</Button>
				</div>
			</div>

			<div class="border-border overflow-hidden rounded-lg border">
				<table class="w-full text-left text-sm">
					<thead class="bg-muted text-muted-foreground sticky top-0 text-xs">
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
							<th class="py-2 pr-4 font-medium">Title</th>
							<th class="py-2 pr-4 font-medium">Speaker</th>
							<th class="py-2 pr-4 font-medium">Track</th>
							<th class="py-2 pr-4 font-medium">Format</th>
							<th class="py-2 pr-4 font-medium">Sponsor</th>
							<!-- The only sortable column, and it says so with the arrow rather than
							     with a legend: `aria-sort` tells a screen reader the same thing the
							     arrow tells everyone else. It is a link, not a button, because the
							     order lives in the URL — middle-click and back both work. -->
							<th
								class="py-2 pr-4 font-medium"
								aria-sort={data.sort === 'score-desc'
									? 'descending'
									: data.sort === 'score-asc'
										? 'ascending'
										: 'none'}
							>
								<a
									href={sortHref(nextScoreSort)}
									data-testid="sort-by-score"
									aria-label={scoreSortLabel}
									title={scoreSortLabel}
									class="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none {data.sort ===
									'newest'
										? ''
										: 'text-foreground'}"
								>
									Score
									<span aria-hidden="true" class="text-[0.9em] leading-none">
										{data.sort === 'score-desc' ? '↓' : data.sort === 'score-asc' ? '↑' : '↕'}
									</span>
								</a>
							</th>
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
								<td class="py-2 pr-4">
									<a
										href="{base}/submissions/{submission.id}"
										class="focus-visible:ring-ring font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
									>
										{submission.title}
									</a>
								</td>
								<td class="text-muted-foreground py-2 pr-4">{speakerLine(submission.speakers)}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.track ?? '—'}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.sessionFormat ?? '—'}</td>
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
								<td class="py-2 pr-4 tabular-nums">
									{formatScore(submission.score)}
									{#if submission.reviewsAssigned > 0}
										<span class="text-muted-foreground text-xs">
											({submission.reviewsSubmitted}/{submission.reviewsAssigned})
										</span>
									{/if}
								</td>
								<td class="py-2 pr-4"><StatusBadge status={submission.status} /></td>
								<td class="text-muted-foreground py-2 pr-4">
									{notificationLabel(submission)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

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

<script lang="ts">
	/**
	 * The filter row above the organizer's submissions table.
	 *
	 * Its own file because the page it sits on had grown past the point where the
	 * table and its controls could be read as one thing — and because these controls
	 * share exactly one contract with the rest of the screen: every one of them is a
	 * query parameter the loader reads, and nothing here holds state of its own.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Input } from '$lib/components/ui/input';
	import { tick } from 'svelte';

	let {
		facets,
		filters,
		sort,
		clearHref
	}: {
		facets: { tracks: { id: number; name: string }[]; formats: { id: number; name: string }[] };
		filters: {
			q?: string;
			status?: string[];
			trackId?: number;
			sessionFormatId?: number;
			needsReview?: boolean;
			agenda?: 'scheduled' | 'unscheduled';
			includeDrafts?: boolean;
		};
		sort: string;
		/** Where "Clear" goes — the page owns the URL, this component only links to it. */
		clearHref: string;
	} = $props();

	/**
	 * "All tracks" is an option, not a placeholder.
	 *
	 * The empty value is what clears the filter, so it has to be pickable — a
	 * placeholder is only shown while nothing is chosen and gives no way back.
	 */
	const facetOptions = (all: string, entries: { id: number; name: string }[]) => [
		{ value: '', label: all },
		...entries.map((entry) => ({ value: String(entry.id), label: entry.name }))
	];

	const filtered = $derived(
		Boolean(
			filters.q ||
			filters.trackId ||
			filters.sessionFormatId ||
			filters.status?.length ||
			filters.needsReview ||
			filters.agenda ||
			filters.includeDrafts
		)
	);

	/**
	 * No `draft` box any more (#412). Drafts are not a status the organizer picks
	 * between — they are the pile that is not theirs yet, so they get one checkbox
	 * of their own that brings them back rather than a seventh box among the
	 * decisions.
	 */
	const STATUSES = [
		'submitted',
		'in_review',
		'accepted',
		'waitlisted',
		'rejected',
		'resubmit_with_guidance',
		'withdrawn'
	];

	/**
	 * Apply the filters the moment one of them changes.
	 *
	 * `change` rather than `input`: this is a GET form and submitting it navigates,
	 * so firing per keystroke would reload the page under the organizer's caret. On a
	 * text field `change` means blur or Enter; on a select or a checkbox it means the
	 * click they just made.
	 */
	const applyFilters = (event: Event) => {
		(event.currentTarget as HTMLFormElement).requestSubmit();
	};

	let formEl: HTMLFormElement;

	/**
	 * The app-drawn dropdowns apply themselves, because nothing else will.
	 *
	 * The row applies on the form's own `change` event, which reaches it because a
	 * native control dispatches one that bubbles. A shadcn select does not: it
	 * sets its hidden input programmatically and dispatches nothing, so both of
	 * these would have looked like working filters that quietly did nothing.
	 *
	 * `tick()` first. bits-ui calls this back synchronously from its value setter,
	 * while the hidden input carrying that value is written on Svelte's next
	 * flush — submitting before it lands would post the previous choice.
	 */
	const applyAfterFlush = async () => {
		await tick();
		formEl?.requestSubmit();
	};
</script>

<form
	bind:this={formEl}
	method="GET"
	class="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2"
	data-testid="submission-filters"
	onchange={applyFilters}
>
	<!-- A GET form submits only its own fields, so without this the first filter
	     change would quietly throw the chosen order away. -->
	{#if sort !== 'newest'}
		<input type="hidden" name="sort" value={sort} />
	{/if}

	<Input
		name="q"
		value={filters.q ?? ''}
		placeholder="Search title or speaker…"
		class="w-60"
		aria-label="Search submissions"
	/>

	<AppSelect
		name="track"
		aria-label="Track"
		class="w-40"
		value={filters.trackId ? String(filters.trackId) : ''}
		options={facetOptions('All tracks', facets.tracks)}
		onValueChange={applyAfterFlush}
	/>

	<AppSelect
		name="format"
		aria-label="Format"
		class="w-40"
		value={filters.sessionFormatId ? String(filters.sessionFormatId) : ''}
		options={facetOptions('All formats', facets.formats)}
		onValueChange={applyAfterFlush}
	/>

	<!--
		Where a talk stands in the programme (#412). A select rather than a checkbox
		because the two answers are a pair an organizer switches between — "what still
		needs a slot" on Monday, "what is already placed" when checking the grid.
	-->
	<AppSelect
		name="agenda"
		aria-label="Agenda status"
		class="w-44"
		value={filters.agenda ?? ''}
		options={[
			{ value: '', label: 'Any agenda status' },
			{ value: 'scheduled', label: 'Scheduled' },
			{ value: 'unscheduled', label: 'Not scheduled' }
		]}
		onValueChange={applyAfterFlush}
	/>

	<!--
		Drafts are out unless asked for (#412). The old control had `draft` as a
		status box, so the organizer's default view was full of proposals nobody had
		handed in yet — work in progress read as a queue.
	-->
	<label class="flex cursor-pointer items-center gap-1.5 pb-1.5 text-sm">
		<input
			type="checkbox"
			name="includeDrafts"
			checked={filters.includeDrafts}
			class="border-input accent-primary size-4 rounded"
			data-testid="filter-include-drafts"
		/>
		<span>Include drafts</span>
	</label>

	<!--
		The one filter the interview asked for by name (#122): what is left to review.

		The live pipeline — submitted and in review — whether or not a review has
		already been handed in (#261). A checkbox rather than an eighth status box,
		because it is not a status, and the two compose: "submitted" plus this one
		is the queue an organizer chases on a Monday morning.
	-->
	<label class="flex cursor-pointer items-center gap-1.5 pb-1.5 text-sm">
		<input
			type="checkbox"
			name="needsReview"
			checked={filters.needsReview}
			class="border-input accent-primary size-4 rounded"
			data-testid="filter-needs-review"
		/>
		<span>Still to review</span>
	</label>

	<!--
		Checkboxes, not a `multiple` listbox. Several statuses at once is the point —
		"undecided" is `submitted` OR `in_review`, the most useful view on this screen
		— but the old control asked for that with ⌘-click, which is invisible, easy to
		get wrong (a plain click silently drops the other picks) and impossible on a
		touch screen. Checkboxes send the same repeated `status` parameter the server
		has read as a list since day one; only the control changed.
	-->
	<!--
		Its own row from the start. Six checkboxes plus a search box and three
		selects do not fit on one line at any width an organizer actually uses, and
		as a flex item the group does not wrap on its own — it just runs off the
		right edge and takes "rejected" and "withdrawn" with it.
	-->
	<fieldset class="order-last basis-full border-0 p-0">
		<legend class="text-muted-foreground mb-1 text-xs">Status</legend>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			{#each STATUSES as status (status)}
				<label class="flex cursor-pointer items-center gap-1.5 text-sm">
					<input
						type="checkbox"
						name="status"
						value={status}
						checked={filters.status?.includes(status)}
						class="border-input accent-primary size-4 rounded"
					/>
					<span>{status.replace(/_/g, ' ')}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<!--
		No "Filter" button: every control applies itself on change, so the button was
		a second step that only ever meant "yes, I meant it". `onchange` on the form
		catches all of them at once — and for the search box that is blur or Enter,
		not every keystroke, because a GET form navigates and a navigation per letter
		would take the caret with it.

		Without JavaScript nothing would apply at all, so the fallback is a real
		submit button that only exists in that case.
	-->
	<noscript>
		<button
			type="submit"
			class="border-input bg-background hover:bg-muted h-9 rounded-md border px-3 text-sm"
		>
			Filter
		</button>
	</noscript>

	{#if filtered}
		<!-- Clears the filters and keeps the order: the link says "Clear", and the
		     organizer means the boxes beside it, not the column they just sorted by. -->
		<a
			href={clearHref}
			class="text-muted-foreground hover:text-foreground pb-1.5 text-sm underline underline-offset-4"
		>
			Clear
		</a>
	{/if}
</form>

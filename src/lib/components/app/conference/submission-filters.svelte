<script lang="ts">
	/**
	 * The filter row above the organizer's submissions table.
	 *
	 * Its own file because the page it sits on had grown past the point where the
	 * table and its controls could be read as one thing — and because these controls
	 * share exactly one contract with the rest of the screen: every one of them is a
	 * query parameter the loader reads, and nothing here holds state of its own.
	 */
	import { Input } from '$lib/components/ui/input';

	let {
		facets,
		filters,
		sort,
		clearHref
	}: {
		facets: { tracks: { id: number; name: string }[]; formats: { id: number; name: string }[] };
		filters: { q?: string; status?: string[]; trackId?: number; sessionFormatId?: number };
		sort: string;
		/** Where "Clear" goes — the page owns the URL, this component only links to it. */
		clearHref: string;
	} = $props();

	const filtered = $derived(
		Boolean(filters.q || filters.trackId || filters.sessionFormatId || filters.status?.length)
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
</script>

<form
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

	<select
		name="track"
		aria-label="Track"
		class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
	>
		<option value="">All tracks</option>
		{#each facets.tracks as track (track.id)}
			<option value={track.id} selected={filters.trackId === track.id}>{track.name}</option>
		{/each}
	</select>

	<select
		name="format"
		aria-label="Format"
		class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
	>
		<option value="">All formats</option>
		{#each facets.formats as format (format.id)}
			<option value={format.id} selected={filters.sessionFormatId === format.id}>
				{format.name}
			</option>
		{/each}
	</select>

	<!--
		Checkboxes, not a `multiple` listbox. Several statuses at once is the point —
		"undecided" is `submitted` OR `in_review`, the most useful view on this screen
		— but the old control asked for that with ⌘-click, which is invisible, easy to
		get wrong (a plain click silently drops the other picks) and impossible on a
		touch screen. Checkboxes send the same repeated `status` parameter the server
		has read as a list since day one; only the control changed.
	-->
	<!--
		Its own row from the start. Seven checkboxes plus a search box and two
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

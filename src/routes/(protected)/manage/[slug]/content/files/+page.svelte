<script lang="ts">
	/**
	 * Every file the conference holds, in one list (CNT-13), with a selection that
	 * leaves as one ZIP (CNT-14).
	 *
	 * Latest versions only by default. A re-upload is a new row rather than an
	 * overwrite, so the unfiltered list is mostly history — and an organizer
	 * collecting decks the week before the event wants the current one, not four of
	 * them. History is one checkbox away, never gone.
	 *
	 * The form posts to a route rather than an action: the answer is a file, and a
	 * form action can only answer with a page.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { SvelteSet } from 'svelte/reactivity';

	let { data } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);

	let latestOnly = $state(true);
	let query = $state('');
	let selected = new SvelteSet<number>();
	let group = $state<'speaker' | 'flat'>('speaker');

	const shown = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return data.files.filter((file) => {
			if (latestOnly && !file.isLatest) return false;
			if (!needle) return true;
			return `${file.filename} ${file.speakerName} ${file.taskTitle} ${file.sessionTitle ?? ''}`
				.toLowerCase()
				.includes(needle);
		});
	});

	/** Selection follows the list: a file filtered out of view must not leave silently. */
	const selectedShown = $derived(shown.filter((file) => selected.has(file.id)));
	const allShown = $derived(shown.length > 0 && selectedShown.length === shown.length);

	const toggle = (id: number) => {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	};

	const toggleAll = () => {
		const wanted = allShown ? [] : shown.map((file) => file.id);
		selected.clear();
		for (const id of wanted) selected.add(id);
	};

	const size = (bytes: number | null) => {
		if (bytes == null) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	};

	const day = (value: Date | string) =>
		new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
</script>

<svelte:head>
	<title>Files — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Files</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
				{shown.length} of {data.files.length} handed in
				{#if selectedShown.length > 0}
					<span class="text-foreground">· {selectedShown.length} selected</span>
				{/if}
			</p>
		</div>
		<Button href="{base}/content" size="sm" variant="ghost">Back to speaker content</Button>
	</div>
</div>

<div class="space-y-5 px-6 py-5">
	<div class="flex flex-wrap items-center gap-4">
		<label class="w-full max-w-xs text-sm">
			<span class="sr-only">Find a file</span>
			<Input bind:value={query} type="search" placeholder="File, speaker, task or talk" />
		</label>
		<label class="text-muted-foreground flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={latestOnly} class="accent-primary" />
			Latest version of each task only
		</label>
	</div>

	{#if shown.length === 0}
		<p class="border-border bg-muted/40 text-muted-foreground rounded-lg border p-4 text-sm">
			{#if data.files.length === 0}
				Nothing has been handed in yet. Files appear here as speakers upload them against their
				tasks.
			{:else}
				No file matches this filter.
			{/if}
		</p>
	{:else}
		<form method="POST" action="{base}/content/files/download" class="space-y-3">
			<div class="border-border overflow-x-auto rounded-lg border">
				<table class="w-full min-w-[48rem] text-left text-sm">
					<thead class="border-border bg-muted/40 border-b text-xs">
						<tr>
							<th class="w-10 px-3 py-2">
								<input
									type="checkbox"
									class="accent-primary"
									checked={allShown}
									onchange={toggleAll}
									aria-label="Select every file shown"
								/>
							</th>
							<th class="px-3 py-2 font-medium">File</th>
							<th class="px-3 py-2 font-medium">Speaker</th>
							<th class="px-3 py-2 font-medium">For</th>
							<th class="px-3 py-2 font-medium">Version</th>
							<th class="px-3 py-2 font-medium">Size</th>
							<th class="px-3 py-2 font-medium">Handed in</th>
						</tr>
					</thead>
					<tbody class="divide-border divide-y">
						{#each shown as file (file.id)}
							<tr>
								<td class="px-3 py-2 align-top">
									<input
										type="checkbox"
										name="id"
										value={file.id}
										class="accent-primary"
										checked={selected.has(file.id)}
										onchange={() => toggle(file.id)}
										aria-label="Select {file.filename}"
									/>
								</td>
								<td class="px-3 py-2 align-top">
									<a class="font-medium hover:underline" href="{base}/content/files/{file.id}">
										{file.filename}
									</a>
									<div class="text-muted-foreground text-xs">{file.approvalStatus}</div>
								</td>
								<td class="px-3 py-2 align-top">{file.speakerName}</td>
								<td class="text-muted-foreground px-3 py-2 align-top text-xs">
									<a class="hover:underline" href="{base}/content/tasks/{file.taskId}">
										{file.taskTitle}
									</a>
									{#if file.sessionTitle}
										<div>{file.sessionTitle}</div>
									{/if}
								</td>
								<td class="px-3 py-2 align-top tabular-nums">
									v{file.version}
									{#if !file.isLatest}
										<span class="text-muted-foreground text-xs">superseded</span>
									{/if}
								</td>
								<td class="px-3 py-2 align-top tabular-nums">{size(file.sizeBytes)}</td>
								<td class="text-muted-foreground px-3 py-2 align-top text-xs">
									{day(file.uploadedAt)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<Button type="submit" size="sm" disabled={selectedShown.length === 0}>
					Download {selectedShown.length || ''} selected as ZIP
				</Button>
				<label class="text-muted-foreground flex items-center gap-2 text-xs">
					Group by
					<AppSelect
						name="group"
						size="sm"
						class="w-48"
						aria-label="Group by"
						value={group}
						options={[
							{ value: 'speaker', label: 'One folder per speaker' },
							{ value: 'flat', label: 'No folders' }
						]}
						onValueChange={(next) => (group = next === 'flat' ? 'flat' : 'speaker')}
					/>
				</label>
			</div>
		</form>
	{/if}
</div>

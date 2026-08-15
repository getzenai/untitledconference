<script lang="ts">
	/**
	 * One organizer-library file: PDF and ordinary images open in the sheet,
	 * everything else stays a download with a sentence saying why (#423).
	 *
	 * The href is our own authenticated route, not a speaker-supplied URL, so
	 * the open path does not re-check the scheme — the route does.
	 */
	import { filePreviewKind, type FilePreviewKind } from '$lib/conference/file-preview';

	let {
		filename,
		contentType = null,
		href,
		onOpen
	}: {
		filename: string;
		contentType?: string | null;
		href: string;
		onOpen: (src: string, title: string, kind: FilePreviewKind) => void;
	} = $props();

	const kind = $derived(filePreviewKind(filename, contentType));
</script>

<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
	{#if kind}
		<button
			type="button"
			class="font-medium underline underline-offset-4"
			data-testid="file-open"
			onclick={() => onOpen(href, filename, kind)}
		>
			{filename}
		</button>
		<a
			class="text-muted-foreground text-xs underline underline-offset-4"
			{href}
			download
			data-testid="file-download"
		>
			Download
		</a>
	{:else}
		<a class="font-medium underline underline-offset-4" {href} download data-testid="file-download">
			{filename}
		</a>
		<span class="text-muted-foreground text-xs">
			We cannot show this type here — download it instead.
		</span>
	{/if}
</div>

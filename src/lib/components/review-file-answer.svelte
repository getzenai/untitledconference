<script lang="ts">
	/**
	 * One file-kind CFP answer on the reviewer's scorecard (#423).
	 *
	 * PDF and images open in the sheet. Everything else stays a download with a
	 * sentence saying why — a blank sheet on a .docx would look like an empty file.
	 */
	import {
		filePreviewKind,
		filenameFrom,
		isSafeFileUrl,
		type FilePreviewKind
	} from '$lib/conference/file-preview';

	let {
		value,
		onOpen
	}: {
		value: string;
		onOpen: (value: string, kind: FilePreviewKind) => void;
	} = $props();

	const kind = $derived(filePreviewKind(value));
	const safe = $derived(isSafeFileUrl(value));
	const name = $derived(filenameFrom(value));
</script>

<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
	{#if kind && safe}
		<button
			type="button"
			class="font-medium underline underline-offset-4"
			data-testid="file-open"
			onclick={() => onOpen(value, kind)}
		>
			{name}
		</button>
		<a
			class="text-muted-foreground text-xs underline underline-offset-4"
			href={value}
			download
			data-testid="file-download"
		>
			Download
		</a>
	{:else if safe}
		<a
			class="font-medium underline underline-offset-4"
			href={value}
			download
			data-testid="file-download"
		>
			{name}
		</a>
		<span class="text-muted-foreground text-xs">
			We cannot show this type here — download it instead.
		</span>
	{:else}
		<span>{name}</span>
		<span class="text-muted-foreground text-xs">
			We cannot show this type here — download it instead.
		</span>
	{/if}
</div>

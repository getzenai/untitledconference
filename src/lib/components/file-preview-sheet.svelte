<script lang="ts">
	/**
	 * The file, in a sheet, next to the submission (#423).
	 *
	 * Images render natively. PDFs go through an iframe of the same URL the
	 * download uses — we do not fetch bytes ourselves, so a broken or hostile
	 * file cannot take the page with it. If the browser refuses to draw it,
	 * the download is still in the header.
	 */
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import type { FilePreviewKind } from '$lib/conference/file-preview';

	type Preview = { title: string; src: string; kind: FilePreviewKind };

	let {
		preview = $bindable(null)
	}: {
		preview: Preview | null;
	} = $props();
</script>

<Sheet.Root
	bind:open={
		() => preview !== null,
		(open) => {
			if (!open) preview = null;
		}
	}
>
	<Sheet.Content
		side="right"
		class="data-[side=right]:w-full sm:max-w-3xl"
		data-testid="file-preview-sheet"
	>
		{#if preview}
			<Sheet.Header>
				<Sheet.Title>{preview.title}</Sheet.Title>
				<Sheet.Description class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span>Beside the submission, so the review does not leave the page.</span>
					<a
						class="underline underline-offset-4"
						href={preview.src}
						download
						data-testid="file-preview-download"
					>
						Download
					</a>
				</Sheet.Description>
			</Sheet.Header>
			<div class="min-h-0 flex-1 px-4 pb-4">
				{#if preview.kind === 'image'}
					<img
						src={preview.src}
						alt={preview.title}
						class="border-border max-h-full max-w-full rounded-md border object-contain"
						data-testid="file-preview-image"
					/>
				{:else}
					<iframe
						title={preview.title}
						src={preview.src}
						class="border-border h-[70vh] w-full rounded-md border bg-white"
						data-testid="file-preview-pdf"
					></iframe>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

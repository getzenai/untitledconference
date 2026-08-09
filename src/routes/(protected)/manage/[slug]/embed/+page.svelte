<script lang="ts">
	/**
	 * Embed & share (EMB-15).
	 *
	 * The five public surfaces already exist and are already public; what was
	 * missing was the organizer ever being told so. This page is the whole of the
	 * handover: the address of each widget, and the four lines of HTML that put it
	 * on their own site.
	 *
	 * Everything on it is text the organizer can select with the mouse. The copy
	 * buttons are a convenience on top of that, not the only way through — a page
	 * whose content is only reachable by clicking a button that needs JavaScript
	 * and a secure context is a page that fails silently on the intranet where
	 * half of these conferences are administered.
	 */
	import CopyButton from '$lib/components/ui/copy-button.svelte';
	import { EMBEDDABLE_SURFACES, embedSnippet, embedUrl, surfaceUrl } from '$lib/conference/embed';

	let { data } = $props();

	const slug = $derived(data.conference.slug);
	const published = $derived(data.conference.status === 'published');
	const siteUrl = $derived(surfaceUrl(data.origin, slug, ''));
</script>

<svelte:head>
	<title>Embed &amp; share — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Embed &amp; share</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		Your programme, on your own website — or as a link anyone can open.
	</p>
</div>

<div class="max-w-3xl px-6 py-5">
	{#if !published}
		<!--
			Said before the URLs rather than after them: these addresses answer 404
			while the conference is a draft, and an organizer who pastes a snippet
			into their site and sees nothing deserves to have been warned first.
		-->
		<p
			class="border-status-warn text-status-warn mb-4 rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			This conference is still a draft, so the addresses below are not live yet. Publish it in
			Settings and every link and snippet on this page starts working — they do not change.
		</p>
	{/if}

	<section class="border-border bg-card rounded-lg border p-4">
		<h2 class="text-sm font-semibold">The public site</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			One address for all five surfaces, with the navigation between them. Share this one in an
			email or a tweet.
		</p>
		<div class="mt-3 flex items-center gap-2">
			<code class="border-border min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-xs"
				>{siteUrl}</code
			>
			<CopyButton value={siteUrl} size="sm" title="Copy the public address" />
			<a
				href="/c/{slug}"
				target="_blank"
				rel="noopener"
				class="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-4"
			>
				Open
			</a>
		</div>
	</section>

	<h2 class="mt-6 text-sm font-semibold">Embed one widget</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Each surface can stand on its own inside your site. The embedded version drops our header and
		tab bar and keeps only the content, so it sits inside your page instead of next to it. Adjust
		the height to taste — it is the one number in the snippet you will want to change.
	</p>

	<div class="mt-3 space-y-4">
		{#each EMBEDDABLE_SURFACES as surface (surface.path)}
			{@const url = embedUrl(data.origin, slug, surface.path)}
			{@const snippet = embedSnippet(data.origin, slug, surface)}
			<section class="border-border bg-card rounded-lg border p-4">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="text-sm font-semibold">{surface.label}</h3>
					<a
						href="/c/{slug}{surface.path}?embed=1"
						target="_blank"
						rel="noopener"
						class="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-4"
					>
						Preview
					</a>
				</div>
				<p class="text-muted-foreground mt-0.5 text-xs">{surface.description}</p>

				<div class="mt-3 flex items-center gap-2">
					<code class="border-border min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-xs"
						>{url}</code
					>
					<CopyButton value={url} size="sm" title="Copy the {surface.label} address" />
				</div>

				<div class="mt-2 flex items-start gap-2">
					<pre
						class="border-border text-muted-foreground min-w-0 flex-1 overflow-x-auto rounded-md border px-2 py-1.5 text-xs">{snippet}</pre>
					<CopyButton value={snippet} size="sm" title="Copy the {surface.label} snippet" />
				</div>
			</section>
		{/each}
	</div>
</div>

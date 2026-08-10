<script lang="ts">
	import { page } from '$app/state';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { EMBEDDABLE_SURFACES } from '$lib/conference/embed';
	import { formatDayLong } from '$lib/conference/public-view';

	let { children, data } = $props();

	const conference = $derived(data.conference);
	const base = $derived(`/c/${conference.slug}`);

	// The five widgets come from the same list the organizer's share page offers
	// for embedding, so a widget can never be on one and missing from the other.
	//
	// The call is appended here rather than added to that list, and the difference
	// is deliberate: a proposal form is not a thing to hand another site in an
	// iframe. It is also a tab only when there is one to open — a permanently
	// visible tab that 404s for most conferences would be worse than no tab at
	// all, and a closed call still gets one, because "we are not taking proposals
	// right now" is an answer a speaker came here for.
	const surfaces = $derived([
		...EMBEDDABLE_SURFACES.map(({ path, label }) => ({ path, label })),
		...(data.call ? [{ path: '/cfp', label: 'Call for papers' }] : [])
	]);

	// Prefix match, not equality: the speaker detail page lives under /speakers
	// and should keep its tab lit. The empty path is the index and must be exact,
	// or it would match everything.
	const isCurrent = (path: string) =>
		path === '' ? page.url.pathname === base : page.url.pathname.startsWith(base + path);

	const dateRange = $derived(
		conference.startsOn === conference.endsOn
			? formatDayLong(conference.startsOn)
			: `${formatDayLong(conference.startsOn)} – ${formatDayLong(conference.endsOn)}`
	);
</script>

<div class="bg-background text-foreground {data.embed ? '' : 'min-h-screen'}">
	<!--
		Inside an embed the site chrome comes off: the host page already has a
		header, and `min-h-screen` in an iframe is a viewport-tall box the host has
		to scroll past. What stays is the content and one way back to the real site.
	-->
	{#if !data.embed}
		<header class="border-border border-b">
			<div class="mx-auto flex max-w-6xl items-start justify-between gap-4 px-6 py-8">
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">{conference.name}</h1>
					<p class="text-muted-foreground mt-1 text-sm">
						{dateRange}{#if conference.venue}<span class="px-1.5">·</span>{conference.venue}{/if}
					</p>
				</div>
				<ModeToggle class="-mr-2" />
			</div>

			<nav aria-label="Conference sections" class="mx-auto max-w-6xl px-6">
				<ul class="-mb-px flex gap-6 text-sm">
					{#each surfaces as surface (surface.path)}
						{@const current = isCurrent(surface.path)}
						<li>
							<a
								href={base + surface.path}
								aria-current={current ? 'page' : undefined}
								class="hover:text-foreground -mb-px block border-b-2 py-3 transition-colors {current
									? 'border-primary text-foreground font-medium'
									: 'text-muted-foreground border-transparent'}"
							>
								{surface.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</header>
	{/if}

	<main class="mx-auto max-w-6xl px-6 {data.embed ? 'py-4' : 'py-8'}">
		{@render children?.()}
	</main>

	{#if data.embed}
		<footer class="mx-auto max-w-6xl px-6 pb-6">
			<a
				href={base}
				target="_top"
				class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
			>
				{conference.name} — open the full programme
			</a>
		</footer>
	{/if}
</div>

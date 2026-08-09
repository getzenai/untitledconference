<script lang="ts">
	import { page } from '$app/state';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { formatDayLong } from '$lib/conference/public-view';

	let { children, data } = $props();

	const conference = $derived(data.conference);
	const base = $derived(`/c/${conference.slug}`);

	// The call is a tab only when there is one to open. A permanently visible tab
	// that 404s for most conferences would be worse than no tab at all — and a
	// closed call still gets one, because "we are not taking proposals right now"
	// is an answer a speaker came here for.
	const surfaces = $derived([
		{ href: '', label: 'Sessions' },
		{ href: '/agenda', label: 'Agenda' },
		{ href: '/itinerary', label: 'Itinerary' },
		{ href: '/speakers', label: 'Speakers' },
		{ href: '/gallery', label: 'Gallery' },
		...(data.call ? [{ href: '/cfp', label: 'Call for papers' }] : [])
	]);

	// Prefix match, not equality: the speaker detail page lives under /speakers
	// and should keep its tab lit. The empty href is the index and must be exact,
	// or it would match everything.
	const isCurrent = (href: string) =>
		href === '' ? page.url.pathname === base : page.url.pathname.startsWith(base + href);

	const dateRange = $derived(
		conference.startsOn === conference.endsOn
			? formatDayLong(conference.startsOn)
			: `${formatDayLong(conference.startsOn)} – ${formatDayLong(conference.endsOn)}`
	);
</script>

<div class="bg-background text-foreground min-h-screen">
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
				{#each surfaces as surface (surface.href)}
					{@const current = isCurrent(surface.href)}
					<li>
						<a
							href={base + surface.href}
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

	<main class="mx-auto max-w-6xl px-6 py-8">
		{@render children?.()}
	</main>
</div>

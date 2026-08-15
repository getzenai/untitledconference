<script lang="ts">
	import { page } from '$app/state';
	import CallBanner from '$lib/components/app/conference/call-banner.svelte';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import ScrollEdge from '$lib/components/app/conference/scroll-edge.svelte';
	import { EMBEDDABLE_SURFACES } from '$lib/conference/embed';
	import { formatDateRange } from '$lib/conference/public-view';

	let { children, data } = $props();

	const conference = $derived(data.conference);
	const base = $derived(`/c/${conference.slug}`);

	// The widgets come from the same list the organizer's share page offers for
	// embedding, so a widget can never be on one and missing from the other —
	// with exactly one exception, made on purpose.
	//
	// Speakers and Gallery are the same people in two shapes. As two tabs they
	// read as two sections and cost a visitor a restart to switch; they are one
	// tab now, and the shape is chosen on the page itself. Both remain their own
	// embeddable surface, because an organizer embedding a photo wall in their
	// site is a different decision from embedding a directory — the share page
	// keeps offering both, and both URLs still answer.
	//
	// The call is appended here rather than added to that list, and the difference
	// is deliberate: a proposal form is not a thing to hand another site in an
	// iframe. It is also a tab only when there is one to open — a permanently
	// visible tab that 404s for most conferences would be worse than no tab at
	// all, and a closed call still gets one, because "we are not taking proposals
	// right now" is an answer a speaker came here for.
	//
	// `short` is the label a phone shows, and only this one tab has it: at 390 px
	// the other four are single words that already fit (#617). "CFP" is the word
	// the speaker world uses for exactly this page, and it is the only one of the
	// candidates that stays true when the call is closed — "Submit" would offer
	// something the page then refuses.
	const surfaces = $derived([
		...EMBEDDABLE_SURFACES.filter(({ path }) => path !== '/gallery').map(({ path, label }) => ({
			path,
			label,
			short: undefined as string | undefined
		})),
		...(data.call ? [{ path: '/cfp', label: 'Call for papers', short: 'CFP' }] : [])
	]);

	// Prefix match, not equality: the speaker detail page lives under /speakers
	// and should keep its tab lit. The empty path is the index and must be exact,
	// or it would match everything. /gallery has no tab of its own any more, so
	// it lights the one it belongs to instead of leaving the visitor on a page
	// the tab bar denies they are on.
	const isCurrent = (path: string) => {
		if (path === '') return page.url.pathname === base;
		if (path === '/speakers' && page.url.pathname.startsWith(base + '/gallery')) return true;
		return page.url.pathname.startsWith(base + path);
	};

	const dateRange = $derived(formatDateRange(conference));

	// The index carries the hero, which says the name, the dates and the venue in
	// a larger voice. Rendering the header's identity row above it would say all
	// three twice, so on that one page the header keeps only the tab bar.
	const onIndex = $derived(page.url.pathname === base);

	// A countdown only where there is something to count down to: an open call
	// with a deadline. A call that has not opened yet, or one already closed, has
	// no "closes in N days" to announce.
	const countdown = $derived(
		data.call?.state === 'open' && data.daysUntilClose !== null ? data.daysUntilClose : null
	);
</script>

<div class="bg-background text-foreground {data.embed ? '' : 'min-h-screen'}">
	<!--
		Inside an embed the site chrome comes off: the host page already has a
		header, and `min-h-screen` in an iframe is a viewport-tall box the host has
		to scroll past. What stays is the content and one way back to the real site.
	-->
	{#if !data.embed}
		{#if countdown !== null}
			<CallBanner slug={conference.slug} days={countdown} />
		{/if}

		<header class="border-border border-b">
			<div
				class="mx-auto flex max-w-6xl items-start gap-4 px-6 {onIndex
					? 'justify-end py-4'
					: 'justify-between py-8'}"
			>
				{#if !onIndex}
					<div>
						<h1 class="text-2xl font-semibold tracking-tight">{conference.name}</h1>
						{#if dateRange || conference.venue}
							<p class="text-muted-foreground mt-1 text-sm">
								{#if dateRange}{dateRange}{/if}{#if dateRange && conference.venue}<span
										class="px-1.5">·</span
									>{/if}{#if conference.venue}{conference.venue}{/if}
							</p>
						{/if}
					</div>
				{/if}
				<ModeToggle class="-mr-2" />
			</div>

			<!-- The tab that fell off a 390 px screen was "Call for papers" — the way in
			     for the person the whole site is trying to attract, and it arrived
			     clipped to "Cal" (#617). The banner above is a second way there and it
			     has a dismiss button, so once it is gone this strip is the only one.
			     Being reachable by a swipe was never the fix: a word nobody can read at
			     rest is a word nobody looks for.

			     So the longest label gets a short form on the narrowest screens, and the
			     gaps close from 24 px to 16 px. Together the five tabs fit inside a
			     390 px phone, which is what makes every visible label a whole word.
			     Only the eye reads the short form — `aria-hidden` on it and the full
			     name in a screenreader-only span means the tab is still called "Call
			     for papers" to anyone who cannot see the difference. From `sm` up the
			     two swap over and the abbreviation is gone.

			     The strip stays scrollable, because fitting at 390 px is not fitting
			     everywhere: a 320 px phone and large browser text both still push the
			     last tab off, and then the fade and the buttons are what reach it. -->
			<!-- "sections" is the word the nav below already uses for itself, so the
			     button and the landmark agree (#604). -->
			<ScrollEdge class="mx-auto max-w-6xl" data-testid="conference-tabs" name="sections">
				<nav aria-label="Conference sections" class="px-6">
					<ul class="-mb-px flex gap-4 text-sm whitespace-nowrap sm:gap-6">
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
									{#if surface.short}
										<span aria-hidden="true" class="sm:hidden">{surface.short}</span>
										<span class="sr-only sm:not-sr-only">{surface.label}</span>
									{:else}
										{surface.label}
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</nav>
			</ScrollEdge>
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

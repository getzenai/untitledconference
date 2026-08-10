<script lang="ts">
	/**
	 * The organizer's shell: one rail, always the same, with the conference at the top.
	 *
	 * The rail is the answer to the diagnosis in DESIGN_STANCE — the original has the
	 * features and loses the owner inside them. Seven destinations, no nesting, and the
	 * ones that are not built yet are visibly not links rather than 404s.
	 */
	import { page } from '$app/state';
	import ModeToggle from '$lib/components/mode-toggle.svelte';

	let { data, children } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);

	const nav = $derived([
		{ href: `${base}/dashboard`, label: 'Dashboard', ready: true },
		{ href: `${base}/submissions`, label: 'Submissions', ready: true },
		{ href: `${base}/cfp`, label: 'Call for papers', ready: true },
		{ href: `${base}/agenda`, label: 'Agenda', ready: true },
		{ href: `${base}/content`, label: 'Speaker content', ready: true },
		{ href: `${base}/people`, label: 'Team & reviewers', ready: false },
		{ href: `${base}/embed`, label: 'Embed & share', ready: true },
		{ href: `${base}/settings`, label: 'Settings', ready: true }
	]);

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);

	const dateRange = $derived.by(() => {
		const { startsOn, endsOn, venue } = data.conference;
		const parts: string[] = [];
		if (startsOn) {
			const start = new Date(startsOn);
			const end = endsOn ? new Date(endsOn) : null;
			parts.push(
				end
					? `${start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}`
					: start.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
			);
		}
		if (venue) parts.push(venue);
		return parts.join(' · ');
	});
</script>

<div class="bg-background text-foreground flex min-h-svh flex-col md:flex-row">
	<!--
		The same six destinations on a phone, where the rail has nowhere to stand.
		Below `md` the rail is hidden, and without this header the organizer arriving
		from a link on their phone had no way to anywhere — not even back to their own
		list of conferences.

		A scrolling row rather than a drawer: no open state to get stuck, no focus trap
		to get wrong, and it works with JavaScript switched off.
	-->
	<header class="border-border bg-card sticky top-0 z-10 border-b md:hidden">
		<div class="flex items-center justify-between gap-3 px-4 py-3">
			<a
				href="/manage"
				class="focus-visible:ring-ring min-w-0 rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
			>
				<div class="truncate text-sm font-semibold">{data.conference.name}</div>
				<div class="text-muted-foreground text-xs">Switch conference</div>
			</a>
			<ModeToggle />
		</div>
		<nav
			class="flex gap-1 overflow-x-auto px-4 pb-2 text-sm"
			aria-label="Conference sections"
			data-testid="manage-mobile-nav"
		>
			{#each nav as item (item.href)}
				{#if item.ready}
					<a
						href={item.href}
						aria-current={isCurrent(item.href) ? 'page' : undefined}
						class="focus-visible:ring-ring shrink-0 rounded-md px-3 py-1.5 focus-visible:ring-[3px] focus-visible:outline-none {isCurrent(
							item.href
						)
							? 'bg-primary text-primary-foreground font-medium'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{item.label}
					</a>
				{:else}
					<span class="text-muted-foreground/60 shrink-0 px-3 py-1.5" title="Not built yet">
						{item.label}
					</span>
				{/if}
			{/each}
		</nav>
	</header>

	<aside class="border-border bg-card hidden w-60 shrink-0 border-r p-4 md:block">
		<a
			href="/manage"
			class="hover:bg-muted focus-visible:ring-ring -mx-2 mb-4 block rounded-md px-2 py-1.5 focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<div class="text-sm font-semibold">{data.conference.name}</div>
			{#if dateRange}
				<div class="text-muted-foreground text-xs">{dateRange}</div>
			{/if}
			<div class="text-muted-foreground mt-1 text-xs">Switch conference</div>
		</a>

		<nav class="space-y-0.5 text-sm">
			{#each nav as item (item.href)}
				{#if item.ready}
					<a
						href={item.href}
						aria-current={isCurrent(item.href) ? 'page' : undefined}
						class="focus-visible:ring-ring block rounded-md px-3 py-1.5 focus-visible:ring-[3px] focus-visible:outline-none {isCurrent(
							item.href
						)
							? 'bg-primary text-primary-foreground font-medium'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{item.label}
					</a>
				{:else}
					<span
						class="text-muted-foreground/60 flex items-center justify-between rounded-md px-3 py-1.5"
						title="Not built yet"
					>
						{item.label}
						<span class="text-[10px] tracking-wide uppercase">soon</span>
					</span>
				{/if}
			{/each}
		</nav>

		<div class="border-border mt-8 border-t pt-4">
			<a
				href="/c/{data.conference.slug}"
				class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
			>
				View the public site
			</a>
			<div class="mt-3"><ModeToggle /></div>
		</div>
	</aside>

	<main class="min-w-0 flex-1">
		{@render children()}
	</main>
</div>

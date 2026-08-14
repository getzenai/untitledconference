<script lang="ts">
	/**
	 * The conference workspace rail (#410).
	 *
	 * A second `Sidebar.Root` next to the icon-collapsible app sidebar — not a
	 * handwritten aside. `collapsible="none"` so it does not share the app
	 * rail's open/collapsed state. Hidden below `md`; the mobile sheet in
	 * `AppSidebar` carries the same destinations.
	 */
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { conferenceDateRange, type ConferenceRail } from '$lib/conference/conference-nav';
	import NavConference from './nav-conference.svelte';

	let { conference }: { conference: ConferenceRail } = $props();

	const base = $derived(`/manage/${conference.slug}`);
	const published = $derived(conference.status === 'published');
	const dateRange = $derived(conferenceDateRange(conference));

	const draftBadgeClass =
		'focus-visible:ring-sidebar-ring mx-2 mb-1 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:outline-none';
</script>

<Sidebar.Root
	collapsible="none"
	class="sticky top-0 hidden min-h-svh md:flex"
	data-testid="conference-sidebar"
>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="All conferences">
					{#snippet child({ props })}
						<a href="/manage" data-testid="switch-conference" {...props}>
							<div class="grid min-w-0 flex-1 text-left text-sm leading-tight">
								<span class="truncate font-semibold">{conference.name}</span>
								{#if dateRange}
									<span class="text-muted-foreground truncate text-xs">{dateRange}</span>
								{/if}
								<span class="text-muted-foreground truncate text-xs">All conferences</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
		{#if !published}
			<a href="{base}/settings" data-testid="draft-badge" class={draftBadgeClass}>
				Draft — not public yet
			</a>
		{/if}
	</Sidebar.Header>
	<Sidebar.Content>
		<NavConference {conference} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="Public site">
					{#snippet child({ props })}
						<a
							href="/c/{conference.slug}"
							target="_blank"
							rel="noopener"
							data-testid="view-public-site"
							{...props}
						>
							<span>View the public site</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>

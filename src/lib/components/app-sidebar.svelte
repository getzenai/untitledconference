<script lang="ts" module>
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import GithubIcon from '@lucide/svelte/icons/github';
	import MicIcon from '@lucide/svelte/icons/mic';
	import UsersRoundIcon from '@lucide/svelte/icons/users-round';
	import { REPO_URL } from '$lib/constants';
	import type { NavGate } from '$lib/conference/nav-access';

	const data = {
		// `gate` names the flag that has to be true for the item to appear (#239).
		// The flags come from the shell loader and are derived from relations the
		// user already has — see `$lib/server/conference/nav-access`. They shorten
		// the list; they do not guard the routes, which guard themselves.
		//
		// The same person is often all three, and that case keeps every item.
		navMain: [
			{
				title: 'Conferences',
				url: '/manage',
				icon: CalendarIcon,
				gate: 'conferences' as NavGate
			},
			{
				// CRM-01: org-wide speaker directory, outside any single event — and
				// org-wide is also who gets the link, since a scoped conference
				// organizer's directory is empty.
				title: 'Contacts',
				url: '/contacts',
				icon: UsersRoundIcon,
				gate: 'contacts' as NavGate
			},
			{
				// No gate: anyone may submit a proposal, so `/portal` is everyone's.
				// It also stays the reason this list exists at all — `/portal` and
				// `/review` once had no link anywhere in the signed-in app, and a
				// speaker could only reach their own proposals by being sent a URL.
				title: 'Speaking',
				url: '/portal',
				icon: MicIcon
			},
			{
				title: 'Reviewing',
				url: '/review',
				icon: ClipboardCheckIcon,
				gate: 'reviewing' as NavGate
			}
		],
		navSecondary: [
			{
				title: 'GitHub',
				url: REPO_URL,
				icon: GithubIcon,
				external: true
			}
		]
	};
</script>

<script lang="ts">
	import { page } from '$app/state';
	import {
		conferenceDateRange,
		isConferencePath,
		isConferenceRail,
		type ConferenceRail
	} from '$lib/conference/conference-nav';
	import { reviewQueueHref, visibleNavItems, type NavAccess } from '$lib/conference/nav-access';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { ComponentProps } from 'svelte';
	import NavAdmin from './nav-admin.svelte';
	import NavConference from './nav-conference.svelte';
	import NavMain from './nav-main.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import NavUser from './nav-user.svelte';

	let {
		ref = $bindable(null),
		class: className,
		variant,
		collapsible = 'icon',
		user,
		navAccess
	}: ComponentProps<typeof Sidebar.Root> & {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
		/** Required, so a new shell cannot forget it and silently show everyone everything. */
		navAccess: NavAccess;
	} = $props();

	const navMain = $derived(
		visibleNavItems(data.navMain, navAccess).map((item) =>
			item.gate === 'reviewing' ? { ...item, url: reviewQueueHref(navAccess.reviewSlug) } : item
		)
	);

	// Check if user is admin
	const isAdmin = $derived(user?.role === 'admin');

	/**
	 * Conference pages merge their layout data onto `page.data`. The second rail
	 * renders that workspace on desktop; this group is the same list inside the
	 * mobile sheet, hidden from `md` up so the two do not double up.
	 *
	 * Review pages also put a `conference` on `page.data`. CFP-10: that must not
	 * grow organizer destinations into the reviewer's sheet — only a manage URL
	 * is the organizer workspace.
	 */
	const conference = $derived.by((): ConferenceRail | null => {
		if (!isConferencePath(page.url.pathname)) return null;
		const candidate = (page.data as { conference?: unknown }).conference;
		return isConferenceRail(candidate) ? candidate : null;
	});

	const conferenceDates = $derived(conference ? conferenceDateRange(conference) : '');

	const draftBadgeClass =
		'focus-visible:ring-sidebar-ring mx-2 mb-1 inline-block shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:outline-none';
</script>

<Sidebar.Root bind:ref {variant} {collapsible} class={className} data-testid="app-sidebar">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="Home">
					{#snippet child({ props })}
						<a href="/home" data-testid="sidebar-home-link" {...props}>
							<img src="/mascot/goose-signet.svg" alt="" class="size-6 shrink-0" />
							<span class="truncate font-semibold tracking-tight">untitledconference</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={navMain} />
		{#if conference}
			<div class="md:hidden" data-testid="manage-mobile-nav">
				<a
					href="/manage"
					data-testid="switch-conference-mobile"
					class="text-muted-foreground hover:text-foreground mx-2 mb-1 block truncate text-xs"
				>
					{conference.name}
					{#if conferenceDates}
						· {conferenceDates}
					{/if}
					· All conferences
				</a>
				{#if conference.status !== 'published'}
					<a
						href="/manage/{conference.slug}/settings"
						data-testid="draft-badge-mobile"
						class={draftBadgeClass}
					>
						Draft
					</a>
				{/if}
				<NavConference {conference} />
				<a
					href="/c/{conference.slug}"
					target="_blank"
					rel="noopener"
					data-testid="view-public-site-mobile"
					class="text-muted-foreground hover:text-foreground mx-2 mt-1 block text-xs underline underline-offset-4"
				>
					Public site
				</a>
			</div>
		{/if}
		{#if isAdmin}
			<NavAdmin />
		{/if}
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} speakerProfile={navAccess.speakerProfile} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>

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
	import NavMain from './nav-main.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import NavUser from './nav-user.svelte';
	import NavAdmin from './nav-admin.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { visibleNavItems, type NavAccess } from '$lib/conference/nav-access';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		variant,
		user,
		navAccess
	}: ComponentProps<typeof Sidebar.Root> & {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
		/** Required, so a new shell cannot forget it and silently show everyone everything. */
		navAccess: NavAccess;
	} = $props();

	const navMain = $derived(visibleNavItems(data.navMain, navAccess));

	// Check if user is admin
	const isAdmin = $derived(user?.role === 'admin');
</script>

<Sidebar.Root bind:ref {variant} class={className} data-testid="app-sidebar">
	<Sidebar.Header>
		<a
			href="/home"
			data-testid="sidebar-home-link"
			class="hover:bg-sidebar-accent focus-visible:ring-sidebar-ring rounded-md px-2 py-2 text-sm font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
		>
			untitledconference
		</a>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={navMain} />
		{#if isAdmin}
			<NavAdmin />
		{/if}
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} speakerProfile={navAccess.speakerProfile} />
	</Sidebar.Footer>
</Sidebar.Root>

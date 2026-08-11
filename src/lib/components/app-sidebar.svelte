<script lang="ts" module>
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import GithubIcon from '@lucide/svelte/icons/github';
	import MicIcon from '@lucide/svelte/icons/mic';
	import { REPO_URL } from '$lib/constants';

	const data = {
		navMain: [
			{
				title: 'Conferences',
				url: '/manage',
				icon: CalendarIcon
			},
			{
				// The same person is often all three. `/portal` and `/review` existed
				// with no link anywhere in the signed-in app: a speaker could only
				// reach their own proposals by being sent a URL, and a reviewer only
				// by typing one. Both loaders are safe for a user who is neither —
				// they render an empty list rather than erroring — so these are
				// unconditional rather than guessed from a role the session does not
				// carry.
				title: 'Speaking',
				url: '/portal',
				icon: MicIcon
			},
			{
				title: 'Reviewing',
				url: '/review',
				icon: ClipboardCheckIcon
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
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		variant,
		user
	}: ComponentProps<typeof Sidebar.Root> & {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
	} = $props();

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
		<NavMain items={data.navMain} />
		{#if isAdmin}
			<NavAdmin />
		{/if}
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>
</Sidebar.Root>

<script lang="ts" module>
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import GithubIcon from '@lucide/svelte/icons/github';
	import MicIcon from '@lucide/svelte/icons/mic';
	import { REPO_URL } from '$lib/constants';

	const data = {
		navMain: [
			{
				// The way into the product. Without this the organizer area exists but
				// nobody who logs in can reach it.
				title: 'Conferences',
				url: '/manage',
				icon: CalendarIcon,
				isActive: false,
				items: [
					{
						title: 'My conferences',
						url: '/manage'
					}
				]
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
				icon: MicIcon,
				isActive: false
			},
			{
				title: 'Reviewing',
				url: '/review',
				icon: ClipboardCheckIcon,
				isActive: false
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
	import CommandIcon from '@lucide/svelte/icons/command';
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
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="##" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<CommandIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Zen AI</span>
								<span class="truncate text-xs">Enterprise</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
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

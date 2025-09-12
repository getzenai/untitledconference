<script lang="ts" module>
	import BotIcon from '@lucide/svelte/icons/bot';
	import FrameIcon from '@lucide/svelte/icons/frame';
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import SendIcon from '@lucide/svelte/icons/send';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';

	const data = {
		navMain: [
			{
				title: 'Examples',
				url: '#',
				icon: SquareTerminalIcon,
				isActive: false,
				items: [
					{
						title: 'CRUD',
						url: '/examples/crud'
					},
					{
						title: 'Toast',
						url: '/examples/toast'
					},
					{
						title: 'Drag & Drop',
						url: '/examples/drag-drop'
					},
					{
						title: 'Documents',
						url: '/documents'
					},
					{
						title: 'UI Components',
						url: '/examples/ui-components'
					}
				]
			},
			{
				title: 'Models',
				url: '#',
				icon: BotIcon
			}
		],
		navSecondary: [
			{
				title: 'Support',
				url: '#',
				icon: LifeBuoyIcon
			},
			{
				title: 'Feedback',
				url: '#',
				icon: SendIcon
			}
		],
		projects: [
			{
				name: 'SvelteKit Vibe Starter',
				url: '#',
				icon: FrameIcon
			}
		]
	};
</script>

<script lang="ts">
	import NavMain from './nav-main.svelte';
	import NavProjects from './nav-projects.svelte';
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
		<NavProjects projects={data.projects} />
		{#if isAdmin}
			<NavAdmin />
		{/if}
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>
</Sidebar.Root>

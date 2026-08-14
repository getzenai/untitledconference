<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar-check';
	import UsersIcon from '@lucide/svelte/icons/users';

	let {
		class: className
	}: {
		class?: string;
	} = $props();
</script>

<Sidebar.Group class={className}>
	<Sidebar.GroupLabel>Admin</Sidebar.GroupLabel>
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton tooltipContent="Users" data-active={page.url.pathname === '/admin/users'}>
				{#snippet child({ props })}
					<a href="/admin/users" {...props}>
						<UsersIcon />
						<span>Users</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton
				tooltipContent="Front page"
				data-active={page.url.pathname === '/admin/conferences'}
			>
				{#snippet child({ props })}
					<a href="/admin/conferences" {...props}>
						<CalendarIcon />
						<span>Front page</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	</Sidebar.Menu>
</Sidebar.Group>

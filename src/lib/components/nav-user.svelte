<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import UserIcon from '@lucide/svelte/icons/user';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';

	let {
		user
	}: {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
	} = $props();

	const sidebar = useSidebar();
	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						// The svelteKitHandler should clear the session cookie.
						// The useSession hook will react, and route guards should redirect.
						// Explicit redirect as a fallback or primary action.
						goto('/login', { replaceState: true });
					}
				}
			});
		} catch (error) {
			console.error('Logout failed:', error);
			// Optionally display an error to the user
		}
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<Avatar.Root class="size-8 rounded-lg">
							<Avatar.Image src={user?.avatar} alt={user?.email} />
							<Avatar.Fallback class="rounded-lg"
								>{user?.email?.charAt(0).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate text-xs">{user?.email}</span>
						</div>
						<ChevronsUpDownIcon class="ml-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar.Root class="size-8 rounded-lg">
							<Avatar.Image src={user?.avatar} alt={user?.email} />
							<Avatar.Fallback class="rounded-lg"
								>{user?.email?.charAt(0).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate text-xs">{user?.email}</span>
						</div>
					</div>
				</DropdownMenu.Label>

				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={() => goto('/settings/account')}>
						<UserIcon />
						View profile
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => goto('/settings/organization')}>
						<BuildingIcon />
						Organization
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="p-0">
					<button
						type="button"
						class="flex w-full items-center gap-2 px-2 py-1.5"
						onclick={handleLogout}
					>
						<LogOutIcon />
						Log out
					</button>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

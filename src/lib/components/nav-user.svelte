<script lang="ts">
	import { goto } from '$app/navigation';
	import { resetUser } from '$lib/analytics/posthog';
	import { authClient } from '$lib/auth-client';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MicIcon from '@lucide/svelte/icons/mic';
	import UserIcon from '@lucide/svelte/icons/user';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';

	let {
		user,
		speakerProfile = false
	}: {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
		/** Show "Your speaker profile" — true when a profile exists (#248). */
		speakerProfile?: boolean;
	} = $props();

	const sidebar = useSidebar();
	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						// Drop the analytics identity so the next user on this
						// browser is not attributed to the one signing out.
						resetUser();
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
					<!--
						"Account", not "View profile": the destination is email, password and
						sessions. Two pages answered to "profile" and this item pointed at the
						one without the photo and bio (#248).
					-->
					<DropdownMenu.Item
						data-testid="nav-user-account"
						onclick={() => goto('/settings/account')}
					>
						<UserIcon />
						Account
					</DropdownMenu.Item>
					{#if speakerProfile}
						<DropdownMenu.Item
							data-testid="nav-user-speaker-profile"
							onclick={() => goto('/portal/profile')}
						>
							<MicIcon />
							Your speaker profile
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onclick={() => goto('/settings/organization')}>
						<BuildingIcon />
						Organization
					</DropdownMenu.Item>
					<!--
						The signed-in way to the product page (#237). `/` alone would bounce
						straight back to /home; `?home=0` is the one bypass the front door
						honours, and this menu is where someone looks for it.
					-->
					<DropdownMenu.Item data-testid="nav-user-product-page" onclick={() => goto('/?home=0')}>
						<HouseIcon />
						Product page
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<!--
					Same shape as the other items — a nested <button> inside Item is not a
					reliable Cypress target (bits-ui renders the item as menuitem; the
					user-journey E2E timed out looking for button/^Log out$/ with the menu open).
				-->
				<DropdownMenu.Item data-testid="nav-user-logout" onclick={handleLogout}>
					<LogOutIcon />
					Log out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

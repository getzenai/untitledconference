<script lang="ts">
	/**
	 * The one account menu, wherever the signed-in shell puts it (#127).
	 *
	 * Two shells asked the same question in two different shapes: the app sidebar
	 * had a user menu with Account, Organization and Log out, while the conference
	 * rail under `/manage/<slug>` had a pair of naked underlined links. An organizer
	 * who learned where their account lives in one place did not find it in the
	 * other — and only one of the two ever led to the speaker profile.
	 *
	 * The items live here; the trigger does not. A sidebar row and a compact avatar
	 * in a 60-wide rail are genuinely different controls, so the caller renders the
	 * button and this component owns what is inside the menu. That is the seam that
	 * keeps the two menus identical without pretending the two shells are.
	 */
	import { goto } from '$app/navigation';
	import { resetUser } from '$lib/analytics/posthog';
	import { authClient } from '$lib/auth-client';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MicIcon from '@lucide/svelte/icons/mic';
	import UserIcon from '@lucide/svelte/icons/user';
	import type { Snippet } from 'svelte';

	let {
		user,
		speakerProfile = false,
		trigger,
		side = 'right',
		contentClass = 'min-w-56 rounded-lg'
	}: {
		// eslint-disable-next-line no-undef -- App is a global SvelteKit type
		user: App.Locals['user'];
		/** Show "Your speaker profile" — true when a profile exists (#248). */
		speakerProfile?: boolean;
		/** The control that opens the menu; gets the trigger's props to spread. */
		trigger: Snippet<[Record<string, unknown>]>;
		side?: 'top' | 'right' | 'bottom' | 'left';
		contentClass?: string;
	} = $props();

	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						// Drop the analytics identity so the next user on this
						// browser is not attributed to the one signing out.
						resetUser();
						// The svelteKitHandler should clear the session cookie and the
						// route guards should redirect; this is the explicit path.
						goto('/login', { replaceState: true });
					}
				}
			});
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger(props)}
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class={contentClass} {side} align="end" sideOffset={4}>
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
			<DropdownMenu.Item data-testid="nav-user-account" onclick={() => goto('/settings/account')}>
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

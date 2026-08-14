<script lang="ts">
	/**
	 * The app sidebar's seat for the account menu (#127).
	 *
	 * Only the trigger lives here — a full-width sidebar row with the avatar, the
	 * email and the chevron. Everything the menu offers is in `AccountMenu`, shared
	 * with the conference rail so the two shells cannot drift apart again.
	 */
	import AccountMenu from '$lib/components/account-menu.svelte';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

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
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<AccountMenu
			{user}
			{speakerProfile}
			side={sidebar.isMobile ? 'bottom' : 'right'}
			contentClass="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
		>
			{#snippet trigger(props)}
				<Sidebar.MenuButton
					{...props}
					size="lg"
					data-testid="account-menu-trigger"
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
		</AccountMenu>
	</Sidebar.MenuItem>
</Sidebar.Menu>

<script lang="ts">
	/**
	 * The ten conference destinations, as a shadcn sidebar group.
	 *
	 * Desktop puts this in `ConferenceSidebar`; the mobile sheet puts the same
	 * group inside `AppSidebar`. One list, one active-state rule.
	 */
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { conferenceNav, type ConferenceRail } from '$lib/conference/conference-nav';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import MicIcon from '@lucide/svelte/icons/mic';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import UsersIcon from '@lucide/svelte/icons/users';

	let {
		conference,
		class: className
	}: {
		conference: ConferenceRail;
		class?: string;
	} = $props();

	const icons = {
		dashboard: LayoutDashboardIcon,
		submissions: InboxIcon,
		cfp: FileTextIcon,
		agenda: CalendarDaysIcon,
		speakers: MicIcon,
		content: FolderIcon,
		rounds: ClipboardListIcon,
		people: UsersIcon,
		embed: Share2Icon,
		settings: SettingsIcon
	};

	const items = $derived(conferenceNav(conference.slug));

	const isCurrent = (href: string) => page.url.pathname.startsWith(href);
</script>

<Sidebar.Group class={className}>
	<Sidebar.GroupLabel>Conference</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.id)}
			{@const Icon = icons[item.id]}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					tooltipContent={item.label}
					isActive={isCurrent(item.href)}
					data-testid="conference-nav-{item.id}"
				>
					{#snippet child({ props })}
						<a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined} {...props}>
							<Icon />
							<span>{item.label}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>

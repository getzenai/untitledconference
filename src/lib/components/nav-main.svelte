<script lang="ts">
	import LockIcon from '@lucide/svelte/icons/lock';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { NavLock } from '$lib/conference/nav-access';
	import { cn } from '$lib/utils.js';

	let {
		items
	}: {
		items: {
			title: string;
			url: string;
			// This should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon: any;
			/**
			 * Set when the destination is not open yet (#439). The entry stays in
			 * the list so the product has a shape on day one; the link goes to the
			 * form that opens it, not to the destination itself, because that one
			 * would answer 404.
			 */
			lock?: NavLock | null;
		}[];
	} = $props();

	const isCurrent = (url: string) =>
		page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as mainItem (mainItem.title)}
			{@const lock = mainItem.lock ?? null}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					tooltipContent={lock ? `${mainItem.title} — ${lock.reason}` : mainItem.title}
					data-active={lock ? false : isCurrent(mainItem.url)}
				>
					{#snippet child({ props })}
						<a
							href={lock ? lock.href : mainItem.url}
							data-testid={lock ? `nav-locked-${mainItem.title.toLowerCase()}` : undefined}
							title={lock?.reason}
							{...props}
							class={cn(
								'flex w-full items-center',
								lock && 'text-muted-foreground',
								props.class as string
							)}
						>
							<mainItem.icon />
							<span>{mainItem.title}</span>
							{#if lock}
								<!-- The reason is a tooltip on a pointer and a title on hover; a
								     screen reader gets it here, where it is part of the link's name. -->
								<span class="sr-only">— {lock.reason}</span>
								<LockIcon class="ml-auto size-3.5 shrink-0" aria-hidden="true" />
							{/if}
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>

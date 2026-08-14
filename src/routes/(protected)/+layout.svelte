<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { initialAppRail, transitAppRail } from '$lib/conference/conference-nav';
	import type { NavAccess } from '$lib/conference/nav-access';
	import { consumeGooseWelcome } from '$lib/goose-welcome';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Invitation accept and the post-verify card are signed-in but not the app
	// shell. Everything else — including /manage/<slug> — keeps AppSidebar
	// mounted so collapse state and rail scroll survive the workspace switch (#410).
	const showAppChrome = $derived(
		!page.url.pathname.startsWith('/onboarding') && !page.url.pathname.startsWith('/email-verified')
	);

	// First paint of a conference URL is collapsed so the icon rail does not
	// flash open. That is not a user preference — `savedOpen` stays expanded
	// until they actually collapse, so "All conferences" after a bookmark does
	// not leave them staring at icons.
	const initialRail = initialAppRail(page.url.pathname);
	let rail = $state(initialRail);
	let open = $state(initialRail.open);

	$effect.pre(() => {
		const next = transitAppRail(
			{ ...untrack(() => rail), open: untrack(() => open) },
			page.url.pathname
		);
		rail = next;
		open = next.open;
	});

	const navAccess = $derived((page.data as { navAccess?: NavAccess }).navAccess);

	// Goose easter egg: the login form sets this right before redirecting here
	// (or wherever `returnTo` sends the user), so it fires exactly once per
	// sign-in regardless of landing page.
	onMount(() => {
		if (consumeGooseWelcome(sessionStorage)) {
			toast('Welcome back, ya crazy goose!');
		}
	});
</script>

<Toaster richColors closeButton />
{#if showAppChrome && navAccess}
	<Sidebar.Provider bind:open>
		<AppSidebar user={page.data.user} {navAccess} variant="inset" collapsible="icon" />
		{@render children?.()}
	</Sidebar.Provider>
{:else}
	{@render children?.()}
{/if}

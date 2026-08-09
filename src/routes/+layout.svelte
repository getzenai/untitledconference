<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
	import ImpersonationBanner from '$lib/components/impersonation-banner.svelte';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children } = $props();

	// Hydration marker for E2E tests. Cypress types into forms as soon as the
	// SSR markup is on screen; submitting before Svelte has hydrated hits the
	// plain <form> and triggers a native navigation instead of the SPA handler.
	// Specs wait for `body[data-hydrated="true"]` before interacting.
	onMount(() => {
		document.body.dataset.hydrated = 'true';
	});

	// Push sidebar down when impersonating by injecting padding-top style
	$effect(() => {
		const styleEl = document.getElementById('impersonation-styles');

		if (page.data.impersonating) {
			if (!styleEl) {
				const newStyleEl = document.createElement('style');
				newStyleEl.id = 'impersonation-styles';
				newStyleEl.textContent =
					'[data-slot="sidebar-container"] { padding-top: 52px !important; }';
				document.head.appendChild(newStyleEl);
			}
		} else {
			styleEl?.remove();
		}
	});
</script>

<Toaster />
{#if page.data.impersonating}
	<div class="fixed inset-x-0 top-0 z-[100]">
		<ImpersonationBanner
			impersonatedUser={{ email: page.data.user?.email || '', id: page.data.user?.id || '' }}
		/>
	</div>
	<div class="h-[52px]"></div>
{/if}
<div class="h-full">
	{@render children()}
</div>

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>

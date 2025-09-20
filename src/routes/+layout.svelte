<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
	import ImpersonationBanner from '$lib/components/impersonation-banner.svelte';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import '../app.css';

	let { children } = $props();

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

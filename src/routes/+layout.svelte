<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import ImpersonationBanner from '$lib/components/impersonation-banner.svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { reloadIfBuildIsStale } from '$lib/navigation/stale-build';
	import { capturePageview, identifyUser, initAnalytics } from '$lib/analytics/posthog';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children, data } = $props();

	// Hydration marker for E2E tests. Cypress types into forms as soon as the
	// SSR markup is on screen; submitting before Svelte has hydrated hits the
	// plain <form> and triggers a native navigation instead of the SPA handler.
	// Specs wait for `body[data-hydrated="true"]` before interacting, so set it
	// before awaiting anything.
	//
	// The analytics calls are no-ops unless PUBLIC_POSTHOG_API_KEY is set.
	onMount(async () => {
		document.body.dataset.hydrated = 'true';
		await initAnalytics(data.analytics);
		capturePageview(window.location.href);
	});

	// When we deploy, the chunks this client would import are deleted. Rather
	// than let the next click die on a 404 import, hand the URL to the browser
	// and let it load the new build — the rule and the reasoning are in
	// `$lib/navigation/stale-build`. `updated.current` is fed by the version poll
	// configured in svelte.config.js.
	beforeNavigate((navigation) =>
		reloadIfBuildIsStale(navigation, updated.current, (url) => {
			window.location.href = url.href;
		})
	);

	// SvelteKit navigations do not reload the page, so pageviews are captured
	// per navigation. The initial load is captured in onMount above.
	afterNavigate(({ from }) => {
		if (from) capturePageview(window.location.href);
	});

	$effect(() => {
		const user = page.data.user;
		if (user?.id) {
			identifyUser(user.id, { email: user.email });
		}
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

<!-- Without this nothing can ever set the `dark` class, and the entire dark
     palette in app.css is unreachable. -->
<ModeWatcher defaultMode="light" track={false} />

<Toaster richColors closeButton />
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

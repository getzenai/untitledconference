<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import { consumeGooseWelcome } from '$lib/goose-welcome';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Goose easter egg: the login form sets this right before redirecting here
	// (or wherever `returnTo` sends the user), so it fires exactly once per
	// sign-in regardless of landing page.
	onMount(() => {
		if (consumeGooseWelcome(sessionStorage)) {
			toast('Welcome back, ya crazy goose!');
		}
	});
</script>

<!-- Minimal layout for protected pages - only authentication check, no sidebar -->
<Toaster richColors closeButton />
{@render children?.()}

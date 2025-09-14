<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<!-- Minimal layout for protected pages - only authentication check, no sidebar -->
<Toaster richColors closeButton />
{@render children?.()}

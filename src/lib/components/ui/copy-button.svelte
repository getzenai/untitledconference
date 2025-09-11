<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Copy, Check } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	export let value: string;
	export let size: 'default' | 'sm' | 'lg' | 'icon' = 'icon';
	export let variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' = 'outline';
	export let title: string = 'Copy to clipboard';
	let className: string = '';
	export { className as class };

	let copied = false;
	let timeoutId: NodeJS.Timeout | undefined;

	// Clean up timeout on component destroy to prevent memory leak
	onDestroy(() => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	});

	function copyToClipboard() {
		if (!value || !browser) return;

		navigator.clipboard
			.writeText(value)
			.then(() => {
				copied = true;
				
				// Clear any existing timeout
				if (timeoutId) clearTimeout(timeoutId);
				
				// Reset icon after 2 seconds
				timeoutId = setTimeout(() => {
					copied = false;
				}, 2000);
			})
			.catch((error) => {
				console.error('Failed to copy to clipboard:', error);
				
				// Fallback method for copying
				const textArea = document.createElement('textarea');
				textArea.value = value;
				textArea.style.position = 'fixed';
				textArea.style.left = '-999999px';
				textArea.style.top = '-999999px';
				document.body.appendChild(textArea);
				textArea.select();
				
				try {
					document.execCommand('copy');
					copied = true;
					
					// Clear any existing timeout
					if (timeoutId) clearTimeout(timeoutId);
					
					// Reset icon after 2 seconds
					timeoutId = setTimeout(() => {
						copied = false;
					}, 2000);
				} catch (_err) {
					console.error('Failed to copy to clipboard');
				}
				
				document.body.removeChild(textArea);
			});
	}
</script>

<Button
	type="button"
	{size}
	{variant}
	{title}
	class="transition-transform {copied ? 'scale-110' : ''} {className}"
	onclick={copyToClipboard}
>
	<div class="relative inline-flex items-center justify-center">
		{#if copied}
			<Check class="h-4 w-4 animate-in fade-in-0 zoom-in-95 duration-200" />
		{:else}
			<Copy class="h-4 w-4" />
		{/if}
	</div>
</Button>
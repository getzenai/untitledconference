<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
</script>

<svelte:head>
	<title>Toast Example</title>
	<meta name="description" content="An example of how to use toast notifications." />
</svelte:head>

<div class="container h-full py-8">
	<p class="mb-4">Click the button to show a toast notification.</p>
	<Button onclick={() => toast('This is a toast notification.')}>Show Toast</Button>
</div>

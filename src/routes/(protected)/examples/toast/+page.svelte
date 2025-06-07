<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Toast Example</title>
	<meta name="description" content="An example of how to use toast notifications." />
</svelte:head>

<div class="container py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Toast Example</h1>
		<a href="/home">
			<Button variant="outline"><ArrowLeft class="mr-2 h-4 w-4" /> Back to Dashboard</Button>
		</a>
	</div>

	<p class="mb-4">Click the button to show a toast notification.</p>

	<Button on:click={() => toast('This is a toast notification.')}>Show Toast</Button>
</div>

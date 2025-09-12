<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// This page acts as a router/redirect
	// The server-side loader handles the actual redirect logic

	onMount(() => {
		// If we somehow reach this page client-side, redirect to home
		goto('/home');
	});
</script>

<div class="container mx-auto max-w-6xl py-8">
	<p>Redirecting...</p>
</div>

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	onMount(() => {
		if (browser && !$page.data.user) {
			goto('/login');
		}
	});
</script>

<slot />

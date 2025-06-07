<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import { Toaster } from '$lib/components/ui/sonner';
	import '../app.css';

	let { children } = $props();
</script>

<ParaglideJS {i18n}>
	<Toaster />
	<div class="h-full">
		{@render children()}
	</div>
</ParaglideJS>

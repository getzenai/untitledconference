<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
</script>

<!-- Minimal layout for protected pages - only authentication check, no sidebar -->
<Toaster richColors closeButton />
<slot />

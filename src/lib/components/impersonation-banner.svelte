<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { AlertTriangle } from 'lucide-svelte';

	let {
		impersonatedUser
	}: {
		impersonatedUser?: { email: string; id: string };
	} = $props();

	async function stopImpersonating() {
		try {
			await authClient.admin.stopImpersonating();
			toast.success('Stopped impersonating');
			// Refresh the page to update the session
			await goto(window.location.pathname, { invalidateAll: true });
		} catch (error) {
			console.error('Error stopping impersonation:', error);
			toast.error('Failed to stop impersonating');
		}
	}
</script>

{#if impersonatedUser}
	<div class="border-primary bg-primary text-primary-foreground border-b-2 px-4 py-3">
		<div class="container mx-auto flex items-center justify-between">
			<div class="flex items-center gap-3">
				<AlertTriangle class="h-5 w-5 animate-pulse" />
				<div>
					<span class="font-semibold">IMPERSONATION MODE ACTIVE</span>
					<span class="ml-2 text-sm opacity-90">
						You are currently viewing the system as: <strong>{impersonatedUser.email}</strong>
					</span>
				</div>
			</div>
			<Button size="sm" variant="secondary" onclick={stopImpersonating} class="font-semibold">
				Stop Impersonating
			</Button>
		</div>
	</div>
{/if}

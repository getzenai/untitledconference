<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	const sessionState = authClient.useSession();
	// $sessionState will have properties like .data, .isPending, .error
	// .data itself is likely the store containing the actual session object { user, session } or null

	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						// The svelteKitHandler should clear the session cookie.
						// The useSession hook will react, and route guards should redirect.
						// Explicit redirect as a fallback or primary action.
						goto('/login', { replaceState: true });
					}
				}
			});
		} catch (error) {
			console.error('Logout failed:', error);
			// Optionally display an error to the user
		}
	}
</script>

<div class="container py-8">
	<Card>
		<CardHeader>
			<CardTitle>Protected Dashboard</CardTitle>
			<CardDescription>This page is only visible to authenticated users</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="space-y-4">
				{#if $sessionState.isPending}
					<p>Loading user information...</p>
				{:else if $sessionState.data?.user}
					<p>Welcome, {$sessionState.data.user.email}!</p>
				{:else if $page.data.user?.email && !$sessionState.error}
					<!-- Fallback to page data from server load if session hook is slow or for initial render -->
					<p>Welcome, {$page.data.user?.email}!</p>
				{:else if $sessionState.error}
					<p>Could not load user session: {$sessionState.error.message}</p>
				{:else}
					<p>Welcome! (User data not available)</p>
				{/if}

				<div class="flex flex-col gap-4 sm:flex-row">
					<Button on:click={handleLogout} variant="outline" disabled={$sessionState.isPending}
						>Logout</Button
					>
				</div>
			</div>
		</CardContent>
	</Card>
</div>

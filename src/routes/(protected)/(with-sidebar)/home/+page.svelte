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
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

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

<div class="container space-y-4 py-8">
	{#if data.onboarding}
		<Card>
			<CardHeader>
				<CardTitle>
					{#if data.onboarding.pendingInvitationCount > 0}
						You have {data.onboarding.pendingInvitationCount} pending invitation{data.onboarding
							.pendingInvitationCount === 1
							? ''
							: 's'}
					{:else}
						Finish setting up your account
					{/if}
				</CardTitle>
				<CardDescription>
					{#if data.onboarding.pendingInvitationCount > 0}
						Join an organization you have been invited to.
					{:else}
						Create an organization to start collaborating.
					{/if}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<a href={data.onboarding.href}>
					<Button>
						{data.onboarding.pendingInvitationCount > 0
							? 'Review invitations'
							: 'Create organization'}
					</Button>
				</a>
			</CardContent>
		</Card>
	{/if}

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
					<Button onclick={handleLogout} variant="outline" disabled={$sessionState.isPending}
						>Logout</Button
					>
					<a href="/documents">
						<Button>Documents</Button>
					</a>
					<a href="/examples/crud">
						<Button>CRUD Example</Button>
					</a>
					<a href="/examples/toast">
						<Button>Toast Example</Button>
					</a>
					<a href="/examples/drag-drop">
						<Button>Drag Drop Example</Button>
					</a>
				</div>
			</div>
		</CardContent>
	</Card>
</div>

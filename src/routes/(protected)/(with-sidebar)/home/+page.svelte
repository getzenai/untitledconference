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

	<Card data-testid="home-dashboard">
		<CardHeader>
			<CardTitle>Where do you want to go?</CardTitle>
			<CardDescription>
				{#if $sessionState.isPending}
					Loading user information...
				{:else if $sessionState.data?.user}
					Welcome, {$sessionState.data.user.email}!
				{:else if $page.data.user?.email && !$sessionState.error}
					<!-- Fallback to page data from server load if the session hook is slow -->
					Welcome, {$page.data.user?.email}!
				{:else if $sessionState.error}
					Could not load user session: {$sessionState.error.message}
				{:else}
					Welcome! (User data not available)
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent>
			<!--
				The three roles one account can hold, named on the first screen after
				login. `/portal` and `/review` were reachable only by typing the URL,
				which made a speaker's own proposals and a reviewer's queue invisible to
				anyone who had not been sent a link. All three are listed for everyone:
				the session carries no role to branch on, and both loaders answer a user
				who holds neither role with an empty list rather than an error.
			-->
			<div class="space-y-4">
				<div class="grid gap-3 sm:grid-cols-3">
					<a
						href="/manage"
						class="border-border hover:border-primary hover:bg-muted/40 block rounded-lg border p-4 transition-colors"
					>
						<span class="block font-medium">Organizing</span>
						<span class="text-muted-foreground text-sm">
							Your conferences, the call, decisions and the programme.
						</span>
					</a>
					<a
						href="/portal"
						class="border-border hover:border-primary hover:bg-muted/40 block rounded-lg border p-4 transition-colors"
					>
						<span class="block font-medium">Speaking</span>
						<span class="text-muted-foreground text-sm"> Your proposals, tasks and files. </span>
					</a>
					<a
						href="/review"
						class="border-border hover:border-primary hover:bg-muted/40 block rounded-lg border p-4 transition-colors"
					>
						<span class="block font-medium">Reviewing</span>
						<span class="text-muted-foreground text-sm">
							The proposals assigned to you to score.
						</span>
					</a>
				</div>

				<Button onclick={handleLogout} variant="outline" disabled={$sessionState.isPending}
					>Logout</Button
				>
			</div>
		</CardContent>
	</Card>
</div>

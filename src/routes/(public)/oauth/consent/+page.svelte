<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import Check from '@lucide/svelte/icons/check';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);

	const scopeDescriptions: Record<string, string> = {
		openid: 'Confirm your identity',
		profile: 'Read your basic profile information',
		email: 'Read your email address',
		offline_access: 'Stay connected while you are away'
	};

	const clientName = $derived(data.clientName ?? 'an unknown application');

	async function decide(accept: boolean) {
		submitting = true;
		errorMessage = null;
		try {
			// The oauthProviderClient fetch plugin attaches the signed OAuth query
			// from the page URL, which the server validates before issuing the code.
			const { data: result, error } = await authClient.oauth2.consent({ accept });
			if (error || !result?.url) {
				errorMessage = error?.message || 'Could not complete the authorization request.';
				submitting = false;
				return;
			}
			// Redirect back to the requesting application (with code or denial).
			// Keep the buttons disabled while the browser navigates away.
			window.location.href = result.url;
		} catch (_err) {
			errorMessage = 'Could not complete the authorization request.';
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Authorize application</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-background flex min-h-screen items-center justify-center p-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Authorize application</CardTitle>
			<CardDescription>{clientName} wants to access your account.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if data.valid}
				{#if data.scopes.length > 0}
					<div>
						<p class="mb-2 text-sm font-medium">This will allow it to:</p>
						<ul class="space-y-1">
							{#each data.scopes as scope (scope)}
								<li class="text-muted-foreground flex items-center gap-2 text-sm">
									<Check class="text-primary h-4 w-4 flex-shrink-0" />
									{scopeDescriptions[scope] ?? scope}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if data.redirectHost}
					<p class="text-muted-foreground text-xs">
						You will be redirected to {data.redirectHost}.
					</p>
				{/if}
				<p class="text-muted-foreground text-xs">Signed in as {data.email}</p>
			{:else}
				<p role="alert" class="text-destructive text-sm">
					This authorization request is not valid.
				</p>
			{/if}
			{#if errorMessage}
				<p role="alert" class="text-destructive text-sm">{errorMessage}</p>
			{/if}
		</CardContent>
		{#if data.valid}
			<CardFooter class="flex gap-2">
				<Button
					variant="outline"
					class="flex-1"
					disabled={submitting}
					onclick={() => decide(false)}
				>
					Deny
				</Button>
				<Button class="flex-1" disabled={submitting} onclick={() => decide(true)}>Approve</Button>
			</CardFooter>
		{/if}
	</Card>
</div>

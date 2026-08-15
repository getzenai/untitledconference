<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { CheckCircle2, AlertCircle } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { page } from '$app/state';
	import { safeReturnTo } from '$lib/safe-return-to';
	import { emailVerifiedContinueLabel } from './continue-label';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const returnTo = $derived(safeReturnTo(page.url.searchParams.get('returnTo'), page.url.origin));
	const continueLabel = $derived(emailVerifiedContinueLabel(returnTo));
	const skipLabel = $derived(emailVerifiedContinueLabel(returnTo, 'Go'));

	function handleContinue() {
		goto(returnTo);
	}

	function handleVerifyEmail() {
		goto(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
	}
</script>

<svelte:head>
	<title>{data.user?.emailVerified ? 'Email Verified' : 'Email Verification'}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card>
			{#if data.user?.emailVerified}
				<CardHeader class="text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
					>
						<CheckCircle2 class="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
					</div>
					<CardTitle class="text-2xl">Email Verified!</CardTitle>
					<CardDescription class="mt-2">
						Your email address <strong>{data.user?.email}</strong> has been successfully verified.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="flex flex-col gap-2">
						<Button onclick={handleContinue} class="w-full">{continueLabel}</Button>
						<Button variant="outline" onclick={() => goto('/settings/account')} class="w-full">
							View Account Settings
						</Button>
					</div>
				</CardContent>
			{:else}
				<CardHeader class="text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
					>
						<AlertCircle class="h-10 w-10 text-amber-600 dark:text-amber-400" />
					</div>
					<CardTitle class="text-2xl">Email Not Yet Verified</CardTitle>
					<CardDescription class="mt-2">
						Your email address <strong>{data.user?.email}</strong> is not yet verified.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="flex flex-col gap-2">
						<Button onclick={handleVerifyEmail} class="w-full">Verify Email</Button>
						<Button variant="outline" onclick={handleContinue} class="w-full">
							{skipLabel}
						</Button>
					</div>
				</CardContent>
			{/if}
		</Card>
	</div>
</div>

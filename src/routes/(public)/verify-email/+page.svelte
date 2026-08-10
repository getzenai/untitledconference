<script lang="ts">
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth-client';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-svelte';

	const DEFAULT_RETURN_TO = '/home';
	let email = '';
	let isLoading = false;
	let error: string | null = null;
	let successMessage: string | null = null;
	let canResend = true;
	let resendCooldown = 0;
	let cooldownTimer: ReturnType<typeof setInterval> | null = null;
	let returnToTarget = DEFAULT_RETURN_TO;

	// Rate limiting: store last resend time in sessionStorage
	const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

	onMount(async () => {
		if (browser) {
			const currentUrl = new URL(window.location.href);
			const emailParam = currentUrl.searchParams.get('email');
			const returnToParam = currentUrl.searchParams.get('returnTo');
			if (emailParam) {
				email = emailParam;
			}
			if (returnToParam && returnToParam.startsWith('/') && !returnToParam.startsWith('//')) {
				returnToTarget = returnToParam;
			}
		}

		// Check if user is already logged in and verified
		const sessionResponse = await authClient.getSession();
		if (sessionResponse?.data?.user?.emailVerified) {
			goto(returnToTarget);
			return;
		}

		// Get email from session or URL params
		if (sessionResponse?.data?.user?.email) {
			email = sessionResponse.data.user.email;
		}

		// Check rate limiting
		if (browser) {
			const lastResendTime = sessionStorage.getItem('lastEmailResend');
			if (lastResendTime) {
				const timeSinceLastResend = Date.now() - parseInt(lastResendTime);
				if (timeSinceLastResend < RESEND_COOLDOWN_MS) {
					canResend = false;
					resendCooldown = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastResend) / 1000);
					startCooldownTimer();
				}
			}
		}
	});

	function startCooldownTimer() {
		cooldownTimer = setInterval(() => {
			resendCooldown--;
			if (resendCooldown <= 0) {
				canResend = true;
				if (cooldownTimer) {
					clearInterval(cooldownTimer);
					cooldownTimer = null;
				}
			}
		}, 1000);
	}

	onDestroy(() => {
		if (cooldownTimer) {
			clearInterval(cooldownTimer);
		}
	});

	async function handleResendEmail() {
		if (!canResend || isLoading) return;

		isLoading = true;
		error = null;
		successMessage = null;

		try {
			await authClient.sendVerificationEmail({
				email,
				callbackURL: window.location.origin + '/email-verified'
			});

			successMessage = 'Verification email sent! Please check your inbox.';

			// Set rate limiting
			if (browser) {
				sessionStorage.setItem('lastEmailResend', Date.now().toString());
			}
			canResend = false;
			resendCooldown = RESEND_COOLDOWN_MS / 1000;
			startCooldownTimer();
		} catch (e: unknown) {
			console.error('Failed to resend verification email:', e);
			if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'Failed to resend verification email. Please try again.';
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						goto('/login');
					}
				}
			});
		} catch (e) {
			console.error('Logout failed:', e);
			// Force redirect even if logout fails
			goto('/login');
		}
	}

	function formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Verify your email — Untitled Conference</title>
</svelte:head>

<AuthShell title="Verify your email" wide>
	<div class="space-y-6">
		<div class="flex items-start gap-3">
			<div
				class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
			>
				<MailCheck class="size-5" />
			</div>
			<div class="space-y-1 text-sm">
				<p class="text-muted-foreground">
					We've sent a verification link to
					{#if email}
						<span class="text-foreground font-medium">{email}</span>
					{:else}
						your email address
					{/if}. Click it to finish registering.
				</p>
				<p class="text-muted-foreground">Didn't receive anything? Resend a fresh link below.</p>
			</div>
		</div>

		{#if error}
			<Alert variant="destructive">
				<AlertCircle class="size-4" />
				<AlertTitle>Unable to send email</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		{/if}

		{#if successMessage}
			<Alert>
				<CheckCircle2 class="text-primary size-4" />
				<AlertTitle>Verification sent</AlertTitle>
				<AlertDescription>{successMessage}</AlertDescription>
			</Alert>
		{/if}

		<div class="space-y-3">
			<Button class="w-full" disabled={!canResend || isLoading} onclick={handleResendEmail}>
				{#if isLoading}
					Sending...
				{:else if !canResend}
					Resend in {formatTime(resendCooldown)}
				{:else}
					Resend verification email
				{/if}
			</Button>

			<div class="flex flex-col gap-2 sm:flex-row">
				<Button variant="ghost" size="sm" class="flex-1" onclick={handleLogout}>
					Use a different account
				</Button>
				<Button variant="ghost" size="sm" class="flex-1" onclick={() => goto('/login')}>
					Back to login
				</Button>
			</div>
		</div>
	</div>

	{#snippet footer()}
		<p>The verification link expires in 24 hours.</p>
	{/snippet}
</AuthShell>

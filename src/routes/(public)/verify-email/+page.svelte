<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
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
	<title>Verify Your Email - SvelteKit Vibe Starter</title>
</svelte:head>

<div
	class="relative container grid min-h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<div class="bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r">
		<div class="absolute inset-0 bg-zinc-900"></div>
		<div class="relative z-20 flex flex-1 flex-col justify-center text-right">
			<span class="text-2xl font-bold">Verify your email</span>
			<p class="mt-4 text-lg leading-relaxed text-white/80">
				Check your inbox, click the link, and you’ll be right back here to continue.
			</p>
		</div>
	</div>
	<div class="flex h-full items-center p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<Card class="border-border/80 border shadow-sm">
				<CardHeader class="space-y-4 text-center">
					<div
						class="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full"
					>
						<MailCheck class="h-6 w-6" />
					</div>
					<div class="space-y-1">
						<CardTitle class="text-2xl font-semibold">Verify your email</CardTitle>
						<CardDescription class="text-base">
							We've sent a verification link to
							{#if email}
								<span class="text-foreground block font-medium">{email}</span>
							{:else}
								your email address
							{/if}
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="text-muted-foreground space-y-3 text-center text-sm">
						<p>Click the link in that email to complete your registration.</p>
						<p>Didn't receive anything? You can resend a fresh link below.</p>
					</div>

					{#if error}
						<Alert variant="destructive">
							<AlertCircle class="h-4 w-4" />
							<AlertTitle>Unable to send email</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					{/if}

					{#if successMessage}
						<Alert>
							<CheckCircle2 class="text-primary h-4 w-4" />
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
				</CardContent>
				<CardFooter class="flex justify-center">
					<p class="text-muted-foreground text-center text-xs">
						The verification link expires in 24 hours.
					</p>
				</CardFooter>
			</Card>
		</div>
	</div>
</div>

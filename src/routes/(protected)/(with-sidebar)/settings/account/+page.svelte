<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import {
		changePasswordSchema,
		getPasswordRequirementsFromSchema,
		PASSWORD_MIN_LENGTH,
		PASSWORD_MAX_LENGTH
	} from '$lib/validators/password';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	interface FieldErrors {
		currentPassword?: string;
		newPassword?: string;
	}

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const passwordRequirements = getPasswordRequirementsFromSchema();

	let currentPassword = $state('');
	let newPassword = $state('');
	let revokeOtherSessions = $state(true);
	let fieldErrors = $state<FieldErrors>({});
	let formMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let isSubmitting = $state(false);

	function formatDate(value: string | Date | null | undefined): string {
		if (!value) return 'Unknown';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	async function handlePasswordSubmit(event: SubmitEvent) {
		event.preventDefault();
		formMessage = null;
		successMessage = null;
		fieldErrors = {};

		const result = changePasswordSchema.safeParse({
			currentPassword,
			newPassword
		});

		if (!result.success) {
			const flattened = result.error.flatten();
			fieldErrors = Object.fromEntries(
				Object.entries(flattened.fieldErrors).map(([key, value]) => [key, value?.[0]])
			);
			formMessage = flattened.formErrors[0] ?? null;
			return;
		}

		isSubmitting = true;

		try {
			const { error } = await authClient.changePassword({
				currentPassword: result.data.currentPassword,
				newPassword: result.data.newPassword,
				revokeOtherSessions
			});

			if (error) {
				const message =
					error.message ||
					'Unable to update password. Please verify your current password and try again.';
				formMessage = message;
				toast.error('Password update failed', { description: message });
				return;
			}

			currentPassword = '';
			newPassword = '';
			successMessage = revokeOtherSessions
				? 'Password updated. You have been signed out on other devices.'
				: 'Password updated successfully.';
			toast.success('Password updated', {
				description: successMessage
			});
		} catch (error) {
			console.error('Failed to change password', error);
			const message =
				error instanceof Error
					? 'Unable to update password. Please verify your credentials and try again.'
					: 'Unable to update password at this time. Please try again later.';
			formMessage = message;
			toast.error('Password update failed', { description: message });
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Account settings</title>
</svelte:head>

<div class="container mx-auto max-w-4xl space-y-8 py-8">
	<div>
		<h1 class="text-3xl font-semibold tracking-tight">Account settings</h1>
		<p class="text-muted-foreground mt-2 text-sm">
			Review your profile information and update your password to keep your account secure.
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Profile overview</CardTitle>
			<CardDescription>Your basic account details</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-1">
				<Label>Email</Label>
				<div class="flex items-center gap-2">
					<p class="text-sm font-medium">{data.user?.email ?? 'Unknown'}</p>
					{#if data.user?.emailVerified}
						<span
							class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
						>
							Verified
						</span>
					{:else}
						<span
							class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
						>
							Unverified
						</span>
					{/if}
				</div>
				{#if !data.user?.emailVerified}
					<div class="mt-2">
						<a href="/verify-email" class="text-primary text-sm font-medium hover:underline">
							Resend verification email
						</a>
					</div>
				{/if}
			</div>
			<div class="space-y-1">
				<Label>Role</Label>
				<p class="text-sm font-medium capitalize">{data.user?.role ?? 'user'}</p>
			</div>
			<div class="space-y-1">
				<Label>Member since</Label>
				<p class="text-sm font-medium">{formatDate(data.user?.createdAt)}</p>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Change password</CardTitle>
			<CardDescription>
				Use a strong, unique password. Updating your password will immediately secure future logins.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form class="space-y-6" onsubmit={handlePasswordSubmit}>
				<div class="grid gap-4">
					<div class="space-y-2">
						<Label for="currentPassword">Current password</Label>
						<PasswordInput
							id="currentPassword"
							autocomplete="current-password"
							bind:value={currentPassword}
							disabled={isSubmitting}
							required
						/>
						{#if fieldErrors.currentPassword}
							<p class="text-destructive text-sm" role="alert">
								{fieldErrors.currentPassword}
							</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="newPassword">New password</Label>
						<PasswordInput
							id="newPassword"
							autocomplete="new-password"
							bind:value={newPassword}
							disabled={isSubmitting}
							minlength={PASSWORD_MIN_LENGTH}
							maxlength={PASSWORD_MAX_LENGTH}
							required
						/>
						{#if fieldErrors.newPassword}
							<p class="text-destructive text-sm" role="alert">
								{fieldErrors.newPassword}
							</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label>Password requirements</Label>
					<ul class="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
						{#each passwordRequirements as requirement}
							<li>{requirement}</li>
						{/each}
						<li>Different from your current password</li>
					</ul>
				</div>

				<div class="flex items-start gap-3">
					<Checkbox
						id="revokeOtherSessions"
						bind:checked={revokeOtherSessions}
						disabled={isSubmitting}
					/>
					<div class="space-y-1">
						<Label for="revokeOtherSessions">Sign out of other sessions</Label>
						<p class="text-muted-foreground text-xs">
							Recommended for account security—this revokes access from other browsers and devices.
						</p>
					</div>
				</div>

				{#if formMessage}
					<p class="text-destructive text-sm" role="alert" aria-live="assertive">
						{formMessage}
					</p>
				{/if}
				{#if successMessage}
					<p class="text-sm text-emerald-600 dark:text-emerald-400" aria-live="polite">
						{successMessage}
					</p>
				{/if}

				<Button type="submit" disabled={isSubmitting} class="min-w-40">
					{#if isSubmitting}
						Updating password...
					{:else}
						Update password
					{/if}
				</Button>
			</form>
		</CardContent>
	</Card>
</div>

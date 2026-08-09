<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import * as Form from '$lib/components/ui/form';
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
	import PasswordStrength from '$lib/components/ui/password-strength.svelte';
	import { getPasswordRequirementsFromSchema } from '$lib/validators/password';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

	const passwordRequirements = getPasswordRequirementsFromSchema();
	let successMessage = $state<string | null>(null);

	const form = superForm(data.form, {
		SPA: true, // Prevent default form submission
		onSubmit: async ({ formData: formValues, cancel }) => {
			// Cancel the default form submission
			cancel();

			const currentPassword = formValues.get('currentPassword') as string;
			const newPassword = formValues.get('newPassword') as string;
			const revokeOtherSessions = formValues.get('revokeOtherSessions') === 'on';

			try {
				// Use Better Auth client to change password
				const result = await authClient.changePassword({
					currentPassword,
					newPassword,
					revokeOtherSessions
				});

				if (result?.error) {
					const message =
						result.error.message ||
						'Unable to update password. Please verify your current password and try again.';
					errors.set({ _errors: [message] });
					toast.error('Password update failed', { description: message });
					return;
				}

				// Clear password fields on success
				formData.update((f) => {
					f.currentPassword = '';
					f.newPassword = '';
					return f;
				});
				successMessage = revokeOtherSessions
					? 'Password updated. You have been signed out on other devices.'
					: 'Password updated successfully.';
				toast.success('Password updated', {
					description: successMessage
				});
			} catch (_err) {
				const message = 'An unexpected error occurred. Please try again.';
				errors.set({ _errors: [message] });
				toast.error('Password update failed', { description: message });
			}
		}
	});

	const { form: formData, enhance, submitting, errors } = form;

	function formatDate(value: string | Date | null | undefined): string {
		if (!value) return 'Unknown';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
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
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
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
			<form method="POST" use:enhance class="space-y-6">
				<div class="grid gap-4">
					<Form.Field {form} name="currentPassword">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Current password</Form.Label>
								<PasswordInput
									{...props}
									id="currentPassword"
									autocomplete="current-password"
									bind:value={$formData.currentPassword}
									disabled={$submitting}
									required
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Field {form} name="newPassword">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>New password</Form.Label>
								<PasswordInput
									{...props}
									id="newPassword"
									autocomplete="new-password"
									bind:value={$formData.newPassword}
									disabled={$submitting}
									required
								/>
								<PasswordStrength password={$formData.newPassword} />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<div class="space-y-2">
					<Label>Password requirements</Label>
					<ul class="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
						{#each passwordRequirements as requirement, i (i)}
							<li>{requirement}</li>
						{/each}
						<li>Different from your current password</li>
					</ul>
				</div>

				<Form.Field {form} name="revokeOtherSessions">
					<Form.Control>
						{#snippet children({ props })}
							<div class="flex items-start gap-3">
								<Checkbox
									{...props}
									id="revokeOtherSessions"
									bind:checked={$formData.revokeOtherSessions as boolean}
									disabled={$submitting}
								/>
								<div class="space-y-1">
									<Form.Label for="revokeOtherSessions">Sign out of other sessions</Form.Label>
									<p class="text-muted-foreground text-xs">
										Recommended for account security—this revokes access from other browsers and
										devices.
									</p>
								</div>
							</div>
						{/snippet}
					</Form.Control>
				</Form.Field>

				{#if $errors._errors}
					<div role="alert" class="text-sm text-red-500">
						{#each $errors._errors as error, i (i)}
							<p>{error}</p>
						{/each}
					</div>
				{/if}
				{#if successMessage}
					<p class="text-sm text-emerald-600 dark:text-emerald-400" aria-live="polite">
						{successMessage}
					</p>
				{/if}

				<Form.Button type="submit" disabled={$submitting} class="min-w-40">
					{#if $submitting}
						Updating password...
					{:else}
						Update password
					{/if}
				</Form.Button>
			</form>
		</CardContent>
	</Card>
</div>

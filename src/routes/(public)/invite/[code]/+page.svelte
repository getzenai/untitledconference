<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	interface InvitationInfo {
		id: string;
		email: string;
		organizationName: string;
		role: string;
		expiresAt: Date;
	}

	let invitationCode = data.invitationCode;
	let invitationInfo: InvitationInfo | null = $state(null);
	let isLoading = $state(true);
	let isAccepting = $state(false);
	let error: string | null = $state(data.error || null);
	let isLoggedIn = $state(false);
	let userEmail = '';

	onMount(async () => {
		await checkAuthAndLoadInvitation();
	});

	async function checkAuthAndLoadInvitation() {
		try {
			// Check if user is logged in
			const { data: session } = await authClient.getSession();
			if (session?.user) {
				isLoggedIn = true;
				userEmail = session.user.email;
			}

			// Load invitation details
			await loadInvitationDetails();
		} catch (err) {
			console.error('Error checking auth:', err);
		} finally {
			isLoading = false;
		}
	}

	async function loadInvitationDetails() {
		// Check if invitation is valid from server data
		if (!data.isValid) {
			// Error is already set from server
			return;
		}

		// For unauthenticated users, we can't get full invitation details from Better Auth
		// But we can still show them the invitation and let them register
		if (!isLoggedIn) {
			// Just set basic info to show the invitation acceptance UI
			invitationInfo = {
				id: invitationCode,
				email: '',
				organizationName: data.organizationName || 'the organization',
				role: 'member',
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Assume 7 days
			};
			// Clear any error for unauthenticated users since we have valid invitation from server
			error = null;
			return;
		}

		try {
			// Get invitation details for authenticated users
			const { data, error: inviteError } = await authClient.organization.getInvitation({
				query: { id: invitationCode }
			});

			if (inviteError) {
				error = inviteError.message || 'Invalid or expired invitation';
			} else if (data) {
				// Check if invitation is expired
				const expiresAt = new Date(data.expiresAt);
				if (expiresAt < new Date()) {
					error = 'This invitation has expired';
				} else {
					invitationInfo = {
						id: data.id,
						email: data.email,
						organizationName: data.organizationName,
						role: data.role || 'member',
						expiresAt
					};

					// Check if logged in user matches invitation email
					if (isLoggedIn && userEmail !== invitationInfo.email) {
						error = `This invitation is for ${invitationInfo.email}. Please login with that email address or logout and register a new account.`;
					}
				}
			}
		} catch (err) {
			console.error('Error loading invitation:', err);
			error = 'Failed to load invitation details';
		}
	}

	async function acceptInvitation() {
		if (!invitationInfo) return;

		isAccepting = true;
		try {
			// If not logged in, redirect to registration
			if (!isLoggedIn) {
				// Store invitation code in session storage for after registration
				sessionStorage.setItem('pendingInvitation', invitationCode);
				// Redirect with invitation parameter
				await goto(`/register?invitation=${invitationCode}`);
				return;
			}

			// Accept the invitation
			const { data, error: acceptError } = await authClient.organization.acceptInvitation({
				invitationId: invitationCode
			});

			if (acceptError) {
				toast.error(acceptError.message || 'Failed to accept invitation');
			} else if (data) {
				// Set the organization as active
				if (data.member?.organizationId) {
					await authClient.organization.setActive({
						organizationId: data.member.organizationId
					});
				}

				toast.success(`Successfully joined ${invitationInfo.organizationName}`);
				await goto('/home');
			}
		} catch (err) {
			console.error('Error accepting invitation:', err);
			toast.error('Failed to accept invitation');
		} finally {
			isAccepting = false;
		}
	}

	async function declineInvitation() {
		await goto('/');
	}
</script>

<div class="container flex min-h-screen items-center justify-center">
	<Card class="w-full max-w-md">
		{#if isLoading}
			<CardContent class="pt-6">
				<div class="flex justify-center">
					<p class="text-muted-foreground">Loading invitation...</p>
				</div>
			</CardContent>
		{:else if error}
			<CardHeader>
				<CardTitle>Invalid Invitation</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="text-destructive mb-4 text-sm">{error}</p>
				<Button href="/" variant="outline" class="w-full">Go to Home</Button>
			</CardContent>
		{:else if invitationInfo}
			<CardHeader>
				<CardTitle>Organization Invitation</CardTitle>
				<CardDescription>
					{#if isLoggedIn}
						You've been invited to join an organization
					{:else}
						Create an account to accept this invitation
					{/if}
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if isLoggedIn}
					<div class="space-y-2">
						<p class="text-muted-foreground text-sm">Organization</p>
						<p class="text-lg font-semibold">{invitationInfo.organizationName || 'Loading...'}</p>
					</div>

					<div class="space-y-2">
						<p class="text-muted-foreground text-sm">Your Role</p>
						<p class="font-medium capitalize">{invitationInfo.role}</p>
					</div>

					<div class="space-y-2">
						<p class="text-muted-foreground text-sm">Invitation For</p>
						<p class="font-medium">{invitationInfo.email}</p>
					</div>
				{:else}
					<div class="space-y-3">
						<p class="text-sm">You've been invited to join an organization.</p>
						<p class="text-sm">
							Please create an account to accept this invitation and join the organization.
						</p>
					</div>
				{/if}

				<div class="flex gap-2 pt-4">
					<Button
						variant="outline"
						onclick={declineInvitation}
						disabled={isAccepting}
						class="flex-1"
					>
						Decline
					</Button>
					<Button onclick={acceptInvitation} disabled={isAccepting} class="flex-1">
						{#if isAccepting}
							Accepting...
						{:else if !isLoggedIn}
							Continue to Sign Up
						{:else}
							Accept Invitation
						{/if}
					</Button>
				</div>
			</CardContent>
		{/if}
	</Card>
</div>

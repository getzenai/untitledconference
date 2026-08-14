<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';
	import {
		Shield,
		Users,
		UserX,
		UserCheck,
		Mail,
		Clock,
		RefreshCw,
		Loader2,
		UserPlus
	} from 'lucide-svelte';
	import CopyButton from '$lib/components/ui/copy-button.svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipTrigger,
		TooltipProvider
	} from '$lib/components/ui/tooltip';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { INVITATION_EXPIRY_SECONDS } from '$lib/constants';
	import { generateRandomPassword } from '$lib/utils/password';
	import { PASSWORD_MIN_LENGTH } from '$lib/validators/password';
	import { banTakesEffectCopy } from './ban-copy';
	import { REGENERATE_REPLACES_LINK_COPY } from './regenerate-copy';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	interface User {
		id: string;
		name: string | null;
		email: string;
		role: string | null;
		banned: boolean | null;
		banReason: string | null;
		createdAt: Date;
		emailVerified: boolean;
	}

	// All data comes from server
	let currentUser = $state(data.currentUser as User);
	// Make users reactive to data changes
	let users = $state(data.users as User[]);
	let stats = $state(data.stats);
	let searchQuery = $state('');
	let invitations = $state(data.invitations || []);

	// Reactive updates when data changes
	$effect(() => {
		users = data.users as User[];
		stats = data.stats;
		invitations = data.invitations || [];
	});

	// Invitation dialog state
	let inviteDialogOpen = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state('user');
	let showInvitationSuccess = $state(false);
	let isCreatingInvitation = $state(false);
	let invitationLink = $state('');
	let regeneratingInvitationId = $state<string | null>(null);
	let invitationReplacedPrevious = $state(false);
	let emailVerificationLoading = $state<Record<string, boolean>>({});

	// Create user dialog state
	let createDialogOpen = $state(false);
	let createEmail = $state('');
	let createPassword = $state('');
	let createRole = $state('user');
	let isCreatingUser = $state(false);
	let showCreateUserSuccess = $state(false);
	let createUserError = $state<string | null>(null);
	let createdUserDetails = $state<User | null>(null);

	function prepareCreateDialog() {
		createEmail = '';
		createPassword = generateRandomPassword();
		createRole = 'user';
		createUserError = null;
		createdUserDetails = null;
		showCreateUserSuccess = false;
		isCreatingUser = false;
	}

	function resetCreateDialogState(refresh = false) {
		createEmail = '';
		createPassword = generateRandomPassword();
		createRole = 'user';
		createUserError = null;
		createdUserDetails = null;
		const shouldRefresh = refresh && showCreateUserSuccess;
		showCreateUserSuccess = false;
		isCreatingUser = false;

		if (shouldRefresh) {
			void loadAdminData();
		}
	}

	// Handle form response
	$effect(() => {
		const actionType = (form as { action?: string } | null)?.action;

		if (!actionType) {
			return;
		}

		if (actionType === 'createInvitation' || actionType === 'regenerateInvitation') {
			if (form?.success) {
				if (form?.invitationLink) {
					invitationLink = form.invitationLink;
					showInvitationSuccess = true;
					inviteDialogOpen = true;
					toast.success('Invitation link ready');
				} else if (form?.message) {
					toast.success(form.message);
					inviteDialogOpen = false;
					resetInviteDialog();
					void goto('/admin/users', { invalidateAll: true });
				}
			} else if (form?.error) {
				toast.error(form.error);
			}

			if (actionType === 'createInvitation') {
				isCreatingInvitation = false;
				regeneratingInvitationId = null;
				invitationReplacedPrevious = false;
			}

			if (actionType === 'regenerateInvitation') {
				regeneratingInvitationId = null;
				invitationReplacedPrevious = true;
			}
		}

		if (actionType === 'createUser') {
			if (form?.success && form?.createdUser) {
				const created = form.createdUser as User;
				const existingUser = users.find((user) => user.id === created.id);

				if (existingUser) {
					users = users.map((user) => (user.id === created.id ? { ...user, ...created } : user));
				} else {
					users = [created, ...users].sort(
						(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					);
					stats = {
						...stats,
						totalUsers: stats.totalUsers + 1,
						adminUsers: created.role === 'admin' ? stats.adminUsers + 1 : stats.adminUsers
					};
				}

				// Preserve the password for display (it's already in createPassword from the form)
				// Only update email and details
				createEmail = created.email;
				createdUserDetails = created;
				showCreateUserSuccess = true;
				createUserError = null;
				toast.success('User created successfully');

				// Clear form state after handling
				form = null;
			} else if (form?.error) {
				createUserError = form.error;
				toast.error(form.error);
				// Clear form state after handling error
				form = null;
			}

			isCreatingUser = false;
		}
	});

	// Reset dialog state when closing
	function resetInviteDialog() {
		inviteDialogOpen = false;
		inviteEmail = '';
		inviteRole = 'user';
		invitationLink = '';
		showInvitationSuccess = false;
		invitationReplacedPrevious = false;
	}

	// Alert dialog states
	let impersonateDialogOpen = $state(false);
	let banDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedUser = $state<User | null>(null);

	async function loadAdminData() {
		try {
			// Reload the page to get fresh data
			await goto('/admin/users', { invalidateAll: true });
		} catch (error) {
			console.error('Error loading admin data:', error);
			toast.error('Failed to load admin data');
		}
	}

	async function updateEmailVerificationStatus(userId: string, email: string, nextValue: boolean) {
		const targetUser = users.find((u) => u.id === userId);
		if (!targetUser) {
			return;
		}

		if (emailVerificationLoading[userId]) {
			return;
		}

		if (targetUser.emailVerified === nextValue) {
			return;
		}

		const previousValue = targetUser.emailVerified;

		emailVerificationLoading = { ...emailVerificationLoading, [userId]: true };
		users = users.map((user) =>
			user.id === userId ? { ...user, emailVerified: nextValue } : user
		);

		try {
			const formData = new FormData();
			formData.set('userId', userId);
			formData.set('emailVerified', nextValue ? 'true' : 'false');

			const response = await fetch('?/setEmailVerification', {
				method: 'POST',
				body: formData
			});

			// Check if the response is successful based on HTTP status
			// SvelteKit actions return 2xx for success, 4xx/5xx for failures
			if (!response.ok) {
				// Try to parse error message from response
				let errorMessage = 'Failed to update email verification status';
				try {
					const responseText = await response.text();
					if (responseText) {
						const result = JSON.parse(responseText);
						if (result?.error) {
							errorMessage = result.error;
						}
					}
				} catch (_e) {
					// If parsing fails, use default error message
				}
				throw new Error(errorMessage);
			}

			// Success - the action has completed successfully
			toast.success(`Email verification ${nextValue ? 'enabled' : 'disabled'} for ${email}`);
		} catch (error) {
			console.error('Error updating email verification status:', error);
			toast.error(
				error instanceof Error ? error.message : 'Failed to update email verification status'
			);
			users = users.map((user) =>
				user.id === userId ? { ...user, emailVerified: previousValue } : user
			);
		} finally {
			const { [userId]: _, ...rest } = emailVerificationLoading;
			emailVerificationLoading = rest;
		}
	}

	async function updateUserRole(userId: string, newRole: string) {
		const previousRole = users.find((u) => u.id === userId)?.role || 'user';

		try {
			// Optimistically update the UI
			users = users.map((user) => (user.id === userId ? { ...user, role: newRole } : user));
			// Update stats optimistically
			if (previousRole === 'admin' && newRole !== 'admin') {
				stats = { ...stats, adminUsers: Math.max(0, stats.adminUsers - 1) };
			} else if (previousRole !== 'admin' && newRole === 'admin') {
				stats = { ...stats, adminUsers: stats.adminUsers + 1 };
			}

			await authClient.admin.setRole({
				userId,
				role: newRole as 'user' | 'admin'
			});
			await loadAdminData();
		} catch (error) {
			console.error('Error updating user role:', error);
			toast.error('Failed to update user role');
			// Revert on error
			await loadAdminData();
		}
	}

	async function impersonateUser() {
		if (!selectedUser) return;

		try {
			await authClient.admin.impersonateUser({
				userId: selectedUser.id
			});
			toast.success(`Now impersonating ${selectedUser.email}`);
			// Redirect and invalidate all data to refresh the session
			await goto('/home', { invalidateAll: true });
		} catch (error) {
			console.error('Error impersonating user:', error);
			toast.error('Failed to impersonate user');
		} finally {
			impersonateDialogOpen = false;
			selectedUser = null;
		}
	}

	async function banUser() {
		if (!selectedUser) return;

		const userId = selectedUser.id;

		try {
			// Optimistically update the UI
			users = users.map((user) =>
				user.id === userId ? { ...user, banned: true, banReason: 'Banned by administrator' } : user
			);
			// Update stats optimistically
			stats = {
				...stats,
				bannedUsers: stats.bannedUsers + 1
			};

			await authClient.admin.banUser({
				userId,
				banReason: 'Banned by administrator'
			});
			// Reload to get fresh data from server
			await loadAdminData();
		} catch (error) {
			console.error('Error banning user:', error);
			toast.error('Failed to ban user');
			// Revert optimistic update on error
			await loadAdminData();
		} finally {
			banDialogOpen = false;
			selectedUser = null;
		}
	}

	async function unbanUser(userId: string) {
		try {
			// Optimistically update the UI
			users = users.map((user) =>
				user.id === userId ? { ...user, banned: false, banReason: null } : user
			);
			// Update stats optimistically
			stats = {
				...stats,
				bannedUsers: Math.max(0, stats.bannedUsers - 1)
			};

			await authClient.admin.unbanUser({
				userId
			});
			// Reload to get fresh data from server
			await loadAdminData();
		} catch (error) {
			console.error('Error unbanning user:', error);
			toast.error('Failed to unban user');
			// Revert optimistic update on error
			await loadAdminData();
		}
	}

	async function removeUser() {
		if (!selectedUser) return;

		const userId = selectedUser.id;
		const userToRemove = users.find((u) => u.id === userId);

		try {
			// Optimistically update the UI
			users = users.filter((user) => user.id !== userId);
			// Update stats optimistically
			if (userToRemove) {
				stats = {
					...stats,
					totalUsers: Math.max(0, stats.totalUsers - 1),
					bannedUsers: userToRemove.banned ? Math.max(0, stats.bannedUsers - 1) : stats.bannedUsers,
					adminUsers:
						userToRemove.role === 'admin' ? Math.max(0, stats.adminUsers - 1) : stats.adminUsers
				};
			}

			await authClient.admin.removeUser({
				userId
			});
			toast.success('User removed successfully');
			await loadAdminData();
		} catch (error) {
			console.error('Error removing user:', error);
			toast.error('Failed to remove user');
			// Revert on error
			await loadAdminData();
		} finally {
			deleteDialogOpen = false;
			selectedUser = null;
		}
	}

	// Reactive filtering - updates instantly as you type
	let filteredUsers = $derived(
		users.filter((user) => {
			// Search across multiple fields
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				const matchesEmail = user.email?.toLowerCase().includes(query);
				const matchesName = user.name?.toLowerCase().includes(query);
				const matchesRole = user.role?.toLowerCase().includes(query);
				const matchesBanned =
					(query === 'banned' && user.banned) || (query === 'enabled' && !user.banned);

				return matchesEmail || matchesName || matchesRole || matchesBanned;
			}

			return true;
		})
	);
</script>

<div class="container mx-auto max-w-7xl py-8">
	<div class="mb-8">
		<h1 class="flex items-center gap-2 text-3xl font-bold">
			<Shield class="h-8 w-8" />
			System Admin Dashboard
		</h1>
		<p class="text-muted-foreground mt-2">Manage users, organizations, and system settings</p>
	</div>

	<!-- Statistics Cards -->
	<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Total Users</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="flex items-center gap-2">
					<Users class="text-muted-foreground h-4 w-4" />
					<span class="text-2xl font-bold">{stats.totalUsers}</span>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Admin Users</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="flex items-center gap-2">
					<UserCheck class="text-muted-foreground h-4 w-4" />
					<span class="text-2xl font-bold">{stats.adminUsers}</span>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-sm font-medium">Banned Users</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="flex items-center gap-2">
					<UserX class="text-muted-foreground h-4 w-4" />
					<span class="text-2xl font-bold">{stats.bannedUsers}</span>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- User Management -->
	<Card>
		<CardHeader>
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<CardTitle>User Management</CardTitle>
					<CardDescription>View and manage all system users</CardDescription>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Dialog.Root
						bind:open={createDialogOpen}
						onOpenChange={(open) => {
							if (open) {
								prepareCreateDialog();
							} else {
								// Only reset state when closing, don't refresh
								resetCreateDialogState(false);
							}
						}}
					>
						<Dialog.Trigger class={buttonVariants({ variant: 'secondary' })}>
							<UserPlus class="mr-2 h-4 w-4" />
							Create User
						</Dialog.Trigger>
						<Dialog.Content class="sm:max-w-md">
							{#if !showCreateUserSuccess}
								<Dialog.Header>
									<Dialog.Title>Create User Account</Dialog.Title>
									<Dialog.Description>
										Provision a new account and share credentials directly with the user.
									</Dialog.Description>
								</Dialog.Header>
								<form
									method="POST"
									action="?/createUser"
									use:enhance={() => {
										isCreatingUser = true;
										createUserError = null;
										// Store the password value before form submission
										const submittedPassword = createPassword;
										return async ({ update }) => {
											await update();
											// Restore the password after update
											createPassword = submittedPassword;
											isCreatingUser = false;
										};
									}}
								>
									<div class="space-y-4">
										<div class="space-y-2">
											<Label for="create-email">Email Address</Label>
											<Input
												id="create-email"
												name="email"
												type="email"
												placeholder="user@example.com"
												bind:value={createEmail}
												required
												disabled={isCreatingUser}
											/>
										</div>
										<div class="space-y-2">
											<Label for="create-password">Temporary Password</Label>
											<div class="flex items-center gap-2">
												<Input
													id="create-password"
													name="password"
													type="text"
													bind:value={createPassword}
													required
													minlength={PASSWORD_MIN_LENGTH}
													disabled={isCreatingUser}
													class="font-mono"
												/>
												<CopyButton value={createPassword} />
												<Button
													type="button"
													variant="outline"
													onclick={() => (createPassword = generateRandomPassword())}
													disabled={isCreatingUser}
												>
													Regenerate
												</Button>
											</div>
											<p class="text-muted-foreground text-sm">
												Share this password with the user. They can change it after signing in.
											</p>
										</div>
										<div class="space-y-2">
											<Label for="create-role">Initial Role</Label>
											<input type="hidden" name="role" value={createRole} />
											<Select
												type="single"
												value={createRole}
												onValueChange={(value) => value && (createRole = value)}
												disabled={isCreatingUser}
											>
												<SelectTrigger id="create-role">
													<span class="capitalize">{createRole}</span>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="user">User</SelectItem>
													<SelectItem value="admin">Admin</SelectItem>
												</SelectContent>
											</Select>
										</div>
										{#if createUserError}
											<p class="text-destructive text-sm">{createUserError}</p>
										{/if}
									</div>
									<Dialog.Footer>
										<Button
											type="submit"
											disabled={isCreatingUser || !createEmail || !createPassword}
										>
											{isCreatingUser ? 'Creating User...' : 'Create User'}
										</Button>
									</Dialog.Footer>
								</form>
							{:else}
								<Dialog.Header>
									<Dialog.Title>User Created</Dialog.Title>
									<Dialog.Description>
										Share the details below with the user so they can sign in.
									</Dialog.Description>
								</Dialog.Header>
								<div class="space-y-4">
									<div class="space-y-2">
										<Label>Email</Label>
										<Input value={createEmail} readonly class="font-mono text-sm" />
									</div>
									<div class="space-y-2">
										<Label>Temporary Password</Label>
										<Input value={createPassword} readonly class="font-mono text-sm" />
										<p class="text-muted-foreground text-sm">
											Ask the user to update their password after their first sign in.
										</p>
									</div>
									{#if createdUserDetails?.role}
										<p class="text-muted-foreground text-sm">
											Assigned role: <span class="capitalize">{createdUserDetails.role}</span>
										</p>
									{/if}
									<div class="flex items-center gap-2 pt-2">
										<CopyButton value={`Email: ${createEmail}\nPassword: ${createPassword}`} />
										<span class="text-muted-foreground text-sm">Copy credentials</span>
									</div>
								</div>
								<Dialog.Footer>
									<Button
										type="button"
										onclick={async () => {
											createDialogOpen = false;
											resetCreateDialogState(true);
											// Clear form state and refresh page
											form = null;
											await goto('/admin/users', { invalidateAll: true });
										}}
									>
										Close
									</Button>
								</Dialog.Footer>
							{/if}
						</Dialog.Content>
					</Dialog.Root>
					<Dialog.Root
						bind:open={inviteDialogOpen}
						onOpenChange={(open) => !open && resetInviteDialog()}
					>
						<Dialog.Trigger class={buttonVariants({ variant: 'default' })}>
							<Mail class="mr-2 h-4 w-4" />
							Invite User
						</Dialog.Trigger>
						<Dialog.Content class="sm:max-w-md">
							{#if !showInvitationSuccess}
								<Dialog.Header>
									<Dialog.Title>Invite New User</Dialog.Title>
									<Dialog.Description>
										Create an invitation to join the platform. You'll receive a link to share with
										the new user.
									</Dialog.Description>
								</Dialog.Header>
								<form
									method="POST"
									action="?/createInvitation"
									use:enhance={() => {
										isCreatingInvitation = true;
										return async ({ update }) => {
											await update();
										};
									}}
								>
									<div class="space-y-4">
										<div class="space-y-2">
											<Label for="invite-email">Email Address</Label>
											<Input
												id="invite-email"
												name="email"
												type="email"
												placeholder="user@example.com"
												bind:value={inviteEmail}
												required
												disabled={isCreatingInvitation}
											/>
										</div>
										<div class="space-y-2">
											<Label for="invite-role">Initial Role</Label>
											<input type="hidden" name="role" value={inviteRole} />
											<Select
												type="single"
												value={inviteRole}
												onValueChange={(value) => value && (inviteRole = value)}
												disabled={isCreatingInvitation}
											>
												<SelectTrigger id="invite-role">
													<span class="capitalize">{inviteRole}</span>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="user">User</SelectItem>
													<SelectItem value="admin">Admin</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<Dialog.Footer>
										<Button
											type="submit"
											disabled={!inviteEmail || !inviteRole || isCreatingInvitation}
										>
											{isCreatingInvitation ? 'Creating Invitation...' : 'Create Invitation'}
										</Button>
									</Dialog.Footer>
								</form>
							{:else}
								<Dialog.Header>
									<Dialog.Title>Invitation Created</Dialog.Title>
									<Dialog.Description>
										The invitation has been created successfully. Share the link below with the
										user.
									</Dialog.Description>
								</Dialog.Header>
								<div class="space-y-4">
									<div class="space-y-2">
										<Label>Invitation Link</Label>
										<div class="flex items-center space-x-2">
											<Input value={invitationLink} readonly class="font-mono text-sm" />
											<CopyButton value={invitationLink} />
										</div>
										<p class="text-muted-foreground text-sm">
											This link will expire in {INVITATION_EXPIRY_SECONDS / 3600} hours. Share it with
											the user to complete their registration.
										</p>
										{#if invitationReplacedPrevious}
											<p class="text-muted-foreground text-sm">{REGENERATE_REPLACES_LINK_COPY}</p>
										{/if}
									</div>
								</div>
								<Dialog.Footer>
									<Button
										type="button"
										onclick={() => {
											inviteDialogOpen = false;
											resetInviteDialog();
										}}>Close</Button
									>
								</Dialog.Footer>
							{/if}
						</Dialog.Content>
					</Dialog.Root>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			<!-- Search -->
			<div class="mb-6">
				<Label for="search">Search Users</Label>
				<Input
					id="search"
					type="text"
					placeholder="Search by email, name, role (admin/user), or status (banned/enabled)..."
					bind:value={searchQuery}
					class="max-w-2xl"
				/>
				<p class="text-muted-foreground mt-1 text-sm">Search filters instantly as you type</p>
			</div>

			<!-- Users Table -->
			<div class="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Email</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>E-Mail Verified</TableHead>
							<TableHead>Login</TableHead>
							<TableHead>Created</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each filteredUsers as user}
							<TableRow>
								<TableCell>
									<div class="flex items-center gap-2">
										<span class="font-medium">{user.email}</span>
										{#if user.id === currentUser?.id}
											<Badge variant="secondary">You</Badge>
										{/if}
									</div>
								</TableCell>
								<TableCell>
									<span class="text-sm">{user.name || '-'}</span>
								</TableCell>
								<TableCell>
									{#if user.id !== currentUser?.id}
										<Select
											type="single"
											value={user.role || 'user'}
											onValueChange={(value) => value && updateUserRole(user.id, value)}
										>
											<SelectTrigger class="w-28">
												<span class="capitalize">{user.role || 'user'}</span>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="user">User</SelectItem>
												<SelectItem value="admin">Admin</SelectItem>
											</SelectContent>
										</Select>
									{:else}
										<Badge variant="outline" class="capitalize">{user.role || 'user'}</Badge>
									{/if}
								</TableCell>
								<TableCell>
									<div class="flex items-center gap-3">
										<Switch
											checked={user.emailVerified}
											disabled={Boolean(emailVerificationLoading[user.id])}
											aria-label={user.emailVerified
												? `Mark ${user.email} as unverified`
												: `Mark ${user.email} as verified`}
											onCheckedChange={(checked) =>
												updateEmailVerificationStatus(user.id, user.email, checked)}
										/>
										<div class="flex items-center gap-1 text-sm">
											{#if emailVerificationLoading[user.id]}
												<Loader2 class="text-muted-foreground h-4 w-4 animate-spin" />
												<span>Updating...</span>
											{:else if user.emailVerified}
												<UserCheck class="h-4 w-4 text-green-500" />
												<span>Verified</span>
											{:else}
												<UserX class="text-muted-foreground h-4 w-4" />
												<span>Unverified</span>
											{/if}
										</div>
									</div>
								</TableCell>
								<TableCell>
									{#if user.banned}
										<div class="space-y-1">
											<Badge variant="destructive">Banned</Badge>
											<p class="text-muted-foreground text-xs">{banTakesEffectCopy()}</p>
										</div>
									{:else}
										<Badge variant="outline">Enabled</Badge>
									{/if}
								</TableCell>
								<TableCell>
									{new Date(user.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell class="text-right">
									{#if user.id !== currentUser?.id}
										<div class="flex justify-end gap-2">
											<Button
												variant="outline"
												size="sm"
												onclick={() => {
													selectedUser = user;
													impersonateDialogOpen = true;
												}}
											>
												Impersonate
											</Button>
											{#if user.banned}
												<Button variant="outline" size="sm" onclick={() => unbanUser(user.id)}>
													Unban
												</Button>
											{:else}
												<Button
													variant="outline"
													size="sm"
													onclick={() => {
														selectedUser = user;
														banDialogOpen = true;
													}}
													class="text-warning hover:text-warning"
												>
													Ban
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="sm"
												onclick={() => {
													selectedUser = user;
													deleteDialogOpen = true;
												}}
												class="text-destructive hover:text-destructive"
											>
												Delete
											</Button>
										</div>
									{/if}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</CardContent>
	</Card>

	<!-- System Invitations -->
	<Card class="mt-8">
		<CardHeader>
			<CardTitle>System Invitations</CardTitle>
			<CardDescription>Track and manage pending invitations</CardDescription>
		</CardHeader>
		<CardContent>
			{#if invitations.length === 0}
				<div class="flex flex-col items-center justify-center py-8">
					<Mail class="text-muted-foreground mb-4 h-12 w-12" />
					<p class="text-muted-foreground">No invitations sent yet</p>
					<p class="text-muted-foreground text-sm">
						Click "Invite User" above to send your first invitation
					</p>
				</div>
			{:else}
				<div class="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Invited By</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead>Created</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each invitations as invitation}
								<TableRow>
									<TableCell class="font-medium">{invitation.email}</TableCell>
									<TableCell>
										<Badge variant={invitation.role === 'admin' ? 'destructive' : 'default'}>
											{invitation.role}
										</Badge>
									</TableCell>
									<TableCell>
										{#if invitation.status === 'accepted'}
											<Badge class="bg-green-500 text-white">Accepted</Badge>
										{:else if invitation.status === 'expired'}
											<Badge variant="secondary">Expired</Badge>
										{:else}
											<div class="flex items-center gap-2">
												<Clock class="h-4 w-4 text-yellow-500" />
												<Badge variant="outline">Pending</Badge>
											</div>
										{/if}
									</TableCell>
									<TableCell>
										<div>
											<p class="text-sm">{invitation.inviterName}</p>
											<p class="text-muted-foreground text-xs">{invitation.inviterEmail}</p>
										</div>
									</TableCell>
									<TableCell>
										{new Date(invitation.expiresAt).toLocaleDateString()}
									</TableCell>
									<TableCell>
										{new Date(invitation.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell>
										<div class="flex items-center gap-2">
											{#if invitation.status === 'accepted'}
												<span class="text-muted-foreground text-sm">Accepted</span>
											{:else if invitation.status === 'expired'}
												<span class="text-muted-foreground text-sm">Expired</span>
											{:else}
												{#if regeneratingInvitationId === invitation.id}
													<span class="text-muted-foreground text-sm">Regenerating...</span>
												{/if}
												<form
													method="POST"
													action="?/regenerateInvitation"
													use:enhance={() => {
														regeneratingInvitationId = invitation.id;
														return async ({ update }) => {
															await update();
														};
													}}
													class="inline-flex"
												>
													<!-- Only the id. The address comes from the invitation row on
													     the server; a form that carries both invites the two to
													     disagree (#407). -->
													<input type="hidden" name="invitationId" value={invitation.id} />
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger>
																<Button
																	type="submit"
																	variant="outline"
																	size="icon"
																	disabled={regeneratingInvitationId === invitation.id}
																>
																	<RefreshCw class="h-4 w-4" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>
																<p>{REGENERATE_REPLACES_LINK_COPY}</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</form>
											{/if}
										</div>
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<!-- Alert Dialogs -->
<AlertDialog bind:open={impersonateDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Impersonate User</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to impersonate {selectedUser?.email}? You will be logged in as this
				user and redirected to the home page.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={impersonateUser}>Impersonate</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<AlertDialog bind:open={banDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Ban User</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to ban {selectedUser?.email}? New sign-ins are blocked immediately.
				{banTakesEffectCopy()}
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={banUser} class={buttonVariants({ variant: 'destructive' })}>
				Ban User
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<AlertDialog bind:open={deleteDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete User</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to permanently delete {selectedUser?.email}? This action cannot be
				undone and will remove all associated data.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={removeUser} class={buttonVariants({ variant: 'destructive' })}>
				Delete User
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

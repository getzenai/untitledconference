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
	import { Shield, Users, UserX, UserCheck, Mail, Clock, RefreshCw } from 'lucide-svelte';
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

	// Handle form response
	$effect(() => {
		if (form?.success) {
			if (form?.invitationLink) {
				invitationLink = form.invitationLink;
				showInvitationSuccess = true;
				// Clear regenerating state
				regeneratingInvitationId = null;
			} else if (form?.message) {
				// Invitation created/regenerated but link generation timed out
				toast.success(form.message);
				inviteDialogOpen = false;
				resetInviteDialog();
				// Reload to show the new invitation in the list
				goto('/admin/users', { invalidateAll: true });
			}
			isCreatingInvitation = false;
			if (form?.invitationLink) {
				toast.success('Invitation link ready');
			}
		} else if (form?.error) {
			toast.error(form.error);
			isCreatingInvitation = false;
			regeneratingInvitationId = null;
		}
	});

	// Reset dialog state when closing
	function resetInviteDialog() {
		inviteDialogOpen = false;
		inviteEmail = '';
		inviteRole = 'user';
		invitationLink = '';
		showInvitationSuccess = false;
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
			<div class="flex items-center justify-between">
				<div>
					<CardTitle>User Management</CardTitle>
					<CardDescription>View and manage all system users</CardDescription>
				</div>
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
									Create an invitation to join the platform. You'll receive a link to share with the
									new user.
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
									The invitation has been created successfully. Share the link below with the user.
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
									{#if user.emailVerified}
										<UserCheck class="h-4 w-4 text-green-500" />
									{:else}
										<UserX class="text-muted-foreground h-4 w-4" />
									{/if}
								</TableCell>
								<TableCell>
									{#if user.banned}
										<Badge variant="destructive">Banned</Badge>
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
														return async ({ result, update }) => {
															if (result.type === 'success') {
																const data = result.data as ActionData;
																if (data?.invitationLink) {
																	invitationLink = data.invitationLink;
																	showInvitationSuccess = true;
																	inviteDialogOpen = true;
																}
															} else if (result.type === 'failure') {
																const data = result.data as { error?: string };
																toast.error(data?.error || 'Failed to regenerate invitation');
															}
															regeneratingInvitationId = null;
															await update();
														};
													}}
													class="inline-flex"
												>
													<input type="hidden" name="invitationId" value={invitation.id} />
													<input type="hidden" name="email" value={invitation.email} />
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
																<p>Generate new invitation link</p>
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
				Are you sure you want to ban {selectedUser?.email}? This user will no longer be able to
				access the platform.
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

<script lang="ts">
	import { onMount } from 'svelte';
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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { Shield, Users, Building, UserX, UserCheck } from 'lucide-svelte';
	import { goto } from '$app/navigation';

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

	interface Organization {
		id: string;
		name: string;
		slug: string | null;
		createdAt: Date;
		memberCount?: number;
	}

	let currentUser: User | null = null;
	let isAdmin = false;
	let users: User[] = [];
	let organizations: Organization[] = [];
	let isLoading = true;
	let searchQuery = '';
	let selectedRole = 'all';
	let stats = {
		totalUsers: 0,
		totalOrganizations: 0,
		bannedUsers: 0,
		adminUsers: 0
	};

	onMount(async () => {
		await checkAdminAccess();
	});

	async function checkAdminAccess() {
		try {
			const { data: session } = await authClient.getSession();
			if (!session?.user) {
				await goto('/login');
				return;
			}

			currentUser = session.user as User;
			isAdmin = currentUser.role === 'admin';

			if (!isAdmin) {
				toast.error('Access denied. Admin privileges required.');
				await goto('/home');
				return;
			}

			await loadAdminData();
		} catch (error) {
			console.error('Error checking admin access:', error);
			toast.error('Failed to verify admin access');
			await goto('/home');
		}
	}

	async function loadAdminData() {
		isLoading = true;
		try {
			// Load users
			const usersResult = await authClient.admin.listUsers({
				query: {
					limit: 100,
					searchField: searchQuery ? 'email' : undefined,
					searchValue: searchQuery || undefined
				}
			});

			if (usersResult.data) {
				users = (usersResult.data.users || []) as User[];

				// Calculate stats
				stats.totalUsers = users.length;
				stats.bannedUsers = users.filter((u) => u.banned).length;
				stats.adminUsers = users.filter((u) => u.role === 'admin').length;
			}

			// For now, we'll simulate organization data
			// In a real implementation, you'd fetch this from your API
			organizations = [];
			stats.totalOrganizations = organizations.length;
		} catch (error) {
			console.error('Error loading admin data:', error);
			toast.error('Failed to load admin data');
		} finally {
			isLoading = false;
		}
	}

	async function updateUserRole(userId: string, newRole: string) {
		try {
			await authClient.admin.setRole({
				userId,
				role: newRole as 'user' | 'admin'
			});
			toast.success('User role updated successfully');
			await loadAdminData();
		} catch (error) {
			console.error('Error updating user role:', error);
			toast.error('Failed to update user role');
		}
	}

	async function banUser(userId: string) {
		if (!confirm('Are you sure you want to ban this user?')) return;

		try {
			await authClient.admin.banUser({
				userId,
				banReason: 'Banned by administrator'
			});
			toast.success('User banned successfully');
			await loadAdminData();
		} catch (error) {
			console.error('Error banning user:', error);
			toast.error('Failed to ban user');
		}
	}

	async function unbanUser(userId: string) {
		try {
			await authClient.admin.unbanUser({
				userId
			});
			toast.success('User unbanned successfully');
			await loadAdminData();
		} catch (error) {
			console.error('Error unbanning user:', error);
			toast.error('Failed to unban user');
		}
	}

	async function removeUser(userId: string) {
		if (
			!confirm(
				'Are you sure you want to permanently delete this user? This action cannot be undone.'
			)
		)
			return;

		try {
			await authClient.admin.removeUser({
				userId
			});
			toast.success('User removed successfully');
			await loadAdminData();
		} catch (error) {
			console.error('Error removing user:', error);
			toast.error('Failed to remove user');
		}
	}

	async function searchUsers() {
		await loadAdminData();
	}

	$: filteredUsers = users.filter((user) => {
		if (selectedRole !== 'all' && user.role !== selectedRole) return false;
		return true;
	});
</script>

<div class="container mx-auto max-w-7xl py-8">
	<div class="mb-8">
		<h1 class="flex items-center gap-2 text-3xl font-bold">
			<Shield class="h-8 w-8" />
			System Admin Dashboard
		</h1>
		<p class="text-muted-foreground mt-2">Manage users, organizations, and system settings</p>
	</div>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<p class="text-muted-foreground">Loading admin dashboard...</p>
		</div>
	{:else if !isAdmin}
		<Card>
			<CardContent class="pt-6">
				<p class="text-destructive">Access denied. Admin privileges required.</p>
			</CardContent>
		</Card>
	{:else}
		<!-- Statistics Cards -->
		<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
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
					<CardTitle class="text-sm font-medium">Organizations</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex items-center gap-2">
						<Building class="text-muted-foreground h-4 w-4" />
						<span class="text-2xl font-bold">{stats.totalOrganizations}</span>
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
				<CardTitle>User Management</CardTitle>
				<CardDescription>View and manage all system users</CardDescription>
			</CardHeader>
			<CardContent>
				<!-- Search and Filters -->
				<div class="mb-6 flex gap-4">
					<div class="flex-1">
						<Label for="search">Search Users</Label>
						<div class="flex gap-2">
							<Input
								id="search"
								type="text"
								placeholder="Search by email..."
								bind:value={searchQuery}
								onkeydown={(e) => e.key === 'Enter' && searchUsers()}
							/>
							<Button onclick={searchUsers}>Search</Button>
						</div>
					</div>
					<div class="w-48">
						<Label for="roleFilter">Filter by Role</Label>
						<Select
							type="single"
							value={selectedRole}
							onValueChange={(v) => (selectedRole = v || 'all')}
						>
							<SelectTrigger id="roleFilter">
								<span class="capitalize">{selectedRole === 'all' ? 'All Roles' : selectedRole}</span
								>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Roles</SelectItem>
								<SelectItem value="user">User</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<!-- Users Table -->
				<div class="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
								<TableHead class="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each filteredUsers as user}
								<TableRow>
									<TableCell>
										<div class="font-medium">
											{user.name || 'Unnamed User'}
											{#if user.id === currentUser?.id}
												<Badge variant="secondary" class="ml-2">You</Badge>
											{/if}
										</div>
									</TableCell>
									<TableCell>
										<div class="flex items-center gap-2">
											{user.email}
											{#if user.emailVerified}
												<Badge variant="outline" class="text-xs">Verified</Badge>
											{/if}
										</div>
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
										{#if user.banned}
											<Badge variant="destructive">Banned</Badge>
										{:else}
											<Badge variant="outline">Active</Badge>
										{/if}
									</TableCell>
									<TableCell>
										{new Date(user.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell class="text-right">
										{#if user.id !== currentUser?.id}
											<div class="flex justify-end gap-2">
												{#if user.banned}
													<Button variant="outline" size="sm" onclick={() => unbanUser(user.id)}>
														Unban
													</Button>
												{:else}
													<Button
														variant="outline"
														size="sm"
														onclick={() => banUser(user.id)}
														class="text-warning hover:text-warning"
													>
														Ban
													</Button>
												{/if}
												<Button
													variant="ghost"
													size="sm"
													onclick={() => removeUser(user.id)}
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

		<!-- Organizations Overview -->
		{#if organizations.length > 0}
			<Card class="mt-8">
				<CardHeader>
					<CardTitle>Organizations Overview</CardTitle>
					<CardDescription>View all organizations in the system</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization Name</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Members</TableHead>
								<TableHead>Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each organizations as org}
								<TableRow>
									<TableCell class="font-medium">{org.name}</TableCell>
									<TableCell>{org.slug || '-'}</TableCell>
									<TableCell>{org.memberCount || 0}</TableCell>
									<TableCell>{new Date(org.createdAt).toLocaleDateString()}</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

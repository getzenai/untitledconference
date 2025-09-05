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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { Shield, Users, UserX, UserCheck } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	interface User {
		id: string;
		name: string | null;
		email: string;
		role: string | null;
		banned: boolean | null;
		banReason: string | null;
		createdAt: Date;
		emailVerified: boolean;
		organizations?: Array<{
			id: string;
			name: string;
			slug: string | null;
			memberRole: string;
		}>;
	}

	// All data comes from server
	let currentUser = data.currentUser as User;
	let users: User[] = data.users as User[];
	let stats = data.stats;
	let searchQuery = '';

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

	async function impersonateUser(userId: string, userEmail: string) {
		if (!confirm(`Are you sure you want to impersonate ${userEmail}?`)) return;

		try {
			await authClient.admin.impersonateUser({
				userId
			});
			toast.success(`Now impersonating ${userEmail}`);
			// Redirect and invalidate all data to refresh the session
			await goto('/home', { invalidateAll: true });
		} catch (error) {
			console.error('Error impersonating user:', error);
			toast.error('Failed to impersonate user');
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

	// Reactive filtering - updates instantly as you type
	$: filteredUsers = users.filter((user) => {
		// Search across multiple fields
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			const matchesEmail = user.email?.toLowerCase().includes(query);
			const matchesName = user.name?.toLowerCase().includes(query);
			const matchesRole = user.role?.toLowerCase().includes(query);
			const matchesOrg = user.organizations?.some((org) => org.name.toLowerCase().includes(query));
			const matchesBanned =
				(query === 'banned' && user.banned) || (query === 'enabled' && !user.banned);

			return matchesEmail || matchesName || matchesRole || matchesOrg || matchesBanned;
		}

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
			<CardTitle>User Management</CardTitle>
			<CardDescription>View and manage all system users</CardDescription>
		</CardHeader>
		<CardContent>
			<!-- Search -->
			<div class="mb-6">
				<Label for="search">Search Users</Label>
				<Input
					id="search"
					type="text"
					placeholder="Search by email, name, organization, role (admin/user), or status (banned/enabled)..."
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
							<TableHead>Organization</TableHead>
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
									{#if user.organizations && user.organizations.length > 0}
										<div class="flex flex-col gap-1">
											{#each user.organizations as org}
												<div class="flex items-center gap-1">
													<span class="text-sm">{org.name}</span>
													{#if org.memberRole === 'admin'}
														<Badge variant="outline" class="text-xs">Admin</Badge>
													{/if}
												</div>
											{/each}
										</div>
									{:else}
										<span class="text-muted-foreground text-sm">No organization</span>
									{/if}
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
												onclick={() => impersonateUser(user.id, user.email)}
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
</div>

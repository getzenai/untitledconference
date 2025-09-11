<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Copy, Trash2, UserPlus, LogOut, AlertTriangle, Mail, Check, X } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let inviteEmail = '';
	let inviteRole = 'member';
	let isInviting = false;
	let organizationName = '';
	let isCreatingOrg = false;
	let createOrgError = '';
	let showLeaveDialog = false;
	let selectedNewOwner = '';
	let isLeavingOrg = false;

	$: organization = data.organization;
	$: members = data.members || [];
	$: invitations = data.invitations || [];
	$: currentMember = data.currentMember;
	$: userInvitations = data.userInvitations || [];

	$: if (form?.success && form?.invitationId) {
		const invitationLink = `${$page.url.origin}/invite/${form.invitationId}`;
		navigator.clipboard.writeText(invitationLink);
		toast.success('Invitation created and link copied to clipboard');
		inviteEmail = '';
	} else if (form?.success && form?.leftOrganization) {
		toast.success('Successfully left the organization');
		// Refresh the page or redirect
		invalidateAll();
	} else if (form?.success && form?.acceptedInvitation) {
		toast.success('Successfully joined the organization');
		// Refresh to load the new organization
		invalidateAll();
	} else if (form?.success && form?.rejectedInvitation) {
		toast.success('Invitation rejected');
		invalidateAll();
	} else if (form?.error) {
		if ((form as Record<string, unknown>).needsOwnerTransfer) {
			// Show dialog to select new owner
			showLeaveDialog = true;
		} else {
			toast.error(form.error);
		}
	}

	function isAdmin(member: typeof currentMember): boolean {
		return member?.role === 'admin' || member?.role === 'owner';
	}

	async function copyInvitationLink(invitationId: string) {
		const invitationLink = `${$page.url.origin}/invite/${invitationId}`;
		await navigator.clipboard.writeText(invitationLink);
		toast.success('Invitation link copied to clipboard');
	}

	async function createOrganization() {
		if (!organizationName.trim()) {
			createOrgError = 'Please enter an organization name';
			return;
		}

		isCreatingOrg = true;
		createOrgError = '';

		try {
			// Generate base slug from organization name
			const baseSlug = organizationName
				.trim()
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '');

			let slug = baseSlug;
			let attempts = 0;
			const maxAttempts = 10;
			let orgData = null;
			let lastError = null;

			// Try to create organization with unique slug
			while (attempts < maxAttempts) {
				const { data, error: orgError } = await authClient.organization.create({
					name: organizationName.trim(),
					slug: slug
				});

				if (data) {
					orgData = data;
					break;
				}

				if (orgError) {
					// Check if error is due to duplicate slug
					if (
						orgError.message?.toLowerCase().includes('already exists') ||
						orgError.message?.toLowerCase().includes('duplicate') ||
						orgError.message?.toLowerCase().includes('unique')
					) {
						// Try with a different slug
						attempts++;
						// Add random suffix for uniqueness
						const randomSuffix = Math.random().toString(36).substring(2, 8);
						slug = `${baseSlug}-${randomSuffix}`;
						lastError = null; // Clear error for retry
					} else {
						// Other error, stop trying
						lastError = orgError;
						break;
					}
				}
			}

			if (orgData) {
				// Set the new organization as active
				await authClient.organization.setActive({
					organizationId: orgData.id
				});

				toast.success('Organization created successfully!');
				// Refresh the page to load the new organization data
				await invalidateAll();
			} else if (lastError) {
				createOrgError = lastError.message || 'Failed to create organization';
			} else {
				createOrgError = 'Unable to create organization. Please try a different name.';
			}
		} catch (error) {
			console.error('Error creating organization:', error);
			createOrgError = 'An unexpected error occurred while creating the organization';
		} finally {
			isCreatingOrg = false;
		}
	}
</script>

<div class="container mx-auto max-w-6xl py-8">
	<h1 class="mb-8 text-3xl font-bold">Organization Settings</h1>

	{#if !organization}
		<!-- Pending Invitations -->
		{#if userInvitations && userInvitations.length > 0}
			<Card class="mb-8">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Mail class="h-5 w-5" />
						Pending Invitations
					</CardTitle>
					<CardDescription>
						You have been invited to join the following organizations
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="space-y-4">
						{#each userInvitations as invitation}
							<div class="flex items-center justify-between rounded-lg border p-4">
								<div class="space-y-1">
									<p class="font-medium">
										{invitation.organizationName || 'Unknown Organization'}
									</p>
									<p class="text-muted-foreground text-sm">
										Role: <Badge variant="outline" class="ml-1">{invitation.role || 'member'}</Badge
										>
									</p>
									<p class="text-muted-foreground text-sm">
										Invited by: {invitation.inviterEmail || 'Unknown'}
									</p>
									{#if invitation.expiresAt}
										<p class="text-muted-foreground text-sm">
											Expires: {new Date(
												invitation.expiresAt as string | number | Date
											).toLocaleDateString()}
										</p>
									{/if}
								</div>
								<div class="flex gap-2">
									<form
										method="POST"
										action="?/acceptInvitation"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
											};
										}}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button type="submit" size="sm" class="gap-2">
											<Check class="h-4 w-4" />
											Accept
										</Button>
									</form>
									<form
										method="POST"
										action="?/rejectInvitation"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
											};
										}}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button type="submit" variant="outline" size="sm" class="gap-2">
											<X class="h-4 w-4" />
											Reject
										</Button>
									</form>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Create Organization -->
		<Card>
			<CardHeader>
				<CardTitle>Create Your Organization</CardTitle>
				<CardDescription>
					{#if userInvitations && userInvitations.length > 0}
						Or create your own organization to get started
					{:else}
						You're not currently part of any organization. Create one to get started.
					{/if}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					<div>
						<Label for="orgName">Organization Name</Label>
						<Input
							id="orgName"
							type="text"
							placeholder="My Organization"
							bind:value={organizationName}
							disabled={isCreatingOrg}
							required
						/>
						<p class="text-muted-foreground mt-2 text-sm">
							You'll be the owner of this organization and can invite other members.
						</p>
					</div>

					{#if createOrgError}
						<div class="text-destructive text-sm">{createOrgError}</div>
					{/if}

					<Button
						onclick={createOrganization}
						disabled={isCreatingOrg || !organizationName.trim()}
						class="w-full"
					>
						{#if isCreatingOrg}
							Creating...
						{:else}
							Create Organization
						{/if}
					</Button>
				</div>
			</CardContent>
		</Card>
	{:else}
		<!-- Organization Details -->
		<Card class="mb-8">
			<CardHeader>
				<CardTitle>Organization Details</CardTitle>
				<CardDescription>Manage your organization information</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div>
					<Label>Organization Name</Label>
					<p class="text-lg font-medium">{organization.name}</p>
				</div>
				{#if organization.slug}
					<div>
						<Label>Organization Slug</Label>
						<p class="text-muted-foreground text-sm">{organization.slug}</p>
					</div>
				{/if}
				<div>
					<Label>Your Role</Label>
					<Badge variant="outline" class="badge mt-1">
						{currentMember?.role || 'Unknown'}
					</Badge>
				</div>
				<div class="flex items-center justify-between border-t pt-4">
					<div>
						<Label>Leave Organization</Label>
						<p class="text-muted-foreground text-sm">
							{#if currentMember?.role === 'owner' && members.length > 1}
								Transfer ownership before leaving
							{:else if members.length === 1}
								This will delete the organization
							{:else}
								Remove yourself from this organization
							{/if}
						</p>
					</div>
					<Button
						variant="destructive"
						size="sm"
						onclick={() => (showLeaveDialog = true)}
						class="gap-2"
					>
						<LogOut class="h-4 w-4" />
						Leave Organization
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Leave Organization Dialog -->
		{#if showLeaveDialog}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
				<Card class="w-full max-w-md">
					<CardHeader>
						<CardTitle class="flex items-center gap-2">
							<AlertTriangle class="text-destructive h-5 w-5" />
							Leave Organization
						</CardTitle>
						<CardDescription>
							{#if currentMember?.role === 'owner' && members.length > 1}
								As the owner, you must transfer ownership to another member before leaving.
							{:else if members.length === 1}
								You are the only member. Leaving will delete this organization permanently.
							{:else}
								Are you sure you want to leave this organization?
							{/if}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{#if currentMember?.role === 'owner' && members.length > 1}
							<div class="space-y-4">
								<div>
									<Label for="newOwner">Select New Owner</Label>
									<Select
										type="single"
										bind:value={selectedNewOwner}
										onValueChange={(v) => (selectedNewOwner = v || '')}
									>
										<SelectTrigger id="newOwner">
											<span>
												{#if selectedNewOwner}
													{members.find((m) => m.id === selectedNewOwner)?.user?.email ||
														'Select member'}
												{:else}
													Select member
												{/if}
											</span>
										</SelectTrigger>
										<SelectContent>
											{#each members.filter((m) => m.userId !== $page.data.user?.id) as member}
												<SelectItem value={member.id}>
													{member.user?.email}
													{#if member.role === 'admin'}
														<span class="text-muted-foreground ml-1">(Admin)</span>
													{/if}
												</SelectItem>
											{/each}
										</SelectContent>
									</Select>
								</div>
							</div>
						{/if}

						<div class="mt-6 flex gap-2">
							<Button
								variant="outline"
								onclick={() => {
									showLeaveDialog = false;
									selectedNewOwner = '';
								}}
								disabled={isLeavingOrg}
								class="flex-1"
							>
								Cancel
							</Button>
							<form
								method="POST"
								action="?/leaveOrganization"
								use:enhance={() => {
									isLeavingOrg = true;
									return async ({ update }) => {
										await update();
										isLeavingOrg = false;
										showLeaveDialog = false;
										selectedNewOwner = '';
									};
								}}
								class="flex-1"
							>
								<input type="hidden" name="organizationId" value={organization.id} />
								{#if selectedNewOwner}
									<input type="hidden" name="newOwnerId" value={selectedNewOwner} />
								{/if}
								<Button
									type="submit"
									variant="destructive"
									disabled={isLeavingOrg ||
										(currentMember?.role === 'owner' && members.length > 1 && !selectedNewOwner)}
									class="w-full"
								>
									{#if isLeavingOrg}
										Leaving...
									{:else if members.length === 1}
										Delete & Leave
									{:else}
										Leave Organization
									{/if}
								</Button>
							</form>
						</div>
					</CardContent>
				</Card>
			</div>
		{/if}

		<!-- Invite Members -->
		{#if isAdmin(currentMember)}
			<Card class="mb-8">
				<CardHeader>
					<CardTitle>Invite Members</CardTitle>
					<CardDescription>Invite new members to your organization</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						method="POST"
						action="?/inviteMember"
						use:enhance={() => {
							isInviting = true;
							return async ({ update }) => {
								await update();
								isInviting = false;
								await invalidateAll();
							};
						}}
					>
						<input type="hidden" name="organizationId" value={organization.id} />
						<div class="flex gap-4">
							<div class="flex-1">
								<Label for="inviteEmail">Email Address</Label>
								<Input
									id="inviteEmail"
									name="email"
									type="email"
									placeholder="member@example.com"
									bind:value={inviteEmail}
									disabled={isInviting}
									required
								/>
							</div>
							<div class="w-32">
								<Label for="inviteRole">Role</Label>
								<Select
									type="single"
									value={inviteRole}
									onValueChange={(v) => (inviteRole = v || 'member')}
									disabled={isInviting}
								>
									<SelectTrigger id="inviteRole">
										<span class="capitalize">{inviteRole}</span>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="member">Member</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
										{#if currentMember?.role === 'owner'}
											<SelectItem value="owner">Owner</SelectItem>
										{/if}
									</SelectContent>
								</Select>
								<!-- Hidden native select for testing purposes -->
								<select
									class="sr-only"
									bind:value={inviteRole}
									disabled={isInviting}
									aria-label="Role for testing"
								>
									<option value="member">Member</option>
									<option value="admin">Admin</option>
									{#if currentMember?.role === 'owner'}
										<option value="owner">Owner</option>
									{/if}
								</select>
								<input type="hidden" name="role" value={inviteRole} />
							</div>
							<div class="flex items-end">
								<Button type="submit" disabled={isInviting || !inviteEmail} class="gap-2">
									<UserPlus class="h-4 w-4" />
									Invite
								</Button>
							</div>
						</div>
					</form>
				</CardContent>
			</Card>
		{/if}

		<!-- Members List -->
		<Card class="mb-8">
			<CardHeader>
				<CardTitle>Members</CardTitle>
				<CardDescription>View and manage organization members</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							{#if isAdmin(currentMember)}
								<TableHead class="text-right">Actions</TableHead>
							{/if}
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each members as member}
							<TableRow>
								<TableCell>
									{member.user?.email}
									{#if member.userId === $page.data.user?.id}
										<Badge variant="secondary" class="badge ml-2">You</Badge>
									{/if}
								</TableCell>
								<TableCell>
									{#if isAdmin(currentMember) && member.userId !== $page.data.user?.id && currentMember?.role === 'owner'}
										<form
											id={`update-role-${member.id}`}
											method="POST"
											action="?/updateMemberRole"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													await invalidateAll();
												};
											}}
										>
											<input type="hidden" name="organizationId" value={organization.id} />
											<input type="hidden" name="memberId" value={member.id} />
											<input type="hidden" name="role" value={member.role} />
											<Select
												type="single"
												value={member.role}
												onValueChange={(value) => {
													if (value) {
														const form = document.getElementById(`update-role-${member.id}`);
														const roleInput = form?.querySelector(
															'input[name="role"]'
														) as HTMLInputElement;
														if (roleInput) {
															roleInput.value = value;
															(form as HTMLFormElement)?.requestSubmit();
														}
													}
												}}
											>
												<SelectTrigger class="w-32">
													<span class="capitalize">{member.role}</span>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="member">Member</SelectItem>
													<SelectItem value="admin">Admin</SelectItem>
													<SelectItem value="owner">Owner</SelectItem>
												</SelectContent>
											</Select>
										</form>
									{:else}
										<Badge variant="outline" class="badge">{member.role}</Badge>
									{/if}
								</TableCell>
								{#if isAdmin(currentMember)}
									<TableCell class="text-right">
										{#if member.userId !== $page.data.user?.id && currentMember?.role === 'owner'}
											<form
												method="POST"
												action="?/removeMember"
												use:enhance={() => {
													if (!confirm('Are you sure you want to remove this member?')) {
														return async () => {};
													}
													return async ({ update }) => {
														await update();
														await invalidateAll();
													};
												}}
												class="inline"
											>
												<input type="hidden" name="organizationId" value={organization.id} />
												<input type="hidden" name="memberId" value={member.id} />
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													class="text-destructive hover:text-destructive"
												>
													<Trash2 class="h-4 w-4" />
												</Button>
											</form>
										{/if}
									</TableCell>
								{/if}
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</CardContent>
		</Card>

		<!-- Pending Invitations -->
		{#if isAdmin(currentMember) && invitations.length > 0}
			<Card>
				<CardHeader>
					<CardTitle>Pending Invitations</CardTitle>
					<CardDescription>Manage pending invitations</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead class="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each invitations as invitation}
								<TableRow>
									<TableCell>{invitation.email}</TableCell>
									<TableCell>
										<Badge variant="outline" class="badge">{invitation.role || 'member'}</Badge>
									</TableCell>
									<TableCell>
										<Badge
											variant={invitation.status === 'pending' ? 'secondary' : 'outline'}
											class="badge"
										>
											{invitation.status}
										</Badge>
									</TableCell>
									<TableCell>
										{new Date(invitation.expiresAt as string | number | Date).toLocaleDateString()}
									</TableCell>
									<TableCell class="text-right">
										<div class="flex items-center justify-end gap-2">
											<Button
												variant="ghost"
												size="sm"
												onclick={() => copyInvitationLink(invitation.id as string)}
												class="gap-1"
											>
												<Copy class="h-4 w-4" />
												Copy Link
											</Button>
											<form
												method="POST"
												action="?/cancelInvitation"
												use:enhance={() => {
													return async ({ update }) => {
														await update();
														await invalidateAll();
													};
												}}
												class="inline"
											>
												<input type="hidden" name="invitationId" value={invitation.id} />
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													class="text-destructive hover:text-destructive"
												>
													<Trash2 class="h-4 w-4" />
												</Button>
											</form>
										</div>
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

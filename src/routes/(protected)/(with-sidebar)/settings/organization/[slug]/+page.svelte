<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$lib/forms/enhance';
	import { formatStoredDay } from '$lib/components/app/date-value';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
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
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Copy, Trash2, UserPlus, LogOut, AlertTriangle } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import AiBackendCard from './ai-backend-card.svelte';

	let { data, form } = $props();

	let inviteEmail = $state('');
	let inviteRole = $state('member');
	let isInviting = $state(false);
	let showLeaveDialog = $state(false);
	let selectedNewOwner = $state('');
	let isLeavingOrg = $state(false);
	let isRenaming = $state(false);
	let nameDirty = $state(false);
	let nameCommit = $state(0);
	let confirmName = $state('');
	let isDeleting = $state(false);

	let organization = $derived(data.organization);
	let members = $derived(data.members || []);
	let invitations = $derived(data.invitations || []);
	let currentMember = $derived(data.currentMember);
	// Deleting is the owner's alone, and only once nothing hangs off the
	// organization — every one of these cascades if it goes (#777).
	let isOwner = $derived(currentMember?.role === 'owner');
	let conferenceCount = $derived(data.conferenceCount ?? 0);
	let otherMembers = $derived(members.filter((m) => m.userId !== currentMember?.userId).length);
	let pendingInvitations = $derived(invitations.length);
	let isLastMember = $derived(members.length === 1);
	let deleteBlockers = $derived(
		[
			conferenceCount > 0
				? `${conferenceCount} event${conferenceCount === 1 ? '' : 's'} — deleting would take every submission, review and agenda with them`
				: null,
			otherMembers > 0 ? `${otherMembers} other member${otherMembers === 1 ? '' : 's'}` : null,
			pendingInvitations > 0
				? `${pendingInvitations} pending invitation${pendingInvitations === 1 ? '' : 's'}`
				: null
		].filter((entry): entry is string => entry !== null)
	);
	let canDelete = $derived(isOwner && deleteBlockers.length === 0);

	let pageTitle = $derived(
		organization?.name ? `${organization.name} — Organization settings` : 'Organization settings'
	);

	$effect(() => {
		if (form?.success && (form as Record<string, unknown>).renamed) {
			toast.success('Organization renamed');
		} else if (form?.success && form?.invitationId) {
			const invitationLink = `${page.url.origin}/invite/${form.invitationId}`;
			navigator.clipboard.writeText(invitationLink);
			toast.success('Invitation created and link copied to clipboard');
			inviteEmail = '';
		} else if (form?.error) {
			if ((form as Record<string, unknown>).needsOwnerTransfer) {
				showLeaveDialog = true;
			} else {
				toast.error(form.error);
			}
		}
	});

	function isAdmin(member: typeof currentMember): boolean {
		return member?.role === 'admin' || member?.role === 'owner';
	}

	async function copyInvitationLink(invitationId: string) {
		const invitationLink = `${page.url.origin}/invite/${invitationId}`;
		await navigator.clipboard.writeText(invitationLink);
		toast.success('Invitation link copied to clipboard');
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<UnsavedGuard dirty={nameDirty} />

<div class="container mx-auto max-w-6xl py-8">
	<h1 class="mb-8 text-3xl font-bold">{organization?.name || 'Organization'}</h1>

	<!-- Organization Details -->
	<Card class="mb-8">
		<CardHeader>
			<CardTitle>Organization Details</CardTitle>
			<CardDescription>Manage your organization information</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if isAdmin(currentMember)}
				<form
					method="POST"
					action="?/renameOrganization"
					use:enhance={() => {
						isRenaming = true;
						return async ({ result, update }) => {
							await update(formUpdateOptions('edit'));
							await invalidateAll();
							// Zod trims the name, so value === baseline is not a reliable
							// success signal. Clear the parked copy only when Save kept it.
							if (result.type === 'success') nameCommit += 1;
							isRenaming = false;
						};
					}}
					class="space-y-2"
				>
					<Label for="organization-name">Organization Name</Label>
					<input type="hidden" name="organizationId" value={organization?.id} />
					<div class="flex gap-2">
						{#key organization?.id}
							<BrowserDraftInput
								id="organization-name"
								name="name"
								scope={`organization-name:${organization?.id ?? ''}`}
								owner={data.user.id}
								baseline={organization?.name ?? ''}
								required
								class="max-w-sm"
								testId="organization-name"
								commitToken={nameCommit}
								ondirtychange={(dirty) => (nameDirty = dirty)}
							/>
						{/key}
						<Button type="submit" variant="outline" disabled={isRenaming}>
							{isRenaming ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</form>
			{:else}
				<div>
					<Label>Organization Name</Label>
					<p class="text-lg font-medium">{organization?.name}</p>
				</div>
			{/if}
			{#if organization?.slug}
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
					<p class="text-muted-foreground text-sm" data-testid="leave-description">
						{#if isLastMember}
							<!--
								It used to say "This will delete the organization". It did not:
								leaving removed the membership row and left the organization
								behind with nobody in it (#777).
							-->
							You are the only member. Leaving would leave this organization with nobody in it — delete
							it below instead.
						{:else if currentMember?.role === 'owner'}
							Transfer ownership before leaving
						{:else}
							Remove yourself from this organization
						{/if}
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					disabled={isLastMember}
					onclick={() => (showLeaveDialog = true)}
					data-testid="leave-organization"
					class="gap-2"
				>
					<LogOut class="h-4 w-4" />
					Leave Organization
				</Button>
			</div>
		</CardContent>
	</Card>

	<AiBackendCard
		organizationId={organization?.id ?? ''}
		canEdit={isAdmin(currentMember)}
		settings={data.aiSettings ?? { configured: false }}
		{form}
	/>

	{#if isOwner}
		<Card class="border-status-bad/40" data-testid="organization-delete-card">
			<CardHeader>
				<CardTitle class="text-status-bad flex items-center gap-2">
					<AlertTriangle class="h-4 w-4" />
					Delete organization
				</CardTitle>
				<CardDescription>
					This removes the organization and everything owned by it — contacts, speaker profiles and
					its chat backend. It cannot be undone.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if deleteBlockers.length > 0}
					<div class="border-border rounded-md border p-3 text-sm" data-testid="delete-blockers">
						<p class="font-medium">Clear these first:</p>
						<ul class="text-muted-foreground mt-1 list-disc space-y-1 pl-5">
							{#each deleteBlockers as blocker (blocker)}
								<li>{blocker}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<form
					method="POST"
					action="?/deleteOrganization"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							isDeleting = false;
						};
					}}
					class="space-y-3"
				>
					<input type="hidden" name="organizationId" value={organization?.id ?? ''} />
					<div>
						<Label for="confirmName">
							Type <span class="font-mono">{organization?.name}</span> to confirm
							<!--
								Two organizations may share a name, so the name alone confirms
								intent but not *which* one. The slug is the part that cannot
								repeat, and this is the most destructive button in the app.
							-->
							<span class="text-muted-foreground mt-0.5 block text-xs font-normal">
								This deletes <span class="font-mono">{organization?.slug}</span>. Names can repeat;
								the address cannot.
							</span>
						</Label>
						<Input
							id="confirmName"
							name="confirmName"
							bind:value={confirmName}
							disabled={!canDelete}
							autocomplete="off"
							data-testid="delete-confirm-name"
							class="mt-1"
						/>
					</div>
					<Button
						type="submit"
						variant="destructive"
						size="sm"
						disabled={!canDelete || isDeleting || confirmName !== organization?.name}
						data-testid="delete-organization"
					>
						<Trash2 class="mr-2 h-4 w-4" />
						{isDeleting ? 'Deleting…' : 'Delete this organization'}
					</Button>
				</form>
			</CardContent>
		</Card>
	{/if}

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
								<Select.Root
									type="single"
									bind:value={selectedNewOwner}
									onValueChange={(v) => (selectedNewOwner = v || '')}
								>
									<Select.Trigger id="newOwner">
										<span>
											{#if selectedNewOwner}
												{members.find((m) => m.id === selectedNewOwner)?.user?.email ||
													'Select member'}
											{:else}
												Select member
											{/if}
										</span>
									</Select.Trigger>
									<Select.Content>
										{#each members.filter((m) => m.userId !== data.user?.id) as member}
											<Select.Item value={member.id}>
												{member.user?.email}
												{#if member.role === 'admin'}
													<span class="text-muted-foreground ml-1">(Admin)</span>
												{/if}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
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
									await update(formUpdateOptions('edit'));
									isLeavingOrg = false;
									showLeaveDialog = false;
									selectedNewOwner = '';
								};
							}}
							class="flex-1"
						>
							<input type="hidden" name="organizationId" value={organization?.id} />
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
							await update(formUpdateOptions('add'));
							isInviting = false;
							await invalidateAll();
						};
					}}
				>
					<input type="hidden" name="organizationId" value={organization?.id} />
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
							<Select.Root
								type="single"
								value={inviteRole}
								onValueChange={(v) => (inviteRole = v || 'member')}
								disabled={isInviting}
							>
								<Select.Trigger id="inviteRole">
									<span class="capitalize">{inviteRole}</span>
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="member">Member</Select.Item>
									<Select.Item value="admin">Admin</Select.Item>
									{#if currentMember?.role === 'owner'}
										<Select.Item value="owner">Owner</Select.Item>
									{/if}
								</Select.Content>
							</Select.Root>
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
								{#if member.userId === data.user?.id}
									<Badge variant="secondary" class="badge ml-2">You</Badge>
								{/if}
							</TableCell>
							<TableCell>
								{#if isAdmin(currentMember) && member.userId !== data.user?.id && currentMember?.role === 'owner'}
									<form
										id={`update-role-${member.id}`}
										method="POST"
										action="?/updateMemberRole"
										use:enhance={() => {
											return async ({ update }) => {
												await update(formUpdateOptions('edit'));
												await invalidateAll();
											};
										}}
									>
										<input type="hidden" name="organizationId" value={organization?.id} />
										<input type="hidden" name="memberId" value={member.id} />
										<input type="hidden" name="role" value={member.role} />
										<Select.Root
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
											<Select.Trigger class="w-32" data-testid="member-role">
												<span class="capitalize">{member.role}</span>
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="member">Member</Select.Item>
												<Select.Item value="admin">Admin</Select.Item>
												<Select.Item value="owner">Owner</Select.Item>
											</Select.Content>
										</Select.Root>
									</form>
								{:else}
									<Badge variant="outline" class="badge" data-testid="member-role"
										>{member.role}</Badge
									>
								{/if}
							</TableCell>
							{#if isAdmin(currentMember)}
								<TableCell class="text-right">
									{#if member.userId !== data.user?.id && currentMember?.role === 'owner'}
										<form
											method="POST"
											action="?/removeMember"
											use:enhance={() => {
												if (!confirm('Are you sure you want to remove this member?')) {
													return async () => {};
												}
												return async ({ update }) => {
													await update(formUpdateOptions('edit'));
													await invalidateAll();
												};
											}}
											class="inline"
										>
											<input type="hidden" name="organizationId" value={organization?.id} />
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
									{formatStoredDay(invitation.expiresAt as string | number | Date)}
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
													await update(formUpdateOptions('edit'));
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
</div>

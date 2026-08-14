<script lang="ts">
	import { enhance } from '$app/forms';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let submitting = $state(false);

	const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	function submitHandler() {
		submitting = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update(formUpdateOptions('edit'));
			submitting = false;
		};
	}
</script>

<div class="container flex min-h-screen items-center justify-center py-8">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>You have been invited</CardTitle>
			<CardDescription>
				Accept an invitation to join an existing organization, or decline to continue on your own.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			{#if form?.error}
				<p class="text-destructive text-sm">{form.error}</p>
			{/if}

			{#each data.invitations as invitation (invitation.id)}
				<div class="space-y-3 rounded-lg border p-4">
					<div>
						<p class="text-lg font-semibold">{invitation.organizationName}</p>
						<p class="text-muted-foreground text-sm">
							Role: <span class="capitalize">{invitation.role}</span> · Expires
							{dateFormatter.format(new Date(invitation.expiresAt))}
						</p>
					</div>

					<div class="flex gap-2">
						<form method="POST" action="?/decline" use:enhance={submitHandler} class="flex-1">
							<input type="hidden" name="invitationId" value={invitation.id} />
							<Button type="submit" variant="outline" class="w-full" disabled={submitting}>
								Decline
							</Button>
						</form>
						<form method="POST" action="?/accept" use:enhance={submitHandler} class="flex-1">
							<input type="hidden" name="invitationId" value={invitation.id} />
							<Button type="submit" class="w-full" disabled={submitting}>Accept</Button>
						</form>
					</div>
				</div>
			{/each}
		</CardContent>
	</Card>
</div>

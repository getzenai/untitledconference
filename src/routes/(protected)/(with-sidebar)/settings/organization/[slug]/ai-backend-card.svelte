<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
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
	import { toast } from 'svelte-sonner';

	let {
		organizationId,
		canEdit,
		settings,
		form
	}: {
		organizationId: string;
		canEdit: boolean;
		settings: {
			configured: boolean;
			baseUrl?: string;
			apiKeySuffix?: string;
			modelId?: string | null;
		};
		form: { success?: boolean; error?: string; aiSaved?: boolean; aiCleared?: boolean } | null;
	} = $props();

	let isSaving = $state(false);
	let isClearing = $state(false);

	$effect(() => {
		if (form?.success && form.aiSaved) {
			toast.success('Chat backend saved');
		} else if (form?.success && form.aiCleared) {
			toast.success('Chat backend cleared');
		}
	});
</script>

<Card class="mb-8" data-testid="org-ai-settings-card">
	<CardHeader>
		<CardTitle>Chat backend</CardTitle>
		<CardDescription>
			Use your own OpenAI-compatible endpoint instead of the hosted assistant. The API key never
			leaves the server and is not shown again after you save.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if !canEdit}
			<p class="text-muted-foreground text-sm" data-testid="org-ai-configured">
				{#if settings.configured}
					This organization uses its own chat backend.
				{:else}
					This organization uses the hosted assistant.
				{/if}
			</p>
		{:else}
			{#if settings.configured && settings.apiKeySuffix}
				<p class="text-sm" data-testid="org-ai-configured">
					Configured. Key ending in {settings.apiKeySuffix}.
				</p>
			{/if}
			<form
				method="POST"
				action="?/saveAiSettings"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update(formUpdateOptions('edit'));
						await invalidateAll();
						isSaving = false;
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="organizationId" value={organizationId} />
				<div class="space-y-2">
					<Label for="org-ai-base-url">Backend URL</Label>
					<Input
						id="org-ai-base-url"
						name="baseUrl"
						type="url"
						value={settings.baseUrl ?? ''}
						placeholder="https://api.openai.com/v1"
						required
						autocomplete="off"
					/>
				</div>
				<div class="space-y-2">
					<Label for="org-ai-api-key">API key</Label>
					<Input
						id="org-ai-api-key"
						name="apiKey"
						type="password"
						value=""
						placeholder={settings.configured ? 'Leave blank to keep the current key' : 'sk-…'}
						required={!settings.configured}
						autocomplete="new-password"
					/>
				</div>
				<div class="space-y-2">
					<Label for="org-ai-model-id">Model id (optional)</Label>
					<Input
						id="org-ai-model-id"
						name="modelId"
						value={settings.modelId ?? ''}
						placeholder="Leave blank to use the hosted default"
						autocomplete="off"
					/>
				</div>
				<div class="flex gap-2">
					<Button type="submit" disabled={isSaving} data-testid="org-ai-save">
						{isSaving ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</form>
			{#if settings.configured}
				<form
					method="POST"
					action="?/clearAiSettings"
					use:enhance={() => {
						if (!confirm("Clear this organization's chat backend and use the hosted assistant?")) {
							return async () => {};
						}
						isClearing = true;
						return async ({ update }) => {
							await update(formUpdateOptions('edit'));
							await invalidateAll();
							isClearing = false;
						};
					}}
				>
					<input type="hidden" name="organizationId" value={organizationId} />
					<Button type="submit" variant="outline" disabled={isClearing} data-testid="org-ai-clear">
						{isClearing ? 'Clearing…' : 'Use hosted assistant'}
					</Button>
				</form>
			{/if}
		{/if}
	</CardContent>
</Card>

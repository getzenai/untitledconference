<script lang="ts">
	/**
	 * The speaker's own profile.
	 *
	 * One form per organization, because the profile is org-wide: someone who has
	 * spoken for two organizers has two records and may want a different bio in
	 * each. Merging them into one form would silently overwrite both. Typed
	 * fields park under `portal-{field}:{profileId}` (#789). The headshot is a
	 * file and is not parked.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { isUploadedHeadshot } from '$lib/conference/headshot';
	import {
		PORTAL_PROFILE_LEAVE_PROMPT,
		portalProfileFieldScope
	} from '$lib/conference/portal-profile-draft';
	import { initials } from '$lib/conference/public-view';
	import { parseSpeakerLinks, SPEAKER_LINK_ROWS } from '$lib/conference/speaker-links';
	import { HEADSHOT_ACCEPT } from '$lib/conference/upload-limits';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();

	let busy = $state(false);
	// One dialog is open at a time, and which one is a profile id: a speaker who
	// has spoken for two organizers has two headshots on this page.
	let confirmRemoveHeadshot = $state<number | null>(null);
	let commitByProfile = $state<Record<number, number>>({});
	const dirtyFields = new SvelteSet<string>();

	function setFieldDirty(id: string, dirty: boolean) {
		if (dirty) dirtyFields.add(id);
		else dirtyFields.delete(id);
	}

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
				// A removed headshot takes its dialog with it — the block is inside
				// `{#if isUploadedHeadshot(...)}`. A refused removal does not, and
				// the question would stand over the answer.
				confirmRemoveHeadshot = null;
			}
		};
	};

	/** Save only: a refused URL must not raise the token or the typed row is gone. */
	const saving = (profileId: number) => () => {
		busy = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			try {
				await update(formUpdateOptions('edit'));
				if (result.type === 'success') {
					commitByProfile[profileId] = (commitByProfile[profileId] ?? 0) + 1;
				}
			} finally {
				busy = false;
			}
		};
	};

	/**
	 * A different example per row.
	 *
	 * All three rows carried "LinkedIn", which makes a set of empty fields read as
	 * the same field repeated three times rather than as three slots for three
	 * different links. Varying the example is what says "these are yours to fill
	 * with whatever you use" without a sentence explaining it.
	 */
	const LINK_EXAMPLES = [
		{ label: 'LinkedIn', url: 'https://linkedin.com/in/…' },
		{ label: 'Mastodon', url: 'https://mastodon.social/@…' },
		{ label: 'Your site', url: 'https://…' }
	];

	/** The link rows for one profile: what is stored, padded out to the fixed count. */
	const linkRows = (stored: string | null) => {
		const links = parseSpeakerLinks(stored);
		return Array.from({ length: SPEAKER_LINK_ROWS }, (_, i) => links[i] ?? { label: '', url: '' });
	};
</script>

<svelte:head>
	<title>Your speaker profile</title>
</svelte:head>

<UnsavedGuard dirty={dirtyFields.size > 0} message={PORTAL_PROFILE_LEAVE_PROMPT} />

<div class="mx-auto max-w-4xl px-6 py-8">
	<a href="/portal" class="text-muted-foreground hover:text-foreground text-sm">← Speaker portal</a>

	<h1 class="mt-3 text-2xl font-semibold tracking-tight">Your speaker profile</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		This is what appears next to your name on a public programme. Signed in as
		<span class="text-foreground font-medium">{data.account.name || data.account.email}</span>.
		Change your email or password in
		<a href="/settings/account" class="text-foreground underline underline-offset-4"
			>account settings</a
		>.
	</p>

	{#if data.profiles.length === 0}
		<EmptyState
			class="mt-8"
			title="You do not have a speaker profile yet"
			description="One is created for you when you submit a proposal, or when an organizer adds you to their programme."
			action={{ href: '/portal', label: 'Back to the portal →' }}
		/>
	{/if}

	{#each data.profiles as profile (profile.id)}
		{@const saved = form?.profileId === profile.id ? form : null}
		<section class="border-border bg-card mt-8 rounded-lg border p-5" data-testid="profile-form">
			{#if data.profiles.length > 1}
				<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					{profile.organizationName}
				</p>
			{/if}

			{#if saved?.error}
				<p
					class="border-status-bad text-status-bad mb-4 rounded-md border px-3 py-2 text-sm"
					role="alert"
				>
					{saved.error}
				</p>
			{:else if saved?.message}
				<p
					class="border-status-good text-status-good mb-4 rounded-md border px-3 py-2 text-sm"
					role="status"
				>
					{saved.message}
				</p>
			{/if}

			<div class="flex flex-wrap items-start gap-5">
				{#if profile.headshotUrl}
					<img
						src={profile.headshotUrl}
						alt=""
						class="bg-muted size-24 shrink-0 rounded-full object-cover"
					/>
				{:else}
					<span
						aria-hidden="true"
						class="bg-muted text-muted-foreground flex size-24 shrink-0 items-center justify-center rounded-full text-xl font-medium"
					>
						{initials(profile.name)}
					</span>
				{/if}

				<div class="min-w-64 flex-1">
					<h2 class="text-sm font-medium">Headshot</h2>
					<p class="text-muted-foreground mt-0.5 text-xs">
						JPEG, PNG or WebP. It appears on the public speaker page once one of your sessions is
						scheduled.
					</p>

					<form
						method="POST"
						action="?/headshot"
						enctype="multipart/form-data"
						use:enhance={submitting}
						class="mt-3 flex flex-wrap items-center gap-2"
					>
						<input type="hidden" name="profileId" value={profile.id} />
						<input
							type="file"
							name="headshot"
							accept={HEADSHOT_ACCEPT}
							aria-label="Choose a headshot"
							class="border-input bg-background max-w-full rounded-md border px-3 py-2 text-sm"
						/>
						<Button type="submit" size="sm" disabled={busy}>Upload</Button>
					</form>

					{#if isUploadedHeadshot(profile.headshotUrl)}
						<form
							id="remove-headshot-{profile.id}"
							method="POST"
							action="?/removeHeadshot"
							use:enhance={submitting}
							class="mt-2"
						>
							<input type="hidden" name="profileId" value={profile.id} />
							<Button
								type="submit"
								variant="ghost"
								size="sm"
								disabled={busy}
								data-testid="remove-headshot"
								onclick={(event: MouseEvent) => {
									// The picture and the initials fill the same circle, so the screen
									// looks the same before and after (#495). Nothing on this page can
									// tell you that you just deleted the file, and nothing can put it
									// back — the only place to say so is before the click.
									event.preventDefault();
									confirmRemoveHeadshot = profile.id;
								}}
							>
								Remove headshot
							</Button>
						</form>

						<!--
							The confirm button reaches the form through `form=`: the dialog content
							is portalled out of the form's subtree, so a submit button inside it
							would post nothing. Without JavaScript the trigger stays an ordinary
							submit button and removal still works — the guard is an enhancement,
							not the mechanism.
						-->
						<AlertDialog
							open={confirmRemoveHeadshot === profile.id}
							onOpenChange={(open) => {
								if (!open) confirmRemoveHeadshot = null;
							}}
						>
							<AlertDialogContent data-testid="remove-headshot-dialog">
								<AlertDialogHeader>
									<AlertDialogTitle>Remove your headshot?</AlertDialogTitle>
									<AlertDialogDescription>
										The picture is deleted{#if data.profiles.length > 1}&nbsp;from your {profile.organizationName}
											profile{/if}. Your initials take its place on the public programme, and you
										would have to upload the file again to undo this.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel data-testid="remove-headshot-cancel">
										Keep it
									</AlertDialogCancel>
									<Button
										type="submit"
										form="remove-headshot-{profile.id}"
										variant="destructive"
										disabled={busy}
										data-testid="remove-headshot-confirm"
									>
										Remove it
									</Button>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					{/if}
				</div>
			</div>

			<form method="POST" action="?/save" use:enhance={saving(profile.id)} class="mt-6 space-y-4">
				<input type="hidden" name="profileId" value={profile.id} />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Name *</span>
						<BrowserDraftInput
							name="name"
							class="mt-1"
							scope={portalProfileFieldScope(profile.id, 'name')}
							owner={data.user.id}
							baseline={profile.name}
							required
							testId="profile-name"
							commitToken={commitByProfile[profile.id] ?? 0}
							ondirtychange={(dirty) => setFieldDirty(`${profile.id}:name`, dirty)}
						/>
					</label>

					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Sort as</span>
						<BrowserDraftInput
							name="sortName"
							class="mt-1"
							scope={portalProfileFieldScope(profile.id, 'sortName')}
							owner={data.user.id}
							baseline={profile.sortName}
							testId="profile-sort-name"
							commitToken={commitByProfile[profile.id] ?? 0}
							ondirtychange={(dirty) => setFieldDirty(`${profile.id}:sortName`, dirty)}
						/>
						<span class="text-muted-foreground mt-1 block text-xs">
							How your name is filed in alphabetical lists.
						</span>
					</label>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Job title</span>
						<BrowserDraftInput
							name="jobTitle"
							class="mt-1"
							scope={portalProfileFieldScope(profile.id, 'jobTitle')}
							owner={data.user.id}
							baseline={profile.jobTitle ?? ''}
							testId="profile-job-title"
							commitToken={commitByProfile[profile.id] ?? 0}
							ondirtychange={(dirty) => setFieldDirty(`${profile.id}:jobTitle`, dirty)}
						/>
					</label>

					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Company</span>
						<BrowserDraftInput
							name="company"
							class="mt-1"
							scope={portalProfileFieldScope(profile.id, 'company')}
							owner={data.user.id}
							baseline={profile.company ?? ''}
							testId="profile-company"
							commitToken={commitByProfile[profile.id] ?? 0}
							ondirtychange={(dirty) => setFieldDirty(`${profile.id}:company`, dirty)}
						/>
					</label>
				</div>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Short bio</span>
					<BrowserDraftInput
						name="bio"
						class="mt-1"
						scope={portalProfileFieldScope(profile.id, 'bio')}
						owner={data.user.id}
						baseline={profile.bio ?? ''}
						rows={5}
						testId="profile-bio"
						commitToken={commitByProfile[profile.id] ?? 0}
						ondirtychange={(dirty) => setFieldDirty(`${profile.id}:bio`, dirty)}
					/>
				</label>

				<fieldset class="space-y-2">
					<legend class="text-muted-foreground text-xs">Links</legend>
					{#each linkRows(profile.links) as row, i (i)}
						<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
							<BrowserDraftInput
								name="linkLabel{i}"
								scope={portalProfileFieldScope(profile.id, `linkLabel${i}`)}
								owner={data.user.id}
								baseline={row.label}
								placeholder={LINK_EXAMPLES[i]?.label ?? 'Link'}
								aria-label="Link {i + 1} label"
								testId="profile-link-label-{i}"
								commitToken={commitByProfile[profile.id] ?? 0}
								ondirtychange={(dirty) => setFieldDirty(`${profile.id}:linkLabel${i}`, dirty)}
							/>
							<BrowserDraftInput
								name="linkUrl{i}"
								scope={portalProfileFieldScope(profile.id, `linkUrl${i}`)}
								owner={data.user.id}
								baseline={row.url}
								placeholder={LINK_EXAMPLES[i]?.url ?? 'https://…'}
								aria-label="Link {i + 1} address"
								testId="profile-link-url-{i}"
								commitToken={commitByProfile[profile.id] ?? 0}
								ondirtychange={(dirty) => setFieldDirty(`${profile.id}:linkUrl${i}`, dirty)}
							/>
						</div>
					{/each}
				</fieldset>

				<div class="flex items-center gap-3">
					<Button type="submit" disabled={busy}>Save profile</Button>
					<span class="text-muted-foreground text-xs">
						Your email address is set by the account you signed in with.
					</span>
				</div>
			</form>
		</section>
	{/each}
</div>

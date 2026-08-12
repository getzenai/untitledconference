<script lang="ts">
	/**
	 * The proposal form, rendered identically wherever a proposal is written.
	 *
	 * Two routes use it: the public call (`/c/<slug>/cfp`) for a new proposal, and
	 * the portal (`/portal/submissions/<id>/edit`) for finishing a draft. One
	 * component rather than two, for the same reason visibility lives in one
	 * module: a form whose edit view differs from its create view will eventually
	 * ask a returning submitter something the original never asked.
	 *
	 * Everything conditional runs through `visibleFields` — the same function the
	 * organizer's preview and the submit handler use.
	 */
	import { enhance } from '$app/forms';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { draftFromFormData } from '$lib/conference/pending-proposal';
	import { onMount } from 'svelte';
	import {
		ALL_FIXED_QUESTIONS_SHOWN,
		asks,
		type FixedQuestionVisibility
	} from '$lib/conference/fixed-questions';
	import {
		parseOptions,
		visibleFields,
		type AnswerContext,
		type FieldDefinition
	} from '$lib/conference/form-definition';
	import type { ProposalDraft } from '$lib/conference/proposal-draft';

	type Props = {
		fields: FieldDefinition[];
		/**
		 * Which built-in questions this call asks (#159). Defaults to all of them,
		 * so a caller that has no conference in hand still renders the whole form
		 * rather than an empty one.
		 */
		fixed?: FixedQuestionVisibility;
		formats: { id: number; name: string; minutes: number | null }[];
		tracks: { id: number; name: string }[];
		initial: ProposalDraft;
		/** The action result, carrying per-field errors from a rejected submit. */
		form?: {
			errors?: Record<string, string>;
			fieldErrors?: Record<number, string>;
			closed?: boolean;
		} | null;
		signedIn: boolean;
		signInHref: string;
		submitLabel?: string;
		/**
		 * A proposal that is already in has no draft state to fall back to: saving it
		 * as a draft would withdraw it from the organizer's list, so that door is not
		 * drawn rather than being drawn and refused.
		 */
		allowDraft?: boolean;
		/**
		 * Signed-out submit: the page parks the draft and sends them to login.
		 * The form does not own storage — it only reads the fields.
		 */
		onSignIn?: (draft: ProposalDraft) => void;
		/** After login restored a draft: send it. The button they clicked said submit. */
		autoSubmit?: boolean;
	};

	let {
		fields,
		fixed = ALL_FIXED_QUESTIONS_SHOWN,
		formats,
		tracks,
		initial,
		form = null,
		signedIn,
		signInHref: _signInHref,
		submitLabel = 'Submit proposal',
		allowDraft = true,
		onSignIn,
		autoSubmit = false
	}: Props = $props();

	let sessionFormatId = $state(initial.sessionFormatId);
	let trackId = $state(initial.trackId);
	let answers = $state<Record<number, string>>({ ...initial.answers });
	let speakerName = $state(initial.speaker.name);
	let sortName = $state(initial.speaker.sortName);
	// A prefilled sort name came from a person, not from the guess, so it is never
	// overwritten by typing in the name field.
	let sortNameTouched = $state(Boolean(initial.speaker.sortName));
	let coSpeakers = $state(initial.coSpeakers.map((co, i) => ({ key: i, ...co })));
	let nextKey = $state(initial.coSpeakers.length);
	let busy = $state(false);

	const context = $derived<AnswerContext>({ sessionFormatId, trackId, answers });
	const shown = $derived(visibleFields(fields, context));

	/**
	 * Whether this call asks a given built-in question.
	 *
	 * A removed control is not rendered at all rather than hidden with CSS: the
	 * server drops answers to questions it does not ask, so a control that still
	 * posted would look like it collected something and silently would not.
	 */
	const asked = $derived((key: string) => asks(fixed, key));

	/**
	 * The two-up rows collapse to one column when only one of their pair is left.
	 *
	 * `sm:grid-cols-2` on a row holding a single control leaves the other half
	 * empty, which reads as a control that failed to render rather than one the
	 * organizer removed.
	 */
	const pairClass = (both: boolean) => (both ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4');

	/**
	 * The empty option stays an option, and is not folded into the placeholder.
	 *
	 * Neither format nor track is required, so "no answer" has to remain
	 * reachable after one has been picked — a placeholder only shows while
	 * nothing is chosen and offers no way back to it.
	 */
	const none = { value: '', label: '—' };

	const formatOptions = $derived([
		none,
		...formats.map((format) => ({
			value: String(format.id),
			label: format.minutes ? `${format.name} (${format.minutes} min)` : format.name
		}))
	]);

	const trackOptions = $derived([
		none,
		...tracks.map((track) => ({ value: String(track.id), label: track.name }))
	]);

	const YES_NO = [none, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

	/**
	 * The sort key is a guess until someone corrects it, and it stops being one the
	 * moment they do. "Ng Wei Ling" sorts under N, not under L — showing the result
	 * is what gives a submitter the chance to notice.
	 */
	function suggestSortName(name: string) {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length < 2) return name.trim();
		return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
	}

	function onNameInput(value: string) {
		speakerName = value;
		if (!sortNameTouched) sortName = suggestSortName(value);
	}

	let formEl = $state<HTMLFormElement | undefined>();

	const submitting = ({ formData, cancel }: { formData: FormData; cancel: () => void }) => {
		// The click said submit. Without a session the POST would redirect to
		// login and drop the body, so we park the draft and let the page go there.
		if (!signedIn) {
			cancel();
			if (onSignIn) onSignIn(draftFromFormData(formData));
			return;
		}
		busy = true;
		// `finally`, not the success path: a network failure would otherwise leave
		// every button disabled with no way back except a reload.
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};

	onMount(() => {
		if (!autoSubmit || !formEl) return;
		const submit = formEl.querySelector<HTMLButtonElement>('button[formaction="?/submit"]');
		if (submit) formEl.requestSubmit(submit);
	});
</script>

{#if form?.closed}
	<p class="border-status-bad/40 bg-status-bad/5 mt-4 rounded-lg border p-4 text-sm">
		The call closed while you were writing. Nothing was saved.
	</p>
{/if}

<form bind:this={formEl} method="POST" use:enhance={submitting} class="mt-6 space-y-8">
	<section class="space-y-4">
		<h3 class="text-sm font-medium">Your talk</h3>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Title *</span>
			<Input
				name="title"
				class="mt-1"
				required
				value={initial.title}
				aria-invalid={Boolean(form?.errors?.title)}
			/>
			{#if form?.errors?.title}
				<span class="text-status-bad mt-1 block text-xs">{form.errors.title}</span>
			{/if}
		</label>

		{#if asked('abstract')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Abstract *</span>
				<Textarea name="abstract" rows={6} class="mt-1" value={initial.abstract} />
				{#if form?.errors?.abstract}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.abstract}</span>
				{/if}
			</label>
		{/if}

		{#if asked('keyTakeaway')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Key takeaway</span>
				<Input name="keyTakeaway" class="mt-1" value={initial.keyTakeaway} />
			</label>
		{/if}

		{#if asked('sessionFormatId') || asked('trackId')}
			<div class={pairClass(asked('sessionFormatId') && asked('trackId'))}>
				{#if asked('sessionFormatId')}
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Session format</span>
						<AppSelect
							name="sessionFormatId"
							class="mt-1"
							aria-label="Session format"
							placeholder="—"
							value={initial.sessionFormatId ? String(initial.sessionFormatId) : ''}
							options={formatOptions}
							onValueChange={(value) => (sessionFormatId = Number(value) || null)}
						/>
					</label>
				{/if}

				{#if asked('trackId')}
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Track</span>
						<AppSelect
							name="trackId"
							class="mt-1"
							aria-label="Track"
							placeholder="—"
							value={initial.trackId ? String(initial.trackId) : ''}
							options={trackOptions}
							onValueChange={(value) => (trackId = Number(value) || null)}
						/>
					</label>
				{/if}
			</div>
		{/if}

		{#if asked('audienceLevel')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Audience level</span>
				<Input
					name="audienceLevel"
					class="mt-1"
					value={initial.audienceLevel}
					placeholder="Beginner, intermediate, advanced"
				/>
			</label>
		{/if}
	</section>

	{#if shown.length > 0}
		<section class="space-y-4">
			<h3 class="text-sm font-medium">Questions from the organizers</h3>

			{#each shown as field (field.id)}
				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">
						{field.label}{#if field.required}<span class="text-status-bad"> *</span>{/if}
					</span>

					{#if field.kind === 'long_text'}
						<Textarea
							name="answer:{field.id}"
							rows={4}
							class="mt-1"
							value={answers[field.id] ?? ''}
							oninput={(e) => (answers[field.id] = e.currentTarget.value)}
						/>
					{:else if field.kind === 'select'}
						<AppSelect
							name="answer:{field.id}"
							class="mt-1"
							aria-label={field.label}
							placeholder="—"
							value={answers[field.id] ?? ''}
							options={parseOptions(field.options).map((option) => ({
								value: option,
								label: option
							}))}
							onValueChange={(value) => (answers[field.id] = value)}
						/>
					{:else if field.kind === 'boolean'}
						<AppSelect
							name="answer:{field.id}"
							class="mt-1"
							aria-label={field.label}
							placeholder="—"
							value={answers[field.id] ?? ''}
							options={YES_NO}
							onValueChange={(value) => (answers[field.id] = value)}
						/>
					{:else}
						<Input
							name="answer:{field.id}"
							class="mt-1"
							value={answers[field.id] ?? ''}
							placeholder={field.kind === 'file' ? 'Link to the file' : undefined}
							oninput={(e) => (answers[field.id] = e.currentTarget.value)}
						/>
					{/if}

					{#if form?.fieldErrors?.[field.id]}
						<span class="text-status-bad mt-1 block text-xs">{form.fieldErrors[field.id]}</span>
					{/if}
				</label>
			{/each}
		</section>
	{/if}

	<section class="space-y-4">
		<h3 class="text-sm font-medium">About you</h3>

		<div class={pairClass(asked('speakerSortName'))}>
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Name *</span>
				<Input
					name="speakerName"
					class="mt-1"
					value={speakerName}
					oninput={(e) => onNameInput(e.currentTarget.value)}
				/>
				{#if form?.errors?.speakerName}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.speakerName}</span>
				{/if}
			</label>

			{#if asked('speakerSortName')}
				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Sort as</span>
					<Input
						name="speakerSortName"
						class="mt-1"
						value={sortName}
						oninput={(e) => {
							sortNameTouched = true;
							sortName = e.currentTarget.value;
						}}
					/>
					<span class="text-muted-foreground mt-1 block text-xs">
						How your name is filed in alphabetical lists. Correct it if the guess is wrong.
					</span>
				</label>
			{/if}
		</div>

		<div class={pairClass(asked('speakerJobTitle'))}>
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Email *</span>
				<Input name="speakerEmail" type="email" class="mt-1" value={initial.speaker.email} />
				{#if form?.errors?.speakerEmail}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.speakerEmail}</span>
				{/if}
			</label>

			{#if asked('speakerJobTitle')}
				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Job title</span>
					<Input name="speakerJobTitle" class="mt-1" value={initial.speaker.jobTitle} />
				</label>
			{/if}
		</div>

		{#if asked('speakerCompany')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Company</span>
				<Input name="speakerCompany" class="mt-1" value={initial.speaker.company} />
			</label>
		{/if}

		{#if asked('speakerBio')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Short bio</span>
				<Textarea name="speakerBio" rows={4} class="mt-1" value={initial.speaker.bio} />
			</label>
		{/if}
	</section>

	{#if asked('coSpeakers')}
		<section class="space-y-3">
			<h3 class="text-sm font-medium">Co-presenters</h3>
			<p class="text-muted-foreground text-sm">
				Anyone presenting this talk with you. They appear on the programme alongside you.
			</p>

			{#each coSpeakers as co (co.key)}
				<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
					<Input name="co-name" placeholder="Name" value={co.name} />
					<Input name="co-email" type="email" placeholder="Email" value={co.email} />
					<div class="flex gap-2">
						<Input name="co-role" placeholder="Role" class="sm:w-28" value={co.roleLabel} />
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (coSpeakers = coSpeakers.filter((c) => c.key !== co.key))}
						>
							Remove
						</Button>
					</div>
				</div>
			{/each}

			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={() =>
					(coSpeakers = [...coSpeakers, { key: nextKey++, name: '', email: '', roleLabel: '' }])}
			>
				Add a co-presenter
			</Button>
		</section>
	{/if}

	{#if signedIn}
		<div class="flex flex-wrap items-center gap-3 border-t pt-6">
			<Button type="submit" formaction="?/submit" disabled={busy}>{submitLabel}</Button>
			{#if allowDraft}
				<Button type="submit" formaction="?/draft" variant="outline" disabled={busy}>
					Save as draft
				</Button>
				<span class="text-muted-foreground text-sm">
					A draft needs only a title. You can finish it any time before the call closes.
				</span>
			{:else}
				<span class="text-muted-foreground text-sm">
					Your proposal stays in the organizers' list while you edit it.
				</span>
			{/if}
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-3 border-t pt-6">
			<Button type="submit" data-testid="cfp-sign-in-to-submit">Sign in to submit</Button>
			<span class="text-muted-foreground text-sm">
				We'll send this proposal as soon as you sign in.
			</span>
		</div>
	{/if}
</form>

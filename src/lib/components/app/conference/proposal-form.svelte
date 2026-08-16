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
	import { enhance } from '$lib/forms/enhance';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { TALK_TITLE_MAX } from '$lib/conference/proposal-limits';
	import BrowserDraftSelect from '$lib/components/app/browser-draft-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { draftFromFormData } from '$lib/conference/pending-proposal';
	import { onMount, tick } from 'svelte';
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
	import {
		formatSelectOptions,
		parseOptionalId,
		trackSelectOptions,
		YES_NO_OPTIONS,
		type ProposalDraft
	} from '$lib/conference/proposal-draft';
	import ProposalAuthActions from './proposal-auth-actions.svelte';

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
		onSignIn?: (draft: ProposalDraft, intent: 'draft' | 'submit') => void;
		/** After login restored a draft: perform the action the visitor chose. */
		autoAction?: 'draft' | 'submit' | null;
		/** Page owns storage (#494). Withheld until restore so the empty paint cannot wipe it. */
		onDraftChange?: (draft: ProposalDraft) => void;
		/** A save that landed. The parked copy can go. */
		onCommitted?: () => void;
		/** Park chosen dropdowns. `BrowserDraftInput` cannot wrap `AppSelect` (#801). */
		draft?: { scope: string; owner: string };
	};

	let {
		fields,
		fixed = ALL_FIXED_QUESTIONS_SHOWN,
		formats,
		tracks,
		initial,
		form = null,
		signedIn,
		submitLabel = 'Submit proposal',
		allowDraft = true,
		onSignIn,
		autoAction = null,
		onDraftChange,
		onCommitted,
		draft
	}: Props = $props();

	let title = $state(initial.title);
	let abstract = $state(initial.abstract);
	let keyTakeaway = $state(initial.keyTakeaway);
	let audienceLevel = $state(initial.audienceLevel);
	let sessionFormatId = $state(initial.sessionFormatId);
	let trackId = $state(initial.trackId);
	let answers = $state<Record<number, string>>({ ...initial.answers });
	let speakerName = $state(initial.speaker.name);
	let sortName = $state(initial.speaker.sortName);
	let speakerEmail = $state(initial.speaker.email);
	let speakerJobTitle = $state(initial.speaker.jobTitle);
	let speakerCompany = $state(initial.speaker.company);
	let speakerBio = $state(initial.speaker.bio);
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
	const formatOptions = $derived(formatSelectOptions(formats));
	const trackOptions = $derived(trackSelectOptions(tracks));

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

	/**
	 * Built-in fields that can fail, split where the organizer questions sit.
	 *
	 * A single walk would put the speaker errors above the questions that
	 * made the speaker click. Labels are not unique — two copied fields
	 * share a sentence — so the each-block keys on `selector`, not the text.
	 */
	const TALK_ERROR_FIELDS = [
		['title', '[name="title"]'],
		['abstract', '[name="abstract"]']
	] as const;
	const ABOUT_ERROR_FIELDS = [
		['speakerName', '[name="speakerName"]'],
		['speakerEmail', '[name="speakerEmail"]'],
		['coSpeakerEmail', '[name="co-email"]']
	] as const;

	type ErrorItem = { message: string; selector: string };

	function collectFixedErrors(
		errors: Record<string, string>,
		fields: readonly (readonly [string, string])[]
	): ErrorItem[] {
		const items: ErrorItem[] = [];
		for (const [key, selector] of fields) {
			const message = errors[key];
			if (message) items.push({ message, selector });
		}
		return items;
	}

	/**
	 * What a rejected submit has to say, in the order the form asks it (#493).
	 *
	 * The server already names the missing organizer question. The form used to
	 * print that only next to the field — in a block titled "Questions from the
	 * organizers" that a speaker does not read as "required" — while they were
	 * still looking at the button. The summary is the same sentences, at the
	 * top; the first selector is where focus goes.
	 */
	const errorItems = $derived.by(() => {
		const errors = form?.errors ?? {};
		const fieldErrors = form?.fieldErrors ?? {};
		const custom: ErrorItem[] = [];
		for (const field of shown) {
			const message = fieldErrors[field.id];
			if (!message) continue;
			custom.push({
				message,
				selector: `[name="answer:${field.id}"], [data-testid="app-select-answer:${field.id}"]`
			});
		}
		return [
			...collectFixedErrors(errors, TALK_ERROR_FIELDS),
			...custom,
			...collectFixedErrors(errors, ABOUT_ERROR_FIELDS)
		];
	});

	/**
	 * Jump once per rejected submit, not once per error text.
	 *
	 * A second click with the same missing field used to do nothing:
	 * the key was the message, and the message had not changed. That
	 * is the silence this page is here to end, one click later. `form`
	 * is a new object on every failed action; typing does not replace it.
	 */
	let focusedForm = $state<object | null | undefined>(undefined);

	$effect(() => {
		const items = errorItems;
		if (items.length === 0 || form === focusedForm) return;
		focusedForm = form;
		const selector = items[0].selector;
		void tick().then(() => {
			const el = formEl?.querySelector<HTMLElement>(selector);
			if (!el) return;
			el.focus();
			el.scrollIntoView({ block: 'center' });
		});
	});

	$effect(() => {
		onDraftChange?.({
			title,
			abstract,
			keyTakeaway,
			audienceLevel,
			sessionFormatId,
			trackId,
			answers: { ...answers },
			speaker: {
				name: speakerName,
				sortName,
				email: speakerEmail,
				jobTitle: speakerJobTitle,
				company: speakerCompany,
				bio: speakerBio
			},
			coSpeakers: coSpeakers.map(({ name, email, roleLabel }) => ({ name, email, roleLabel }))
		});
	});

	/**
	 * A thrown action must not replace this page (#482).
	 *
	 * The visitor has no draft and no way back. SvelteKit's default `update()`
	 * treats a 500 like a failed navigation, and `+error.svelte` takes the typed
	 * abstract with it.
	 */
	const submitting: SubmitFunction = ({ formData, cancel, submitter }) => {
		// Without a session the POST would redirect to login and drop the body, so
		// park the draft together with the action the visitor chose.
		if (!signedIn) {
			cancel();
			const intent = submitter?.getAttribute('formaction') === '?/draft' ? 'draft' : 'submit';
			if (onSignIn) onSignIn(draftFromFormData(formData), intent);
			return;
		}
		busy = true;
		// `finally`, not the success path: a network failure would otherwise leave
		// every button disabled with no way back except a reload.
		return async ({ update, result }) => {
			try {
				// Clear before `update()` navigates away on a redirect.
				if (result.type === 'redirect' || result.type === 'success') {
					onCommitted?.();
				}
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
			}
		};
	};

	onMount(() => {
		if (!autoAction || !formEl) return;
		const submit = formEl.querySelector<HTMLButtonElement>(`button[formaction="?/${autoAction}"]`);
		if (submit) formEl.requestSubmit(submit);
	});
</script>

{#if form?.closed}
	<p class="border-status-bad/40 bg-status-bad/5 mt-4 rounded-lg border p-4 text-sm">
		The call closed while you were writing. Nothing was saved.
	</p>
{/if}

<form bind:this={formEl} method="POST" use:enhance={submitting} class="mt-6 space-y-8">
	{#if errorItems.length > 0}
		<div
			class="border-status-bad/40 bg-status-bad/5 rounded-lg border p-4"
			role="alert"
			data-testid="proposal-errors"
		>
			<p class="text-sm font-medium">This proposal cannot be submitted yet.</p>
			<ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
				{#each errorItems as item (item.selector)}
					<li>{item.message}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<section class="space-y-4">
		<h3 class="text-sm font-medium">Your talk</h3>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Title *</span>
			<Input
				name="title"
				class="mt-1"
				required
				maxlength={TALK_TITLE_MAX}
				bind:value={title}
				aria-invalid={Boolean(form?.errors?.title)}
			/>
			<!--
				The count shows up near the ceiling and not before (#470). A counter on
				every field from the first keystroke is noise on a title nobody was ever
				going to make long; a limit you meet without warning is the surprise
				this is here to prevent.
			-->
			{#if title.length > TALK_TITLE_MAX - 40}
				<span class="text-muted-foreground mt-1 block text-xs" data-testid="title-count">
					{title.length} / {TALK_TITLE_MAX} characters
				</span>
			{/if}
			{#if form?.errors?.title}
				<span class="text-status-bad mt-1 block text-xs">{form.errors.title}</span>
			{/if}
		</label>

		{#if asked('abstract')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Abstract *</span>
				<Textarea
					name="abstract"
					rows={6}
					class="mt-1"
					bind:value={abstract}
					aria-invalid={Boolean(form?.errors?.abstract)}
				/>
				{#if form?.errors?.abstract}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.abstract}</span>
				{/if}
			</label>
		{/if}

		{#if asked('keyTakeaway')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Key takeaway</span>
				<Input name="keyTakeaway" class="mt-1" bind:value={keyTakeaway} />
			</label>
		{/if}

		{#if asked('sessionFormatId') || asked('trackId')}
			<div class={pairClass(asked('sessionFormatId') && asked('trackId'))}>
				{#if asked('sessionFormatId')}
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Session format</span>
						<BrowserDraftSelect
							scope={draft ? `${draft.scope}:sessionFormatId` : ''}
							owner={draft?.owner ?? ''}
							baseline=""
							name="sessionFormatId"
							class="mt-1"
							aria-label="Session format"
							placeholder="—"
							value={sessionFormatId ? String(sessionFormatId) : ''}
							options={formatOptions}
							onValueChange={(value) => (sessionFormatId = parseOptionalId(value))}
						/>
					</label>
				{/if}

				{#if asked('trackId')}
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Track</span>
						<BrowserDraftSelect
							scope={draft ? `${draft.scope}:trackId` : ''}
							owner={draft?.owner ?? ''}
							baseline=""
							name="trackId"
							class="mt-1"
							aria-label="Track"
							placeholder="—"
							value={trackId ? String(trackId) : ''}
							options={trackOptions}
							onValueChange={(value) => (trackId = parseOptionalId(value))}
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
					bind:value={audienceLevel}
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
						{field.label}{#if field.required}<span class="text-status-bad">&nbsp;*</span>{/if}
					</span>

					{#if field.kind === 'long_text'}
						<Textarea
							name="answer:{field.id}"
							rows={4}
							class="mt-1"
							value={answers[field.id] ?? ''}
							aria-invalid={Boolean(form?.fieldErrors?.[field.id])}
							oninput={(e) => (answers[field.id] = e.currentTarget.value)}
						/>
					{:else if field.kind === 'select'}
						<BrowserDraftSelect
							name="answer:{field.id}"
							class="mt-1"
							aria-label={field.label}
							aria-invalid={Boolean(form?.fieldErrors?.[field.id])}
							placeholder="—"
							value={answers[field.id] ?? ''}
							options={parseOptions(field.options).map((option) => ({
								value: option,
								label: option
							}))}
							onValueChange={(value) => (answers[field.id] = value)}
						/>
					{:else if field.kind === 'boolean'}
						<BrowserDraftSelect
							name="answer:{field.id}"
							class="mt-1"
							aria-label={field.label}
							aria-invalid={Boolean(form?.fieldErrors?.[field.id])}
							placeholder="—"
							value={answers[field.id] ?? ''}
							options={YES_NO_OPTIONS}
							onValueChange={(value) => (answers[field.id] = value)}
						/>
					{:else}
						<Input
							name="answer:{field.id}"
							class="mt-1"
							value={answers[field.id] ?? ''}
							aria-invalid={Boolean(form?.fieldErrors?.[field.id])}
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
				<Input name="speakerEmail" type="email" class="mt-1" bind:value={speakerEmail} />
				{#if form?.errors?.speakerEmail}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.speakerEmail}</span>
				{/if}
			</label>

			{#if asked('speakerJobTitle')}
				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Job title</span>
					<Input name="speakerJobTitle" class="mt-1" bind:value={speakerJobTitle} />
				</label>
			{/if}
		</div>

		{#if asked('speakerCompany')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Company</span>
				<Input name="speakerCompany" class="mt-1" bind:value={speakerCompany} />
			</label>
		{/if}

		{#if asked('speakerBio')}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Short bio</span>
				<Textarea name="speakerBio" rows={4} class="mt-1" bind:value={speakerBio} />
			</label>
		{/if}
	</section>

	{#if asked('coSpeakers')}
		<section class="space-y-3">
			<h3 class="text-sm font-medium">Co-presenters</h3>
			<p class="text-muted-foreground text-sm">
				Anyone presenting this talk with you. They appear on the programme alongside you. An email
				address is required for each — it is what keeps two people with the same name apart.
			</p>
			{#if form?.errors?.coSpeakerEmail}
				<span class="text-status-bad block text-xs">{form.errors.coSpeakerEmail}</span>
			{/if}

			{#each coSpeakers as co (co.key)}
				<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
					<Input name="co-name" placeholder="Name" bind:value={co.name} />
					<Input
						name="co-email"
						type="email"
						placeholder="Email"
						aria-invalid={Boolean(form?.errors?.coSpeakerEmail) && !co.email}
						bind:value={co.email}
					/>
					<div class="flex gap-2">
						<Input name="co-role" placeholder="Role" class="sm:w-28" bind:value={co.roleLabel} />
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
		<ProposalAuthActions {allowDraft} />
	{/if}
</form>

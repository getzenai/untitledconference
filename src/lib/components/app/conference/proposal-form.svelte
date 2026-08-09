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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		parseOptions,
		visibleFields,
		type AnswerContext,
		type FieldDefinition
	} from '$lib/conference/form-definition';

	export type ProposalDraft = {
		title: string;
		abstract: string;
		keyTakeaway: string;
		audienceLevel: string;
		sessionFormatId: number | null;
		trackId: number | null;
		answers: Record<number, string>;
		speaker: {
			name: string;
			sortName: string;
			email: string;
			jobTitle: string;
			company: string;
			bio: string;
		};
		coSpeakers: { name: string; email: string; roleLabel: string }[];
	};

	type Props = {
		fields: FieldDefinition[];
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
	};

	let {
		fields,
		formats,
		tracks,
		initial,
		form = null,
		signedIn,
		signInHref,
		submitLabel = 'Submit proposal'
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

	const selectClass =
		'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none';

	const submitting = () => {
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
</script>

{#if form?.closed}
	<p class="border-status-bad/40 bg-status-bad/5 mt-4 rounded-lg border p-4 text-sm">
		The call closed while you were writing. Nothing was saved.
	</p>
{/if}

<form method="POST" use:enhance={submitting} class="mt-6 space-y-8">
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

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Abstract *</span>
			<Textarea name="abstract" rows={6} class="mt-1" value={initial.abstract} />
			{#if form?.errors?.abstract}
				<span class="text-status-bad mt-1 block text-xs">{form.errors.abstract}</span>
			{/if}
		</label>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Key takeaway</span>
			<Input name="keyTakeaway" class="mt-1" value={initial.keyTakeaway} />
		</label>

		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Session format</span>
				<select
					name="sessionFormatId"
					class="{selectClass} mt-1 w-full"
					onchange={(e) => (sessionFormatId = Number(e.currentTarget.value) || null)}
				>
					<option value="">—</option>
					{#each formats as format (format.id)}
						<option value={format.id} selected={format.id === initial.sessionFormatId}>
							{format.name}{#if format.minutes}
								({format.minutes} min){/if}
						</option>
					{/each}
				</select>
			</label>

			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Track</span>
				<select
					name="trackId"
					class="{selectClass} mt-1 w-full"
					onchange={(e) => (trackId = Number(e.currentTarget.value) || null)}
				>
					<option value="">—</option>
					{#each tracks as track (track.id)}
						<option value={track.id} selected={track.id === initial.trackId}>{track.name}</option>
					{/each}
				</select>
			</label>
		</div>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Audience level</span>
			<Input
				name="audienceLevel"
				class="mt-1"
				value={initial.audienceLevel}
				placeholder="Beginner, intermediate, advanced"
			/>
		</label>
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
						<select
							name="answer:{field.id}"
							class="{selectClass} mt-1 w-full"
							onchange={(e) => (answers[field.id] = e.currentTarget.value)}
						>
							<option value="">—</option>
							{#each parseOptions(field.options) as option (option)}
								<option value={option} selected={answers[field.id] === option}>{option}</option>
							{/each}
						</select>
					{:else if field.kind === 'boolean'}
						<select
							name="answer:{field.id}"
							class="{selectClass} mt-1 w-full"
							onchange={(e) => (answers[field.id] = e.currentTarget.value)}
						>
							<option value="">—</option>
							<option value="true" selected={answers[field.id] === 'true'}>Yes</option>
							<option value="false" selected={answers[field.id] === 'false'}>No</option>
						</select>
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

		<div class="grid gap-4 sm:grid-cols-2">
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
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Email *</span>
				<Input name="speakerEmail" type="email" class="mt-1" value={initial.speaker.email} />
				{#if form?.errors?.speakerEmail}
					<span class="text-status-bad mt-1 block text-xs">{form.errors.speakerEmail}</span>
				{/if}
			</label>

			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">Job title</span>
				<Input name="speakerJobTitle" class="mt-1" value={initial.speaker.jobTitle} />
			</label>
		</div>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Company</span>
			<Input name="speakerCompany" class="mt-1" value={initial.speaker.company} />
		</label>

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Short bio</span>
			<Textarea name="speakerBio" rows={4} class="mt-1" value={initial.speaker.bio} />
		</label>
	</section>

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

	{#if signedIn}
		<div class="flex flex-wrap items-center gap-3 border-t pt-6">
			<Button type="submit" formaction="?/submit" disabled={busy}>{submitLabel}</Button>
			<Button type="submit" formaction="?/draft" variant="outline" disabled={busy}>
				Save as draft
			</Button>
			<span class="text-muted-foreground text-sm">
				A draft needs only a title. You can finish it any time before the call closes.
			</span>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-3 border-t pt-6">
			<Button href={signInHref}>Sign in to submit</Button>
			<span class="text-muted-foreground text-sm">Signing in takes you back to this form.</span>
		</div>
	{/if}
</form>

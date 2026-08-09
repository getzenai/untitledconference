<script lang="ts">
	/**
	 * The proposal form a speaker actually fills in.
	 *
	 * It renders through the same `visibleFields` as the organizer's preview and the
	 * submit handler, so a conditional field behaves identically in all three. That
	 * is the whole point of the shared module: the form can never ask for something
	 * the preview did not show, or accept something the handler will reject.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { parseOptions, visibleFields, type AnswerContext } from '$lib/conference/form-definition';
	import { formatDayLong } from '$lib/conference/public-view';

	let { data, form } = $props();

	const call = $derived(data.call);
	const signedIn = $derived(Boolean(data.user));

	let sessionFormatId = $state<number | null>(null);
	let trackId = $state<number | null>(null);
	let answers = $state<Record<number, string>>({});
	let speakerName = $state('');
	let sortNameTouched = $state(false);
	let sortName = $state('');
	let coSpeakers = $state<{ key: number }[]>([]);
	let nextKey = 1;
	let busy = $state(false);

	const context = $derived<AnswerContext>({ sessionFormatId, trackId, answers });
	const shown = $derived(visibleFields(call.fields, context));

	/**
	 * The sort key is a guess until someone corrects it, and it stops being a guess
	 * the moment they do. "Ng Wei Ling" sorts under N, not under L — showing the
	 * result is what gives a submitter the chance to notice.
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
		// both buttons disabled with no way back except a reload.
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};

	const closesLabel = $derived(
		call.form.closesAt ? formatDayLong(String(call.form.closesAt).slice(0, 10)) : null
	);
</script>

<svelte:head>
	<title>Call for papers — {call.conference.name}</title>
</svelte:head>

<div class="max-w-3xl">
	<h2 class="text-xl font-semibold tracking-tight">{call.form.title}</h2>

	{#if call.state === 'closed'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has closed{#if closesLabel}
				— proposals were accepted until {closesLabel}{/if}. Submissions already made are still
			visible in your <a class="underline" href="/portal">speaker portal</a>.
		</p>
	{:else if call.state === 'not_yet_open'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has not opened yet. Check back nearer the date.
		</p>
	{:else}
		{#if closesLabel}
			<p class="text-muted-foreground mt-1 text-sm">Proposals close on {closesLabel}.</p>
		{/if}

		{#if !signedIn}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				You can read the whole form without an account. To submit — and to come back and edit before
				the call closes — you will need to
				<a class="underline" href="/login?returnTo=/c/{call.conference.slug}/cfp">sign in</a>.
			</p>
		{/if}

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
					<Input name="title" class="mt-1" required aria-invalid={Boolean(form?.errors?.title)} />
					{#if form?.errors?.title}
						<span class="text-status-bad mt-1 block text-xs">{form.errors.title}</span>
					{/if}
				</label>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Abstract *</span>
					<Textarea name="abstract" rows={6} class="mt-1" />
					{#if form?.errors?.abstract}
						<span class="text-status-bad mt-1 block text-xs">{form.errors.abstract}</span>
					{/if}
				</label>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Key takeaway</span>
					<Input name="keyTakeaway" class="mt-1" />
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
							{#each call.formats as format (format.id)}
								<option value={format.id}>
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
							{#each call.tracks as track (track.id)}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Audience level</span>
					<Input name="audienceLevel" class="mt-1" placeholder="Beginner, intermediate, advanced" />
				</label>
			</section>

			{#if shown.length > 0}
				<section class="space-y-4">
					<h3 class="text-sm font-medium">{call.form.title} questions</h3>

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
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else if field.kind === 'boolean'}
								<select
									name="answer:{field.id}"
									class="{selectClass} mt-1 w-full"
									onchange={(e) => (answers[field.id] = e.currentTarget.value)}
								>
									<option value="">—</option>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							{:else if field.kind === 'file'}
								<Input
									name="answer:{field.id}"
									class="mt-1"
									placeholder="Link to the file"
									oninput={(e) => (answers[field.id] = e.currentTarget.value)}
								/>
							{:else}
								<Input
									name="answer:{field.id}"
									class="mt-1"
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
						<Input name="speakerEmail" type="email" class="mt-1" />
						{#if form?.errors?.speakerEmail}
							<span class="text-status-bad mt-1 block text-xs">{form.errors.speakerEmail}</span>
						{/if}
					</label>

					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Job title</span>
						<Input name="speakerJobTitle" class="mt-1" />
					</label>
				</div>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Company</span>
					<Input name="speakerCompany" class="mt-1" />
				</label>

				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Short bio</span>
					<Textarea name="speakerBio" rows={4} class="mt-1" />
				</label>
			</section>

			<section class="space-y-3">
				<h3 class="text-sm font-medium">Co-presenters</h3>
				<p class="text-muted-foreground text-sm">
					Anyone presenting this talk with you. They appear on the programme alongside you.
				</p>

				{#each coSpeakers as co (co.key)}
					<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
						<Input name="co-name" placeholder="Name" />
						<Input name="co-email" type="email" placeholder="Email" />
						<div class="flex gap-2">
							<Input name="co-role" placeholder="Role" class="sm:w-28" />
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
					onclick={() => (coSpeakers = [...coSpeakers, { key: nextKey++ }])}
				>
					Add a co-presenter
				</Button>
			</section>

			{#if signedIn}
				<div class="flex flex-wrap items-center gap-3 border-t pt-6">
					<Button type="submit" formaction="?/submit" disabled={busy}>Submit proposal</Button>
					<Button type="submit" formaction="?/draft" variant="outline" disabled={busy}>
						Save as draft
					</Button>
					<span class="text-muted-foreground text-sm">
						A draft needs only a title. You can finish it any time before the call closes.
					</span>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-3 border-t pt-6">
					<Button href="/login?returnTo=/c/{call.conference.slug}/cfp">Sign in to submit</Button>
					<span class="text-muted-foreground text-sm">
						Signing in takes you back to this form.
					</span>
				</div>
			{/if}
		</form>
	{/if}
</div>

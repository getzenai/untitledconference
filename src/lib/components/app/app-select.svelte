<script lang="ts">
	/**
	 * A dropdown in the app's own hand (#124).
	 *
	 * `<select>` is the last control on these screens the browser still draws
	 * itself — Safari's blue rounded box, Chrome's grey one, a system font next
	 * to shadcn inputs that all agree with each other. This is the shadcn select
	 * instead, with the one thing a form needs kept intact: `name`.
	 *
	 * The wire is unchanged. `Select.Root` renders its own hidden input as soon
	 * as it is given a name, carrying exactly the option value the native element
	 * carried, so every action that reads `formData.get('status')` keeps reading
	 * the same string. Omitting `name` — the preview column does — renders no
	 * input at all, which is right: a picture of a form should not post.
	 */
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils';

	type SelectOption = { value: string; label: string };

	let {
		name,
		// Deliberately not defaulted from `name`: the field editor renders one of
		// these per question, so `id="kind"` would be on the page four times over.
		// Callers that pair one with a <label for> pass an id of their own.
		id,
		value = '',
		options,
		placeholder = 'Select…',
		size = 'default',
		class: className,
		disabled = false,
		required = false,
		'aria-label': ariaLabel,
		onValueChange
	}: {
		/** The form field name. Omitted for a control that is only shown, never posted. */
		name?: string;
		id?: string;
		/** The stored option value, or empty when there is none. */
		value?: string | null;
		options: SelectOption[];
		placeholder?: string;
		size?: 'default' | 'sm';
		class?: string;
		disabled?: boolean;
		required?: boolean;
		'aria-label'?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	// Same reasoning as the date picker: `undefined` until the organizer picks,
	// so a value the server sends back after a rejected submit still shows;
	// seeding `$state` from the prop would freeze the field at whatever arrived
	// first.
	let picked = $state<string | undefined>(undefined);

	const current = $derived(picked ?? value ?? '');
	const label = $derived(options.find((option) => option.value === current)?.label ?? '');

	const choose = (next: string) => {
		picked = next;
		onValueChange?.(next);
	};
</script>

<Select.Root type="single" {name} {disabled} {required} value={current} onValueChange={choose}>
	<Select.Trigger
		{id}
		{size}
		aria-label={ariaLabel}
		data-testid={name ? `app-select-${name}` : undefined}
		class={cn('w-full justify-between font-normal', !label && 'text-muted-foreground', className)}
	>
		{label || placeholder}
	</Select.Trigger>

	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>

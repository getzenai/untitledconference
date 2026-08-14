<script lang="ts">
	/**
	 * A date field in the app's own hand (#124).
	 *
	 * `<input type="date">` hands the organizer whatever their browser feels like
	 * — Safari's stepper, Chrome's grid, a different font, a different language —
	 * next to controls that are all shadcn. This is a trigger, a popover and the
	 * shadcn calendar instead, so a conference's dates look like the rest of the
	 * screen.
	 *
	 * The wire is unchanged: a hidden input carries the same `name` and the same
	 * `YYYY-MM-DD` the native field posted, so every action, every validation
	 * message and every test that reads `startsOn` off the form data keeps
	 * working. What the organizer reads ("May 12, 2027") and what the server
	 * reads are deliberately two different strings.
	 */
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import type { DateValue } from '@internationalized/date';
	import { formatDay, toCalendarDate } from './date-value';

	let {
		name,
		id = name,
		value = '',
		placeholder = 'Pick a date',
		size = 'default',
		class: className,
		disabled = false,
		onpick,
		'aria-label': ariaLabel
	}: {
		name: string;
		id?: string;
		/** The stored day as `YYYY-MM-DD`, or empty when there is none. */
		value?: string | null;
		placeholder?: string;
		size?: 'default' | 'sm';
		class?: string;
		disabled?: boolean;
		/**
		 * Called with the new `YYYY-MM-DD` (or `''` when cleared) each time the
		 * organizer picks a day. The value still travels through the hidden input
		 * below; this exists because writing that input from script fires no
		 * `input` event, so a form watching its own fields would never hear a date
		 * being chosen (#435).
		 */
		onpick?: (value: string) => void;
		'aria-label'?: string;
	} = $props();

	// `undefined` while the organizer has not touched the field, so a value the
	// server sends after a rejected submit still shows; `''` once they clear it,
	// which is a choice and has to beat the stored day. Seeding `$state` from the
	// prop instead would freeze the field at whatever arrived first.
	let picked = $state<string | undefined>(undefined);
	let open = $state(false);

	const current = $derived(picked ?? value ?? '');
	const selected = $derived(toCalendarDate(current));
	const label = $derived(formatDay(current));

	const choose = (next: DateValue | undefined) => {
		picked = next ? next.toString() : '';
		open = false;
		onpick?.(picked);
	};
</script>

<input type="hidden" {name} value={current} />

<Popover.Root bind:open>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				{size}
				variant="outline"
				{disabled}
				aria-label={ariaLabel}
				data-testid="date-picker-{name}"
				class={cn(
					'w-full justify-between font-normal',
					!label && 'text-muted-foreground',
					className
				)}
			>
				{label || placeholder}
				<CalendarIcon class="size-4 opacity-60" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-auto p-0" align="start">
		<!-- The month and year are dropdowns: a conference two years out is four
		     clicks away otherwise, and the native field let them type it. -->
		<Calendar
			type="single"
			value={selected}
			captionLayout="dropdown"
			onValueChange={choose}
			data-testid="date-picker-calendar-{name}"
		/>
		{#if current}
			<div class="border-border flex justify-end border-t p-2">
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						picked = '';
						open = false;
					}}
					data-testid="date-picker-clear-{name}"
				>
					Clear
				</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>

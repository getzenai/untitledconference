---
title: shadcn-svelte Select Component Implementation
description: AI reference for correctly implementing shadcn-svelte Select component - avoiding missing Select.Root errors and proper value binding patterns
tags:
  - shadcn-svelte
  - bits-ui
  - select
  - dropdown
  - select-component
  - Select.Root
  - Select.Trigger
  - Select.Content
  - Select.Item
  - form-controls
  - ui-components
  - value-binding
  - svelte-5
  - type-single
  - type-multiple
---

# shadcn-svelte Select Component Implementation

## The Problem

The most common error when implementing Select is forgetting `Select.Root`, which results in: "Cannot read properties of undefined" or components not rendering. Select components require the complete hierarchy starting with `Select.Root`.

## Common Mistakes

```svelte
<!-- ❌ BAD: Missing Select.Root -->
<script>
  import * as Select from '$lib/components/ui/select';
  let value = $state('');
</script>

<Select.Trigger>
  Select an option
</Select.Trigger>
<Select.Content>
  <Select.Item value="opt1">Option 1</Select.Item>
</Select.Content>

<!-- ❌ BAD: Not importing as namespace -->
<script>
  import { SelectTrigger, SelectContent } from '$lib/components/ui/select';
</script>

<!-- ❌ BAD: Forgetting to bind value -->
<Select.Root type="single">
  <Select.Trigger>Choose</Select.Trigger>
  <!-- No bind:value means selection won't work -->
</Select.Root>

<!-- ❌ BAD: Incorrect value type for single select -->
<script>
  let value = $state([]); // Wrong: single select needs string
</script>
<Select.Root type="single" bind:value>
```

## Correct Implementation

### Single Select (Most Common)

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	// Single select: value is string
	let selectedValue = $state<string>('');

	// Options data
	const options = [
		{ value: 'apple', label: 'Apple' },
		{ value: 'banana', label: 'Banana' },
		{ value: 'orange', label: 'Orange' }
	];

	// Derive display label from selected value
	let selectedLabel = $derived(
		options.find((opt) => opt.value === selectedValue)?.label || 'Select a fruit'
	);
</script>

<!-- ✅ CORRECT: Complete hierarchy with Select.Root -->
<Select.Root type="single" bind:value={selectedValue}>
	<Select.Trigger>
		{selectedLabel}
	</Select.Trigger>
	<Select.Content>
		{#each options as option}
			<Select.Item value={option.value} label={option.label}>
				{option.label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
```

### Real Examples from Codebase

#### Example 1: Simple Select with Options

```svelte
<!-- From ui-components example -->
<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	let selectValue = $state<string>('');
	const selectOptions = [
		{ value: 'option1', label: 'Option 1' },
		{ value: 'option2', label: 'Option 2' },
		{ value: 'option3', label: 'Option 3' }
	];

	let selectedLabel = $derived(
		selectValue
			? selectOptions.find((opt) => opt.value === selectValue)?.label || 'Select an option'
			: 'Select an option'
	);
</script>

<Select.Root type="single" bind:value={selectValue}>
	<Select.Trigger data-testid="select-trigger">
		{selectedLabel}
	</Select.Trigger>
	<Select.Content>
		{#each selectOptions as option}
			<Select.Item
				value={option.value}
				label={option.label}
				data-testid={`select-${option.value}`}
			/>
		{/each}
	</Select.Content>
</Select.Root>
```

#### Example 2: Select with Dynamic Content

```svelte
<!-- From organization settings -->
<script lang="ts">
  import * as Select from '$lib/components/ui/select';

  let selectedNewOwner = $state('');
  let members = $state([...]); // Array of member objects
</script>

<Select.Root
	type="single"
	bind:value={selectedNewOwner}
	onValueChange={(v) => (selectedNewOwner = v || '')}
>
	<Select.Trigger id="newOwner">
		<span>
			{#if selectedNewOwner}
				{members.find((m) => m.id === selectedNewOwner)?.user?.email || 'Select member'}
			{:else}
				Select member
			{/if}
		</span>
	</Select.Trigger>
	<Select.Content>
		{#each members.filter((m) => m.userId !== currentUserId) as member}
			<Select.Item value={member.id}>
				{member.user?.email}
				{#if member.role === 'admin'}
					<span class="text-muted-foreground ml-1">(Admin)</span>
				{/if}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
```

### Multiple Select

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	// Multiple select: value is array of strings
	let selectedValues = $state<string[]>([]);

	const options = [
		{ value: 'red', label: 'Red' },
		{ value: 'green', label: 'Green' },
		{ value: 'blue', label: 'Blue' }
	];

	let displayText = $derived(
		selectedValues.length > 0 ? `${selectedValues.length} selected` : 'Select colors'
	);
</script>

<Select.Root type="multiple" bind:value={selectedValues}>
	<Select.Trigger>
		{displayText}
	</Select.Trigger>
	<Select.Content>
		{#each options as option}
			<Select.Item value={option.value} label={option.label}>
				{option.label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
```

## Key Requirements

1. **Always import as namespace**: `import * as Select from '$lib/components/ui/select'`
2. **Always start with Select.Root**: Required wrapper component
3. **Specify type**: `type="single"` or `type="multiple"`
4. **Bind value**: Use `bind:value` for two-way binding
5. **Match value types**: String for single, string[] for multiple
6. **Provide Item values**: Each Select.Item needs `value` prop

## Component Hierarchy

```
Select.Root (required wrapper)
├── Select.Trigger (clickable element)
└── Select.Content (dropdown panel)
    ├── Select.Group (optional grouping)
    │   ├── Select.Label (group label)
    │   └── Select.Item (selectable option)
    └── Select.Item (ungrouped option)
```

## Quick Reference Pattern

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	let value = $state<string>('');
	const options = [
		/* your options */
	];
	let label = $derived(
		value ? options.find((o) => o.value === value)?.label || 'Select' : 'Select'
	);
</script>

<Select.Root type="single" bind:value>
	<Select.Trigger>{label}</Select.Trigger>
	<Select.Content>
		{#each options as opt}
			<Select.Item value={opt.value} label={opt.label} />
		{/each}
	</Select.Content>
</Select.Root>
```

## Testing Select Components

```typescript
// E2E test example
await page.click('[data-testid="select-trigger"]');
await page.click('[data-testid="select-option1"]');
expect(await page.locator('[data-testid="select-trigger"]').textContent()).toBe('Option 1');
```

## Common Error Messages and Fixes

- **"Cannot read properties of undefined (reading 'Trigger')"** → Missing Select.Root
- **"Select.Item must be used within Select.Content"** → Wrong component hierarchy
- **Selection not working** → Missing `bind:value` on Select.Root
- **Value not updating** → Wrong value type (string vs array)

## Related Documentation

- [shadcn-svelte Select docs](https://www.shadcn-svelte.com/docs/components/select)
- [bits-ui Select](https://www.bits-ui.com/docs/components/select)

# Components

## Organization

```
components/
    ui/                   # shadcn-svelte primitives (bits-ui based) — see below
    document-editor/       # Tiptap-based rich text editor + extensions
    app-sidebar.svelte     # Feature/layout components at the top level
    nav-*.svelte
    file-upload.svelte
    impersonation-banner.svelte
    ...
```

- `ui/` holds shadcn-svelte's generated primitives (button, dialog, dropdown-menu, sidebar, form,
  etc.), built on `bits-ui`. These are meant to be regenerated via the shadcn-svelte CLI — avoid
  hand-editing them for one-off needs; wrap or compose instead so a future regeneration doesn't
  clobber custom logic.
- Everything else is a feature/layout component living at the top level or in its own subdirectory
  for multi-file features (`document-editor/`).
- Use the `cn()` helper from `$lib/utils` to merge Tailwind classes conditionally:
  `class={cn('base-classes', conditional && 'conditional-class')}`.

## Svelte 5 Runes

New and recently-touched components (e.g. `nav-user.svelte`, everything in `ui/`) use plain
Svelte 5 runes — this is the pattern to follow for new code:

```svelte
<script lang="ts">
	let { user }: { user: App.Locals['user'] } = $props();
	let { value = $bindable() }: { value: string } = $props(); // two-way bindable prop
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>
```

Not every component in the tree has been modernized to this style yet — some older files still use
`svelte/legacy` interop helpers (e.g. `import { run } from 'svelte/legacy'` in place of
`$effect`). Don't treat those as the pattern to copy; when you touch such a file, prefer migrating
the piece you're editing to runes over extending the legacy interop further, but that's a judgment
call scoped to what you're already changing, not a mandate to do a wholesale rewrite.

### Trigger Snippet Pattern

bits-ui triggers (`Dialog.Trigger`, `DropdownMenu.Trigger`, `Popover.Trigger`, etc.) that need a
custom child element use the Svelte 5 snippet form, as in `nav-user.svelte`:

```svelte
<DropdownMenu.Trigger>
	{#snippet child({ props })}
		<Sidebar.MenuButton {...props} size="lg">...</Sidebar.MenuButton>
	{/snippet}
</DropdownMenu.Trigger>
```

The older `asChild` + `let:builder` pattern is a Svelte 4 idiom and does not apply to this
bits-ui/Svelte 5 setup.

### `{#each}` Keys

Key list blocks by a stable identifier to avoid state bugs when items are added, removed, or
reordered:

```svelte
{#each items as item (item.id)}
	<Component {item} />
{/each}
```

## Internationalization

`messages/en.json` and `messages/de.json` plus ParaglideJS (`$lib/paraglide/messages`) are wired up
and demonstrated in `src/routes/(protected)/(with-sidebar)/examples/paraglide/+page.svelte`. This
is scaffolding for a project that wants i18n from day one — it is **not** yet an enforced
convention across the existing components: most feature components (`nav-user.svelte`,
`app-sidebar.svelte`, etc.) currently use hardcoded English strings. If your project needs i18n,
follow the `examples/paraglide` page as the pattern; if not, hardcoded strings match the rest of
the codebase as it stands.

## Forms (Superforms + Formsnap)

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';

	let { data } = $props();
	const form = superForm(data.form, { validators: zodClient(schema) });
	const { form: formData, enhance, submitting } = form;
</script>

<form method="POST" use:enhance>
	<!-- Formsnap fields -->
</form>
```

See `ai-dev-docs/howtos/formsnap-superforms-with-actions.md` and
`ai-dev-docs/howtos/formsnap-superforms-client-only.md` for the two supported patterns (server
actions vs. client-only/SPA forms), and `ai-dev-docs/howtos/zod-v4-superforms-compatibility.md` for
the Zod v3/v4 interop gotchas (`package.json` pins an override forcing Zod v4 everywhere).

## Common Pitfalls

1. Using the Svelte 4 `let:builder` trigger pattern instead of the snippet form.
2. Missing `{#each}` keys — causes state to "stick" to the wrong item when a list changes.
3. Hand-editing `ui/` primitives instead of composing/wrapping them.
4. Assuming i18n is enforced project-wide — check whether the surrounding code actually uses it.

# Validate & Update API Surface Map

**Source of truth:** `docs/arc42/api-surface.puml`
**Rendered outputs:** `docs/arc42/api-surface.png` + `.svg`

When this workflow is referenced, validate the PUML diagram against the
current codebase and update it with any discrepancies found.

## Step 1: Parallel Validation

Launch up to 2 Explore agents in parallel:

### Agent 1: Route Handlers

Search `src/routes/` for all `+page.server.ts` and `+server.ts` files:

- Compare exported `load` functions against PUML route entries
- Compare exported `actions` against PUML POST annotations
- Check for new routes not in the diagram
- Check for removed routes still in the diagram
- Verify redirect targets match actual code

### Agent 2: Client Routes & Layouts

Search `src/routes/` for all `+page.svelte` and `+layout.svelte` files:

- Compare route paths (directory structure) against PUML component entries
- Check layout group assignments: `(public)`, `(protected)`, `(admin)`
- Verify client-only routes (no `+page.server.ts`) are noted correctly
- Check for Better Auth client-side form patterns

## Step 2: Compile Findings

Categorize discrepancies by severity:

- **High** — Diagram shows routes or actions that don't exist, or misses routes with server-side actions
- **Medium** — Missing route entries or incorrect action descriptions
- **Low** — Minor annotation differences, missing notes on client-only behavior

## Step 3: Update the PUML

Apply corrections directly to `docs/arc42/api-surface.puml`:

- Fix factual errors (wrong actions, wrong redirect targets)
- Add missing routes as new components with notes
- Remove routes that no longer exist in code
- Do NOT add internal/utility routes or API routes handled by Better Auth catch-all

## Step 4: Re-render

```bash
cd docs/arc42
plantuml -DPLANTUML_LIMIT_SIZE=16384 -tpng -o . api-surface.puml
plantuml -DPLANTUML_LIMIT_SIZE=16384 -tsvg -o . api-surface.puml
```

Important: the PUML file must NOT have a name after `@startuml`.

## Step 5: Verify

Read the rendered PNG and visually confirm all sections are visible:

1. Root redirect
2. (public) group with all auth routes
3. (protected) group with documents, examples, settings
4. (admin) group with user management
5. API routes (Better Auth catch-all)

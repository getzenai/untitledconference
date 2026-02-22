# Validate & Update Service Architecture

**Source of truth:** `docs/arc42/service-architecture.puml`
**Rendered outputs:** `docs/arc42/service-architecture.png` + `.svg`

When this workflow is referenced, validate the PUML diagram against the
current codebase and update it with any discrepancies found.

## Step 1: Parallel Validation

Launch up to 2 Explore agents in parallel:

### Agent 1: Server-Side Services

Search `src/lib/server/` for all `.ts` files:

- Compare exports in `config.ts` against PUML Config component
- Compare DB schemas (`db/auth-schema.ts`, `db/documents-schema.ts`, `db/examples/crud-example-schema.ts`) against PUML Schemas
- Compare AI provider files (`ai/factory.ts`, `ai/azure-openai-provider.ts`, `ai/mock-provider.ts`) against PUML AI Provider package
- Compare service files (`services/email-service.ts`, `services/system-invitation.ts`) against PUML Communication package
- Compare document operations (`documents/operations.ts`, `documents/tiptap-validator.ts`) against PUML Documents package
- Compare utils (`utils/organization-transfer.ts`) against PUML Organization Utils
- Check for new services or modules not in the diagram

### Agent 2: Route Dependencies

Search `src/routes/` for all `+page.server.ts` files:

- Check which server-side imports are used (db, services, auth, config)
- Verify dependency arrows in PUML match actual import chains
- Check for new external service integrations
- Verify the middleware description matches `hooks.server.ts`

## Step 2: Compile Findings

Categorize discrepancies by severity:

- **High** — Diagram shows services or dependencies that don't match implementation
- **Medium** — Missing services, incorrect dependency arrows, outdated schema details
- **Low** — Minor annotation differences, missing notes

## Step 3: Update the PUML

Apply corrections directly to `docs/arc42/service-architecture.puml`:

- Fix factual errors (wrong dependencies, wrong exports)
- Add missing services or modules as new components
- Update dependency arrows to match actual imports
- Remove services that no longer exist
- Update schema details if tables were added/removed
- Do NOT add test utilities or build-only modules

## Step 4: Re-render

```bash
cd docs/arc42
plantuml -DPLANTUML_LIMIT_SIZE=16384 -tpng -o . service-architecture.puml
plantuml -DPLANTUML_LIMIT_SIZE=16384 -tsvg -o . service-architecture.puml
```

Important: the PUML file must NOT have a name after `@startuml`.

## Step 5: Verify

Read the rendered PNG and visually confirm all sections are visible:

1. SvelteKit Application layer (routes, middleware, config)
2. Services & Operations (auth, documents, AI, communication, org utils, logger)
3. Data Layer (Drizzle ORM, all schemas)
4. External Services (Azure KV, PostgreSQL, SendGrid, OpenAI, GitHub)
5. All dependency arrows connecting the layers

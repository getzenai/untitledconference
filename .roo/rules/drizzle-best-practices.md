# Drizzle ORM Best Practices

## Schema Management

- **Schema Synchronization**: After making changes to Drizzle ORM schemas (e.g., in `src/lib/server/db/*-schema.ts`), always run the appropriate Drizzle Kit command (like `npm run db:push` for development or `npm run db:migrate` for production workflows) to synchronize your database structure. This prevents runtime errors such as "table not found" or "column not found."

## Database Interaction

- **Leverage ORM and Database Features**: Prefer using the built-in capabilities of Drizzle ORM and your underlying database (e.g., PostgreSQL's `serial` type for auto-incrementing IDs, or other database-specific functions for default values like `now()`) for tasks like ID generation and setting default column values. This often simplifies your application code and can be more performant than implementing custom solutions.
- **Type Safety**: Ensure that data used in Drizzle queries, especially values coming from client requests (e.g., route parameters, form data), are correctly parsed to their expected types (e.g., using `parseInt()` for numeric IDs that are strings in `event.params`) before being passed to Drizzle's `eq()`, `values()`, or `set()` methods.

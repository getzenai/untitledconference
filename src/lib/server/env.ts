/**
 * Server environment — the single runtime entry point for reading configuration.
 *
 * The variable inventory (the source of truth that documents `.env.example`)
 * lives in `src/lib/env/server-env-schema.ts`, deliberately free of `$env`
 * imports so it can be unit-tested directly. This module binds it to the running
 * process:
 *
 * - Values are read at RUNTIME from `$env/dynamic/private` (the deploy target and
 *   `scripts/infisical/dev-from-infisical.sh` inject them into the process
 *   environment at start), never inlined at build time.
 * - `serverEnv()` validates on first use and throws a single aggregated error
 *   listing every problem, so one run surfaces all misconfiguration instead of
 *   one variable at a time.
 * - Call it lazily, from inside a function — never at module scope. `vite build`
 *   evaluates the server bundle without any secrets (see CLAUDE.md, "Git Hooks &
 *   CI Parity"), and a module-scope call would abort the build.
 *
 * Server-only by virtue of living under `$lib/server`: never import it from
 * client code.
 */
import { formatEnvIssues } from '$lib/env/format';
import { serverEnvSchema, type ServerEnv } from '$lib/env/server-env-schema';

/**
 * Resolved dynamically so this module also loads outside SvelteKit: the job
 * worker (`src/lib/server/jobs/worker.ts`) is bundled by esbuild into
 * `build/worker.js` and runs as a plain Node process, where the virtual module
 * `$env/dynamic/private` does not exist. Same fallback as `./logger.ts`.
 */
let rawEnv: Record<string, string | undefined> = process.env;

try {
	const envModule = await import('$env/dynamic/private');
	rawEnv = envModule.env;
} catch {
	// Not in a SvelteKit environment, use process.env
}

export type { ServerEnv };

let cached: ServerEnv | null = null;

/** The validated, coerced server environment. Parsed once, then cached. */
export function serverEnv(): ServerEnv {
	if (cached) return cached;

	const result = serverEnvSchema.safeParse(rawEnv);
	if (!result.success) {
		throw new Error(
			`${formatEnvIssues(result.error.issues, 'server environment')}\n\n` +
				'See src/lib/env/server-env-schema.ts for the full list of variables, and run ' +
				'`npm run dev` (which loads secrets from Infisical) or set them in .env.'
		);
	}

	cached = result.data;
	return cached;
}

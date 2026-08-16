import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';

/**
 * What the running client calls "my build".
 *
 * SvelteKit writes this into `_app/version.json` and into the client bundle; the
 * client compares the two to learn that the deploy it is running no longer
 * exists. The default is a build timestamp, which changes on every build of the
 * same code — a rebuild that ships nothing new would then tell every open tab to
 * reload. The commit is the honest unit: it changes exactly when what we ship
 * changes.
 *
 * `GITHUB_SHA` is what the deploy workflow has (it builds from a checkout of
 * `main`). Locally `git rev-parse` answers. If neither does — a build from a
 * tarball, say — fall back to a timestamp, which is SvelteKit's own default and
 * never worse than it.
 */
function buildVersion() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;

	try {
		return execSync('git rev-parse HEAD', {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return Date.now().toString();
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Kit's origin check runs before `handle`, so it cannot be relaxed for one
		// route. The OAuth token endpoint has to accept a form POST with no Origin
		// header (RFC 6749, server-to-server), so the check moves into
		// `hooks.server.ts` — same rule, one exception. Do not turn this back on
		// without deleting `csrfHandler` there, or every form action is checked twice.
		csrf: { checkOrigin: false },
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			// Read bindings/vars from wrangler.jsonc during `vite dev`/`vite preview`
			platformProxy: {
				configPath: 'wrangler.jsonc',
				persist: true
			}
		}),

		// A deploy deletes the previous build's hashed chunks. A tab that was open
		// while we shipped still holds the old client, and its next route import is
		// a 404 — the click does nothing and nothing appears on screen (#702).
		//
		// The poll makes the client notice on its own instead of finding out by
		// dying: every 60 s it fetches `_app/version.json` and compares. When it
		// differs, `updated` flips and the root layout turns the next navigation
		// into a real page load (`src/lib/navigation/stale-build.ts`). 60 s is
		// chosen against the deploy itself, which takes ~3 minutes: a tab learns
		// well inside the window in which its chunks disappear.
		version: {
			name: buildVersion(),
			pollInterval: 60_000
		}
	}
};

export default config;

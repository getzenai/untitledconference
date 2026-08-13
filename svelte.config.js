import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

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
		})
	}
};

export default config;

/**
 * Single compile config for the Vite plugin and `scripts/compile-paraglide.mjs`.
 *
 * The default URL pattern treats the locale segment as optional, so `url`
 * always returns the base locale and `preferredLanguage` never runs. Reordering
 * the global strategy would let Accept-Language beat `/de/...` and break every
 * language link. Route rules keep `url` only when the locale is actually in
 * the path; unprefixed routes fall through to Accept-Language, then `en`.
 */
export const paraglideCompilerOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	strategy: ['localStorage', 'url', 'preferredLanguage', 'baseLocale'],
	routeStrategies: [
		{ match: '/de/:path(.*)?', strategy: ['url', 'baseLocale'] },
		{
			match: '/:path(.*)?',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		}
	]
};

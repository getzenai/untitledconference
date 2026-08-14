import { m } from '$lib/paraglide/messages';
import { describe, expect, it } from 'vitest';

/**
 * The app writes hardcoded English; ParaglideJS is wired but not yet used for copy.
 * `locale_name` is the one message that keeps that wiring honest: it proves the
 * compiler still turns `messages/<locale>.json` into per-locale functions, so the
 * locale a request resolves to (hooks.server.locale.unit.test.ts) and the locale the
 * public cache keys on (public-page-cache.unit.test.ts) would actually change words.
 * Without it the message set is empty and Paraglide emits an index that is not a
 * module — `npm run check` fails. Delete this test only together with Paraglide.
 */
describe('paraglide message compilation', () => {
	it('gives each configured locale its own string', () => {
		expect(m.locale_name({}, { locale: 'en' })).toBe('English');
		expect(m.locale_name({}, { locale: 'de' })).toBe('Deutsch');
	});
});

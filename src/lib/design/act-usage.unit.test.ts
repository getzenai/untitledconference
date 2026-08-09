/**
 * `--act` may be a surface. It may never be a foreground colour.
 *
 * The contrast test next door checks every pair the token file *declares* — and that
 * is exactly why it could not catch this one. `act-foreground` on `act` is 9.79:1 and
 * passes; the misuse is bare `act` as text or an icon on the page background, which is
 * 2.02:1 and is not a declared pair at all. Adding it to the pair list would only make
 * the suite red for a combination we never want to ship anyway.
 *
 * So the rule is enforced where it is broken: in the class attribute. It cost us a
 * near-invisible star on the itinerary before this test existed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../..', import.meta.url));

/** `text-act`, `border-act`, `fill-act` … but not `text-act-foreground`. */
const BARE_ACT =
	/\b(?:text|border|ring|outline|fill|stroke|decoration|divide|caret|accent)-act\b(?!-)/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Generated i18n output is not hand-written design.
			return entry.name === 'paraglide' ? [] : sourceFiles(path);
		}
		return /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('act-usage.unit.test.ts')
			? [path]
			: [];
	});
}

describe('--act is rationed', () => {
	it('never appears as a bare foreground colour', () => {
		const offenders = sourceFiles(SRC).flatMap((file) =>
			readFileSync(file, 'utf8')
				.split('\n')
				.map((line, i) => ({ line, number: i + 1 }))
				.filter(({ line }) => BARE_ACT.test(line))
				.map(({ number }) => `${file.replace(SRC, 'src/')}:${number}`)
		);

		// If this fails: `--act` is a surface. Use `bg-act text-act-foreground`, or pick
		// a status token — `text-status-warn` is the usual answer for an indicator.
		expect(offenders).toEqual([]);
	});
});

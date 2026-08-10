/**
 * Seed recordings must be real public talks — never the unlisted challenge-entry
 * video that went live on the agenda by mistake (issue #84).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const seedSource = readFileSync(join(root, 'scripts/db/seed-data.mjs'), 'utf8');
const fixtureSource = readFileSync(join(root, 'src/lib/conference/public-fixtures.ts'), 'utf8');
const fixScript = readFileSync(join(root, 'scripts/db/fix-recording-urls.mjs'), 'utf8');

const FORBIDDEN = 'oE49MdbPNYw';

/** Public AI Engineer channel ids used as replacements (issue #84). */
const EXPECTED_IDS = ['ju73sWVtvU0', '0ML7ZLMdcl4', '5N33E9tC400', 'D7_ipDqhtwk', 'PAy_GHUAICw'];

describe('seed recording URLs (issue #84)', () => {
	it('does not reference the unlisted challenge-entry video in seed or fixtures', () => {
		expect(seedSource).not.toContain(FORBIDDEN);
		expect(fixtureSource).not.toContain(FORBIDDEN);
	});

	it('pins public AI Engineer talks for seeded recordings', () => {
		for (const id of EXPECTED_IDS) {
			expect(seedSource).toContain(id);
		}
	});

	it('ships an idempotent prod fix script for the old id', () => {
		expect(fixScript).toContain(FORBIDDEN);
		expect(fixScript).toContain('--dry-run');
		expect(fixScript).toContain('placement');
		expect(fixScript).toContain('submission_answer');
	});
});

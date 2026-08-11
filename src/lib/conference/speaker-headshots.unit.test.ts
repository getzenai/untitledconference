/**
 * Every seeded headshot shows the initials of the speaker it belongs to.
 *
 * The demo speakers have no photographs, so each headshot is a placeholder SVG
 * with two letters in it. They were named after computer-science pioneers and
 * handed out in order, which put "JB" (Jean Bartik) on Tomiwa Adeyemi's card and
 * seven more like it — a judge reading the public gallery sees initials that
 * contradict the name printed under them, and a wrong letter reads as *data*,
 * where a missing photo reads as a missing photo.
 *
 * The file names are historical and stay that way on purpose: the seeded rows in
 * production point at them, so renaming would break every image until somebody
 * re-seeds. What has to hold is the pairing, and that is what this pins — the
 * letters come from the same rule the fallback avatar uses, so a speaker with a
 * placeholder and one without never disagree about their own initials.
 *
 * The seed is read as text rather than imported: `scripts/` is outside the app's
 * type-checked sources, and importing it from here drags the whole file into
 * `svelte-check` (which it does not survive).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { initials } from './public-view';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const seedSource = readFileSync(join(root, 'scripts/db/seed-data.mjs'), 'utf8');

/**
 * `name: 'Tomiwa Adeyemi'` … `headshot: '/speakers/bartik.svg'` inside one entry.
 *
 * The "no further `name:` in between" clause is what makes it one entry: without
 * it the match runs past a speaker whose headshot is `null` and pairs their name
 * with the next speaker's file — which is the very mistake this test is about.
 */
const PAIR = /name: '([^']+)',(?:(?!name: ')[\s\S])*?headshot: '([^']+)'/g;

const pairs = [...seedSource.matchAll(PAIR)].map(([, name, headshot]) => ({ name, headshot }));

describe('seeded placeholder headshots', () => {
	it('finds the speakers the demo conference shows a photo for', () => {
		// A guard on the guard: a regex that stops matching would make every
		// assertion below pass vacuously.
		expect(pairs.length).toBeGreaterThanOrEqual(8);
		expect(pairs.map((p) => p.name)).toContain('Tomiwa Adeyemi');
	});

	it('gives each of them their own initials', () => {
		const wrong = pairs.filter(({ name, headshot }) => {
			const svg = readFileSync(join(root, 'static', headshot), 'utf8');
			const expected = initials(name);
			// Both places the two letters appear: the drawn text and the label a
			// screen reader would reach if the image were rendered with a role of
			// its own.
			return !svg.includes(`>${expected}</text>`) || !svg.includes(`aria-label="${expected}"`);
		});

		expect(wrong.map(({ name, headshot }) => `${name} → ${headshot}`)).toEqual([]);
	});
});

/**
 * Where the itinerary's *Add to calendar* gets its bytes (#822).
 *
 * The export runs on a click, in a browser, against a `Blob` — so what a unit
 * test can hold here is the seam, not the download: this page asks `icalFile`
 * for the file and assembles no calendar of its own. That is the property that
 * broke, and it broke silently — a second builder next to the hardened one, with
 * none of its folding or escaping. `personal-schedule.unit.test.ts` holds what
 * the bytes then say.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/routes/(public)/c/[slug]/itinerary/+page.svelte', 'utf8');

describe('the itinerary export', () => {
	it('writes the file with the same writer as the subscription feed', () => {
		expect(source).toContain("import { icalFile } from '$lib/conference/ical'");
		expect(source).toContain('icalFile(view.conference.name, scheduleEvents(mine), new Date())');
	});

	it('assembles no calendar of its own', () => {
		expect(source).not.toContain('BEGIN:VCALENDAR');
		expect(source).not.toContain('DTSTART');
		expect(source).not.toContain('buildIcs');
	});
});

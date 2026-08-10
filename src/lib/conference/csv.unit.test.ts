/**
 * The CSV rules, checked one at a time.
 *
 * Every case here is one that produces a file which opens without an error message
 * and says something other than what we wrote — the only failure mode this module
 * has.
 */
import { describe, expect, it } from 'vitest';
import { csvCell, csvFile, csvFilename } from './csv';

describe('a cell', () => {
	it('leaves an ordinary value alone', () => {
		expect(csvCell('Serving 70B models on a budget')).toBe('Serving 70B models on a budget');
		expect(csvCell(4.3)).toBe('4.3');
	});

	it('quotes the three characters that would end the field or the record', () => {
		expect(csvCell('Testing, briefly')).toBe('"Testing, briefly"');
		expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
		expect(csvCell('say "hello"')).toBe('"say ""hello"""');
	});

	it('renders an empty cell for nothing at all, and a zero for zero', () => {
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
		// A score of 0 is a rating, not a blank. The two must not collapse.
		expect(csvCell(0)).toBe('0');
	});

	it('defuses a title that a spreadsheet would run instead of show', () => {
		// A submitter can type this into the title field, and it reaches the organizer
		// as a formula unless something stops it here.
		// No CSV quoting here: apostrophes are ordinary characters in a field. Only the
		// leading `=` had to be neutralised.
		expect(csvCell("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
		expect(csvCell('+1 more thing')).toBe("'+1 more thing");
		expect(csvCell('-- a talk')).toBe("'-- a talk");
		expect(csvCell('@mentions in talks')).toBe("'@mentions in talks");

		// And it stays a defusing, not a rewrite: the original is still readable.
		expect(csvCell('+1 more thing').endsWith('+1 more thing')).toBe(true);
	});
});

describe('a file', () => {
	it('carries a BOM and CRLF endings, for the reader that needs them', () => {
		const file = csvFile(['title', 'score'], [['A talk', 4.3]]);

		expect(file.startsWith('\uFEFF')).toBe(true);
		expect(file).toBe('\uFEFFtitle,score\r\nA talk,4.3\r\n');
	});

	it('survives a title with a comma, a quote and a newline in the same row', () => {
		const file = csvFile(['title', 'speaker'], [['A talk, "properly"\nnamed', 'Ada Lovelace']]);

		// Two records, not four: the embedded newline is inside quotes.
		expect(file.trimEnd().split('\r\n')).toHaveLength(2);
		expect(file).toContain('"A talk, ""properly""\nnamed"');
	});

	it('writes a header even when there is nothing to export', () => {
		// An empty file reads as a broken export; a header alone reads as "no rows".
		expect(csvFile(['title'], [])).toBe('\uFEFFtitle\r\n');
	});
});

describe('a filename', () => {
	it('joins the parts it was given', () => {
		expect(csvFilename('devflow-conf-2027', 'submissions', '2026-08-10')).toBe(
			'devflow-conf-2027-submissions-2026-08-10.csv'
		);
	});

	it('cannot carry a second header out of a slug', () => {
		// A newline in a header is a header injection, and this name is built from
		// stored data rather than from a literal.
		const name = csvFilename('evil\r\nX-Injected: yes', 'submissions');

		expect(name).not.toMatch(/[\r\n]/);
		expect(name).toBe('evil-X-Injected-yes-submissions.csv');
	});

	it('still has a name when every character was dropped', () => {
		expect(csvFilename('///', '')).toBe('export.csv');
	});
});

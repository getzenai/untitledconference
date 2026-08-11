/**
 * The CSV reader behind the roster import (SPK-03 / CRM-05).
 *
 * Every case here is a real file somebody exported from something else: Excel on
 * Windows, Google Sheets, a conference tool with its own column names. The
 * failures are the point — a parser that is nearly right turns one wrong cell
 * into a roster nobody notices is wrong.
 */
import { describe, expect, it } from 'vitest';
import { importedMessage, MAX_ROWS, parseCsv, readSpeakerCsv } from './speaker-csv';

describe('parseCsv', () => {
	it('reads plain rows', () => {
		expect(parseCsv('a,b\n1,2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('treats CRLF as one break, not two', () => {
		expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('keeps commas and newlines inside quoted cells', () => {
		expect(parseCsv('name,bio\n"Vance, Bob","Line one\nLine two"')).toEqual([
			['name', 'bio'],
			['Vance, Bob', 'Line one\nLine two']
		]);
	});

	it('reads a doubled quote as one literal quote', () => {
		expect(parseCsv('name\n"Bob ""Bo"" Vance"')).toEqual([['name'], ['Bob "Bo" Vance']]);
	});

	it('leaves a quote in the middle of a cell alone', () => {
		// The alternative reading swallows the rest of the file into one field.
		expect(parseCsv('name\nBob "Bo" Vance\nPriya Raman')).toEqual([
			['name'],
			['Bob "Bo" Vance'],
			['Priya Raman']
		]);
	});

	it('drops a leading byte-order mark', () => {
		expect(parseCsv('﻿name,email')).toEqual([['name', 'email']]);
	});

	it('does not invent a row for the trailing newline', () => {
		expect(parseCsv('a\nb\n')).toEqual([['a'], ['b']]);
	});

	it('keeps a last row that has no trailing newline', () => {
		expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
	});

	it('keeps empty cells rather than collapsing them', () => {
		expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
	});

	it('reads a trailing comma as an empty last field', () => {
		// A row whose last column is blank is exactly what a spreadsheet writes for a
		// speaker with no company. Losing the field would shift nothing here, but it
		// would make the row a different width than its header.
		expect(parseCsv('a,b,\n')).toEqual([['a', 'b', '']]);
	});

	it('keeps what an unclosed quote had rather than dropping the rest of the file', () => {
		expect(parseCsv('name\n"Ada Bennett')).toEqual([['name'], ['Ada Bennett']]);
	});
});

describe('readSpeakerCsv', () => {
	it('maps the obvious header row', () => {
		const result = readSpeakerCsv(
			'name,email,job title,company,bio,notes,status\nPriya Raman,priya@example.com,Staff Engineer,Acme,Builds things.,Met at KubeCon,confirmed\n'
		);

		expect(result).toEqual({
			ok: true,
			rows: [
				{
					line: 2,
					name: 'Priya Raman',
					email: 'priya@example.com',
					jobTitle: 'Staff Engineer',
					company: 'Acme',
					bio: 'Builds things.',
					notes: 'Met at KubeCon',
					status: 'confirmed'
				}
			]
		});
	});

	it('accepts the header names other tools write', () => {
		const result = readSpeakerCsv(
			'Full Name,E-Mail,Organisation\nAda Bennett,ada@example.com,Globex'
		);

		expect(result).toEqual({
			ok: true,
			rows: [
				{
					line: 2,
					name: 'Ada Bennett',
					email: 'ada@example.com',
					jobTitle: null,
					company: 'Globex',
					bio: null,
					notes: null,
					status: null
				}
			]
		});
	});

	it('ignores columns it does not know', () => {
		const result = readSpeakerCsv('name,twitter\nAda Bennett,@ada');
		expect(result.ok && result.rows[0]).toMatchObject({ name: 'Ada Bennett' });
	});

	it('numbers rows as the spreadsheet does, counting the blank ones it skips', () => {
		const result = readSpeakerCsv('name\nAda Bennett\n\n\nRow five has no name here');
		expect(result.ok && result.rows.map((r) => r.line)).toEqual([2, 5]);
	});

	it('refuses a file with no name column, and says what a header row looks like', () => {
		const result = readSpeakerCsv('Ada Bennett,ada@example.com\nPriya Raman,priya@example.com');
		expect(result).toMatchObject({ ok: false });
		expect(!result.ok && result.problem).toContain('header row');
	});

	it('refuses the whole file when one row has no name, naming the row', () => {
		const result = readSpeakerCsv('name,email\nAda Bennett,ada@example.com\n,priya@example.com');
		expect(!result.ok && result.problem).toBe('Row 3 has no name. Every speaker needs one.');
	});

	it('refuses a value in the email column that is not an address', () => {
		// The realistic import bug: columns shifted by one, so companies land in
		// `email` and become the key every later import dedupes against.
		const result = readSpeakerCsv('name,email\nAda Bennett,Globex');
		expect(!result.ok && result.problem).toContain('Row 2');
		expect(!result.ok && result.problem).toContain('columns line up');
	});

	it('leaves an empty email alone — plenty of speakers arrive without one', () => {
		const result = readSpeakerCsv('name,email\nAda Bennett,');
		expect(result.ok && result.rows[0].email).toBe(null);
	});

	it('refuses an empty file and a header-only file differently', () => {
		const empty = readSpeakerCsv('');
		expect(!empty.ok && empty.problem).toBe('That file is empty.');
		const headerOnly = readSpeakerCsv('name,email\n');
		expect(!headerOnly.ok && headerOnly.problem).toContain('nothing else');
	});

	it(`refuses more than ${MAX_ROWS} rows rather than half-writing them`, () => {
		const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `Speaker ${i}`).join('\n');
		const result = readSpeakerCsv(`name\n${rows}`);
		expect(!result.ok && result.problem).toContain(`at most ${MAX_ROWS}`);
	});
});

describe('importedMessage', () => {
	it('counts what landed and names what did not', () => {
		expect(importedMessage(2, ['Ada Bennett'])).toBe(
			'Imported 2 speakers. This one was already on the roster, so nothing changed: Ada Bennett.'
		);
	});

	it('says nothing about skips when there are none', () => {
		expect(importedMessage(1, [])).toBe('Imported 1 speaker.');
	});
});

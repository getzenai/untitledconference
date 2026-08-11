/**
 * The text an organizer types into the structure forms (#110).
 *
 * The rules here are the whole reason batching is safe to offer: what counts as a
 * line, what a repeat does, and what happens to a length that is not a length.
 */
import { describe, expect, it } from 'vitest';
import { addedMessage, MAX_NAME, parseFormatLines, parseNames } from './structure-lines';

describe('names, one per line', () => {
	it('reads a pasted block as one name per line', () => {
		expect(parseNames('Main Stage\nRoom 3C\nWorkshop Lab')).toEqual([
			'Main Stage',
			'Room 3C',
			'Workshop Lab'
		]);
	});

	it('still reads a single name, which is what most submits are', () => {
		expect(parseNames('Main Stage')).toEqual(['Main Stage']);
	});

	// A trailing newline is what the field is left holding when somebody presses
	// enter after the last entry. Rejecting it would be a lecture about whitespace.
	it('drops blank lines and surrounding spaces instead of complaining', () => {
		expect(parseNames('  Main Stage  \n\n\t\n Room 3C \n')).toEqual(['Main Stage', 'Room 3C']);
	});

	it('keeps the first of a name repeated in the same block, whatever the case', () => {
		expect(parseNames('Main Stage\nmain stage\nMAIN STAGE')).toEqual(['Main Stage']);
	});

	it('cuts a name to what the column holds rather than failing the whole paste', () => {
		const [only] = parseNames('x'.repeat(MAX_NAME + 50));
		expect(only).toHaveLength(MAX_NAME);
	});

	it('has nothing to do with an empty field', () => {
		expect(parseNames('')).toEqual([]);
		expect(parseNames('\n  \n')).toEqual([]);
	});
});

describe('formats, with an optional length', () => {
	const formats = (block: string) => {
		const parsed = parseFormatLines(block);
		if (!parsed.ok) throw new Error(`expected these lines to parse: ${parsed.problem}`);
		return parsed.formats;
	};

	it('takes the number after the last comma as the length', () => {
		expect(formats('Talk, 30\nWorkshop, 90')).toEqual([
			{ name: 'Talk', minutes: 30 },
			{ name: 'Workshop', minutes: 90 }
		]);
	});

	it('leaves a line without a comma as a format with no length set', () => {
		expect(formats('Panel')).toEqual([{ name: 'Panel', minutes: null }]);
	});

	/**
	 * The rule only fires on a tail that is nothing but digits. A name is free
	 * text, and a rule that quietly ate part of it would be worse than no rule.
	 */
	it('treats a comma inside a name as part of the name', () => {
		expect(formats('Talk, extended')).toEqual([{ name: 'Talk, extended', minutes: null }]);
	});

	it('refuses a length no session could have, naming the line it means', () => {
		const parsed = parseFormatLines('Talk, 30\nMarathon, 5000');
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.problem).toContain('Marathon, 5000');
	});

	it('refuses a length of zero rather than storing a format nobody can schedule', () => {
		expect(parseFormatLines('Lightning, 0').ok).toBe(false);
	});

	it('refuses a line that is only a length, because it has no name', () => {
		const parsed = parseFormatLines(', 30');
		expect(parsed.ok).toBe(false);
	});
});

describe('what the organizer is told', () => {
	it('counts what landed', () => {
		expect(addedMessage('room', ['A', 'B'], [])).toBe('Added 2 rooms.');
		expect(addedMessage('room', ['A'], [])).toBe('Added 1 room.');
	});

	// Naming the skipped one ends the question. A count sends somebody comparing
	// a twelve-line paste against the list by eye.
	it('names what was already there', () => {
		expect(addedMessage('track', ['New'], ['Security'])).toBe(
			'Added 1 track. This one was already there, so nothing changed: Security.'
		);
	});

	it('says only that nothing changed when the whole block was a repeat', () => {
		expect(addedMessage('room', [], ['Main Stage', 'Room 3C'])).toBe(
			'These were already there, so nothing changed: Main Stage, Room 3C.'
		);
	});
});

import { describe, expect, it } from 'vitest';
import { ASSISTANT_NAME_NOT_ID, renderAssistantMarkdown } from './assistant-markdown';

/**
 * The live answer from untitledconference.com that #703 is written against.
 * Four markdown lines of table (header, rule, two rooms) plus the bold lead-in.
 */
const LIVE_ROOM_ANSWER = `Here are the rooms for **DevFlow Conf 2027**:

| ID | Name | Position |
|----|------|----------|
| 1 | Main Stage | 0 |
| 2 | Room 2A | 1 |
`;

describe('assistant markdown', () => {
	it('turns the live room table into a table with four rows of source as a <table>', () => {
		const html = renderAssistantMarkdown(LIVE_ROOM_ANSWER);

		expect(html).toContain('<table>');
		expect(html.match(/<tr>/g)).toEqual(['<tr>', '<tr>', '<tr>']);
		expect(html).toContain('<strong>DevFlow Conf 2027</strong>');
		expect(html).toContain('<th>ID</th>');
		expect(html).toContain('<th>Name</th>');
		expect(html).toContain('<th>Position</th>');
		expect(html).toContain('<td>Main Stage</td>');
		expect(html).toContain('<td>Room 2A</td>');

		// The thing a juror actually saw: pipes and stars as characters.
		expect(html).not.toContain('|----');
		expect(html).not.toContain('**DevFlow');
		expect(html).not.toContain('| ID |');
	});

	it('renders paragraphs, lists and inline code the model actually types', () => {
		const html = renderAssistantMarkdown(
			'Move it to **Main Stage**.\n\n- Keep the slot\n- Tell the speaker\n\nUse `place_talk`.'
		);
		expect(html).toContain('<strong>Main Stage</strong>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>Keep the slot</li>');
		expect(html).toContain('<code>place_talk</code>');
	});

	it('escapes HTML and never turns a javascript: target into a link', () => {
		const html = renderAssistantMarkdown(
			'See <script>alert(1)</script> and [click](javascript:alert(1)) plus <img src=x onerror=alert(1)>.'
		);
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).not.toMatch(/href=["']javascript:/i);
		expect(html).toContain('[click](javascript:alert(1))');
	});

	it('the name-not-id rule is written against that same live leak', () => {
		// Without a model call the instruction is what we can pin: it names the
		// room from the leak, and the leak is exactly the ID-column table.
		expect(ASSISTANT_NAME_NOT_ID).toContain('Main Stage');
		expect(ASSISTANT_NAME_NOT_ID).toContain('Never mention internal database IDs');
		expect(LIVE_ROOM_ANSWER).toContain('| ID |');
		expect(LIVE_ROOM_ANSWER).toContain('Main Stage');
	});
});

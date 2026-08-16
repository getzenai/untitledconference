import { describe, expect, it } from 'vitest';
import { classify } from '../../../../scripts/ai/probe-outcome.mjs';

/**
 * The probe itself needs a gateway key, so nothing about it can be tested here.
 * What a finished turn *means* needs nothing at all, and that is the part a
 * reader acts on: the deploy log's verdict is where the next person starts
 * looking for the fault.
 */
describe('classify', () => {
	const expectTool = 'get_agenda_tray';

	it('names the expected tool call', () => {
		expect(
			classify({ calls: 1, names: [expectTool], expect: expectTool, finish: 'tool_calls' })
		).toBe('tool_call');
	});

	it('separates a different tool from no tool', () => {
		expect(
			classify({ calls: 1, names: ['list_rooms'], expect: expectTool, finish: 'tool_calls' })
		).toBe('wrong_tool');
	});

	it('calls prose instead of a tool what it is', () => {
		expect(classify({ calls: 0, names: [], expect: expectTool, finish: 'stop' })).toBe(
			'no_tool_call'
		);
	});

	// The case that failed the deploy on 20c736e: 49 tools, a 200-token budget,
	// `finish_reason: length` and an empty answer. Reporting that as #660 blames
	// the model for a ceiling the chat never sets.
	it('does not blame the model when the turn ran out of tokens', () => {
		expect(classify({ calls: 0, names: [], expect: expectTool, finish: 'length' })).toBe(
			'truncated'
		);
	});

	// A turn that decided and then hit the ceiling still decided.
	it('keeps the verdict when the tool call came before the ceiling', () => {
		expect(classify({ calls: 1, names: [expectTool], expect: expectTool, finish: 'length' })).toBe(
			'tool_call'
		);
	});
});
